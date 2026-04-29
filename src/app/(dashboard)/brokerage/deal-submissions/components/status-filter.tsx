"use client";

import { SUBMISSION_STATUS_LABELS } from "@/lib/bms-types";

const STATUS_KEYS = ["submitted", "approved", "invoiced", "paid", "rejected"] as const;

export type StatusKey = (typeof STATUS_KEYS)[number];
export type StatusFilterValue = "all" | StatusKey;

// Slice 1c: replaces the old horizontal status pill row. Filter checkboxes
// live in the right column. "All" is mutually exclusive with the per-status
// checkboxes — we keep it as a radio-like reset rather than a true multi-
// select, because the existing server query takes a single status filter and
// expanding to OR-of-statuses is out of scope for 1c.
export function StatusFilter({
  value,
  counts,
  onChange,
}: {
  value: StatusFilterValue;
  counts: Record<string, number>;
  onChange: (next: StatusFilterValue) => void;
}) {
  const totalCount = Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0);

  return (
    <fieldset
      data-testid="status-filter"
      className="bg-white border border-slate-200 rounded-xl p-4"
    >
      <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">
        Status
      </legend>
      <div className="space-y-2 mt-2">
        <label className="flex items-center justify-between gap-2 cursor-pointer text-sm">
          <span className="flex items-center gap-2">
            <input
              type="radio"
              name="status-filter"
              checked={value === "all"}
              onChange={() => onChange("all")}
              className="text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className={value === "all" ? "text-slate-900 font-medium" : "text-slate-600"}>
              All
            </span>
          </span>
          <span className="text-xs text-slate-400">{totalCount}</span>
        </label>
        {STATUS_KEYS.map((key) => {
          const count = Number(counts[key]) || 0;
          const active = value === key;
          return (
            <label
              key={key}
              className="flex items-center justify-between gap-2 cursor-pointer text-sm"
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="status-filter"
                  checked={active}
                  onChange={() => onChange(key)}
                  className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className={active ? "text-slate-900 font-medium" : "text-slate-600"}>
                  {SUBMISSION_STATUS_LABELS[key] ?? key}
                </span>
              </span>
              <span className="text-xs text-slate-400">{count}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
