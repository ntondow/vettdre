"use client";

import { CheckCircle2 } from "lucide-react";

// Slice 1c: shown when the Submitted-tab card grid is empty (the manager's
// happy path — nothing to triage). For non-Submitted filters, we render a
// muted "no matches" variant since "All caught up" would be misleading.
export function EmptyState({
  variant = "caught-up",
  onReset,
}: {
  variant?: "caught-up" | "no-matches";
  onReset?: () => void;
}) {
  if (variant === "no-matches") {
    return (
      <div
        role="status"
        className="text-center py-16 bg-white border border-slate-200 rounded-xl"
      >
        <p className="text-slate-500 font-medium">No submissions match the current filters</p>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            Reset filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="status"
      data-testid="empty-state-caught-up"
      className="text-center py-20 bg-white border border-slate-200 rounded-xl"
    >
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 mb-3">
        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
      </div>
      <p className="text-slate-700 font-semibold">All caught up</p>
      <p className="text-sm text-slate-400 mt-1">
        No new deal submissions waiting for approval.
      </p>
    </div>
  );
}
