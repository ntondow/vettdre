// ============================================================
// Leasing Upgrade Success — Post-Checkout Confirmation
//
// /leasing/upgrade/success?session_id=cs_xxx
//
// Verifies Stripe session, shows confetti + unlocked features.
// ============================================================

import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import SuccessClient from "./success-client";

interface Props {
  searchParams: Promise<{ session_id?: string }>;
}

export default async function UpgradeSuccessPage({ searchParams }: Props) {
  const { session_id } = await searchParams;

  if (!session_id) redirect("/leasing");

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      redirect("/leasing");
    }

    const tier = (session.metadata?.leasingTier as "pro" | "team") || "pro";

    return <SuccessClient tier={tier} />;
  } catch {
    redirect("/leasing");
  }
}
