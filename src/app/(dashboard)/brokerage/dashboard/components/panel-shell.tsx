"use client";

import { ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

// Shared shell for slice 4 dashboard panels — keeps the
// loading-skeleton / error / retry pattern identical across panels
// without each one re-implementing it. Per slice 4 addition (A): a
// slow fetch in one panel must not hang the page.

export function PanelShell({
  title,
  status,
  onRetry,
  children,
  testId,
  trailingRight,
  paddingClass = "p-5",
  skeleton,
}: {
  title?: string;
  status: "loading" | "ready" | "error" | "empty";
  onRetry?: () => void;
  children: ReactNode;
  testId?: string;
  trailingRight?: ReactNode;
  paddingClass?: string;
  // Optional custom skeleton; defaults to three pulsing rows.
  skeleton?: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className={`bg-white border border-slate-200 rounded-xl ${paddingClass}`}
    >
      {(title || trailingRight) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title ? (
            <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          ) : (
            <span />
          )}
          {trailingRight}
        </div>
      )}

      {status === "loading" ? (
        skeleton ?? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-10 bg-slate-100 animate-pulse rounded-lg"
              />
            ))}
          </div>
        )
      ) : status === "error" ? (
        <div className="text-center py-6" data-testid={testId ? `${testId}-error` : undefined}>
          <AlertCircle className="h-7 w-7 text-rose-400 mx-auto mb-2" />
          <p className="text-sm text-slate-600 mb-3">Couldn&apos;t load this section.</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Loader2 className="h-3 w-3" />
              Retry
            </button>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
