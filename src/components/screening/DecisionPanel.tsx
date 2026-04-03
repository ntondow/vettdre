"use client";

import { useState } from "react";

interface DecisionPanelProps {
  applicationId: string;
  currentStatus: string;
  riskScore: number | null;
  recommendation: string | null;
  onDecision: (decision: "approved" | "conditional" | "denied", notes?: string) => Promise<void>;
}

export default function DecisionPanel({
  applicationId,
  currentStatus,
  riskScore,
  recommendation,
  onDecision,
}: DecisionPanelProps) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

  const isDecided = ["approved", "conditional", "denied"].includes(currentStatus);
  const canDecide = currentStatus === "complete";

  if (isDecided) {
    return (
      <div className="rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Decision</h3>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
            currentStatus === "approved" ? "bg-green-100 text-green-700" :
            currentStatus === "conditional" ? "bg-amber-100 text-amber-700" :
            "bg-red-100 text-red-700"
          }`}>
            {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
          </span>
        </div>
      </div>
    );
  }

  if (!canDecide) return null;

  const handleDecision = async (decision: "approved" | "conditional" | "denied") => {
    setSubmitting(decision);
    try {
      await onDecision(decision, notes || undefined);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Make Decision</h3>

      {recommendation && (
        <p className="text-xs text-slate-500">
          AI Recommendation: <span className="font-semibold capitalize">{recommendation}</span>
          {riskScore != null && ` (Score: ${Math.round(riskScore)})`}
        </p>
      )}

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Decision notes (optional)..."
        rows={2}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />

      <div className="flex gap-2">
        <button
          onClick={() => handleDecision("approved")}
          disabled={submitting !== null}
          className="flex-1 rounded-lg bg-green-600 text-white text-sm font-medium py-2 hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {submitting === "approved" ? "..." : "Approve"}
        </button>
        <button
          onClick={() => handleDecision("conditional")}
          disabled={submitting !== null}
          className="flex-1 rounded-lg bg-amber-500 text-white text-sm font-medium py-2 hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {submitting === "conditional" ? "..." : "Conditional"}
        </button>
        <button
          onClick={() => handleDecision("denied")}
          disabled={submitting !== null}
          className="flex-1 rounded-lg bg-red-600 text-white text-sm font-medium py-2 hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {submitting === "denied" ? "..." : "Deny"}
        </button>
      </div>
    </div>
  );
}
