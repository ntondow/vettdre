"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, Inbox, AlertCircle, Loader2 } from "lucide-react";
import { getSubmittedCount } from "../../deal-submissions/actions";

// Slice 4 CTA strip: replaces the missing primary action (closes
// audit U-011). When pending submissions > 0, the strip prompts the
// manager to triage them. When 0, it directs to the active pipeline.
//
// Reuses slice 1.5's getSubmittedCount — no new server action.
// Override-threaded.

export function PrimaryCtaStrip({ asOrg }: { asOrg?: string }) {
  const overrideOpts = asOrg ? { overrideAsOrg: asOrg } : {};
  const overrideQs = asOrg ? `?as_org=${encodeURIComponent(asOrg)}` : "";
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await getSubmittedCount(overrideOpts);
      setCount(result.count);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOrg, tick]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading") {
    return (
      <div
        data-testid="cta-strip-loading"
        className="h-16 bg-slate-100 animate-pulse rounded-xl"
      />
    );
  }

  if (status === "error" || count === null) {
    return (
      <div
        data-testid="cta-strip-error"
        className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <AlertCircle className="h-4 w-4 text-rose-400" />
          Couldn&apos;t load pending count.
        </div>
        <button
          type="button"
          onClick={() => setTick((t) => t + 1)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Loader2 className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }

  if (count > 0) {
    const plural = count !== 1;
    return (
      <Link
        href={`/brokerage/deal-submissions${overrideQs}`}
        data-testid="cta-strip-pending"
        className="group block bg-blue-50 border-2 border-blue-200 rounded-xl px-5 py-4 hover:bg-blue-100 hover:border-blue-300 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-semibold text-blue-900">
                {count} submission{plural ? "s" : ""} waiting on you.
              </p>
              <p className="text-sm text-blue-700">
                Approve, push to invoice, or reject from the queue.
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg group-hover:bg-blue-700 transition-colors">
            Review queue
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </Link>
    );
  }

  // Empty-state CTA — copy approved as "All caught up. View pipeline →"
  return (
    <Link
      href={`/brokerage/transactions${overrideQs}`}
      data-testid="cta-strip-empty"
      className="group block bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 hover:bg-slate-100 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center flex-shrink-0">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-700">
              All caught up.
            </p>
            <p className="text-sm text-slate-500">
              No submissions pending review.
            </p>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg group-hover:bg-white transition-colors">
          View pipeline
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
