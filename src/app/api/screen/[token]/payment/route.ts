import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { BASE_SCREENING_FEE_CENTS } from "@/lib/screening/constants";
import {
  isRateLimitEnabled,
  checkRateLimit,
  rateLimitHeaders,
  paymentLimiter,
  getClientIP,
} from "@/lib/rate-limit";
import { validateApplicantSession } from "@/lib/screening/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Rate limiting (optional — depends on Redis config)
    if (isRateLimitEnabled()) {
      const rl = await checkRateLimit(paymentLimiter(), getClientIP(req));
      if (!rl.success) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: rateLimitHeaders(rl) },
        );
      }
    }

    // Session validation (mandatory)
    const authSession = await validateApplicantSession(
      token,
      req.headers.get("cookie"),
    );
    if (!authSession.valid) {
      return NextResponse.json(
        { error: authSession.error || "Invalid session" },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { applicantId } = body as {
      applicantId?: string;
    };

    if (!applicantId) {
      return NextResponse.json(
        { error: "Missing required field: applicantId" },
        { status: 400 },
      );
    }

    // Look up application by token with organization
    const application = await prisma.screeningApplication.findUnique({
      where: { accessToken: token },
      include: {
        applicants: {
          select: { id: true, email: true },
        },
        organization: {
          select: { name: true },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 },
      );
    }

    // Reject submissions on finalized applications
    const openStatuses = ["draft", "invited", "in_progress"];
    if (!openStatuses.includes(application.status)) {
      return NextResponse.json(
        { error: "Application is no longer accepting submissions" },
        { status: 410 },
      );
    }

    // Verify applicant belongs to this application and get email
    const applicant = application.applicants.find(
      (a: any) => a.id === applicantId,
    );
    if (!applicant) {
      return NextResponse.json(
        { error: "Applicant not found in this application" },
        { status: 404 },
      );
    }

    // Create Stripe checkout session
    const stripe = getStripe();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vettdre.com";
    const successUrl = `${appUrl}/screen/${token}?step=confirmation&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/screen/${token}?step=payment`;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `VettdRE Tenant Screening — ${application.organization.name}`,
            },
            unit_amount: BASE_SCREENING_FEE_CENTS,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: applicant.email,
      metadata: {
        applicationId: application.id,
        applicantId,
        type: "screening",
      },
    });

    // Create ScreeningPayment record
    await prisma.screeningPayment.create({
      data: {
        applicationId: application.id,
        applicantId,
        payerType: "applicant",
        paymentType: "base_screening",
        amountCents: BASE_SCREENING_FEE_CENTS,
        status: "pending",
        stripeCheckoutSessionId: checkoutSession.id,
      },
    });

    // Create ScreeningEvent
    await prisma.screeningEvent.create({
      data: {
        applicationId: application.id,
        applicantId,
        eventType: "step_completed",
        eventData: {
          step: "payment",
          stripeSessionId: checkoutSession.id,
        },
      },
    });

    return NextResponse.json({ sessionUrl: checkoutSession.url });
  } catch (error) {
    console.error("Payment POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
