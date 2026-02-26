"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { getAgentById, getAgentStats, updateAgent, deactivateAgent, reactivateAgent } from "../actions";
import { getCommissionPlans } from "../../commission-plans/actions";
import { getBrokerageConfig } from "../../invoices/actions";
import { getAgentComplianceDocs, createComplianceDoc, deleteComplianceDoc } from "../../compliance/actions";
import { generateInvoicePDF } from "@/lib/invoice-pdf";
import {
  COMMISSION_PLAN_TYPE_LABELS,
  COMPLIANCE_DOC_TYPE_LABELS,
  COMPLIANCE_STATUS_COLORS,
} from "@/lib/bms-types";
import type { BrokerageConfig, ComplianceDocType } from "@/lib/bms-types";
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
  ChevronDown,
  Shield,
  MapPin,
  Calendar,
  Phone,
  Mail,
  Hash,
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  Trash2,
  Save,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "\u2014";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "\u2014";
  }
};

function yearsDuration(startDate: string | null | undefined): string {
  if (!startDate) return "";
  const start = new Date(startDate);
  const now = new Date();
  const years = (now.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 1) {
    const months = Math.max(1, Math.round(years * 12));
    return `${months}mo`;
  }
  return `${years.toFixed(1)}yr`;
}

function dateStatus(d: string | null | undefined): "active" | "expired" | "expiring_soon" {
  if (!d) return "active";
  const exp = new Date(d);
  const now = new Date();
  if (exp < now) return "expired";
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);
  if (exp < thirtyDays) return "expiring_soon";
  return "active";
}

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

const TABS = ["overview", "deals", "invoices", "compliance", "notes"] as const;
type TabId = (typeof TABS)[number];
const TAB_LABELS: Record<TabId, string> = { overview: "Overview", deals: "Deals", invoices: "Invoices", compliance: "Compliance", notes: "Notes" };

const DEAL_STATUS_TABS = ["all", "submitted", "under_review", "approved", "invoiced", "paid", "rejected"] as const;
const INVOICE_STATUS_TABS = ["all", "draft", "sent", "paid", "void"] as const;

const STATE_OPTIONS = ["NY", "NJ", "CT", "PA"] as const;

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

const PAGE_SIZE = 20;

