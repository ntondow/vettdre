"use client";

import { useState, useEffect, Fragment, lazy, Suspense } from "react";
import { getCurrentAgentInfo } from "@/lib/bms-auth";
import { getAgents, updateAgentRole } from "../agents/actions";
import { getBrokerageSettings, updateBrokerageSettings } from "./actions";
import { getPublicSubmissionLink, regenerateSubmissionToken } from "../deal-submissions/actions";

const AuditLog = lazy(() => import("./audit-log"));
import {
  BMS_PERMISSIONS,
  BROKERAGE_ROLE_LABELS,
  BROKERAGE_ROLE_COLORS,
} from "@/lib/bms-types";
import type { BrokerageRoleType, BmsPermission, BrokerageSettings, BillToEntity, BillToMappings } from "@/lib/bms-types";
import {
  Settings,
  ShieldCheck,
  ChevronDown,
  Check,
  X,
  Crown,
  Briefcase,
  Users,
  UserCheck,
  Loader2,
  ShieldAlert,
  Copy,
  RefreshCw,
  Building2,
  Palette,
  Link2,
  Receipt,
  ClipboardList,
  FileText,
  Trash2,
  Plus,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────

interface AgentRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  brokerageRole: BrokerageRoleType;
}

// ── Permission Categories ────────────────────────────────────

const PERMISSION_CATEGORIES: Record<string, BmsPermission[]> = {
  "Deal Submissions": [
    "submit_deal",
    "approve_deal",
    "reject_deal",
    "delete_submission",
    "view_all_submissions",
    "view_own_submissions",
    "manage_public_link",
  ],
  Invoices: [
    "create_invoice",
    "void_invoice",
    "delete_invoice",
    "view_all_invoices",
    "view_own_invoices",
    "bulk_upload_invoices",
  ],
  Payments: [
    "record_payment",
    "delete_payment",
    "view_payments",
    "export_payments",
  ],
  "Commission Plans": ["manage_plans", "view_plans", "assign_plan"],
  Agents: ["manage_agents", "view_agents", "import_agents"],
  Compliance: ["manage_compliance", "view_compliance"],
  Reports: ["view_reports", "export_reports", "view_1099"],
  Dashboard: ["view_dashboard"],
  Settings: ["manage_brokerage_settings", "manage_roles"],
};

const PERMISSION_LABELS: Record<string, string> = {
  submit_deal: "Submit deals",
  approve_deal: "Approve deals",
  reject_deal: "Reject deals",
  delete_submission: "Delete submissions",
  view_all_submissions: "View all submissions",
  view_own_submissions: "View own submissions",
  manage_public_link: "Manage public link",
  create_invoice: "Create invoices",
  void_invoice: "Void invoices",
  delete_invoice: "Delete invoices",
  view_all_invoices: "View all invoices",
  view_own_invoices: "View own invoices",
  bulk_upload_invoices: "Bulk upload invoices",
  record_payment: "Record payments",
  delete_payment: "Delete payments",
  view_payments: "View payments",
  export_payments: "Export payments",
  manage_plans: "Manage plans",
  view_plans: "View plans",
  assign_plan: "Assign plans",
  manage_agents: "Manage agents",
  view_agents: "View agents",
  import_agents: "Import agents",
  manage_compliance: "Manage compliance",
  view_compliance: "View compliance",
  view_reports: "View reports",
  export_reports: "Export reports",
  view_1099: "View 1099 prep",
  view_dashboard: "View dashboard",
  manage_brokerage_settings: "Manage settings",
  manage_roles: "Manage roles",
};

const ALL_ROLES: BrokerageRoleType[] = [
  "brokerage_admin",
  "broker",
  "manager",
  "agent",
];

const ROLE_DESCRIPTIONS: { role: BrokerageRoleType; icon: typeof Crown; description: string }[] = [
  {
    role: "brokerage_admin",
    icon: Crown,
    description:
      "Full access to all brokerage features including settings and role management",
  },
  {
    role: "broker",
    icon: Briefcase,
    description:
      "Can manage deals, invoices, payments, and agents. Cannot change settings or roles.",
  },
  {
    role: "manager",
    icon: Users,
    description:
      "Can review submissions, view reports and agents. Cannot approve deals or manage payments.",
  },
  {
    role: "agent",
    icon: UserCheck,
    description:
      "Can submit deals and view own submissions and invoices only.",
  },
];

