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
import {
  inviteAgent,
  revokeInvite,
  getPendingInvites,
  bulkInviteAgents,
} from "./onboarding-actions";
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
  ChevronDown,
  Users,
  Eye,
  Mail,
  Link2,
  Clock,
  Copy,
  CheckCircle2,
  XCircle,
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
  teamOrOffice: string;
  startDate: string;
  w9OnFile: boolean;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  dateOfBirth: string;
  notes: string;
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
  teamOrOffice: "",
  startDate: "",
  w9OnFile: false,
  address: "",
  city: "",
  state: "",
  zipCode: "",
  dateOfBirth: "",
  notes: "",
};

const STATE_OPTIONS = ["NY", "NJ", "CT", "PA"] as const;

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
  const [sectionLicense, setSectionLicense] = useState(true);
  const [sectionPersonal, setSectionPersonal] = useState(false);
  const [sectionNotes, setSectionNotes] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<Array<{ agentId: string; agentName: string; email: string; invitedAt: string }>>([]);
  const [showPending, setShowPending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

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

  async function loadPendingInvites() {
    try {
      const invites = await getPendingInvites();
      setPendingInvites(invites);
    } catch {
      setPendingInvites([]);
    }
  }

  useEffect(() => {
    loadData();
    loadPendingInvites();
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
      teamOrOffice: agent.teamOrOffice || "",
      startDate: agent.startDate ? agent.startDate.slice(0, 10) : "",
      w9OnFile: agent.w9OnFile ?? false,
      address: agent.address || "",
      city: agent.city || "",
      state: agent.state || "",
      zipCode: agent.zipCode || "",
      dateOfBirth: agent.dateOfBirth ? agent.dateOfBirth.slice(0, 10) : "",
      notes: agent.notes || "",
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
        teamOrOffice: form.teamOrOffice.trim() || undefined,
        startDate: form.startDate || undefined,
        w9OnFile: form.w9OnFile,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state || undefined,
        zipCode: form.zipCode.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        notes: form.notes.trim() || undefined,
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

  // ── Invite actions ───────────────────────────────────────

  async function handleInvite(agentId: string) {
    setInviteLoading(agentId);
    try {
      const result = await inviteAgent(agentId);
      if (result.error) {
        alert(result.error);
        return;
      }
      if (result.inviteUrl) {
        const fullUrl = `${window.location.origin}${result.inviteUrl}`;
        setInviteUrl(fullUrl);
        await navigator.clipboard.writeText(fullUrl);
        setCopied(agentId);
        setTimeout(() => setCopied(null), 2000);
      }
      loadData();
      loadPendingInvites();
    } finally {
      setInviteLoading(null);
    }
  }

  async function handleInviteAll() {
    const uninvited = agents.filter((a: any) => !a.userId && !a.inviteToken);
    if (uninvited.length === 0) {
      alert("All agents have been invited or are already linked.");
      return;
    }
    if (!confirm(`Send invites to ${uninvited.length} agent(s)?`)) return;
    setInviteLoading("bulk");
    try {
      const result = await bulkInviteAgents(uninvited.map((a: any) => a.id));
      if (result.errors.length > 0) {
        alert(`Invited: ${result.invited}, Already linked: ${result.alreadyLinked}, Errors: ${result.errors.join(", ")}`);
      }
      loadData();
      loadPendingInvites();
    } finally {
      setInviteLoading(null);
    }
  }

  async function handleRevoke(agentId: string) {
    if (!confirm("Revoke this invite? The agent will need a new invitation link.")) return;
    setInviteLoading(agentId);
    try {
      const result = await revokeInvite(agentId);
      if (!result.success) {
        alert(result.error || "Failed to revoke invite");
      }
      loadData();
      loadPendingInvites();
    } finally {
      setInviteLoading(null);
    }
  }

  function copyInviteLink(agentId: string, token: string) {
    const url = `${window.location.origin}/join/agent/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(agentId);
    setTimeout(() => setCopied(null), 2000);
  }

  const totalCount = Object.values(counts).reduce((s, c) => s + c, 0);
  const uninvitedCount = agents.filter((a: any) => !a.userId && !a.inviteToken).length;

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
          {uninvitedCount > 0 && (
            <button
              onClick={handleInviteAll}
              disabled={inviteLoading === "bulk"}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <Mail className="h-4 w-4" />
              Invite All ({uninvitedCount})
            </button>
          )}
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

      {/* Invite URL modal */}
      {inviteUrl && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-blue-800 mb-1">Invite link created</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-white border border-blue-200 rounded px-2 py-1 text-blue-700 truncate block flex-1">{inviteUrl}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(inviteUrl); setCopied("modal"); setTimeout(() => setCopied(null), 2000); }}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-white border border-blue-200 rounded hover:bg-blue-50 transition-colors shrink-0"
                >
                  {copied === "modal" ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied === "modal" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-blue-500 mt-1">Share this link with the agent. They&apos;ll sign up and be automatically linked.</p>
            </div>
            <button onClick={() => setInviteUrl(null)} className="text-blue-400 hover:text-blue-600 shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Pending invites section */}
      {pendingInvites.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowPending(!showPending)}
            className="flex items-center gap-2 w-full px-4 py-3 text-left"
          >
            <Clock className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-sm font-medium text-amber-800 flex-1">
              {pendingInvites.length} pending invite{pendingInvites.length !== 1 ? "s" : ""}
            </span>
            {showPending ? <ChevronUp className="h-4 w-4 text-amber-500" /> : <ChevronDown className="h-4 w-4 text-amber-500" />}
          </button>
          {showPending && (
            <div className="border-t border-amber-200 divide-y divide-amber-100">
              {pendingInvites.map((inv) => (
                <div key={inv.agentId} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{inv.agentName}</p>
                    <p className="text-xs text-slate-500">{inv.email} &middot; Invited {new Date(inv.invitedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                  </div>
                  <button
                    onClick={() => {
                      // Find the agent to get inviteToken
                      const agent = agents.find((a: any) => a.id === inv.agentId);
                      if (agent?.inviteToken) copyInviteLink(inv.agentId, agent.inviteToken);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-white border border-amber-200 rounded hover:bg-amber-50 transition-colors"
                  >
                    {copied === inv.agentId ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied === inv.agentId ? "Copied" : "Copy Link"}
                  </button>
                  <button
                    onClick={() => handleRevoke(inv.agentId)}
                    disabled={inviteLoading === inv.agentId}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    <XCircle className="h-3 w-3" />
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inline add/edit form */}
      {showForm && (
        <div className="mb-6 bg-white border border-slate-200 rounded-xl p-6 relative max-w-2xl mx-auto">
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

          <form onSubmit={handleFormSubmit} className="space-y-5">

            {/* ── Section 1: Basic Info (always visible) ──── */}
            <section>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Basic Info</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <label className={LABEL}>Team / Office</label>
                  <input
                    type="text"
                    value={form.teamOrOffice}
                    onChange={(e) => setField({ teamOrOffice: e.target.value })}
                    className={INPUT}
                    placeholder="Midtown Office"
                  />
                </div>
                <div>
                  <label className={LABEL}>Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setField({ startDate: e.target.value })}
                    className={INPUT}
                  />
                </div>
              </div>
            </section>

            {/* ── Section 2: License & Compliance (collapsible, open) ──── */}
            <section className="border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setSectionLicense(!sectionLicense)}
                className="flex items-center gap-2 w-full text-sm font-semibold text-slate-800 hover:text-slate-900 transition-colors"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${sectionLicense ? "rotate-0" : "-rotate-90"}`} />
                License & Compliance
              </button>
              {sectionLicense && (
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.w9OnFile}
                      onChange={(e) => setField({ w9OnFile: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">W-9 on file</span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </div>
                </div>
              )}
            </section>

            {/* ── Section 3: Personal Info (collapsible, closed) ──── */}
            <section className="border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setSectionPersonal(!sectionPersonal)}
                className="flex items-center gap-2 w-full text-sm font-semibold text-slate-800 hover:text-slate-900 transition-colors"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${sectionPersonal ? "rotate-0" : "-rotate-90"}`} />
                Personal Info
              </button>
              {sectionPersonal && (
                <div className="mt-3 space-y-4">
                  <div>
                    <label className={LABEL}>Address</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => setField({ address: e.target.value })}
                      className={INPUT}
                      placeholder="123 Main St, Apt 4B"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={LABEL}>City</label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={(e) => setField({ city: e.target.value })}
                        className={INPUT}
                        placeholder="New York"
                      />
                    </div>
                    <div>
                      <label className={LABEL}>State</label>
                      <select
                        value={form.state}
                        onChange={(e) => setField({ state: e.target.value })}
                        className={INPUT}
                      >
                        <option value="">—</option>
                        {STATE_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>ZIP Code</label>
                      <input
                        type="text"
                        value={form.zipCode}
                        onChange={(e) => setField({ zipCode: e.target.value })}
                        className={INPUT}
                        placeholder="10001"
                      />
                    </div>
                  </div>
                  <div className="max-w-xs">
                    <label className={LABEL}>Date of Birth</label>
                    <input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => setField({ dateOfBirth: e.target.value })}
                      className={INPUT}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* ── Section 4: Notes (collapsible, closed) ──── */}
            <section className="border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setSectionNotes(!sectionNotes)}
                className="flex items-center gap-2 w-full text-sm font-semibold text-slate-800 hover:text-slate-900 transition-colors"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${sectionNotes ? "rotate-0" : "-rotate-90"}`} />
                Notes
              </button>
              {sectionNotes && (
                <div className="mt-3">
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setField({ notes: e.target.value })}
                    className={INPUT}
                    placeholder="Internal notes about this agent..."
                  />
                </div>
              )}
            </section>

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
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Team</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Default Split</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Commission Plan</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Deals</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Account</th>
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

                    {/* Team */}
                    <td className="px-3 py-3">
                      <span className="text-sm text-slate-600">{agent.teamOrOffice || "\u2014"}</span>
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

                    {/* Account status */}
                    <td className="px-3 py-3 text-center">
                      {agent.userId ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                          <Link2 className="h-3 w-3" />
                          Linked
                        </span>
                      ) : agent.inviteToken ? (
                        <div className="inline-flex items-center gap-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                            <Clock className="h-3 w-3" />
                            Pending
                          </span>
                          <button
                            onClick={() => copyInviteLink(agent.id, agent.inviteToken)}
                            className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                            title="Copy invite link"
                          >
                            {copied === agent.id ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleInvite(agent.id)}
                          disabled={inviteLoading === agent.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full text-blue-600 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                          title="Send invite"
                        >
                          <Mail className="h-3 w-3" />
                          Invite
                        </button>
                      )}
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
