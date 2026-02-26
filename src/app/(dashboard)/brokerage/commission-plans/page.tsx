"use client";

import { useState, useEffect, useRef } from "react";
import {
  getCommissionPlans,
  createCommissionPlan,
  updateCommissionPlan,
  deleteCommissionPlan,
  archiveCommissionPlan,
} from "./actions";
import PlanBuilder from "./plan-builder";
import type { CommissionPlanInput, CommissionPlanRecord } from "@/lib/bms-types";
import {
  COMMISSION_PLAN_TYPE_LABELS,
  COMMISSION_PLAN_STATUS_LABELS,
  COMMISSION_PLAN_STATUS_COLORS,
} from "@/lib/bms-types";
import {
  Plus,
  Edit3,
  Trash2,
  Archive,
  Star,
  Layers,
  X,
  Search,
  Users,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────

const PLAN_TYPE_PILL: Record<string, string> = {
  volume_based: "bg-blue-100 text-blue-700",
  value_based: "bg-violet-100 text-violet-700",
  flat: "bg-slate-100 text-slate-600",
};

// ── Component ─────────────────────────────────────────────────

export default function CommissionPlansPage() {
  const [plans, setPlans] = useState<CommissionPlanRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showBuilder, setShowBuilder] = useState<false | "new" | string>(false);
  const [editingPlan, setEditingPlan] = useState<CommissionPlanInput | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // ── Load data ─────────────────────────────────────────────

  async function loadData() {
    setLoading(true);
    try {
      const result = await getCommissionPlans({
        search: search || undefined,
      });
      setPlans(result.plans || []);
      setTotal(result.total || 0);
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadData(), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ── Actions ───────────────────────────────────────────────

  async function handleCreate(input: CommissionPlanInput) {
    const result = await createCommissionPlan(input);
    if (!result.success) {
      alert(result.error || "Failed to create plan");
      return;
    }
    setShowBuilder(false);
    setEditingPlan(null);
    loadData();
  }

  async function handleUpdate(input: CommissionPlanInput) {
    if (typeof showBuilder !== "string" || showBuilder === "new") return;
    const result = await updateCommissionPlan(showBuilder, input);
    if (!result.success) {
      alert(result.error || "Failed to update plan");
      return;
    }
    setShowBuilder(false);
    setEditingPlan(null);
    loadData();
  }

  function handleEdit(plan: CommissionPlanRecord) {
    setEditingPlan({
      name: plan.name,
      description: plan.description || undefined,
      planType: plan.planType as CommissionPlanInput["planType"],
      isDefault: plan.isDefault,
      tiers: plan.tiers.map((t) => ({
        tierOrder: t.tierOrder,
        minThreshold: t.minThreshold,
        maxThreshold: t.maxThreshold,
        agentSplitPct: t.agentSplitPct,
        houseSplitPct: t.houseSplitPct,
        label: t.label || undefined,
      })),
    });
    setShowBuilder(plan.id);
  }

  async function handleDelete(planId: string) {
    if (!confirm("Delete this commission plan? Agents will be unlinked. This cannot be undone.")) return;
    setActionLoading(planId);
    await deleteCommissionPlan(planId);
    setActionLoading(null);
    if (showBuilder === planId) {
      setShowBuilder(false);
      setEditingPlan(null);
    }
    loadData();
  }

  async function handleArchive(planId: string) {
    setActionLoading(planId);
    await archiveCommissionPlan(planId);
    setActionLoading(null);
    loadData();
  }

  function closeBuilder() {
    setShowBuilder(false);
    setEditingPlan(null);
  }

  // ── Tier summary ──────────────────────────────────────────

  function tierSummary(plan: CommissionPlanRecord): string {
    if (plan.tiers.length === 0) return "No tiers";
    if (plan.tiers.length === 1) {
      return `${plan.tiers[0].agentSplitPct}% agent / ${plan.tiers[0].houseSplitPct}% house`;
    }
    const splits = plan.tiers.map((t) => t.agentSplitPct);
    const min = Math.min(...splits);
    const max = Math.max(...splits);
    return `${min}% – ${max}% agent split`;
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Commission Plans</h1>
          <p className="text-sm text-slate-500 mt-1">
            Define tiered commission structures for your agents
          </p>
        </div>
        <button
          onClick={() => { setEditingPlan(null); setShowBuilder("new"); }}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Plan
        </button>
      </div>

      {/* Collapsible plan builder */}
      {showBuilder && (
        <div className="mb-6 bg-white border border-slate-200 rounded-xl p-6 relative">
          <button
            onClick={closeBuilder}
            className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            {showBuilder === "new" ? "New Commission Plan" : "Edit Commission Plan"}
          </h2>
          <PlanBuilder
            key={typeof showBuilder === "string" ? showBuilder : "new"}
            onSubmit={showBuilder === "new" ? handleCreate : handleUpdate}
            defaultValues={editingPlan || undefined}
            isEditing={showBuilder !== "new"}
          />
        </div>
      )}

      {/* Search (show if more than 5 plans) */}
      {total > 5 && (
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plans by name or description..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && plans.length === 0 && (
        <div className="text-center py-16">
          <Layers className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No commission plans yet</p>
          <p className="text-sm text-slate-400 mt-1">
            {search
              ? "Try a different search term"
              : "Create your first plan to define commission structures"}
          </p>
          {!search && (
            <button
              onClick={() => { setEditingPlan(null); setShowBuilder("new"); }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Plan
            </button>
          )}
        </div>
      )}

      {/* Plan cards */}
      {!loading && plans.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const isActing = actionLoading === plan.id;
            return (
              <div
                key={plan.id}
                className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col"
              >
                {/* Header: name + status + default star */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{plan.name}</h3>
                    {plan.isDefault && (
                      <Star className="h-4 w-4 text-amber-500 flex-shrink-0 fill-amber-500" />
                    )}
                  </div>
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${
                      COMMISSION_PLAN_STATUS_COLORS[plan.status] || "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {COMMISSION_PLAN_STATUS_LABELS[plan.status] || plan.status}
                  </span>
                </div>

                {/* Plan type badge */}
                <div className="mb-3">
                  <span
                    className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                      PLAN_TYPE_PILL[plan.planType] || "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {COMMISSION_PLAN_TYPE_LABELS[plan.planType] || plan.planType}
                  </span>
                </div>

                {/* Description */}
                {plan.description && (
                  <p className="text-sm text-slate-500 mb-3 line-clamp-2">{plan.description}</p>
                )}

                {/* Tier summary */}
                <div className="text-sm text-slate-600 mb-1">
                  <span className="font-medium">{plan.tiers.length} tier{plan.tiers.length !== 1 ? "s" : ""}</span>
                  <span className="text-slate-400 mx-1.5">&middot;</span>
                  <span>{tierSummary(plan)}</span>
                </div>

                {/* Agent count */}
                <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-4">
                  <Users className="h-3.5 w-3.5" />
                  <span>{plan.agentCount} agent{plan.agentCount !== 1 ? "s" : ""} assigned</span>
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Footer actions */}
                <div className="flex items-center gap-1 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => handleEdit(plan)}
                    disabled={isActing}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-md disabled:opacity-50 transition-colors"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  {plan.status === "active" && (
                    <button
                      onClick={() => handleArchive(plan.id)}
                      disabled={isActing}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-md disabled:opacity-50 transition-colors"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </button>
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={() => handleDelete(plan.id)}
                    disabled={isActing}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md disabled:opacity-50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