const PAYMENT_TERMS_OPTIONS = [
  "Due on Receipt",
  "Net 15",
  "Net 30",
  "Net 45",
  "Net 60",
];

const LINE_FORMAT_OPTIONS: { value: string; label: string; preview: string }[] = [
  { value: "rental_commission_tenant_address", label: "Rental commission - [Tenant] at [Address]", preview: "Rental commission - John Smith at 123 Main St Apt 4A" },
  { value: "commission_lease_address", label: "Commission for lease at [Address]", preview: "Commission for lease at 123 Main St Apt 4A" },
  { value: "tenant_address", label: "[Tenant] - [Address]", preview: "John Smith - 123 Main St Apt 4A" },
  { value: "lease_commission_address_tenant", label: "Lease commission - [Address] ([Tenant])", preview: "Lease commission - 123 Main St Apt 4A (John Smith)" },
];

// ── Helpers ──────────────────────────────────────────────────

function permissionHasRole(
  permission: BmsPermission,
  role: BrokerageRoleType
): boolean {
  const allowed: readonly string[] = BMS_PERMISSIONS[permission];
  return allowed?.includes(role) ?? false;
}

const INPUT = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const LABEL = "block text-sm font-medium text-slate-700 mb-1";

// ── Page ─────────────────────────────────────────────────────

