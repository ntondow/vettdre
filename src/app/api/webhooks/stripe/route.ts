import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, getPlanFromPriceId } from "@/lib/stripe";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId || !session.subscription) break;

        const sub = await getStripe().subscriptions.retrieve(session.subscription as string);
        const priceId = sub.items.data[0]?.price?.id;
        if (!priceId) break;

        const plan = getPlanFromPriceId(priceId);
        if (plan === "free") break; // Safety: don't downgrade on unknown price

        const updateData: any = {
          plan,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
        };

        // If Stripe trial is active, set trialEndsAt
        if (sub.trial_end) {
          updateData.trialEndsAt = new Date(sub.trial_end * 1000);
        }

        await prisma.user.update({
          where: { id: userId },
          data: updateData,
        });

        console.log(`[Stripe] checkout.session.completed: user=${userId} plan=${plan} sub=${session.subscription}`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price?.id;
        if (!priceId) break;

        const plan = getPlanFromPriceId(priceId);

        // Find user by subscription ID first, fall back to customer ID
        let user = await prisma.user.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (!user) {
          user = await prisma.user.findFirst({
            where: { stripeCustomerId: sub.customer as string },
          });
        }
        if (!user) {
          console.warn(`[Stripe] subscription.updated: no user found for sub=${sub.id} customer=${sub.customer}`);
          break;
        }

        if (sub.status === "active" || sub.status === "trialing") {
          const updateData: any = {
            plan: plan !== "free" ? plan : user.plan, // Don't downgrade on unknown price
            stripeSubscriptionId: sub.id,
          };
          if (sub.trial_end) {
            updateData.trialEndsAt = new Date(sub.trial_end * 1000);
          }
          await prisma.user.update({
            where: { id: user.id },
            data: updateData,
          });
          console.log(`[Stripe] subscription.updated: user=${user.id} plan=${plan} status=${sub.status}`);
        } else if (sub.status === "past_due") {
          // Flag but don't downgrade yet — Stripe will retry
          console.warn(`[Stripe] subscription.updated: user=${user.id} status=past_due`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        let user = await prisma.user.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (!user) {
          user = await prisma.user.findFirst({
            where: { stripeCustomerId: sub.customer as string },
          });
        }
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              plan: "free",
              stripeSubscriptionId: null,
              trialEndsAt: null,
            },
          });
          console.log(`[Stripe] subscription.deleted: user=${user.id} → free`);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn(`[Stripe] invoice.payment_failed: customer=${invoice.customer} amount=${invoice.amount_due}`);
        break;
      }
    }
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
