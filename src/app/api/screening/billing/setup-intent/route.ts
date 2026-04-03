import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/screening/billing/setup-intent
 * Creates a Stripe SetupIntent so the org can save a card for enhanced screening charges.
 * First SetupIntent pattern in the codebase — all other Stripe usage is subscription-based.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find user + verify admin/broker role
    let user = await prisma.user.findUnique({
      where: { authProviderId: authUser.id },
      select: { id: true, orgId: true, role: true, email: true, fullName: true },
    });
    if (!user && authUser.email) {
      user = await prisma.user.findFirst({
        where: { email: authUser.email },
        select: { id: true, orgId: true, role: true, email: true, fullName: true },
      });
    }
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Only admins/brokers/owners can manage billing
    const isAdmin = user.role === "owner" || user.role === "admin" || user.role === "super_admin";
    if (!isAdmin) {
      // Check if they're the org creator (first user = owner)
      const firstOrgUser = await prisma.user.findFirst({
        where: { orgId: user.orgId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!firstOrgUser || firstOrgUser.id !== user.id) {
        return NextResponse.json({ error: "Only admins can manage billing" }, { status: 403 });
      }
    }

    const org = await prisma.organization.findUnique({
      where: { id: user.orgId },
      select: { id: true, name: true, stripeCustomerId: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const stripe = getStripe();

    // Ensure Stripe customer exists (create if needed)
    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: org.name,
        metadata: { orgId: org.id, createdBy: user.id },
      });
      customerId = customer.id;
      await prisma.organization.update({
        where: { id: org.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // Create SetupIntent
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      metadata: {
        orgId: org.id,
        purpose: "screening_card_on_file",
      },
    });

    if (!setupIntent.client_secret) {
      console.error("[Screening Billing] SetupIntent missing client_secret");
      return NextResponse.json({ error: "Failed to create setup intent" }, { status: 500 });
    }

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId,
    });
  } catch (error) {
    console.error("[Screening Billing] SetupIntent error:", error);
    return NextResponse.json({ error: "Failed to create setup intent" }, { status: 500 });
  }
}