export default function BrokerageSettingsPage() {
  // Shared state
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"roles" | "settings" | "audit">("roles");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Roles tab state
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [myAgentId, setMyAgentId] = useState<string | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Settings tab state
  const [settings, setSettings] = useState<BrokerageSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState<BrokerageSettings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submissionUrl, setSubmissionUrl] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  // Init — auth + roles data
  useEffect(() => {
    async function init() {
      const info = await getCurrentAgentInfo();
      if (!info || info.role !== "brokerage_admin") {
        setAuthorized(false);
        setLoading(false);
        return;
      }

      setAuthorized(true);
      setMyAgentId(info.agentId);

      const result = await getAgents({ limit: 200 });
      const rows: AgentRow[] = (result.agents || []).map(
        (a: Record<string, unknown>) => ({
          id: a.id as string,
          firstName: a.firstName as string,
          lastName: a.lastName as string,
          email: a.email as string,
          status: a.status as string,
          brokerageRole: (a.brokerageRole as BrokerageRoleType) || "agent",
        })
      );
      setAgents(rows);
      setLoading(false);
    }
    init();
  }, []);

  // Load settings when tab switches to settings
  useEffect(() => {
    if (activeTab !== "settings" || settingsLoaded || !authorized) return;
    async function load() {
      const [s, tokenResult] = await Promise.all([
        getBrokerageSettings(),
        getPublicSubmissionLink(),
      ]);
      setSettings(s);
      setSettingsForm({ ...s });
      if (tokenResult.token) {
        setSubmissionUrl(`${window.location.origin}/submit-deal/${tokenResult.token}`);
      }
      setSettingsLoaded(true);
    }
    load();
  }, [activeTab, settingsLoaded, authorized]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Role Handlers ────────────────────────────────────────

  async function handleRoleChange(agentId: string, newRole: BrokerageRoleType) {
    setSavingId(agentId);
    const result = await updateAgentRole(agentId, newRole);
    if (result.success) {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId ? { ...a, brokerageRole: newRole } : a
        )
      );
      setToast({ message: "Role updated successfully", type: "success" });
    } else {
      setToast({ message: result.error || "Failed to update role", type: "error" });
    }
    setSavingId(null);
  }

  // ── Settings Handlers ────────────────────────────────────

  function setField<K extends keyof BrokerageSettings>(key: K, value: BrokerageSettings[K]) {
    setSettingsForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSaveSettings() {
    if (!settingsForm) return;
    setSaving(true);
    const result = await updateBrokerageSettings({
      name: settingsForm.name,
      address: settingsForm.address,
      phone: settingsForm.phone,
      companyName: settingsForm.companyName || undefined,
      logoUrl: settingsForm.logoUrl || undefined,
      primaryColor: settingsForm.primaryColor || undefined,
      accentColor: settingsForm.accentColor || undefined,
      defaultSplitPct: settingsForm.defaultSplitPct,
      defaultPaymentTerms: settingsForm.defaultPaymentTerms,
      invoiceFooterText: settingsForm.invoiceFooterText,
      companyLicenseNumber: settingsForm.companyLicenseNumber,
      companyEmail: settingsForm.companyEmail,
      invoicePrefix: settingsForm.invoicePrefix,
      invoiceNotes: settingsForm.invoiceNotes,
      invoiceLineFormat: settingsForm.invoiceLineFormat,
      billToMappings: settingsForm.billToMappings,
    });
    if (result.success) {
      setSettings({ ...settingsForm });
      setToast({ message: "Settings saved successfully", type: "success" });
    } else {
      setToast({ message: result.error || "Failed to save settings", type: "error" });
    }
    setSaving(false);
  }

  async function handleRegenerateToken() {
    setRegenerating(true);
    const result = await regenerateSubmissionToken();
    if (result.token) {
      setSubmissionUrl(`${window.location.origin}/submit-deal/${result.token}`);
      setToast({ message: "Submission link regenerated", type: "success" });
    } else {
      setToast({ message: "Failed to regenerate link", type: "error" });
    }
    setRegenerating(false);
    setConfirmRegenerate(false);
  }

  function handleCopyLink() {
    if (!submissionUrl) return;
    navigator.clipboard.writeText(submissionUrl);
    setToast({ message: "Link copied to clipboard", type: "success" });
  }

  // ── Loading ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-56 bg-slate-200 rounded" />
          <div className="h-4 w-40 bg-slate-100 rounded" />
          <div className="mt-8 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-slate-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Unauthorized ─────────────────────────────────────────

  if (!authorized) {
    return (
      <div className="p-6">
        <div className="max-w-lg mx-auto mt-16 text-center">
          <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            Access Denied
          </h2>
          <p className="text-slate-500">
            Only brokerage administrators can access this page.
          </p>
        </div>
      </div>
    );
  }

  // ── Main ─────────────────────────────────────────────────

  const hasChanges = settingsForm && settings && JSON.stringify(settingsForm) !== JSON.stringify(settings);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-[fade-in_0.2s_ease-out] ${
            toast.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {toast.type === "success" ? (
            <Check className="w-4 h-4" />
          ) : (
            <X className="w-4 h-4" />
          )}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Settings className="w-6 h-6 text-slate-400" />
          <h1 className="text-2xl font-bold text-slate-900">Brokerage Settings</h1>
        </div>
        <p className="text-slate-500 ml-9">Manage roles, permissions, and brokerage configuration</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("roles")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "roles"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Roles & Permissions
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "settings"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Brokerage Settings
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "audit"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Audit Log
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ROLES TAB                                              */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === "roles" && (
        <div className="space-y-8">
          {/* Role Description Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ROLE_DESCRIPTIONS.map(({ role, icon: Icon, description }) => (
              <div
                key={role}
                className="border border-slate-200 rounded-lg p-4 bg-white"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${BROKERAGE_ROLE_COLORS[role]}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-slate-900">
                    {BROKERAGE_ROLE_LABELS[role]}
                  </span>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>

          {/* Role Assignment Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900">Role Assignment</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Assign roles to control what each agent can access in the brokerage system.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left font-medium text-slate-500 px-5 py-3">Name</th>
                    <th className="text-left font-medium text-slate-500 px-5 py-3">Email</th>
                    <th className="text-left font-medium text-slate-500 px-5 py-3">Status</th>
                    <th className="text-left font-medium text-slate-500 px-5 py-3">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-12 text-slate-400">
                        No agents found.
                      </td>
                    </tr>
                  ) : (
                    agents.map((agent) => {
                      const isSelf = agent.id === myAgentId;
                      const isSaving = savingId === agent.id;
                      return (
                        <tr
                          key={agent.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50"
                        >
                          <td className="px-5 py-3 font-medium text-slate-900">
                            {agent.firstName} {agent.lastName}
                            {isSelf && (
                              <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                You
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-slate-500">{agent.email}</td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                                agent.status === "active"
                                  ? "bg-green-100 text-green-700"
                                  : agent.status === "inactive"
                                    ? "bg-slate-100 text-slate-500"
                                    : "bg-red-100 text-red-700"
                              }`}
                            >
                              {agent.status}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="relative inline-flex items-center gap-1.5">
                              <select
                                value={agent.brokerageRole}
                                disabled={isSelf || isSaving}
                                onChange={(e) =>
                                  handleRoleChange(agent.id, e.target.value as BrokerageRoleType)
                                }
                                className={`text-sm border border-slate-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                                  isSelf ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                                }`}
                                title={isSelf ? "You cannot change your own role" : "Change role"}
                              >
                                {ALL_ROLES.map((r) => (
                                  <option key={r} value={r}>
                                    {BROKERAGE_ROLE_LABELS[r]}
                                  </option>
                                ))}
                              </select>
                              {isSaving && (
                                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Permission Matrix (Collapsible) */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setMatrixOpen(!matrixOpen)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-slate-400" />
                <span className="font-semibold text-slate-900">View Permission Matrix</span>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-slate-400 transition-transform ${
                  matrixOpen ? "rotate-0" : "-rotate-90"
                }`}
              />
            </button>

            {matrixOpen && (
              <div className="border-t border-slate-200">
                <p className="px-5 py-3 text-sm text-slate-500 bg-slate-50 border-b border-slate-100">
                  Permissions are defined in code and cannot be changed per organization. This is a read-only reference.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left font-medium text-slate-500 px-5 py-3 min-w-[200px]">
                          Permission
                        </th>
                        {ALL_ROLES.map((r) => (
                          <th
                            key={r}
                            className="text-center font-medium text-slate-500 px-4 py-3 min-w-[80px]"
                          >
                            <span
                              className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${BROKERAGE_ROLE_COLORS[r]}`}
                            >
                              {BROKERAGE_ROLE_LABELS[r]}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(PERMISSION_CATEGORIES).map(
                        ([category, permissions]) => (
                          <Fragment key={category}>
                            <tr className="bg-slate-50">
                              <td
                                colSpan={5}
                                className="px-5 py-2 font-semibold text-xs uppercase tracking-wider text-slate-400"
                              >
                                {category}
                              </td>
                            </tr>
                            {permissions.map((perm) => (
                              <tr
                                key={perm}
                                className="border-b border-slate-50 hover:bg-slate-50/50"
                              >
                                <td className="px-5 py-2.5 text-slate-700">
                                  {PERMISSION_LABELS[perm] || perm}
                                </td>
                                {ALL_ROLES.map((r) => (
                                  <td key={r} className="text-center px-4 py-2.5">
                                    {permissionHasRole(perm, r) ? (
                                      <Check className="w-4 h-4 text-green-500 mx-auto" />
                                    ) : (
                                      <span className="text-slate-300">&mdash;</span>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </Fragment>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SETTINGS TAB                                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          {!settingsLoaded ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-slate-100 rounded-lg" />
              ))}
            </div>
          ) : settingsForm ? (
            <>
              {/* Company Information */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-slate-400" />
                  <h2 className="font-semibold text-slate-900">Company Information</h2>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Company Name</label>
                    <input
                      type="text"
                      value={settingsForm.companyName || ""}
                      onChange={(e) => setField("companyName", e.target.value || null)}
                      className={INPUT}
                      placeholder="Override org name on invoices"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Overrides organization name ({settingsForm.name}) on invoices and PDFs
                    </p>
                  </div>
                  <div>
                    <label className={LABEL}>Organization Name</label>
                    <input
                      type="text"
                      value={settingsForm.name}
                      onChange={(e) => setField("name", e.target.value)}
                      className={INPUT}
                      placeholder="Your Brokerage LLC"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={LABEL}>Address</label>
                    <input
                      type="text"
                      value={settingsForm.address}
                      onChange={(e) => setField("address", e.target.value)}
                      className={INPUT}
                      placeholder="123 Broadway, New York, NY 10001"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Phone</label>
                    <input
                      type="tel"
                      value={settingsForm.phone}
                      onChange={(e) => setField("phone", e.target.value)}
                      className={INPUT}
                      placeholder="(212) 555-0100"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Email</label>
                    <input
                      type="email"
                      value={settingsForm.companyEmail}
                      onChange={(e) => setField("companyEmail", e.target.value)}
                      className={INPUT}
                      placeholder="office@brokerage.com"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>License Number</label>
                    <input
                      type="text"
                      value={settingsForm.companyLicenseNumber}
                      onChange={(e) => setField("companyLicenseNumber", e.target.value)}
                      className={INPUT}
                      placeholder="10991234567"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Logo URL</label>
                    <input
                      type="url"
                      value={settingsForm.logoUrl || ""}
                      onChange={(e) => setField("logoUrl", e.target.value || null)}
                      className={INPUT}
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                </div>
              </div>

              {/* Invoice Defaults */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-slate-400" />
                  <h2 className="font-semibold text-slate-900">Invoice Defaults</h2>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Invoice Number Prefix</label>
                    <input
                      type="text"
                      value={settingsForm.invoicePrefix}
                      onChange={(e) => setField("invoicePrefix", e.target.value)}
                      className={INPUT}
                      placeholder="INV"
                      maxLength={10}
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Prefix for invoice numbers (e.g., INV-2026-0001)
                    </p>
                  </div>
                  <div>
                    <label className={LABEL}>Default Agent Split %</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={settingsForm.defaultSplitPct}
                        onChange={(e) => setField("defaultSplitPct", parseFloat(e.target.value) || 0)}
                        className={INPUT + " pr-8"}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                    </div>
                  </div>
                  <div>
                    <label className={LABEL}>Default Payment Terms</label>
                    <select
                      value={settingsForm.defaultPaymentTerms}
                      onChange={(e) => setField("defaultPaymentTerms", e.target.value)}
                      className={INPUT}
                    >
                      {PAYMENT_TERMS_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Line Item Format</label>
                    <select
                      value={settingsForm.invoiceLineFormat}
                      onChange={(e) => setField("invoiceLineFormat", e.target.value)}
                      className={INPUT}
                    >
                      {LINE_FORMAT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">
                      Preview: <span className="italic">{LINE_FORMAT_OPTIONS.find(o => o.value === settingsForm.invoiceLineFormat)?.preview || ""}</span>
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label className={LABEL}>Default Notes / Payment Instructions</label>
                    <textarea
                      value={settingsForm.invoiceNotes}
                      onChange={(e) => setField("invoiceNotes", e.target.value)}
                      rows={2}
                      className={INPUT}
                      placeholder="Please make checks payable to Company LLC..."
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Pre-filled as notes on bulk-generated invoices (editable per batch)
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label className={LABEL}>Invoice Footer Text</label>
                    <textarea
                      value={settingsForm.invoiceFooterText}
                      onChange={(e) => setField("invoiceFooterText", e.target.value)}
                      rows={2}
                      className={INPUT}
                      placeholder="Thank you for your business."
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Appears at the bottom of every generated invoice PDF
                    </p>
                  </div>
                </div>
              </div>

              {/* Saved Bill To Entities */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-400" />
                    <h2 className="font-semibold text-slate-900">Saved Bill To Entities</h2>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {Object.keys(settingsForm.billToMappings || {}).length} saved
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const key = `new-entity-${Date.now()}`;
                      setField("billToMappings", {
                        ...settingsForm.billToMappings,
                        [key]: { companyName: "" },
                      });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Entity
                  </button>
                </div>
                <div className="p-5">
                  {Object.keys(settingsForm.billToMappings || {}).length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">
                      No saved Bill To entities. Add one manually or they&apos;ll be created when using the Bulk Invoice tool.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(settingsForm.billToMappings || {}).map(([propKey, entity]) => (
                        <div key={propKey} className="border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{propKey}</span>
                            <button
                              onClick={() => {
                                const next = { ...settingsForm.billToMappings };
                                delete next[propKey];
                                setField("billToMappings", next);
                              }}
                              className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                              title="Remove entity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <input
                              type="text"
                              value={entity.companyName || ""}
                              onChange={(e) => {
                                const next = { ...settingsForm.billToMappings };
                                next[propKey] = { ...entity, companyName: e.target.value };
                                setField("billToMappings", next);
                              }}
                              placeholder="Company name"
                              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <input
                              type="text"
                              value={entity.address || ""}
                              onChange={(e) => {
                                const next = { ...settingsForm.billToMappings };
                                next[propKey] = { ...entity, address: e.target.value };
                                setField("billToMappings", next);
                              }}
                              placeholder="Address"
                              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <input
                              type="text"
                              value={entity.phone || ""}
                              onChange={(e) => {
                                const next = { ...settingsForm.billToMappings };
                                next[propKey] = { ...entity, phone: e.target.value };
                                setField("billToMappings", next);
                              }}
                              placeholder="Phone"
                              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <input
                              type="email"
                              value={entity.email || ""}
                              onChange={(e) => {
                                const next = { ...settingsForm.billToMappings };
                                next[propKey] = { ...entity, email: e.target.value };
                                setField("billToMappings", next);
                              }}
                              placeholder="Email"
                              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Branding */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
                  <Palette className="w-5 h-5 text-slate-400" />
                  <h2 className="font-semibold text-slate-900">Branding</h2>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={LABEL}>Primary Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={settingsForm.primaryColor || "#2563EB"}
                          onChange={(e) => setField("primaryColor", e.target.value)}
                          className="w-10 h-10 rounded border border-slate-300 cursor-pointer p-0.5"
                        />
                        <input
                          type="text"
                          value={settingsForm.primaryColor || "#2563EB"}
                          onChange={(e) => setField("primaryColor", e.target.value)}
                          className={INPUT}
                          placeholder="#2563EB"
                          maxLength={7}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={LABEL}>Accent Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={settingsForm.accentColor || "#10B981"}
                          onChange={(e) => setField("accentColor", e.target.value)}
                          className="w-10 h-10 rounded border border-slate-300 cursor-pointer p-0.5"
                        />
                        <input
                          type="text"
                          value={settingsForm.accentColor || "#10B981"}
                          onChange={(e) => setField("accentColor", e.target.value)}
                          className={INPUT}
                          placeholder="#10B981"
                          maxLength={7}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Preview */}
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Preview</p>
                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 max-w-sm">
                      <div
                        className="h-2 rounded-full mb-3"
                        style={{ backgroundColor: settingsForm.primaryColor || "#2563EB" }}
                      />
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className="w-8 h-8 rounded-lg"
                          style={{ backgroundColor: settingsForm.primaryColor || "#2563EB" }}
                        />
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {settingsForm.companyName || settingsForm.name || "Your Brokerage"}
                          </div>
                          <div className="text-xs text-slate-500">Invoice #INV-2026-0001</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div
                          className="text-xs text-white px-3 py-1 rounded-md font-medium"
                          style={{ backgroundColor: settingsForm.primaryColor || "#2563EB" }}
                        >
                          Primary
                        </div>
                        <div
                          className="text-xs text-white px-3 py-1 rounded-md font-medium"
                          style={{ backgroundColor: settingsForm.accentColor || "#10B981" }}
                        >
                          Accent
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Public Submission Link */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-slate-400" />
                  <h2 className="font-semibold text-slate-900">Public Submission Link</h2>
                </div>
                <div className="p-5 space-y-3">
                  <p className="text-sm text-slate-500">
                    Share this link with agents to submit deals without logging in.
                  </p>
                  {submissionUrl && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={submissionUrl}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-600"
                      />
                      <button
                        onClick={handleCopyLink}
                        className="px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                        title="Copy link"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <div>
                    {confirmRegenerate ? (
                      <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm text-amber-700 flex-1">
                          Regenerating will invalidate the current link. Any existing shared links will stop working.
                        </p>
                        <button
                          onClick={handleRegenerateToken}
                          disabled={regenerating}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50 transition-colors"
                        >
                          {regenerating ? "Regenerating..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmRegenerate(false)}
                          className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRegenerate(true)}
                        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Regenerate Link
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-end gap-3 pt-2 pb-4">
                {hasChanges && (
                  <span className="text-sm text-amber-600">Unsaved changes</span>
                )}
                <button
                  onClick={handleSaveSettings}
                  disabled={saving || !hasChanges}
                  className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* AUDIT LOG TAB                                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === "audit" && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          }
        >
          <AuditLog />
        </Suspense>
      )}
    </div>
  );
}
