"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAgentById, getAgentStats, updateAgent, deactivateAgent, reactivateAgent } from "../actions";
import { getCommissionPlans } from "../../commission-plans/actions";
import { getBrokerageConfig } from "../../invoices/actions";
import { generateInvoicePDF } from "@/lib/invoice-pdf";
import {
  COMMISSION_PLAN_TYPE_LABELS,
  COMMISSION_PLAN_STATUS_COLORS,
} from "@/lib/bms-types";
import type { BrokerageConfig } from "@/lib/bms-types";
import {
  ArrowLeft,
  Edit3,
  UserX,
  UserCheck,
  Download,
  FileText,
  DollarSign,
  TrendingUp,
  BarChart3,
  Briefcase,
  X,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "\u2014";
  }
};

const INPUT = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const LABEL = "block text-sm font-medium text-slate-700 mb-1";

const STATUS_LABELS: Record<string, string> = { active: "Active", inactive: "Inactive", terminated: "Terminated" };
const STATUS_COLORS: Record<string, string> = { active: "bg-green-100 text-green-700", inactive: "bg-gray-100 text-gray-700", terminated: "bg-red-100 text-red-700" };

const DEAL_STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  invoiced: "bg-purple-100 text-purple-700",
  paid: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  void: "bg-red-100 text-red-700",
};

interface AgentFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  licenseNumber: string;
  licenseExpiry: string;
  defaultSplitPct: number;
  commissionPlanId: string;
}

