"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  getAgents,
  createAgent,
  updateAgent,
  deactivateAgent,
  reactivateAgent,
  deleteAgent,
} from "./actions";
import { getCommissionPlans } from "../commission-plans/actions";
import AgentImport from "./agent-import";
import {
  Plus,
  Edit3,
  Trash2,
  UserCheck,
  UserX,
  Search,
  X,
  Upload,
  ChevronUp,
  Users,
  Eye,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────

const STATUS_TABS = ["all", "active", "inactive", "terminated"] as const;

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  terminated: "Terminated",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-700",
  terminated: "bg-red-100 text-red-700",
};

const INPUT = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const LABEL = "block text-sm font-medium text-slate-700 mb-1";

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

const EMPTY_FORM: AgentFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  licenseNumber: "",
  licenseExpiry: "",
  defaultSplitPct: 70,
  commissionPlanId: "",
};

// ── Component ─────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState<false | "new" | string>(false);
  const [form, setForm] = useState<AgentFormData>({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [showImport, setShowImport] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // ── Load data ─────────────────────────────────────────────

  async function loadData() {
    setLoading(true);
    try {
      const result = await getAgents({
        status: statusFilter === "all" ? undefined : statusFilter,
        search: search || undefined,
      });
      setAgents(result.agents || []);
      setCounts(result.counts || {});
      setTotal(result.total || 0);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    getCommissionPlans().then((r) => setPlans(r.plans || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadData(), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ── Form helpers ──────────────────────────────────────────

  function openNewForm() {
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setShowForm("new");
  }

  function openEditForm(agent: any) {
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
    setShowForm(agent.id);
  }

  function closeForm() {
    setShowForm(false);
    setForm({ ...EMPTY_FORM });
    setFormError("");
  }

  function setField(patch: Partial<AgentFormData>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormSubmitting(true);

    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        licenseNumber: form.licenseNumber.trim() || undefined,
        licenseExpiry: form.licenseExpiry || undefined,
        defaultSplitPct: form.defaultSplitPct,
        commissionPlanId: form.commissionPlanId || undefined,
      };

      const result = showForm === "new"
        ? await createAgent(payload)
        : await updateAgent(showForm as string, payload);

      if (!result.success) {
        setFormError(result.error || "Operation failed");
        return;
      }

      closeForm();
      loadData();
    } finally {
      setFormSubmitting(false);
    }
  }

  // ── Row actions ───────────────────────────────────────────

  async function handleDeactivate(id: string) {
    setActionLoading(id);
    await deactivateAgent(id);
    setActionLoading(null);
    loadData();
  }

  async function handleReactivate(id: string) {
    setActionLoading(id);
    await reactivateAgent(id);
    setActionLoading(null);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    setActionLoading(id);
    const result = await deleteAgent(id);
    setActionLoading(null);
    if (!result.success) {
      alert(result.error || "Failed to delete agent");
    }
    if (showForm === id) closeForm();
    loadData();
  }

  const totalCount = Object.values(counts).reduce((s, c) => s + c, 0);

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agent Roster</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your brokerage agents, splits, and commission plans
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport((prev) => !prev)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border rounded-lg transition-colors ${
              showImport
                ? "text-blue-700 bg-blue-50 border-blue-200"
                : "text-slate-700 bg-white border-slate-300 hover:bg-slate-50"
            }`}
          >
            {showImport ? <ChevronUp className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            Import Agents
          </button>
          <button
            onClick={openNewForm}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Agent
          </button>
        </div>
      </div>

      {/* Import panel */}
      {showImport && (
        <div className="mb-6 bg-white border border-slate-200 rounded-xl p-6 relative">
          <button
            onClick={() => setShowImport(false)}
            className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Import Agents from Spreadsheet</h2>
          <AgentImport
            onComplete={() => {
              setShowImport(false);
              loadData();
            }}
          />
        </div>
      )}

      {/* Inline add/edit form */}
      {showForm && (
        <div className="mb-6 bg-white border border-slate-200 rounded-xl p-6 relative">
          <button
            onClick={closeForm}
            className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            {showForm === "new" ? "Add New Agent" : "Edit Agent"}
          </h2>

          {formError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700 flex-1">{formError}</p>
              <button onClick={() => setFormError("")} className="text-red-400 hover:text-red-600 text-sm">Dismiss</button>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>First Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={form.firstName}
                  onChange={(e) => setField({ firstName: e.target.value })}
                  className={INPUT}
                  placeholder="Jane"
                />
              </div>
              <div>
                <label className={LABEL}>Last Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={form.lastName}
                  onChange={(e) => setField({ lastName: e.target.value })}
                  className={INPUT}
                  placeholder="Smith"
                />
              </div>
              <div>
                <label className={LABEL}>Email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setField({ email: e.target.value })}
                  className={INPUT}
                  placeholder="jane@brokerage.com"
                />
              </div>
              <div>
                <label className={LABEL}>Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setField({ phone: e.target.value })}
                  className={INPUT}
                  placeholder="(212) 555-0100"
                />
              </div>
              <div>
                <label className={LABEL}>License #</label>
                <input
                  type="text"
                  value={form.licenseNumber}
                  onChange={(e) => setField({ licenseNumber: e.target.value })}
                  className={INPUT}
                  placeholder="10401234567"
                />
              </div>
              <div>
                <label className={LABEL}>License Expiry</label>
                <input
                  type="date"
                  value={form.licenseExpiry}
                  onChange={(e) => setField({ licenseExpiry: e.target.value })}
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>Default Split %</label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={form.defaultSplitPct}
                    onChange={(e) => setField({ defaultSplitPct: parseFloat(e.target.value) || 0 })}
                    className={INPUT + " pr-8"}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                </div>
              </div>
              <div>
                <label className={LABEL}>Commission Plan</label>
                <select
                  value={form.commissionPlanId}
                  onChange={(e) => setField({ commissionPlanId: e.target.value })}
                  className={INPUT}
                >
                  <option value="">— Use default split —</option>
                  {plans.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={formSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {formSubmitting
                  ? showForm === "new" ? "Creating..." : "Saving..."
                  : showForm === "new" ? "Add Agent" : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto no-scrollbar">
        {STATUS_TABS.map((tab) => {
          const count = tab === "all" ? totalCount : (counts[tab] || 0);
          const active = statusFilter === tab;
          return (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                active ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {tab === "all" ? "All" : STATUS_LABELS[tab] || tab}
              <span className={`text-xs ${active ? "text-blue-500" : "text-slate-400"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or license..."
          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Loading shimmer */}
      {loading && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="h-10 bg-slate-50" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 border-t border-slate-100 bg-slate-50/50 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && agents.length === 0 && (
        <div className="text-center py-16">
          <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No agents yet</p>
          <p className="text-sm text-slate-400 mt-1">
            {search ? "Try a different search term" : "Add your first agent to start managing commissions"}
          </p>
          {!search && (
            <button
              onClick={openNewForm}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Agent
            </button>
          )}
        </div>
      )}

      {/* Agent table */}
      {!loading && agents.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Phone</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">License #</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Default Split</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Commission Plan</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Deals</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {agents.map((agent: any) => {
                const isActing = actionLoading === agent.id;
                const dealCount = agent._count?.dealSubmissions || 0;
                const splitPct = Number(agent.defaultSplitPct) || 70;
                const housePct = 100 - splitPct;
                const canDelete = dealCount === 0 && (agent._count?.invoices || 0) === 0;

                return (
                  <tr key={agent.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Agent name + email */}
                    <td className="px-3 py-3">
                      <Link
                        href={`/brokerage/agents/${agent.id}`}
                        className="group"
                      >
                        <div className="text-sm font-medium text-slate-800 group-hover:text-blue-600 transition-colors">
                          {agent.firstName} {agent.lastName}
                        </div>
                        <div className="text-xs text-slate-500">{agent.email}</div>
                      </Link>
                    </td>

                    {/* Phone */}
                    <td className="px-3 py-3">
                      <span className="text-sm text-slate-600">{agent.phone || "\u2014"}</span>
                    </td>

                    {/* License # */}
                    <td className="px-3 py-3">
                      <span className="text-sm font-mono text-slate-600">{agent.licenseNumber || "\u2014"}</span>
                    </td>

                    {/* Default Split */}
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm">
                        <span className="font-medium text-green-600">{splitPct}</span>
                        <span className="text-slate-400 mx-0.5">/</span>
                        <span className="font-medium text-blue-600">{housePct}</span>
                      </span>
                    </td>

                    {/* Commission Plan */}
                    <td className="px-3 py-3">
                      <span className="text-sm text-slate-600">
                        {agent.commissionPlan?.name || (
                          <span className="text-slate-400">Default</span>
                        )}
                      </span>
                    </td>

                    {/* Deals */}
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm font-medium text-slate-700">{dealCount}</span>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                        STATUS_COLORS[agent.status] || "bg-slate-100 text-slate-600"
                      }`}>
                        {STATUS_LABELS[agent.status] || agent.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <Link
                          href={`/brokerage/agents/${agent.id}`}
                          className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => openEditForm(agent)}
                          disabled={isActing}
                          className="p-1.5 text-slate-400 hover:text-blue-600 disabled:opacity-50 transition-colors"
                          title="Edit"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        {agent.status === "active" ? (
                          <button
                            onClick={() => handleDeactivate(agent.id)}
                            disabled={isActing}
                            className="p-1.5 text-slate-400 hover:text-amber-500 disabled:opacity-50 transition-colors"
                            title="Deactivate"
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(agent.id)}
                            disabled={isActing}
                            className="p-1.5 text-slate-400 hover:text-green-600 disabled:opacity-50 transition-colors"
                            title="Reactivate"
                          >
                            <UserCheck className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(agent.id)}
                          disabled={isActing || !canDelete}
                          className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title={canDelete ? "Delete" : "Cannot delete agent with deals or invoices"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
