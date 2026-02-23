import { NextRequest, NextResponse } from "next/server";
import { stripe, isValidPriceId } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { priceId } = await req.json();
    if (!priceId || !isValidPriceId(priceId)) {
      return NextResponse.json({ error: "Invalid price ID" }, { status: 400 });
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.fullName,
        metadata: { userId: user.id, orgId: user.orgId },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const origin = req.headers.get("origin") || "https://app.vettdre.com";

    // Grant 7-day Stripe trial only if user is on free plan AND has never had a trial
    const grantTrial = user.plan === "free" && !user.trialEndsAt;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/settings/billing?success=true`,
      cancel_url: `${origin}/settings/billing?canceled=true`,
      allow_promotion_codes: true,
      metadata: { userId: user.id },
      ...(grantTrial ? { subscription_data: { trial_period_days: 7 } } : {}),
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
