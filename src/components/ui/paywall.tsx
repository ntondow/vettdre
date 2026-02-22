"use client";

import { useRouter } from "next/navigation";
import type { PlanName } from "@/lib/feature-gate";
import { PLAN_DISPLAY } from "@/lib/feature-gate";

interface PaywallProps {
  featureName: string;
  currentPlan: PlanName;
  requiredPlan: PlanName;
  onClose?: () => void;
}

export default function Paywall({ featureName, currentPlan, requiredPlan, onClose }: PaywallProps) {
  const router = useRouter();
  const required = PLAN_DISPLAY[requiredPlan];
  const current = PLAN_DISPLAY[currentPlan];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Blurred backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center animate-in fade-in zoom-in-95">
        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Lock icon */}
        <div className="w-16 h-16 mx-auto mb-4 bg-blue-50 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          Upgrade to Unlock
        </h2>

        {/* Feature name */}
        <p className="text-slate-600 mb-6">
          <span className="font-semibold text-slate-800">{featureName}</span> requires the{" "}
          <span className={`font-semibold ${
            required.color === "blue" ? "text-blue-600" :
            required.color === "violet" ? "text-violet-600" :
            required.color === "amber" ? "text-amber-600" : "text-slate-600"
          }`}>
            {required.label}
          </span>{" "}
          plan or higher.
        </p>

        {/* Current plan badge */}
        <p className="text-sm text-slate-500 mb-6">
          You&apos;re currently on the{" "}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            current.color === "slate" ? "bg-slate-100 text-slate-700" :
            current.color === "blue" ? "bg-blue-100 text-blue-700" :
            current.color === "violet" ? "bg-violet-100 text-violet-700" :
            "bg-amber-100 text-amber-700"
          }`}>
            {current.label}
          </span>{" "}
          plan.
        </p>

        {/* CTA */}
        <button
          onClick={() => {
            onClose?.();
            router.push("/settings/billing");
          }}
          className="w-full bg-blue-600 text-white rounded-lg px-6 py-3 text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          View Plans & Upgrade
        </button>

        {/* Secondary */}
        {onClose && (
          <button
            onClick={onClose}
            className="mt-3 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Maybe later
          </button>
        )}
      </div>
    </div>
  );
}
