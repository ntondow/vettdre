"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  CreditCard,
  Shield,
  Trash2,
  Loader2,
  Plus,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import {
  getScreeningBillingStatus,
  getScreeningChargeHistory,
  removeScreeningCard,
} from "../actions";
import type { BillingStatus, ScreeningCharge } from "../actions";

// ── Stripe.js dynamic loader (no npm package needed) ─────────
let stripePromise: Promise<any> | null = null;
function getStripeJs() {
  if (!stripePromise) {
    stripePromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined") return reject("SSR");
      const existing = (window as any).Stripe;
      if (existing) return resolve(existing(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY));
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.onload = () => {
        const S = (window as any).Stripe;
        if (S) resolve(S(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY));
        else reject("Stripe.js failed to load");
      };
      script.onerror = () => {
        stripePromise = null; // Reset so next attempt can retry
        reject("Failed to load Stripe.js");
      };
      document.head.appendChild(script);
    });
  }
  return stripePromise;
}

// ── Brand icon helper ────────────────────────────────────────
function brandDisplay(brand: string): string {
  const map: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    discover: "Discover",
    diners: "Diners Club",
    jcb: "JCB",
    unionpay: "UnionPay",
  };
  return map[brand] || brand.charAt(0).toUpperCase() + brand.slice(1);
}

