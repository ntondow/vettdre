import Stripe from "stripe";
import type { UserPlan } from "@/lib/feature-gate";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  typescript: true,
});

// Price ID → plan mapping
const PRICE_TO_PLAN: Record<string, UserPlan> = {
  [process.env.STRIPE_EXPLORER_MONTHLY_PRICE_ID!]: "explorer",
  [process.env.STRIPE_EXPLORER_YEARLY_PRICE_ID!]: "explorer",
  [process.env.STRIPE_PRO_MONTHLY_PRICE_ID!]: "pro",
  [process.env.STRIPE_PRO_YEARLY_PRICE_ID!]: "pro",
  [process.env.STRIPE_TEAM_MONTHLY_PRICE_ID!]: "team",
};

// Plan → price IDs
export const PLAN_TO_PRICES: Record<string, { monthly: string; yearly?: string }> = {
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

export function getPlanFromPriceId(priceId: string): UserPlan {
  return PRICE_TO_PLAN[priceId] || "free";
}

// All valid price IDs for validation
export function isValidPriceId(priceId: string): boolean {
  return priceId in PRICE_TO_PLAN;
}
