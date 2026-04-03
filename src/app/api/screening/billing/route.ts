import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/screening/billing
 * Returns the org's card-on-file status for screening billing.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find user + org
    let user = await prisma.user.findUnique({
      where: { authProviderId: authUser.id },
      select: { id: true, orgId: true, role: true },
    });
    if (!user && authUser.email) {
      user = await prisma.user.findFirst({
        where: { email: authUser.email },
        select: { id: true, orgId: true, role: true },
      });
    }
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: user.orgId },
      select: {
        id: true,
        stripeCustomerId: true,
        stripeDefaultPaymentMethod: true,
      },
    });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // If we have a payment method, fetch its details from Stripe
    let card: {
      brand: string;
      last4: string;
      expMonth: number;
      expYear: number;
    } | null = null;

    if (org.stripeCustomerId && org.stripeDefaultPaymentMethod) {
      try {
        const pm = await getStripe().paymentMethods.retrieve(
          org.stripeDefaultPaymentMethod
        );
        if (pm.card) {
          card = {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
          };
        }
      } catch (err: any) {
        // Payment method may have been deleted in Stripe — clean up stale reference
        console.warn(`[Screening Billing] Failed to retrieve payment method: ${org.stripeDefaultPaymentMethod}`, err);
        if (err?.statusCode === 404 || err?.code === "resource_missing") {
          await prisma.organization.update({
            where: { id: org.id },
            data: { stripeDefaultPaymentMethod: null },
          });
        }
      }
    }

    return NextResponse.json({
      hasCard: !!card,
      card,
    });
  } catch (error) {
    console.error("[Screening Billing] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
