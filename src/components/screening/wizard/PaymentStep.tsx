"use client";

import React, { useState } from "react";
import { Loader2, AlertTriangle, ChevronRight, Lock } from "lucide-react";

interface Props {
  amount: number;
  onCreateSession: () => Promise<string | null>;
  sessionUrl?: string | null;
}

export default function PaymentStep({ amount, onCreateSession, sessionUrl }: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountDollars = (amount / 100).toFixed(2);

  const handlePay = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const url = await onCreateSession();
      if (!url) {
        setError("Failed to create payment session. Please try again.");
        return;
      }
      // Validate URL before redirect — must be a Stripe checkout URL
      try {
        const parsed = new URL(url);
        if (!parsed.hostname.endsWith("stripe.com")) {
          setError("Invalid payment URL. Please try again.");
          return;
        }
      } catch {
        setError("Invalid payment URL. Please try again.");
        return;
      }
      // Redirect to Stripe checkout
      window.location.href = url;
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">Payment</h2>
        <p className="text-sm text-slate-600">
          Complete your application by paying the screening fee.
        </p>
      </div>

      {/* Fee Summary */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Application Fee
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
              ${amountDollars}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Payment Method
            </div>
            <div className="text-sm font-medium text-slate-700 mt-2">Credit Card</div>
            <div className="text-xs text-slate-500">Visa, Mastercard, Amex</div>
          </div>
        </div>
      </div>

      {/* Fee Breakdown */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-slate-900">Fee Breakdown</h3>
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-700">Screening Fee</span>
            <span className="font-medium text-slate-900">${amountDollars}</span>
          </div>
          <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-900">Total Due</span>
            <span className="text-base font-bold text-slate-900">${amountDollars}</span>
          </div>
        </div>
      </div>

      {/* NYC Compliance Notice */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <div className="text-xs text-blue-900">
          <strong>NYC Tenant Screening Fee Notice:</strong> This fee complies with NYC
          Administrative Code Section 20-704.2. The maximum screening fee for a single applicant
          is $50. Your personal information will be handled securely.
        </div>
      </div>

      {/* Security Notice */}
      <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600">
          Payments processed securely by Stripe. Your credit card information is encrypted and
          never stored by VettdRE.
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Pay Button */}
      <button
        onClick={handlePay}
        disabled={isCreating}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-4 text-base font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
      >
        {isCreating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Preparing Payment...
          </>
        ) : (
          <>
            Pay ${amountDollars} &amp; Submit Application
            <ChevronRight className="w-4 h-4" />
          </>
        )}
      </button>

      {/* Terms */}
      <p className="text-center text-xs text-slate-500">
        By clicking the button above, you authorize the payment and agree to our terms.
      </p>
    </div>
  );
}
