// ============================================================
// Leasing Upgrade — Stripe Checkout Session
//
// POST /api/leasing/upgrade
// Body: { configId: string, tier: "pro" | "team" }
//
// Creates a Stripe Checkout session for leasing tier upgrade.
// Requires: STRIPE_LEASING_PRO_PRICE_ID, STRIPE_LEASING_TEAM_PRICE_ID
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { getStripe, getLeasingPriceId } from "@/lib/stripe";
import type { LeasingTier } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 2. Parse body
    const body = await req.json();
    const { configId, tier } = body as { configId: string; tier: LeasingTier };

    if (!configId || !tier || !["pro", "team"].includes(tier)) {
      return NextResponse.json({ error: "Invalid request: configId and tier (pro|team) required" }, { status: 400 });
    }

    // 3. Verify config belongs to user's org
    const config = await prisma.leasingConfig.findFirst({
      where: { id: configId, orgId: user.orgId },
      include: {
        organization: { select: { id: true, name: true, stripeCustomerId: true } },
        property: { select: { name: true, address: true } },
      },
    });

    if (!config) {
      return NextResponse.json({ error: "Leasing config not found" }, { status: 404 });
    }

    // 4. Get price ID
    const priceId = getLeasingPriceId(tier);
    if (!priceId) {
      return NextResponse.json({ error: `Stripe price not configured for leasing ${tier}` }, { status: 500 });
    }

    // 5. Get or create Stripe customer
    const stripe = getStripe();
    let customerId = config.stripeCustomerId || config.organization.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: config.organization.name,
        metadata: { orgId: user.orgId, userId: user.id },
      });
      customerId = customer.id;

      // Store on org for reuse
      await prisma.organization.update({
        where: { id: user.orgId },
        data: { stripeCustomerId: customerId },
      });
    }

    // 6. Create checkout session
    const propertyName = config.property.name || config.property.address || "Property";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        orgId: user.orgId,
        configId,
        leasingTier: tier,
        userId: user.id,
        previousTier: config.tier,
      },
      success_url: `${appUrl}/leasing/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/leasing/analytics?configId=${configId}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("[LEASING UPGRADE] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to create checkout session" }, { status: 500 });
  }
}