// ── Component ─────────────────────────────────────────────────

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [agent, setAgent] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [brokerageConfig, setBrokerageConfig] = useState<BrokerageConfig | null>(null);
  const [plans, setPlans] = useState<any[]>([]);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<AgentFormData>({
    firstName: "", lastName: "", email: "", phone: "",
    licenseNumber: "", licenseExpiry: "", defaultSplitPct: 70, commissionPlanId: "",
  });
  const [formError, setFormError] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Load ──────────────────────────────────────────────────

  async function loadAgent() {
    setLoading(true);
    try {
      const [a, s] = await Promise.all([getAgentById(id), getAgentStats(id)]);
      setAgent(a);
      setStats(s);
    } catch {
      setAgent(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgent();
    getBrokerageConfig().then((c) => setBrokerageConfig(c)).catch(() => {});
    getCommissionPlans().then((r) => setPlans(r.plans || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Edit form ─────────────────────────────────────────────

  function openEdit() {
    if (!agent) return;
    setForm({
      firstName: agent.firstName || "",
      lastName: agent.lastName || "",
      email: agent.email || "",
      phone: agent.phone || "",
      licenseNumber: agent.licenseNumber || "",
      licenseExpiry: agent.licenseExpiry ? agent.licenseExpiry.slice(0, 10) : "",
      defaultSplitPct: Number(agent.defaultSplitPct) || 70,
      commissionPlanId: agent.commissionPlanId || "",
    });
    setFormError("");
    setEditing(true);
  }

  function closeEdit() {
    setEditing(false);
    setFormError("");
  }

  function setField(patch: Partial<AgentFormData>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormSubmitting(true);
    try {
      const result = await updateAgent(id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        licenseNumber: form.licenseNumber.trim() || undefined,
        licenseExpiry: form.licenseExpiry || undefined,
        defaultSplitPct: form.defaultSplitPct,
        commissionPlanId: form.commissionPlanId || undefined,
      });
      if (!result.success) {
        setFormError(result.error || "Failed to update");
        return;
      }
      closeEdit();
      loadAgent();
    } finally {
      setFormSubmitting(false);
    }
  }

  // ── Actions ───────────────────────────────────────────────

  async function handleToggleStatus() {
    if (!agent) return;
    setActionLoading(true);
    if (agent.status === "active") {
      await deactivateAgent(id);
    } else {
      await reactivateAgent(id);
    }
    setActionLoading(false);
    loadAgent();
  }

  function downloadInvoicePDF(inv: any) {
    const doc = generateInvoicePDF(inv, brokerageConfig || undefined);
    doc.save(`${inv.invoiceNumber}.pdf`);
  }

  // ── Loading / Not Found ───────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="h-6 w-40 bg-slate-200 animate-pulse rounded mb-6" />
        <div className="h-40 bg-slate-100 animate-pulse rounded-xl mb-6" />
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-center">
        <p className="text-slate-500">Agent not found</p>
        <Link href="/brokerage/agents" className="text-sm text-blue-600 hover:text-blue-700 mt-2 inline-block">
          Back to Roster
        </Link>
      </div>
    );
  }

  const splitPct = Number(agent.defaultSplitPct) || 70;
  const housePct = 100 - splitPct;
  const initials = `${(agent.firstName?.[0] || "").toUpperCase()}${(agent.lastName?.[0] || "").toUpperCase()}`;

  // Determine current tier for commission plan
  let currentTierIndex = -1;
  if (agent.commissionPlan && agent.commissionPlan.tiers?.length > 0 && stats) {
    const plan = agent.commissionPlan;
    const tiers = plan.tiers;
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      const min = Number(tier.minThreshold);
      const max = tier.maxThreshold ? Number(tier.maxThreshold) : Infinity;
      if (plan.planType === "volume_based") {
        if (stats.totalDeals >= min && stats.totalDeals <= max) { currentTierIndex = i; break; }
      } else if (plan.planType === "value_based") {
        if (stats.totalVolume >= min && stats.totalVolume <= max) { currentTierIndex = i; break; }
      } else {
        currentTierIndex = 0; break;
      }
    }
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* Back link */}
      <Link
        href="/brokerage/agents"
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Roster
      </Link>

      {/* ── Edit Form (inline) ───────────────────────────── */}
      {editing && (
        <div className="mb-6 bg-white border border-slate-200 rounded-xl p-6 relative">
          <button onClick={closeEdit} className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Edit Agent</h2>

          {formError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700 flex-1">{formError}</p>
              <button onClick={() => setFormError("")} className="text-red-400 hover:text-red-600 text-sm">Dismiss</button>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>First Name <span className="text-red-500">*</span></label>
                <input type="text" required value={form.firstName} onChange={(e) => setField({ firstName: e.target.value })} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Last Name <span className="text-red-500">*</span></label>
                <input type="text" required value={form.lastName} onChange={(e) => setField({ lastName: e.target.value })} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Email <span className="text-red-500">*</span></label>
                <input type="email" required value={form.email} onChange={(e) => setField({ email: e.target.value })} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Phone</label>
                <input type="tel" value={form.phone} onChange={(e) => setField({ phone: e.target.value })} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>License #</label>
                <input type="text" value={form.licenseNumber} onChange={(e) => setField({ licenseNumber: e.target.value })} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>License Expiry</label>
                <input type="date" value={form.licenseExpiry} onChange={(e) => setField({ licenseExpiry: e.target.value })} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Default Split %</label>
                <div className="relative">
                  <input type="number" min={0} max={100} step="0.5" value={form.defaultSplitPct} onChange={(e) => setField({ defaultSplitPct: parseFloat(e.target.value) || 0 })} className={INPUT + " pr-8"} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                </div>
              </div>
              <div>
                <label className={LABEL}>Commission Plan</label>
                <select value={form.commissionPlanId} onChange={(e) => setField({ commissionPlanId: e.target.value })} className={INPUT}>
                  <option value="">— Use default split —</option>
                  {plans.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={formSubmitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {formSubmitting ? "Saving..." : "Save Changes"}
              </button>
              <button type="button" onClick={closeEdit} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Agent Header Card ────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 text-xl font-bold flex items-center justify-center flex-shrink-0">
            {initials}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-slate-900">{agent.firstName} {agent.lastName}</h1>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[agent.status] || "bg-slate-100 text-slate-600"}`}>
                {STATUS_LABELS[agent.status] || agent.status}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              <span>{agent.email}</span>
              {agent.phone && <span>{agent.phone}</span>}
              {agent.licenseNumber && <span className="font-mono">Lic# {agent.licenseNumber}</span>}
            </div>
            <div className="mt-2 text-sm">
              {agent.commissionPlan ? (
                <span className="text-slate-600">
                  Plan: <span className="font-medium">{agent.commissionPlan.name}</span>
                  <span className={`ml-2 inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full ${COMMISSION_PLAN_STATUS_COLORS[agent.commissionPlan.status] || "bg-slate-100 text-slate-500"}`}>
                    {COMMISSION_PLAN_TYPE_LABELS[agent.commissionPlan.planType] || agent.commissionPlan.planType}
                  </span>
                </span>
              ) : (
                <span className="text-slate-500">Default Split: <span className="font-medium text-green-600">{splitPct}%</span> / <span className="font-medium text-blue-600">{housePct}%</span></span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={openEdit}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Edit3 className="h-4 w-4" />
              Edit
            </button>
            <button
              onClick={handleToggleStatus}
              disabled={actionLoading}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors ${
                agent.status === "active"
                  ? "text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100"
                  : "text-green-700 bg-green-50 border border-green-200 hover:bg-green-100"
              }`}
            >
              {agent.status === "active" ? (
                <><UserX className="h-4 w-4" /> Deactivate</>
              ) : (
                <><UserCheck className="h-4 w-4" /> Reactivate</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats Cards ──────────────────────────────────── */}
      {stats && (
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<Briefcase className="h-5 w-5 text-blue-500" />}
            label="Total Deals"
            value={String(stats.totalDeals)}
            sub={`${stats.dealsThisYear} this year \u00b7 ${stats.dealsThisMonth} this month`}
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5 text-violet-500" />}
            label="Total Volume"
            value={fmt(stats.totalVolume)}
            sub={`${fmt(stats.volumeThisYear)} this year`}
          />
          <StatCard
            icon={<DollarSign className="h-5 w-5 text-green-500" />}
            label="Total Earnings"
            value={fmt(stats.totalPaidEarnings)}
            sub={stats.unpaidEarnings > 0 ? `${fmt(stats.unpaidEarnings)} unpaid` : "All paid"}
          />
          <StatCard
            icon={<BarChart3 className="h-5 w-5 text-amber-500" />}
            label="Avg Deal Size"
            value={fmt(stats.avgDealSize)}
            sub={stats.avgCommissionPct > 0 ? `${stats.avgCommissionPct.toFixed(1)}% avg commission` : "\u00a0"}
          />
        </div>
      )}

      {/* ── Commission Plan Tiers ────────────────────────── */}
      {agent.commissionPlan && agent.commissionPlan.tiers?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-slate-800">Commission Plan: {agent.commissionPlan.name}</h2>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700`}>
              {COMMISSION_PLAN_TYPE_LABELS[agent.commissionPlan.planType] || agent.commissionPlan.planType}
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Tier</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {agent.commissionPlan.planType === "volume_based" ? "Deal Range" : "Value Range"}
                </th>
                <th className="text-center px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent %</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">House %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {agent.commissionPlan.tiers.map((tier: any, i: number) => {
                const isCurrent = i === currentTierIndex;
                return (
                  <tr key={tier.id} className={isCurrent ? "bg-blue-50" : ""}>
                    <td className="px-3 py-2.5 text-sm">
                      <span className="font-medium text-slate-700">{tier.label || `Tier ${i + 1}`}</span>
                      {isCurrent && (
                        <span className="ml-2 text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">CURRENT</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-600">
                      {agent.commissionPlan.planType === "volume_based"
                        ? `${Number(tier.minThreshold)}${tier.maxThreshold != null ? ` – ${Number(tier.maxThreshold)}` : "+"} deals`
                        : `${fmt(Number(tier.minThreshold))}${tier.maxThreshold != null ? ` – ${fmt(Number(tier.maxThreshold))}` : "+"}`
                      }
                    </td>
                    <td className="px-3 py-2.5 text-sm text-center font-medium text-green-600">{Number(tier.agentSplitPct)}%</td>
                    <td className="px-3 py-2.5 text-sm text-center font-medium text-blue-600">{Number(tier.houseSplitPct)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Two-Column: Deals + Invoices ─────────────────── */}
      <div className="grid md:grid-cols-2 gap-6">

        {/* Recent Deals */}
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-800">Recent Deals</h2>
          </div>
          {agent.dealSubmissions?.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {agent.dealSubmissions.map((d: any) => (
                <div key={d.id} className="px-5 py-3 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-800 truncate max-w-[200px]" title={d.propertyAddress}>
                      {d.propertyAddress}
                    </span>
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full flex-shrink-0 ${DEAL_STATUS_COLORS[d.status] || "bg-slate-100 text-slate-600"}`}>
                      {d.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="capitalize">{d.dealType}</span>
                    <span>{fmt(Number(d.transactionValue))}</span>
                    <span>{fmtDate(d.createdAt)}</span>
                    {d.invoice && (
                      <span className="text-purple-600 font-medium">{d.invoice.invoiceNumber}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No deals yet</p>
            </div>
          )}
        </div>

        {/* Recent Invoices */}
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-800">Recent Invoices</h2>
          </div>
          {agent.invoices?.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {agent.invoices.map((inv: any) => (
                <div key={inv.id} className="px-5 py-3 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-mono font-medium text-slate-800">{inv.invoiceNumber}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${INVOICE_STATUS_COLORS[inv.status] || "bg-slate-100 text-slate-600"}`}>
                        {inv.status}
                      </span>
                    </div>
                    <button
                      onClick={() => downloadInvoicePDF(inv)}
                      className="p-1 text-slate-400 hover:text-blue-600 transition-colors flex-shrink-0"
                      title="Download PDF"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="truncate max-w-[180px]" title={inv.propertyAddress}>{inv.propertyAddress}</span>
                    <span className="font-medium text-green-600">{fmt(Number(inv.agentPayout))}</span>
                    <span>{fmtDate(inv.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No invoices yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
    </div>
  );
}
