import Stripe from "stripe";
import type { UserPlan } from "@/lib/feature-gate";

let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
    });
  }
  return _stripe;
}

// Price ID → plan mapping (lazy to avoid reading env at module level during Docker build)
let _priceToPlan: Record<string, UserPlan> | null = null;
function getPriceToPlan(): Record<string, UserPlan> {
  if (!_priceToPlan) {
    _priceToPlan = {
      [process.env.STRIPE_EXPLORER_MONTHLY_PRICE_ID!]: "explorer",
      [process.env.STRIPE_EXPLORER_YEARLY_PRICE_ID!]: "explorer",
      [process.env.STRIPE_PRO_MONTHLY_PRICE_ID!]: "pro",
      [process.env.STRIPE_PRO_YEARLY_PRICE_ID!]: "pro",
      [process.env.STRIPE_TEAM_MONTHLY_PRICE_ID!]: "team",
    };
  }
  return _priceToPlan;
}

// Plan → price IDs (lazy)
let _planToPrices: Record<string, { monthly: string; yearly?: string }> | null = null;
export function getPlanToPrices(): Record<string, { monthly: string; yearly?: string }> {
  if (!_planToPrices) {
    _planToPrices = {
      explorer: {
        monthly: process.env.STRIPE_EXPLORER_MONTHLY_PRICE_ID!,
        yearly: process.env.STRIPE_EXPLORER_YEARLY_PRICE_ID!,
      },
      pro: {
        monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,
        yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID!,
      },
      team: {
        monthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID!,
      },
    };
  }
  return _planToPrices;
}

export function getPlanFromPriceId(priceId: string): UserPlan {
  return getPriceToPlan()[priceId] || "free";
}

// All valid price IDs for validation
export function isValidPriceId(priceId: string): boolean {
  return priceId in getPriceToPlan();
}