// ── Component ─────────────────────────────────────────────────

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [agent, setAgent] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [brokerageConfig, setBrokerageConfig] = useState<BrokerageConfig | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [complianceDocs, setComplianceDocs] = useState<any[]>([]);

  // Tabs
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Edit state
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<AgentFormData>({
    firstName: "", lastName: "", email: "", phone: "",
    licenseNumber: "", licenseExpiry: "", defaultSplitPct: 70, commissionPlanId: "",
    teamOrOffice: "", startDate: "", w9OnFile: false,
    address: "", city: "", state: "", zipCode: "", dateOfBirth: "", notes: "",
  });
  const [formError, setFormError] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [sectionLicense, setSectionLicense] = useState(true);
  const [sectionPersonal, setSectionPersonal] = useState(false);
  const [sectionNotes, setSectionNotes] = useState(false);

  // Deals tab
  const [dealFilter, setDealFilter] = useState("all");
  const [dealSearch, setDealSearch] = useState("");
  const [dealPage, setDealPage] = useState(1);

  // Invoices tab
  const [invoiceFilter, setInvoiceFilter] = useState("all");
  const [invoicePage, setInvoicePage] = useState(1);

  // Notes tab
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  // Compliance add form
  const [showComplianceForm, setShowComplianceForm] = useState(false);
  const [compForm, setCompForm] = useState({ docType: "license" as ComplianceDocType, title: "", issueDate: "", expiryDate: "", notes: "" });
  const [compFormSubmitting, setCompFormSubmitting] = useState(false);

  // ── Load ──────────────────────────────────────────────────

  async function loadAgent() {
    setLoading(true);
    try {
      const [a, s] = await Promise.all([getAgentById(id), getAgentStats(id)]);
      setAgent(a);
      setStats(s);
      if (a?.notes) setNotesValue(a.notes);
    } catch {
      setAgent(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadCompliance() {
    try {
      const docs = await getAgentComplianceDocs(id);
      setComplianceDocs(docs || []);
    } catch {
      setComplianceDocs([]);
    }
  }

  useEffect(() => {
    loadAgent();
    loadCompliance();
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
    setSectionLicense(true);
    setSectionPersonal(false);
    setSectionNotes(false);
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
        teamOrOffice: form.teamOrOffice.trim() || undefined,
        startDate: form.startDate || undefined,
        w9OnFile: form.w9OnFile,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state || undefined,
        zipCode: form.zipCode.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        notes: form.notes.trim() || undefined,
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

  async function handleSaveNotes() {
    setNotesSaving(true);
    try {
      await updateAgent(id, {
        firstName: agent.firstName,
        lastName: agent.lastName,
        email: agent.email,
        notes: notesValue.trim() || undefined,
      });
      setEditingNotes(false);
      loadAgent();
    } finally {
      setNotesSaving(false);
    }
  }

  async function handleAddComplianceDoc(e: React.FormEvent) {
    e.preventDefault();
    setCompFormSubmitting(true);
    try {
      await createComplianceDoc({
        agentId: id,
        docType: compForm.docType,
        title: compForm.title.trim(),
        issueDate: compForm.issueDate || undefined,
        expiryDate: compForm.expiryDate || undefined,
        notes: compForm.notes.trim() || undefined,
      });
      setShowComplianceForm(false);
      setCompForm({ docType: "license", title: "", issueDate: "", expiryDate: "", notes: "" });
      loadCompliance();
    } finally {
      setCompFormSubmitting(false);
    }
  }

  async function handleDeleteComplianceDoc(docId: string) {
    if (!confirm("Delete this compliance document?")) return;
    await deleteComplianceDoc(docId);
    loadCompliance();
  }

  // ── Loading / Not Found ───────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="h-6 w-40 bg-slate-200 animate-pulse rounded mb-6" />
        <div className="h-48 bg-slate-100 animate-pulse rounded-2xl mb-6" />
        <div className="grid md:grid-cols-5 gap-4 mb-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
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

  // Filter deals
  const allDeals: any[] = agent.dealSubmissions || [];
  const filteredDeals = allDeals.filter((d: any) => {
    if (dealFilter !== "all" && d.status !== dealFilter) return false;
    if (dealSearch) {
      const q = dealSearch.toLowerCase();
      if (!d.propertyAddress?.toLowerCase().includes(q) && !d.clientName?.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const dealTotalPages = Math.max(1, Math.ceil(filteredDeals.length / PAGE_SIZE));
  const pagedDeals = filteredDeals.slice((dealPage - 1) * PAGE_SIZE, dealPage * PAGE_SIZE);

  // Filter invoices
  const allInvoices: any[] = agent.invoices || [];
  const filteredInvoices = allInvoices.filter((inv: any) => {
    if (invoiceFilter !== "all" && inv.status !== invoiceFilter) return false;
    return true;
  });
  const invoiceTotalPages = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const pagedInvoices = filteredInvoices.slice((invoicePage - 1) * PAGE_SIZE, invoicePage * PAGE_SIZE);

  // Compliance summary
  const licenseStatus = dateStatus(agent.licenseExpiry);
  const eoStatus = dateStatus(agent.eoInsuranceExpiry);
  const expiredDocs = complianceDocs.filter((d: any) => d.status === "expired").length;
  const expiringSoonDocs = complianceDocs.filter((d: any) => d.status === "expiring_soon").length;

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">

      {/* Back link */}
      <Link
        href="/brokerage/agents"
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Roster
      </Link>

      {/* ── Edit Form (inline overlay) ─────────────────────── */}
      {editing && (
        <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative max-w-2xl mx-auto">
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

          <form onSubmit={handleSave} className="space-y-5">
            {/* Section 1: Basic Info */}
            <section>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Basic Info</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <label className={LABEL}>Team / Office</label>
                  <input type="text" value={form.teamOrOffice} onChange={(e) => setField({ teamOrOffice: e.target.value })} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Start Date</label>
                  <input type="date" value={form.startDate} onChange={(e) => setField({ startDate: e.target.value })} className={INPUT} />
                </div>
              </div>
            </section>

            {/* Section 2: License & Compliance */}
            <section className="border-t border-slate-200 pt-4">
              <button type="button" onClick={() => setSectionLicense(!sectionLicense)} className="flex items-center gap-2 w-full text-sm font-semibold text-slate-800 hover:text-slate-900 transition-colors">
                <ChevronDown className={`h-4 w-4 transition-transform ${sectionLicense ? "rotate-0" : "-rotate-90"}`} />
                License & Compliance
              </button>
              {sectionLicense && (
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={LABEL}>License #</label>
                      <input type="text" value={form.licenseNumber} onChange={(e) => setField({ licenseNumber: e.target.value })} className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>License Expiry</label>
                      <input type="date" value={form.licenseExpiry} onChange={(e) => setField({ licenseExpiry: e.target.value })} className={INPUT} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.w9OnFile} onChange={(e) => setField({ w9OnFile: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm text-slate-700">W-9 on file</span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={LABEL}>Commission Plan</label>
                      <select value={form.commissionPlanId} onChange={(e) => setField({ commissionPlanId: e.target.value })} className={INPUT}>
                        <option value="">— Use default split —</option>
                        {plans.map((p: any) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>Default Split %</label>
                      <div className="relative">
                        <input type="number" min={0} max={100} step="0.5" value={form.defaultSplitPct} onChange={(e) => setField({ defaultSplitPct: parseFloat(e.target.value) || 0 })} className={INPUT + " pr-8"} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Section 3: Personal Info */}
            <section className="border-t border-slate-200 pt-4">
              <button type="button" onClick={() => setSectionPersonal(!sectionPersonal)} className="flex items-center gap-2 w-full text-sm font-semibold text-slate-800 hover:text-slate-900 transition-colors">
                <ChevronDown className={`h-4 w-4 transition-transform ${sectionPersonal ? "rotate-0" : "-rotate-90"}`} />
                Personal Info
              </button>
              {sectionPersonal && (
                <div className="mt-3 space-y-4">
                  <div>
                    <label className={LABEL}>Address</label>
                    <input type="text" value={form.address} onChange={(e) => setField({ address: e.target.value })} className={INPUT} placeholder="123 Main St, Apt 4B" />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={LABEL}>City</label>
                      <input type="text" value={form.city} onChange={(e) => setField({ city: e.target.value })} className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>State</label>
                      <select value={form.state} onChange={(e) => setField({ state: e.target.value })} className={INPUT}>
                        <option value="">—</option>
                        {STATE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>ZIP Code</label>
                      <input type="text" value={form.zipCode} onChange={(e) => setField({ zipCode: e.target.value })} className={INPUT} />
                    </div>
                  </div>
                  <div className="max-w-xs">
                    <label className={LABEL}>Date of Birth</label>
                    <input type="date" value={form.dateOfBirth} onChange={(e) => setField({ dateOfBirth: e.target.value })} className={INPUT} />
                  </div>
                </div>
              )}
            </section>

            {/* Section 4: Notes */}
            <section className="border-t border-slate-200 pt-4">
              <button type="button" onClick={() => setSectionNotes(!sectionNotes)} className="flex items-center gap-2 w-full text-sm font-semibold text-slate-800 hover:text-slate-900 transition-colors">
                <ChevronDown className={`h-4 w-4 transition-transform ${sectionNotes ? "rotate-0" : "-rotate-90"}`} />
                Notes
              </button>
              {sectionNotes && (
                <div className="mt-3">
                  <textarea rows={3} value={form.notes} onChange={(e) => setField({ notes: e.target.value })} className={INPUT} placeholder="Internal notes about this agent..." />
                </div>
              )}
            </section>

            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={formSubmitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {formSubmitting ? "Saving..." : "Save Changes"}
              </button>
              <button type="button" onClick={closeEdit} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Profile Header Card ────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 mb-6">
        <div className="flex flex-col md:flex-row items-start gap-6">
          {/* Avatar */}
          {agent.photoUrl ? (
            <img src={agent.photoUrl} alt={`${agent.firstName} ${agent.lastName}`} className="w-20 h-20 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-blue-100 text-blue-600 text-2xl font-bold flex items-center justify-center flex-shrink-0">
              {initials}
            </div>
          )}

          {/* Center info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-slate-900">{agent.firstName} {agent.lastName}</h1>
              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[agent.status] || "bg-slate-100 text-slate-600"}`}>
                {STATUS_LABELS[agent.status] || agent.status}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mt-1">
              <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{agent.email}</span>
              {agent.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{agent.phone}</span>}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mt-2">
              {agent.teamOrOffice && (
                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{agent.teamOrOffice}</span>
              )}
              {agent.startDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Started {fmtDate(agent.startDate)}
                  {yearsDuration(agent.startDate) && <span className="text-slate-400">({yearsDuration(agent.startDate)})</span>}
                </span>
              )}
              {agent.licenseNumber && (
                <span className="flex items-center gap-1"><Hash className="h-3.5 w-3.5" />Lic# {agent.licenseNumber}</span>
              )}
            </div>

            <div className="mt-3 text-sm">
              {agent.commissionPlan ? (
                <span className="text-slate-600">
                  Plan: <span className="font-medium">{agent.commissionPlan.name}</span>
                  <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700">
                    {COMMISSION_PLAN_TYPE_LABELS[agent.commissionPlan.planType] || agent.commissionPlan.planType}
                  </span>
                </span>
              ) : (
                <span className="text-slate-500">Default Split: <span className="font-medium text-green-600">{splitPct}%</span> / <span className="font-medium text-blue-600">{housePct}%</span></span>
              )}
            </div>
          </div>

          {/* Action buttons */}
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <StatCard
            icon={<Briefcase className="h-5 w-5 text-blue-500" />}
            label="Total Deals"
            value={String(stats.totalDeals)}
            sub={`${stats.dealsThisYear} this year`}
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5 text-violet-500" />}
            label="Total Volume"
            value={fmt(stats.totalVolume)}
            sub={`${fmt(stats.volumeThisYear)} this year`}
          />
          <StatCard
            icon={<DollarSign className="h-5 w-5 text-green-500" />}
            label="Earnings (Paid)"
            value={fmt(stats.totalPaidEarnings)}
            sub={stats.unpaidEarnings > 0 ? `${fmt(stats.unpaidEarnings)} unpaid` : "All paid"}
          />
          <StatCard
            icon={<Clock className="h-5 w-5 text-amber-500" />}
            label="Pending Payouts"
            value={fmt(stats.unpaidEarnings)}
            sub={stats.unpaidEarnings > 0 ? "Outstanding" : "None"}
          />
          <StatCard
            icon={<BarChart3 className="h-5 w-5 text-indigo-500" />}
            label="Avg Deal Size"
            value={fmt(stats.avgDealSize)}
            sub={stats.avgCommissionPct > 0 ? `${stats.avgCommissionPct.toFixed(1)}% avg comm` : "\u00a0"}
          />
        </div>
      )}

      {/* ── Tab Nav ──────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 overflow-x-auto no-scrollbar border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setDealPage(1); setInvoicePage(1); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            {TAB_LABELS[tab]}
            {tab === "compliance" && (expiredDocs > 0 || expiringSoonDocs > 0) && (
              <span className={`ml-1.5 inline-block w-2 h-2 rounded-full ${expiredDocs > 0 ? "bg-red-500" : "bg-amber-500"}`} />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-6">
            {/* Personal Info */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400" />
                Personal Info
              </h3>
              <div className="space-y-3 text-sm">
                <InfoRow label="Address" value={agent.address || "\u2014"} />
                <InfoRow label="City / State / ZIP" value={
                  [agent.city, agent.state, agent.zipCode].filter(Boolean).join(", ") || "\u2014"
                } />
                <InfoRow label="Date of Birth" value={fmtDate(agent.dateOfBirth)} />
                <InfoRow label="Start Date" value={agent.startDate ? `${fmtDate(agent.startDate)} (${yearsDuration(agent.startDate)})` : "\u2014"} />
                <InfoRow label="Team / Office" value={agent.teamOrOffice || "\u2014"} />
              </div>
            </div>

            {/* Commission Info */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-slate-400" />
                Commission Info
              </h3>
              <div className="space-y-3 text-sm">
                {agent.commissionPlan ? (
                  <>
                    <InfoRow label="Plan" value={agent.commissionPlan.name} />
                    <InfoRow label="Type" value={COMMISSION_PLAN_TYPE_LABELS[agent.commissionPlan.planType] || agent.commissionPlan.planType} />
                    {agent.commissionPlan.tiers?.length > 0 && (
                      <div className="pt-2">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Tier Structure</p>
                        <div className="space-y-1">
                          {agent.commissionPlan.tiers.map((tier: any, i: number) => {
                            const isCurrent = i === currentTierIndex;
                            return (
                              <div key={tier.id} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm ${isCurrent ? "bg-blue-50 ring-1 ring-blue-200" : "bg-slate-50"}`}>
                                <span className="text-slate-700">
                                  {tier.label || `Tier ${i + 1}`}
                                  {isCurrent && <span className="ml-2 text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">CURRENT</span>}
                                </span>
                                <span>
                                  <span className="font-medium text-green-600">{Number(tier.agentSplitPct)}%</span>
                                  <span className="text-slate-400 mx-1">/</span>
                                  <span className="font-medium text-blue-600">{Number(tier.houseSplitPct)}%</span>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <InfoRow label="Plan" value="Default Split" />
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Split:</span>
                      <span className="font-medium text-green-600">{splitPct}%</span>
                      <span className="text-slate-400">/</span>
                      <span className="font-medium text-blue-600">{housePct}%</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Compliance Status */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-slate-400" />
                  Compliance Status
                </h3>
                <button onClick={() => setActiveTab("compliance")} className="text-xs text-blue-600 hover:text-blue-700 font-medium">View All</button>
              </div>
              <div className="space-y-3 text-sm">
                <ComplianceRow
                  label="License"
                  value={agent.licenseNumber ? `#${agent.licenseNumber}` : "Not set"}
                  expiry={agent.licenseExpiry}
                  status={licenseStatus}
                />
                <ComplianceRow
                  label="E&O Insurance"
                  value={agent.eoInsuranceExpiry ? "On file" : "Not set"}
                  expiry={agent.eoInsuranceExpiry}
                  status={eoStatus}
                />
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500">W-9 on File</span>
                  {agent.w9OnFile ? (
                    <span className="flex items-center gap-1 text-green-600 font-medium"><CheckCircle2 className="h-4 w-4" /> Yes</span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-500 font-medium"><XCircle className="h-4 w-4" /> No</span>
                  )}
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500">Documents</span>
                  <span className="text-slate-700 font-medium">{complianceDocs.length}</span>
                </div>
              </div>
            </div>

            {/* Quick Activity */}
            <div className="bg-white border border-slate-200 rounded-xl">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-base font-semibold text-slate-800">Recent Deals</h3>
              </div>
              {allDeals.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {allDeals.slice(0, 5).map((d: any) => (
                    <div key={d.id} className="px-5 py-3">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-medium text-slate-800 truncate max-w-[200px]">{d.propertyAddress}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${DEAL_STATUS_COLORS[d.status] || "bg-slate-100 text-slate-600"}`}>
                          {d.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        <span className="capitalize">{d.dealType}</span> &middot; {fmt(Number(d.transactionValue))} &middot; {fmtDate(d.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-center">
                  <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No deals yet</p>
                </div>
              )}
              {allDeals.length > 5 && (
                <div className="px-5 py-3 border-t border-slate-100">
                  <button onClick={() => setActiveTab("deals")} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    View all {allDeals.length} deals
                  </button>
                </div>
              )}
            </div>

            {/* Recent Invoices */}
            <div className="bg-white border border-slate-200 rounded-xl">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-base font-semibold text-slate-800">Recent Invoices</h3>
              </div>
              {allInvoices.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {allInvoices.slice(0, 5).map((inv: any) => (
                    <div key={inv.id} className="px-5 py-3">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-medium text-slate-800">{inv.invoiceNumber}</span>
                          <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${INVOICE_STATUS_COLORS[inv.status] || "bg-slate-100 text-slate-600"}`}>
                            {inv.status}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-green-600">{fmt(Number(inv.agentPayout))}</span>
                      </div>
                      <div className="text-xs text-slate-500 truncate">{inv.propertyAddress}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-center">
                  <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No invoices yet</p>
                </div>
              )}
              {allInvoices.length > 5 && (
                <div className="px-5 py-3 border-t border-slate-100">
                  <button onClick={() => setActiveTab("invoices")} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    View all {allInvoices.length} invoices
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Deals ───────────────────────────────────── */}
      {activeTab === "deals" && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Filters */}
          <div className="px-5 py-4 border-b border-slate-200 space-y-3">
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {DEAL_STATUS_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setDealFilter(tab); setDealPage(1); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                    dealFilter === tab ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {tab === "all" ? "All" : tab.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </button>
              ))}
            </div>
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={dealSearch}
                onChange={(e) => { setDealSearch(e.target.value); setDealPage(1); }}
                placeholder="Search by address or client..."
                className="w-full pl-10 pr-4 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Table */}
          {pagedDeals.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Property</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Trans. Value</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Commission</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent Payout</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedDeals.map((d: any) => (
                    <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-800 max-w-[200px] truncate">{d.propertyAddress}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 capitalize">{d.dealType}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">{fmt(Number(d.transactionValue))}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">{fmt(Number(d.totalCommission))}</td>
                      <td className="px-4 py-3 text-sm text-green-600 font-medium text-right">{fmt(Number(d.agentPayout))}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${DEAL_STATUS_COLORS[d.status] || "bg-slate-100 text-slate-600"}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{fmtDate(d.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">{dealSearch || dealFilter !== "all" ? "No deals match filters" : "No deal submissions yet"}</p>
            </div>
          )}

          {/* Pagination */}
          {dealTotalPages > 1 && (
            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between text-sm">
              <span className="text-slate-500">{filteredDeals.length} deal{filteredDeals.length !== 1 ? "s" : ""}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setDealPage(Math.max(1, dealPage - 1))} disabled={dealPage <= 1} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-slate-600">{dealPage} / {dealTotalPages}</span>
                <button onClick={() => setDealPage(Math.min(dealTotalPages, dealPage + 1))} disabled={dealPage >= dealTotalPages} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Invoices ────────────────────────────────── */}
      {activeTab === "invoices" && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Filters */}
          <div className="px-5 py-4 border-b border-slate-200">
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {INVOICE_STATUS_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setInvoiceFilter(tab); setInvoicePage(1); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                    invoiceFilter === tab ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {pagedInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Invoice #</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Property</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent Payout</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Due Date</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedInvoices.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono font-medium text-slate-800">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate">{inv.propertyAddress}</td>
                      <td className="px-4 py-3 text-sm font-medium text-green-600 text-right">{fmt(Number(inv.agentPayout))}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${INVOICE_STATUS_COLORS[inv.status] || "bg-slate-100 text-slate-600"}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{fmtDate(inv.dueDate)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => downloadInvoicePDF(inv)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                          title="Download PDF"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">{invoiceFilter !== "all" ? "No invoices match filter" : "No invoices yet"}</p>
            </div>
          )}

          {/* Pagination */}
          {invoiceTotalPages > 1 && (
            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between text-sm">
              <span className="text-slate-500">{filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? "s" : ""}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setInvoicePage(Math.max(1, invoicePage - 1))} disabled={invoicePage <= 1} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-slate-600">{invoicePage} / {invoiceTotalPages}</span>
                <button onClick={() => setInvoicePage(Math.min(invoiceTotalPages, invoicePage + 1))} disabled={invoicePage >= invoiceTotalPages} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Compliance ──────────────────────────────── */}
      {activeTab === "compliance" && (
        <div className="space-y-6">
          {/* Add button */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowComplianceForm(!showComplianceForm)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {showComplianceForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showComplianceForm ? "Cancel" : "Add Document"}
            </button>
          </div>

          {/* Inline add form */}
          {showComplianceForm && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-base font-semibold text-slate-800 mb-4">Add Compliance Document</h3>
              <form onSubmit={handleAddComplianceDoc} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Document Type <span className="text-red-500">*</span></label>
                    <select
                      value={compForm.docType}
                      onChange={(e) => setCompForm({ ...compForm, docType: e.target.value as ComplianceDocType })}
                      className={INPUT}
                    >
                      {Object.entries(COMPLIANCE_DOC_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Title <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      value={compForm.title}
                      onChange={(e) => setCompForm({ ...compForm, title: e.target.value })}
                      className={INPUT}
                      placeholder="e.g. NY Real Estate License"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Issue Date</label>
                    <input type="date" value={compForm.issueDate} onChange={(e) => setCompForm({ ...compForm, issueDate: e.target.value })} className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Expiry Date</label>
                    <input type="date" value={compForm.expiryDate} onChange={(e) => setCompForm({ ...compForm, expiryDate: e.target.value })} className={INPUT} />
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Notes</label>
                  <textarea rows={2} value={compForm.notes} onChange={(e) => setCompForm({ ...compForm, notes: e.target.value })} className={INPUT} placeholder="Optional notes..." />
                </div>
                <button type="submit" disabled={compFormSubmitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {compFormSubmitting ? "Adding..." : "Add Document"}
                </button>
              </form>
            </div>
          )}

          {/* Compliance docs list */}
          {complianceDocs.length > 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {complianceDocs.map((doc: any) => (
                <div key={doc.id} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-100 text-slate-600">
                        {COMPLIANCE_DOC_TYPE_LABELS[doc.docType] || doc.docType}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${COMPLIANCE_STATUS_COLORS[doc.status] || "bg-slate-100 text-slate-600"}`}>
                        {doc.status === "expiring_soon" ? "Expiring Soon" : doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-800">{doc.title}</p>
                    <div className="flex gap-3 text-xs text-slate-500 mt-1">
                      {doc.issueDate && <span>Issued: {fmtDate(doc.issueDate)}</span>}
                      {doc.expiryDate && <span>Expires: {fmtDate(doc.expiryDate)}</span>}
                    </div>
                    {doc.notes && <p className="text-xs text-slate-400 mt-1">{doc.notes}</p>}
                  </div>
                  <button
                    onClick={() => handleDeleteComplianceDoc(doc.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl py-12 text-center">
              <Shield className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No compliance documents yet</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Notes & Activity ────────────────────────── */}
      {activeTab === "notes" && (
        <div className="space-y-6">
          {/* Notes editor */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">Agent Notes</h3>
              {!editingNotes ? (
                <button
                  onClick={() => { setEditingNotes(true); setNotesValue(agent.notes || ""); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveNotes}
                    disabled={notesSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {notesSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingNotes(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            {editingNotes ? (
              <textarea
                rows={6}
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                className={INPUT}
                placeholder="Internal notes about this agent..."
                autoFocus
              />
            ) : (
              <div className="text-sm text-slate-600 whitespace-pre-wrap min-h-[60px]">
                {agent.notes || <span className="text-slate-400 italic">No notes yet. Click Edit to add notes.</span>}
              </div>
            )}
          </div>

          {/* Activity timeline placeholder */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Activity Log</h3>
            <div className="py-8 text-center">
              <Clock className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Activity log coming soon</p>
              <p className="text-xs text-slate-300 mt-1">Audit trail and activity history will appear here</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-medium text-right">{value}</span>
    </div>
  );
}

function ComplianceRow({ label, value, expiry, status }: { label: string; value: string; expiry: string | null | undefined; status: "active" | "expired" | "expiring_soon" }) {
  const StatusIcon = status === "active" ? CheckCircle2 : status === "expiring_soon" ? AlertTriangle : XCircle;
  const statusColor = status === "active" ? "text-green-600" : status === "expiring_soon" ? "text-amber-500" : "text-red-500";

  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <span className="text-slate-500">{label}</span>
        {expiry && <span className="text-xs text-slate-400 ml-2">exp {fmtDate(expiry)}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-slate-700 text-sm">{value}</span>
        <StatusIcon className={`h-4 w-4 ${statusColor}`} />
      </div>
    </div>
  );
}
