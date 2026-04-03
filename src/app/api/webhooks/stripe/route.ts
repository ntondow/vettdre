import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, getPlanFromPriceId, getLeasingTierFromPriceId } from "@/lib/stripe";
import prisma from "@/lib/prisma";
import { invalidateLeasingTierCache } from "@/lib/leasing-limits";
import { runScreeningPipeline } from "@/lib/screening/pipeline";
import { isWebhookProcessed, markWebhookProcessed } from "@/lib/webhook-idempotency";

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

  // ── Webhook Idempotency: skip already-processed events ────
  try {
    if (await isWebhookProcessed("stripe", event.id)) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    // Mark BEFORE processing to prevent duplicates on crash/retry
    await markWebhookProcessed("stripe", event.id, event.type);
  } catch (err) {
    // Idempotency check/mark failure should not block processing
    console.error("[Stripe Webhook] Idempotency error:", err);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // ── Screening payment (one-time, no subscription) ────
        if (session.metadata?.type === "screening" && session.payment_status === "paid") {
          const applicationId = session.metadata?.applicationId;
          const applicantId = session.metadata?.applicantId;

          if (applicationId) {
            // Verify payment record exists AND belongs to the correct application (org-scoped defense)
            const paymentUpdate = await prisma.screeningPayment.updateMany({
              where: {
                stripeCheckoutSessionId: session.id,
                status: "pending",
                application: { id: applicationId },
              },
              data: {
                status: "succeeded",
                stripePaymentIntentId: (session.payment_intent as string) || null,
                paidAt: new Date(),
              },
            });

            if (paymentUpdate.count === 0) {
              // Either already processed (idempotent) or no matching record
              console.warn(`[Stripe] screening payment: no pending record for session=${session.id} (already processed or missing)`);
              break;
            }

            // Log event
            await prisma.screeningEvent.create({
              data: {
                applicationId,
                applicantId: applicantId || null,
                eventType: "payment_succeeded",
                eventData: {
                  stripeSessionId: session.id,
                  amount: session.amount_total,
                },
              },
            });

            // Update applicant step to confirmation (step 6)
            if (applicantId) {
              await prisma.screeningApplicant.update({
                where: { id: applicantId },
                data: { currentStep: 6, wizardCompleted: true },
              }).catch(() => {}); // Non-critical — don't block webhook
            }

            console.log(`[Stripe] screening payment: app=${applicationId} amount=${session.amount_total}`);

            // Trigger the processing pipeline (fire-and-forget — don't block webhook response)
            runScreeningPipeline(applicationId).catch((err) => {
              console.error(`[Stripe] screening pipeline error for app=${applicationId}:`, err);
            });
          }
          break;
        }

        if (!session.subscription) break;

        // ── Leasing tier upgrade ──────────────────────────────
        const leasingTier = session.metadata?.leasingTier;
        const configId = session.metadata?.configId;

        if (leasingTier && configId) {
          const sub = await getStripe().subscriptions.retrieve(session.subscription as string);
          const priceId = sub.items.data[0]?.price?.id;
          if (!priceId) break;

          const tier = getLeasingTierFromPriceId(priceId);
          if (tier === "free") break;

          await prisma.leasingConfig.update({
            where: { id: configId },
            data: {
              tier,
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              emailEnabled: true, // Pro and Team get email
            },
          });

          invalidateLeasingTierCache(configId);
          console.log(`[Stripe] leasing checkout: config=${configId} tier=${tier} sub=${session.subscription}`);

          // ── Apply pending referral credits if this org had any ─
          {
            const lc = await prisma.leasingConfig.findUnique({ where: { id: configId }, select: { orgId: true } });
            if (lc) {
              const thisOrg = await prisma.organization.findUnique({ where: { id: lc.orgId }, select: { pendingReferralCredit: true } });
              if (thisOrg && thisOrg.pendingReferralCredit > 0) {
                await getStripe().customers.createBalanceTransaction(
                  session.customer as string,
                  { amount: -thisOrg.pendingReferralCredit, currency: "usd", description: "Referral reward — friend upgraded to Pro" },
                );
                await prisma.organization.update({
                  where: { id: lc.orgId },
                  data: { pendingReferralCredit: 0 },
                });
                console.log(JSON.stringify({ event: "pending_referral_credit_applied", orgId: lc.orgId, amount: thisOrg.pendingReferralCredit }));
              }
            }
          }

          // ── Referral credit: first upgrade from free ──────────
          if (session.metadata?.previousTier === "free") {
            const leasingConf = await prisma.leasingConfig.findUnique({
              where: { id: configId },
              select: { orgId: true },
            });
            if (leasingConf) {
              const upgradedOrg = await prisma.organization.findUnique({
                where: { id: leasingConf.orgId },
                select: { id: true, referredByOrgId: true },
              });
              if (upgradedOrg?.referredByOrgId) {
                const referringOrg = await prisma.organization.findUnique({
                  where: { id: upgradedOrg.referredByOrgId },
                });
                if (referringOrg) {
                  // Find referring org's Stripe customer from their leasing config
                  const referringConfig = await prisma.leasingConfig.findFirst({
                    where: { orgId: referringOrg.id, stripeCustomerId: { not: null } },
                    select: { stripeCustomerId: true },
                  });
                  if (referringConfig?.stripeCustomerId) {
                    // Apply $149 credit to referring org's Stripe customer
                    await getStripe().customers.createBalanceTransaction(
                      referringConfig.stripeCustomerId,
                      { amount: -14900, currency: "usd", description: "Referral reward — friend upgraded to Pro" },
                    );
                    console.log(JSON.stringify({
                      event: "referral_credit_applied",
                      referringOrgId: referringOrg.id,
                      referredOrgId: upgradedOrg.id,
                      amount: 14900,
                    }));
                  } else {
                    // Referring org has no Stripe customer yet — store pending credit
                    await prisma.organization.update({
                      where: { id: referringOrg.id },
                      data: { pendingReferralCredit: { increment: 14900 } },
                    });
                    console.log(JSON.stringify({
                      event: "referral_credit_pending",
                      referringOrgId: referringOrg.id,
                      referredOrgId: upgradedOrg.id,
                      amount: 14900,
                    }));
                  }
                }
              }
            }
          }

          break;
        }

        // ── Platform plan upgrade ─────────────────────────────
        const userId = session.metadata?.userId;
        if (!userId) break;

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

        // ── Check if this is a leasing subscription ───────────
        const leasingConfig = await prisma.leasingConfig.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (leasingConfig) {
          await prisma.leasingConfig.update({
            where: { id: leasingConfig.id },
            data: {
              tier: "free",
              emailEnabled: false,
              stripeSubscriptionId: null,
            },
          });
          invalidateLeasingTierCache(leasingConfig.id);
          console.log(`[Stripe] leasing subscription.deleted: config=${leasingConfig.id} → free`);
          break;
        }

        // ── Platform subscription ─────────────────────────────
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
