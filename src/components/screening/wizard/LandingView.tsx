"use client";

import React from "react";
import { ChevronRight, Lock, Clock } from "lucide-react";

interface Props {
  propertyAddress: string;
  unitNumber?: string;
  orgName: string;
  agentName: string;
  tier: string;
  onStart: () => void;
}

export default function LandingView({
  propertyAddress,
  unitNumber,
  orgName,
  agentName,
  tier,
  onStart,
}: Props) {
  const isTierEnhanced = tier === "enhanced";

  return (
    <div className="flex flex-col gap-6 py-4 sm:py-6">
      {/* Welcome */}
      <div className="text-center">
        <h1 className="mb-2 text-2xl sm:text-3xl font-bold text-slate-900">
          Welcome to Screening
        </h1>
        <p className="text-sm sm:text-base text-slate-500">
          Complete your tenant application in just a few minutes
        </p>
      </div>

      {/* Property Card */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-6">
        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
              Property
            </div>
            <div className="text-sm sm:text-base font-semibold text-slate-900">
              {propertyAddress}
            </div>
            {unitNumber && (
              <div className="text-xs sm:text-sm text-slate-600 mt-1">Unit {unitNumber}</div>
            )}
          </div>
          <div className="pt-2 border-t border-slate-200">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
              Agent
            </div>
            <div className="text-sm text-slate-700">{agentName}</div>
            <div className="text-xs text-slate-500 mt-1">{orgName}</div>
          </div>
        </div>
      </div>

      {/* What You'll Need */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 mb-3">What you'll need:</h2>
        <ul className="space-y-2 text-sm text-slate-600">
          <li className="flex items-start gap-3">
            <span className="text-blue-600 font-bold mt-0.5">1</span>
            <span>Basic personal information (name, DOB, phone)</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-blue-600 font-bold mt-0.5">2</span>
            <span>E-signature on screening consent forms</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-blue-600 font-bold mt-0.5">3</span>
            <span>Bank account access (via Plaid or upload statements)</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-blue-600 font-bold mt-0.5">4</span>
            <span>Documents (pay stubs, tax returns, government ID)</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-blue-600 font-bold mt-0.5">5</span>
            <span>
              Payment of screening fee{" "}
              <span className="text-slate-500">
                (${isTierEnhanced ? "49.00" : "20.00"})
              </span>
            </span>
          </li>
        </ul>
      </div>

      {/* What's Included */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          {isTierEnhanced ? "Enhanced Screening Includes:" : "What's Included:"}
        </h2>
        <ul className="space-y-2 text-xs sm:text-sm text-slate-600">
          {isTierEnhanced ? (
            <>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-0.5">✓</span>
                <span>Tri-bureau credit report (Equifax, Experian, TransUnion)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-0.5">✓</span>
                <span>Employment verification</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-0.5">✓</span>
                <span>Criminal &amp; eviction history</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-0.5">✓</span>
                <span>Rental payment history</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-0.5">✓</span>
                <span>AI-powered fraud detection</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-0.5">✓</span>
                <span>VettdRE Risk Score &amp; recommendation</span>
              </li>
            </>
          ) : (
            <>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-0.5">✓</span>
                <span>Soft-pull credit report</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-0.5">✓</span>
                <span>Criminal &amp; eviction check</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-0.5">✓</span>
                <span>Bank account verification</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-0.5">✓</span>
                <span>Document fraud analysis</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-0.5">✓</span>
                <span>VettdRE Risk Score</span>
              </li>
            </>
          )}
        </ul>
      </div>

      {/* Security Badge */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-blue-900">Secure &amp; Private</div>
            <div className="text-xs text-blue-700 mt-1">
              Your data is encrypted with 256-bit security. We never store sensitive information
              longer than needed.
            </div>
          </div>
        </div>
      </div>

      {/* Start Button */}
      <button
        onClick={onStart}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-4 text-base font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 transition-colors"
      >
        Start Application
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Time Estimate */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
        <Clock className="w-4 h-4" />
        <span>Takes about 5-10 minutes</span>
      </div>

      {/* Footer */}
      <div className="text-center pt-4 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          Powered by <span className="font-semibold">VettdRE</span>
        </p>
      </div>
    </div>
  );
}
