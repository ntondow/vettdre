"use client";

import { FileText, Receipt, Banknote } from "lucide-react";

export type DetailTabKey = "details" | "invoice" | "payment";

const TABS: Array<{
  key: DetailTabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  hint?: string;
}> = [
  { key: "details", label: "Details", icon: FileText, enabled: true },
  // Slice 2 wires the Invoice tab once the auto-create + view flow lands.
  // Slice 3 wires the Payment tab. For 1c the tabs are visible-but-disabled
  // so the structure is in place when 2/3 land — no migration churn for
  // managers, no stale "TODO" copy.
  {
    key: "invoice",
    label: "Invoice",
    icon: Receipt,
    enabled: false,
    hint: "Available after Slice 2",
  },
  {
    key: "payment",
    label: "Payment",
    icon: Banknote,
    enabled: false,
    hint: "Available after Slice 3",
  },
];

export function DetailTabs({
  active,
  onChange,
}: {
  active: DetailTabKey;
  onChange: (next: DetailTabKey) => void;
}) {
  return (
    <div
      data-testid="detail-tabs"
      role="tablist"
      className="flex items-center gap-1 px-5 pt-3 border-b border-slate-200"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={!tab.enabled}
            disabled={!tab.enabled}
            onClick={() => tab.enabled && onChange(tab.key)}
            data-tab-key={tab.key}
            data-tab-enabled={tab.enabled ? "true" : "false"}
            title={tab.enabled ? undefined : tab.hint}
            className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md transition-colors ${
              isActive
                ? "text-blue-700 bg-white border border-slate-200 border-b-white -mb-px"
                : tab.enabled
                  ? "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  : "text-slate-300 cursor-not-allowed"
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
            {!tab.enabled && (
              <span className="ml-1 text-[10px] font-normal text-slate-400">
                Soon
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