export default function ScreeningBillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [charges, setCharges] = useState<ScreeningCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCardForm, setShowCardForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const cardElementRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<any>(null);
  const elementsRef = useRef<any>(null);
  const cardRef = useRef<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [billingData, chargeData] = await Promise.all([
        getScreeningBillingStatus(),
        getScreeningChargeHistory(),
      ]);
      setBilling(billingData);
      setCharges(chargeData);
    } catch (err) {
      console.error("[Screening Billing] Failed to load data:", err);
      setError("Failed to load billing data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Mount Stripe Elements when card form is shown
  useEffect(() => {
    if (!showCardForm || !cardElementRef.current) return;

    let mounted = true;

    (async () => {
      try {
        const stripe = await getStripeJs();
        if (!mounted) return;
        stripeRef.current = stripe;
        const elements = stripe.elements();
        elementsRef.current = elements;
        const card = elements.create("card", {
          style: {
            base: {
              fontSize: "16px",
              color: "#1e293b",
              fontFamily: "system-ui, -apple-system, sans-serif",
              "::placeholder": { color: "#94a3b8" },
            },
            invalid: { color: "#dc2626" },
          },
        });
        card.mount(cardElementRef.current);
        cardRef.current = card;
      } catch (err) {
        if (mounted) setError("Failed to load payment form. Check your Stripe configuration.");
      }
    })();

    return () => {
      mounted = false;
      if (cardRef.current) {
        try { cardRef.current.destroy(); } catch {}
        cardRef.current = null;
      }
      elementsRef.current = null;
    };
  }, [showCardForm]);

  const handleSaveCard = async () => {
    if (!stripeRef.current || !cardRef.current) return;

    setSaving(true);
    setError(null);

    try {
      // 1. Create SetupIntent on server
      const res = await fetch("/api/screening/billing/setup-intent", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create setup intent");
      }
      const { clientSecret } = await res.json();

      // 2. Confirm SetupIntent with card element
      const { setupIntent, error: stripeError } = await stripeRef.current.confirmCardSetup(
        clientSecret,
        { payment_method: { card: cardRef.current } }
      );

      if (stripeError) {
        throw new Error(stripeError.message || "Card verification failed");
      }

      if (!setupIntent?.payment_method) {
        throw new Error("No payment method returned");
      }

      // payment_method can be a string ID or an object with .id
      const pmId = typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;
      if (!pmId) {
        throw new Error("No payment method ID returned");
      }

      // 3. Save payment method on server
      const saveRes = await fetch("/api/screening/billing/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId: pmId }),
      });

      if (!saveRes.ok) {
        const data = await saveRes.json();
        throw new Error(data.error || "Failed to save payment method");
      }

      setSuccess("Card saved successfully. Enhanced screenings are now available.");
      setShowCardForm(false);
      await loadData();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || "Failed to save card");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCard = async () => {
    if (!confirm("Remove this card? Enhanced screenings will be unavailable until you add a new card.")) return;

    setRemoving(true);
    setError(null);

    try {
      const result = await removeScreeningCard();
      if (result.success) {
        setSuccess("Card removed successfully.");
        await loadData();
        setTimeout(() => setSuccess(null), 5000);
      } else {
        setError(result.error || "Failed to remove card");
      }
    } catch {
      setError("Failed to remove card");
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (billing && !billing.isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <Shield className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Admin Access Required</h2>
          <p className="text-sm text-slate-600 mb-6">
            Only brokerage admins can manage screening billing. Contact your broker to update payment settings.
          </p>
          <Link
            href="/screening"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Screenings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/screening"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ChevronLeft className="w-4 h-4" />
          Screenings
        </Link>
      </div>

      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Screening Billing</h1>
        <p className="text-sm text-slate-600 mt-1">
          Manage your payment method for enhanced screenings and view charge history.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">{error}</p>
            <button onClick={() => setError(null)} className="text-xs text-red-600 underline mt-1">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-green-800">{success}</p>
        </div>
      )}

      {/* Card on File Section */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Payment Method</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            A card on file is required for enhanced tier screenings ($49/screening, charged to your brokerage).
          </p>
        </div>

        <div className="p-6">
          {billing?.hasCard && billing.card ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-8 rounded bg-slate-100 flex items-center justify-center">
                  <CreditCard className="w-6 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {brandDisplay(billing.card.brand)} ending in {billing.card.last4}
                  </p>
                  <p className="text-xs text-slate-500">
                    Expires {String(billing.card.expMonth).padStart(2, "0")}/{billing.card.expYear}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCardForm(true)}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded hover:bg-blue-50 transition-colors"
                >
                  Update
                </button>
                <button
                  onClick={handleRemoveCard}
                  disabled={removing}
                  className="text-sm font-medium text-red-600 hover:text-red-700 px-2 py-1.5 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {removing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ) : !showCardForm ? (
            <div className="text-center py-4">
              <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-600 mb-4">
                No card on file. Add a payment method to enable enhanced screenings.
              </p>
              <button
                onClick={() => setShowCardForm(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Payment Method
              </button>
            </div>
          ) : null}

          {/* Card Form (shown when adding/updating) */}
          {showCardForm && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  Card Details
                </label>
                <div
                  ref={cardElementRef}
                  className="rounded-md border border-slate-300 bg-white px-3 py-3 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Your card will only be charged when you create enhanced tier screenings. Base screenings are paid by the applicant.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveCard}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      Save Card
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowCardForm(false)}
                  disabled={saving}
                  className="text-sm font-medium text-slate-600 hover:text-slate-800 px-4 py-2.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pricing Info */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Screening Tiers</h2>
        </div>
        <div className="p-6 grid sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-lg font-bold text-slate-900">$20</span>
              <span className="text-xs text-slate-500">per screening</span>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Base Screening</h3>
            <p className="text-xs text-slate-600">
              Paid by the applicant. Single bureau credit, criminal, eviction, Plaid bank verification, AI document analysis, risk score, and PDF report.
            </p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-lg font-bold text-blue-700">$20 + $49</span>
              <span className="text-xs text-slate-500">applicant + brokerage</span>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Enhanced Screening</h3>
            <p className="text-xs text-slate-600">
              Applicant pays $20, brokerage pays $49 (charged to card on file). Adds tri-bureau credit, employment verification, extended history, and landlord references.
            </p>
            {!billing?.hasCard && (
              <p className="text-xs font-medium text-blue-700 mt-2">
                Requires card on file
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Charge History */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Charge History</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Enhanced screening charges billed to your brokerage.
          </p>
        </div>

        {charges.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-500">No charges yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Date
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Applicant
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Property
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Type
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {charges.map((charge) => (
                  <tr key={charge.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-700 whitespace-nowrap">
                      {charge.paidAt
                        ? new Date(charge.paidAt).toLocaleDateString()
                        : new Date(charge.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3 text-slate-900 font-medium">
                      {charge.applicantName}
                    </td>
                    <td className="px-6 py-3 text-slate-700 max-w-[200px] truncate">
                      {charge.propertyAddress}
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700">
                        {charge.paymentType === "enhanced_upgrade" ? "Enhanced" : "Base"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                      ${(charge.amountCents / 100).toFixed(2)}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          charge.status === "succeeded"
                            ? "bg-green-50 text-green-700"
                            : charge.status === "failed"
                            ? "bg-red-50 text-red-700"
                            : charge.status === "refunded"
                            ? "bg-yellow-50 text-yellow-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {charge.status === "succeeded"
                          ? "Paid"
                          : charge.status.charAt(0).toUpperCase() + charge.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <Link
                        href={`/screening/${charge.applicationId}`}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Security footer */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-4">
        <Shield className="w-3.5 h-3.5" />
        <span>Payments processed securely by Stripe. Card data never touches VettdRE servers.</span>
      </div>
    </div>
  );
}
