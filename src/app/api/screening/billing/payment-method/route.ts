import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/screening/billing/payment-method
 * After SetupIntent confirmation, saves the payment method as the org default.
 * Body: { paymentMethodId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { paymentMethodId } = body;

    if (!paymentMethodId || typeof paymentMethodId !== "string") {
      return NextResponse.json({ error: "Missing paymentMethodId" }, { status: 400 });
    }

    // Find user + verify admin/broker role
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

    // Only admins/brokers/owners can manage billing
    const isAdmin = user.role === "owner" || user.role === "admin" || user.role === "super_admin";
    if (!isAdmin) {
      const firstOrgUser = await prisma.user.findFirst({
        where: { orgId: user.orgId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!firstOrgUser || firstOrgUser.id !== user.id) {
        return NextResponse.json({ error: "Only admins can manage billing" }, { status: 403 });
      }
    }

    // Verify the payment method exists in Stripe and belongs to this org's customer
    const org = await prisma.organization.findUnique({
      where: { id: user.orgId },
      select: { id: true, stripeCustomerId: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    if (org.stripeCustomerId) {
      try {
        const pm = await getStripe().paymentMethods.retrieve(paymentMethodId);
        if (pm.customer && pm.customer !== org.stripeCustomerId) {
          return NextResponse.json({ error: "Payment method does not belong to this organization" }, { status: 400 });
        }
      } catch (err: any) {
        if (err?.statusCode === 404) {
          return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
        }
        console.warn("[Screening Billing] PM validation warning:", err);
      }
    }

    // Save as default payment method on organization
    await prisma.organization.update({
      where: { id: user.orgId },
      data: { stripeDefaultPaymentMethod: paymentMethodId },
    });

    console.log(`[Screening Billing] saved payment method for org=${user.orgId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Screening Billing] Save payment method error:", error);
    return NextResponse.json({ error: "Failed to save payment method" }, { status: 500 });
  }
}
