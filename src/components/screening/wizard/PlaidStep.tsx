"use client";

import React from "react";
import { usePlaidLink } from "react-plaid-link";
import { Loader2, CheckCircle, Lock, ChevronRight } from "lucide-react";

interface Props {
  linkToken: string | null;
  onSuccess: (publicToken: string, metadata: { institution: { institution_id: string; name: string } }) => void;
  onSkip: () => void;
  loading: boolean;
  connected?: { institutionName: string };
}

export default function PlaidStep({
  linkToken,
  onSuccess,
  onSkip,
  loading,
  connected,
}: Props) {
  // Initialize Plaid Link hook
  const { open, ready } = usePlaidLink({
    token: linkToken || "",
    onSuccess: (public_token: string, metadata: any) => {
      // Call parent handler with public token and institution info
      onSuccess(public_token, {
        institution: {
          institution_id: metadata.institution.institution_id,
          name: metadata.institution.name,
        },
      });
    },
    onExit: (err: any, _metadata: any) => {
      // User exited — they can retry or skip
      if (err) {
        console.error("Plaid Link exit error:", err);
      }
    },
  });

  // Show success state if already connected
  if (connected) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">
            Bank Account Connected
          </h2>
          <p className="text-sm text-slate-600">
            Your bank account has been successfully verified.
          </p>
        </div>

        {/* Success Card */}
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-green-900">{connected.institutionName}</div>
              <div className="text-sm text-green-700 mt-1">
                90 days of transaction history verified
              </div>
            </div>
          </div>
        </div>

        {/* Continue Button */}
        <button
          onClick={onSkip}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          Continue to Documents
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Show loading state if no link token yet
  if (!linkToken || loading) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">
            Connect Your Bank Account
          </h2>
          <p className="text-sm text-slate-600">
            Securely verify your financial information.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm text-slate-500">Preparing secure connection...</p>
        </div>
      </div>
    );
  }

  // Ready to connect
  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">
          Connect Your Bank Account
        </h2>
        <p className="text-sm text-slate-600">
          Securely verify your financial information.
        </p>
      </div>

      {/* Explanation */}
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          We'll connect to your bank to verify your account and review your transaction history.
          This helps us understand your financial stability.
        </p>

        <ul className="space-y-2 text-sm text-slate-600">
          <li className="flex items-start gap-3">
            <span className="text-blue-600 font-bold mt-0.5">✓</span>
            <span>90 days of transaction history</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-blue-600 font-bold mt-0.5">✓</span>
            <span>Read-only access (no transfers)</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-blue-600 font-bold mt-0.5">✓</span>
            <span>Banks you can connect: Chase, Bank of America, Wells Fargo, and 10,000+</span>
          </li>
        </ul>
      </div>

      {/* Security Badge */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-blue-900">Enterprise-Grade Security</div>
            <div className="text-xs text-blue-700 mt-1">
              Powered by Plaid. 256-bit encryption. Read-only access to your bank data.
            </div>
          </div>
        </div>
      </div>

      {/* Connect Button */}
      <button
        onClick={() => open()}
        disabled={!ready || loading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
      >
        {!ready || loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {loading ? "Processing..." : "Preparing..."}
          </>
        ) : (
          <>
            Connect Bank Account
            <ChevronRight className="w-4 h-4" />
          </>
        )}
      </button>

      {/* Skip Option */}
      <button
        onClick={onSkip}
        className="w-full text-center text-sm text-blue-600 hover:text-blue-700 py-3 font-medium"
      >
        I'll upload bank statements instead
      </button>
    </div>
  );
}
