"use client";

import { useState, useMemo } from "react";
import { Plus, X } from "lucide-react";
import type { CommissionPlanInput, CommissionPlanType, CommissionTierInput } from "@/lib/bms-types";
import { COMMISSION_PLAN_TYPE_LABELS } from "@/lib/bms-types";

// ── Types ─────────────────────────────────────────────────────

interface Props {
  onSubmit: (data: CommissionPlanInput) => Promise<void>;
  defaultValues?: CommissionPlanInput;
  isEditing?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────

const INPUT = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const INPUT_RO = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-500 cursor-not-allowed";
const LABEL = "block text-sm font-medium text-slate-700 mb-1";
const SECTION = "text-base font-semibold text-slate-800 mb-3";

const DEFAULT_TIER: CommissionTierInput = {
  tierOrder: 0,
  minThreshold: 0,
  maxThreshold: undefined,
  agentSplitPct: 70,
  houseSplitPct: 30,
  label: "",
};

const PLAN_TYPE_OPTIONS: { value: CommissionPlanType; label: string }[] = Object.entries(
  COMMISSION_PLAN_TYPE_LABELS,
).map(([value, label]) => ({ value: value as CommissionPlanType, label }));

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

// ── Component ─────────────────────────────────────────────────

export default function PlanBuilder({ onSubmit, defaultValues, isEditing }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState(defaultValues?.name || "");
  const [description, setDescription] = useState(defaultValues?.description || "");
  const [planType, setPlanType] = useState<CommissionPlanType>(defaultValues?.planType || "flat");
  const [isDefault, setIsDefault] = useState(defaultValues?.isDefault || false);
  const [tiers, setTiers] = useState<CommissionTierInput[]>(
    defaultValues?.tiers?.length ? defaultValues.tiers : [{ ...DEFAULT_TIER }],
  );

  // ── Tier helpers ──────────────────────────────────────────

  function updateTier(index: number, patch: Partial<CommissionTierInput>) {
    setTiers((prev) => {
      const next = [...prev];
      const updated = { ...next[index], ...patch };
      // Auto-calculate house split
      if ("agentSplitPct" in patch) {
        updated.houseSplitPct = 100 - (updated.agentSplitPct || 0);
      }
      next[index] = updated;
      return next;
    });
  }

  function addTier() {
    setTiers((prev) => {
      const lastTier = prev[prev.length - 1];
      const nextMin = lastTier?.maxThreshold ?? (lastTier?.minThreshold ?? 0) + 1;
      return [
        ...prev,
        {
          ...DEFAULT_TIER,
          tierOrder: prev.length,
          minThreshold: nextMin,
          label: "",
        },
      ];
    });
  }

  function removeTier(index: number) {
    if (tiers.length <= 1) return;
    setTiers((prev) => prev.filter((_, i) => i !== index));
  }

  function handlePlanTypeChange(newType: CommissionPlanType) {
    setPlanType(newType);
    // Reset tiers to single default
    setTiers([{ ...DEFAULT_TIER }]);
  }

  // ── Validation ────────────────────────────────────────────

  const tierWarnings = useMemo(() => {
    const warnings: Record<number, string[]> = {};
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const w: string[] = [];
      if (t.agentSplitPct < 0 || t.agentSplitPct > 100) {
        w.push("Agent split must be 0–100%");
      }
      if (t.maxThreshold !== undefined && t.maxThreshold !== null && t.minThreshold >= t.maxThreshold) {
        w.push("Min must be less than max");
      }
      // Check overlap with previous tier
      if (i > 0) {
        const prev = tiers[i - 1];
        const prevMax = prev.maxThreshold;
        if (prevMax !== undefined && prevMax !== null && t.minThreshold < prevMax) {
          w.push("Overlaps with previous tier");
        }
      }
      if (w.length > 0) warnings[i] = w;
    }
    return warnings;
  }, [tiers]);

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (tiers.length === 0) return false;
    for (const t of tiers) {
      if (t.agentSplitPct < 0 || t.agentSplitPct > 100) return false;
    }
    return true;
  }, [name, tiers]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        planType,
        isDefault,
        tiers: tiers.map((t, i) => ({
          tierOrder: i,
          minThreshold: t.minThreshold,
          maxThreshold: t.maxThreshold,
          agentSplitPct: t.agentSplitPct,
          houseSplitPct: 100 - t.agentSplitPct,
          label: t.label?.trim() || undefined,
        })),
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Tier column config per plan type ──────────────────────

  const isFlat = planType === "flat";
  const thresholdLabel = planType === "volume_based" ? "Deals" : "$";

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-8">

      {/* ── Plan Details ──────────────────────────────────── */}
      <section>
        <h3 className={SECTION}>Plan Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={LABEL}>Plan Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
              placeholder="e.g. Standard Agent Plan"
            />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={INPUT}
              placeholder="Optional description of this commission plan..."
            />
          </div>
          <div>
            <label className={LABEL}>Plan Type</label>
            <select
              value={planType}
              onChange={(e) => handlePlanTypeChange(e.target.value as CommissionPlanType)}
              className={INPUT}
            >
              {PLAN_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">Set as default plan for new agents</span>
            </label>
          </div>
        </div>
      </section>

      {/* ── Commission Tiers ──────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-800">
            Commission Tiers
          </h3>
          {!isFlat && (
            <button
              type="button"
              onClick={addTier}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Tier
            </button>
          )}
        </div>

        {isFlat ? (
          /* ── Flat: single tier ─────────────────────────── */
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>Label</label>
                <input
                  type="text"
                  value={tiers[0]?.label || ""}
                  onChange={(e) => updateTier(0, { label: e.target.value })}
                  className={INPUT}
                  placeholder="e.g. Standard Split"
                />
              </div>
              <div>
                <label className={LABEL}>Agent Split %</label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={tiers[0]?.agentSplitPct ?? ""}
                    onChange={(e) => updateTier(0, { agentSplitPct: parseFloat(e.target.value) || 0 })}
                    className={INPUT + " pr-8"}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                </div>
                {tierWarnings[0] && (
                  <p className="text-xs text-red-500 mt-1">{tierWarnings[0].join(", ")}</p>
                )}
              </div>
              <div>
                <label className={LABEL}>House Split %</label>
                <input
                  type="number"
                  readOnly
                  value={(100 - (tiers[0]?.agentSplitPct || 0)).toFixed(2)}
                  className={INPUT_RO}
                />
              </div>
            </div>
          </div>
        ) : (
          /* ── Tiered: multi-row builder ─────────────────── */
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <div className="col-span-1">#</div>
              <div className="col-span-2">Label</div>
              <div className="col-span-2">Min {thresholdLabel}</div>
              <div className="col-span-2">Max {thresholdLabel}</div>
              <div className="col-span-2">Agent %</div>
              <div className="col-span-2">House %</div>
              <div className="col-span-1" />
            </div>

            {/* Tier rows */}
            {tiers.map((tier, i) => (
              <div
                key={i}
                className={`grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-slate-100 last:border-b-0 ${
                  i % 2 === 1 ? "bg-slate-50" : "bg-white"
                }`}
              >
                {/* # */}
                <div className="col-span-1 text-sm font-medium text-slate-400">
                  {i + 1}
                </div>

                {/* Label */}
                <div className="col-span-2">
                  <input
                    type="text"
                    value={tier.label || ""}
                    onChange={(e) => updateTier(i, { label: e.target.value })}
                    className={INPUT}
                    placeholder={planType === "volume_based" ? `${i * 5}–${(i + 1) * 5} deals` : "Tier name"}
                  />
                </div>

                {/* Min threshold */}
                <div className="col-span-2">
                  {planType === "value_based" ? (
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={tier.minThreshold || ""}
                        onChange={(e) => updateTier(i, { minThreshold: parseFloat(e.target.value) || 0 })}
                        className={INPUT + " pl-6"}
                        placeholder="0"
                      />
                    </div>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={tier.minThreshold || ""}
                      onChange={(e) => updateTier(i, { minThreshold: parseFloat(e.target.value) || 0 })}
                      className={INPUT}
                      placeholder="0"
                    />
                  )}
                </div>

                {/* Max threshold */}
                <div className="col-span-2">
                  {planType === "value_based" ? (
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={tier.maxThreshold ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateTier(i, { maxThreshold: val ? parseFloat(val) : undefined });
                        }}
                        className={INPUT + " pl-6"}
                        placeholder="No limit"
                      />
                    </div>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={tier.maxThreshold ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateTier(i, { maxThreshold: val ? parseFloat(val) : undefined });
                      }}
                      className={INPUT}
                      placeholder="No limit"
                    />
                  )}
                </div>

                {/* Agent split */}
                <div className="col-span-2">
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      value={tier.agentSplitPct ?? ""}
                      onChange={(e) => updateTier(i, { agentSplitPct: parseFloat(e.target.value) || 0 })}
                      className={INPUT + " pr-7"}
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                  </div>
                </div>

                {/* House split (auto) */}
                <div className="col-span-2">
                  <input
                    type="number"
                    readOnly
                    value={(100 - (tier.agentSplitPct || 0)).toFixed(2)}
                    className={INPUT_RO}
                  />
                </div>

                {/* Remove */}
                <div className="col-span-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() => removeTier(i)}
                    disabled={tiers.length <= 1}
                    className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Remove tier"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Warnings */}
                {tierWarnings[i] && (
                  <div className="col-span-12 -mt-1">
                    <p className="text-xs text-amber-600">{tierWarnings[i].join(" · ")}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Preview ───────────────────────────────────────── */}
      <section>
        <h3 className={SECTION}>Preview</h3>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          {isFlat ? (
            <FlatPreview agentPct={tiers[0]?.agentSplitPct || 0} />
          ) : (
            <TieredPreview tiers={tiers} planType={planType} />
          )}
        </div>
      </section>

      {/* ── Submit ────────────────────────────────────────── */}
      <div className="flex justify-end pt-2 pb-8">
        <button
          type="submit"
          disabled={submitting || !canSubmit}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting
            ? isEditing ? "Updating..." : "Creating..."
            : isEditing ? "Update Plan" : "Create Plan"}
        </button>
      </div>
    </form>
  );
}

// ── Preview: Flat ───────────────────────────────────────────────

function FlatPreview({ agentPct }: { agentPct: number }) {
  const housePct = 100 - agentPct;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium text-slate-700">Split:</span>
        <span className="font-semibold text-green-600">{agentPct}% Agent</span>
        <span className="text-slate-400">/</span>
        <span className="font-semibold text-blue-600">{housePct}% House</span>
      </div>
      <div className="flex h-6 rounded-full overflow-hidden">
        {agentPct > 0 && (
          <div
            className="bg-green-500 flex items-center justify-center text-[10px] font-bold text-white transition-all duration-300"
            style={{ width: `${agentPct}%` }}
          >
            {agentPct >= 15 ? `${agentPct}%` : ""}
          </div>
        )}
        {housePct > 0 && (
          <div
            className="bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white transition-all duration-300"
            style={{ width: `${housePct}%` }}
          >
            {housePct >= 15 ? `${housePct}%` : ""}
          </div>
        )}
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>Agent</span>
        <span>House</span>
      </div>
    </div>
  );
}

