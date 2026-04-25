"use client";

import React, { useEffect, useRef } from "react";
import { Loader2, CheckCircle, Clock } from "lucide-react";

interface Props {
  status: string;
  riskScore?: number | null;
  onRefresh: () => void;
}

export default function ConfirmationStep({ status, riskScore, onRefresh }: Props) {
  // Stable ref for onRefresh to avoid interval re-creation
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Auto-refresh every 5 seconds while processing (max 10 minutes)
  const pollCountRef = useRef(0);
  const [pollTimedOut, setPollTimedOut] = React.useState(false);

  useEffect(() => {
    if (status !== "processing") return;
    pollCountRef.current = 0;

    const interval = setInterval(() => {
      pollCountRef.current++;
      if (pollCountRef.current > 120) { // 120 * 5s = 10 minutes
        clearInterval(interval);
        setPollTimedOut(true);
        return;
      }
      onRefreshRef.current();
    }, 5000);

    return () => clearInterval(interval);
  }, [status]);

  const isProcessing = status === "processing";
  const isComplete = status === "complete";

  return (
    <div className="space-y-6 sm:space-y-8">
      {isProcessing ? (
        <>
          {/* Processing Header */}
          <div className="text-center">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
              Application Submitted
            </h2>
            <p className="text-sm text-slate-600">
              {pollTimedOut
                ? "Processing is taking longer than usual. You can close this page — the property manager will contact you when results are ready."
                : "We're reviewing your application. This usually takes 2-5 minutes."}
            </p>
          </div>

          {/* Processing Timeline */}
          <div className="space-y-4">
            {/* Step 1: Submitted */}
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div className="w-0.5 h-12 bg-slate-200 mt-2" />
              </div>
              <div className="pt-1">
                <div className="text-sm font-medium text-slate-900">Application Submitted</div>
                <div className="text-xs text-slate-500 mt-0.5">Your information was received</div>
              </div>
            </div>

            {/* Step 2: Verifying */}
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 flex-shrink-0 animate-pulse">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                </div>
                <div className="w-0.5 h-12 bg-slate-200 mt-2" />
              </div>
              <div className="pt-1">
                <div className="text-sm font-medium text-slate-900">Verifying Information</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Checking identity and financial data
                </div>
              </div>
            </div>

            {/* Step 3: Analyzing */}
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 flex-shrink-0">
                  <Clock className="w-5 h-5 text-slate-400" />
                </div>
              </div>
              <div className="pt-1">
                <div className="text-sm font-medium text-slate-600">Analyzing Risk</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Generating VettdRE Risk Score
                </div>
              </div>
            </div>
          </div>

          {/* Processing Status Card */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              <div className="text-sm font-medium text-blue-900">Processing in Progress</div>
            </div>
            <div className="text-xs text-blue-700">
              We'll notify the agent once your screening is complete. Check your email for
              updates.
            </div>
          </div>
        </>
      ) : isComplete ? (
        <>
          {/* Completion Header */}
          <div className="text-center py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">All Done!</h2>
            <p className="text-sm text-slate-600 max-w-sm mx-auto">
              Your application has been submitted and reviewed.
            </p>
          </div>

          {/* Completion Details */}
          <div className="rounded-lg border border-green-200 bg-green-50 p-6">
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">
                  Status
                </div>
                <div className="text-sm font-medium text-green-900">Screening Complete</div>
              </div>
              {/* Risk score intentionally hidden from applicants (FCRA compliance) */}
            </div>
          </div>

          {/* Next Steps */}
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">What Happens Next?</h3>
            <ol className="space-y-3 text-sm text-slate-600">
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 flex-shrink-0">1</span>
                <span>The agent will review your screening results</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 flex-shrink-0">2</span>
                <span>You'll receive an email with the final decision</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 flex-shrink-0">3</span>
                <span>If approved, you can proceed to the lease signing</span>
              </li>
            </ol>
          </div>

          {/* Contact Info */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
            <p className="text-xs text-slate-600 mb-1">Questions about your screening?</p>
            <p className="text-xs text-slate-500">
              Contact your agent for more information or check your email for updates.
            </p>
          </div>
        </>
      ) : (
        <>
          {/* Unknown Status */}
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-sm text-slate-600">Loading results...</p>
          </div>
        </>
      )}
    </div>
  );
}