// ── Preview: Tiered ─────────────────────────────────────────────

function TieredPreview({ tiers, planType }: { tiers: CommissionTierInput[]; planType: CommissionPlanType }) {
  const isVolume = planType === "volume_based";

  if (tiers.length === 0) {
    return <p className="text-sm text-slate-400">No tiers defined</p>;
  }

  return (
    <div className="space-y-3">
      {/* Stepped bar visualization */}
      <div className="flex items-end gap-1 h-28">
        {tiers.map((tier, i) => {
          const agentPct = tier.agentSplitPct || 0;
          const housePct = 100 - agentPct;
          const barHeight = Math.max(agentPct, 10);
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              {/* Bar */}
              <div className="w-full flex flex-col items-stretch" style={{ height: "80px" }}>
                <div className="flex-1" />
                <div
                  className="bg-green-500 rounded-t transition-all duration-300 relative"
                  style={{ height: `${(barHeight / 100) * 80}px` }}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                    {agentPct}%
                  </span>
                </div>
                <div
                  className="bg-blue-500 rounded-b transition-all duration-300 relative"
                  style={{ height: `${((100 - barHeight) / 100) * 80}px`, minHeight: housePct > 0 ? "4px" : "0" }}
                >
                  {housePct >= 20 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                      {housePct}%
                    </span>
                  )}
                </div>
              </div>
              {/* Label */}
              <div className="text-center">
                <p className="text-[10px] font-medium text-slate-600 truncate max-w-full">
                  {tier.label || `Tier ${i + 1}`}
                </p>
                <p className="text-[9px] text-slate-400">
                  {isVolume
                    ? `${formatNumber(tier.minThreshold)}${tier.maxThreshold != null ? `–${formatNumber(tier.maxThreshold)}` : "+"} deals`
                    : `$${formatNumber(tier.minThreshold)}${tier.maxThreshold != null ? `–$${formatNumber(tier.maxThreshold)}` : "+"}`
                  }
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-1 border-t border-slate-200">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          <span className="text-xs text-slate-500">Agent Split</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-500" />
          <span className="text-xs text-slate-500">House Split</span>
        </div>
      </div>
    </div>
  );
}
