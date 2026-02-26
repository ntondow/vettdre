"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  getComplianceOverview,
  getAgentComplianceDocs,
  createComplianceDoc,
  deleteComplianceDoc,
  getExpiringItems,
  refreshComplianceStatuses,
} from "./actions";
import type { ComplianceDocType, AgentComplianceSummary, ComplianceDocRecord } from "@/lib/bms-types";
import {
  COMPLIANCE_DOC_TYPE_LABELS,
  COMPLIANCE_STATUS_COLORS,
} from "@/lib/bms-types";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Plus,
  Trash2,
  AlertTriangle,
  Clock,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
  Eye,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────

const INPUT = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const LABEL = "block text-sm font-medium text-slate-700 mb-1";

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function expiryColor(iso: string | null): string {
  if (!iso) return "text-slate-400";
  const d = new Date(iso);
  const now = new Date();
  if (d < now) return "text-red-600 font-medium";
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);
  if (d < thirtyDays) return "text-amber-600 font-medium";
  return "text-green-600";
}

const DOC_TYPE_OPTIONS: { value: ComplianceDocType; label: string }[] = [
  { value: "license", label: "License" },
  { value: "eo_insurance", label: "E&O Insurance" },
  { value: "continuing_education", label: "Continuing Education" },
  { value: "background_check", label: "Background Check" },
  { value: "other", label: "Other" },
];

interface DocFormData {
  docType: ComplianceDocType;
  title: string;
  description: string;
  issueDate: string;
  expiryDate: string;
  fileUrl: string;
  fileName: string;
  notes: string;
}

const EMPTY_DOC_FORM: DocFormData = {
  docType: "license",
  title: "",
  description: "",
  issueDate: "",
  expiryDate: "",
  fileUrl: "",
  fileName: "",
  notes: "",
};

// ── Types ─────────────────────────────────────────────────────

interface Overview {
  totalAgents: number;
  fullyCompliant: number;
  hasExpired: number;
  hasExpiringSoon: number;
  agentSummaries: AgentComplianceSummary[];
}

interface ExpiringGroup {
  agentId: string;
  agentName: string;
  agentEmail: string;
  items: Array<{ type: string; title: string; expiryDate: string; daysUntilExpiry: number }>;
}

// ── Component ─────────────────────────────────────────────────

export default function CompliancePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [expiringData, setExpiringData] = useState<{ expiringItems: ExpiringGroup[]; totalItems: number }>({ expiringItems: [], totalItems: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentDocs, setAgentDocs] = useState<ComplianceDocRecord[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [docForm, setDocForm] = useState<DocFormData>({ ...EMPTY_DOC_FORM });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showExpiring, setShowExpiring] = useState(false);

  // ── Load data ─────────────────────────────────────────────

  async function loadOverview() {
    setLoading(true);
    try {
      // Refresh statuses first, then load data
      await refreshComplianceStatuses();
      const [overviewData, expiring] = await Promise.all([
        getComplianceOverview(),
        getExpiringItems(30),
      ]);
      setOverview(overviewData);
      setExpiringData(expiring);
    } catch {
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadAgentDocs(agentId: string) {
    setDocsLoading(true);
    try {
      const docs = await getAgentComplianceDocs(agentId);
      setAgentDocs(docs);
    } catch {
      setAgentDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }

  function selectAgent(agentId: string) {
    if (selectedAgentId === agentId) {
      setSelectedAgentId(null);
      setAgentDocs([]);
      setShowAddDoc(false);
      return;
    }
    setSelectedAgentId(agentId);
    setShowAddDoc(false);
    setDocForm({ ...EMPTY_DOC_FORM });
    setFormError("");
    loadAgentDocs(agentId);
  }

  // ── Doc CRUD ──────────────────────────────────────────────

  async function handleAddDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAgentId) return;
    setFormError("");
    setFormSubmitting(true);

    try {
      const result = await createComplianceDoc({
        agentId: selectedAgentId,
        docType: docForm.docType,
        title: docForm.title.trim(),
        description: docForm.description.trim() || undefined,
        issueDate: docForm.issueDate || undefined,
        expiryDate: docForm.expiryDate || undefined,
        fileUrl: docForm.fileUrl.trim() || undefined,
        fileName: docForm.fileName.trim() || undefined,
        notes: docForm.notes.trim() || undefined,
      });

      if (!result.success) {
        setFormError(result.error || "Failed to create document");
        return;
      }

      setShowAddDoc(false);
      setDocForm({ ...EMPTY_DOC_FORM });
      loadAgentDocs(selectedAgentId);
      loadOverview();
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleDeleteDoc(docId: string) {
    if (!confirm("Delete this compliance document?")) return;
    setActionLoading(docId);
    try {
      const result = await deleteComplianceDoc(docId);
      if (!result.success) {
        alert(result.error || "Failed to delete document");
      }
      if (selectedAgentId) loadAgentDocs(selectedAgentId);
      loadOverview();
    } finally {
      setActionLoading(null);
    }
  }

  // ── Loading ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="h-8 w-40 bg-slate-200 animate-pulse rounded mb-2" />
        <div className="h-5 w-72 bg-slate-100 animate-pulse rounded mb-6" />
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-slate-100 animate-pulse rounded-xl" />
      </div>
    );
  }

  const summaries = overview?.agentSummaries || [];
  const selectedAgent = summaries.find((a) => a.agentId === selectedAgentId);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Compliance</h1>
        <p className="text-sm text-slate-500 mt-1">Track licenses, insurance, and agent compliance status</p>
      </div>

      {/* ── Status Cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatusCard
          icon={<Shield className="h-5 w-5" />}
          iconBg="bg-slate-100 text-slate-600"
          label="Total Agents"
          value={overview?.totalAgents ?? 0}
        />
        <StatusCard
          icon={<ShieldCheck className="h-5 w-5" />}
          iconBg="bg-green-100 text-green-600"
          label="Fully Compliant"
          value={overview?.fullyCompliant ?? 0}
        />
        <StatusCard
          icon={<ShieldAlert className="h-5 w-5" />}
          iconBg="bg-amber-100 text-amber-600"
          label="Expiring Soon"
          value={overview?.hasExpiringSoon ?? 0}
        />
        <StatusCard
          icon={<ShieldX className="h-5 w-5" />}
          iconBg="bg-red-100 text-red-600"
          label="Expired"
          value={overview?.hasExpired ?? 0}
        />
      </div>

      {/* ── Expiring Soon Banner ──────────────────────── */}
      {expiringData.totalItems > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <button
            onClick={() => setShowExpiring(!showExpiring)}
            className="flex items-center gap-2 w-full text-left"
          >
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <span className="text-sm font-medium text-amber-800 flex-1">
              {expiringData.totalItems} item{expiringData.totalItems !== 1 ? "s" : ""} expiring in the next 30 days
            </span>
            {showExpiring
              ? <ChevronUp className="h-4 w-4 text-amber-500" />
              : <ChevronDown className="h-4 w-4 text-amber-500" />
            }
          </button>

          {showExpiring && (
            <div className="mt-3 space-y-2 pt-3 border-t border-amber-200">
              {expiringData.expiringItems.map((group) => (
                <div key={group.agentId} className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-amber-900">{group.agentName}</p>
                  {group.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 ml-4 text-xs text-amber-700">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>{COMPLIANCE_DOC_TYPE_LABELS[item.type] || item.title}</span>
                      <span className="text-amber-500">\u2014</span>
                      <span className="font-medium">{item.daysUntilExpiry} day{item.daysUntilExpiry !== 1 ? "s" : ""}</span>
                      <span className="text-amber-500">({formatDate(item.expiryDate)})</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Empty State ───────────────────────────────── */}
      {summaries.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl py-16 text-center">
          <Shield className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Add agents to start tracking compliance</p>
          <Link
            href="/brokerage/agents"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Agent Roster
          </Link>
        </div>
      )}

      {/* ── Agent Compliance Table ─────────────────────── */}
      {summaries.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">License Expiry</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">E&O Insurance</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Docs</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summaries.map((agent) => (
                <tr
                  key={agent.agentId}
                  className={`hover:bg-slate-50/50 transition-colors ${selectedAgentId === agent.agentId ? "bg-blue-50/30" : ""}`}
                >
                  <td className="px-4 py-3">
                    <Link href={`/brokerage/agents/${agent.agentId}`} className="group">
                      <p className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                        {agent.agentName}
                      </p>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm ${expiryColor(agent.licenseExpiry)}`}>
                      {formatDate(agent.licenseExpiry)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm ${expiryColor(agent.eoInsuranceExpiry)}`}>
                      {formatDate(agent.eoInsuranceExpiry)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-slate-600">{agent.totalDocs}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {agent.isFullyCompliant && agent.expiringSoonDocs === 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                        <ShieldCheck className="h-3 w-3" /> Compliant
                      </span>
                    )}
                    {agent.isFullyCompliant && agent.expiringSoonDocs > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                        <ShieldAlert className="h-3 w-3" /> Expiring
                      </span>
                    )}
                    {!agent.isFullyCompliant && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                        <ShieldX className="h-3 w-3" /> Expired
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => selectAgent(agent.agentId)}
                      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                        selectedAgentId === agent.agentId
                          ? "bg-blue-100 text-blue-700"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {selectedAgentId === agent.agentId ? "Close" : "View Docs"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Side Panel (Agent Docs) ────────────────────── */}
      {selectedAgentId && selectedAgent && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
          {/* Panel header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                {selectedAgent.agentName} \u2014 Compliance Documents
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{agentDocs.length} document{agentDocs.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowAddDoc(true); setDocForm({ ...EMPTY_DOC_FORM }); setFormError(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Document
              </button>
              <button
                onClick={() => { setSelectedAgentId(null); setShowAddDoc(false); }}
                className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Add doc form */}
          {showAddDoc && (
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-sm font-medium text-slate-700 mb-3">New Compliance Document</h3>

              {formError && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-700 flex-1">{formError}</p>
                  <button onClick={() => setFormError("")} className="text-red-400 hover:text-red-600 text-sm">Dismiss</button>
                </div>
              )}

              <form onSubmit={handleAddDoc} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className={LABEL}>Type <span className="text-red-500">*</span></label>
                    <select
                      required
                      value={docForm.docType}
                      onChange={(e) => setDocForm((p) => ({ ...p, docType: e.target.value as ComplianceDocType }))}
                      className={INPUT}
                    >
                      {DOC_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={LABEL}>Title <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      value={docForm.title}
                      onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))}
                      className={INPUT}
                      placeholder="e.g., NY Real Estate License"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className={LABEL}>Description</label>
                    <input
                      type="text"
                      value={docForm.description}
                      onChange={(e) => setDocForm((p) => ({ ...p, description: e.target.value }))}
                      className={INPUT}
                      placeholder="Optional description"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Issue Date</label>
                    <input
                      type="date"
                      value={docForm.issueDate}
                      onChange={(e) => setDocForm((p) => ({ ...p, issueDate: e.target.value }))}
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Expiry Date</label>
                    <input
                      type="date"
                      value={docForm.expiryDate}
                      onChange={(e) => setDocForm((p) => ({ ...p, expiryDate: e.target.value }))}
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Notes</label>
                    <input
                      type="text"
                      value={docForm.notes}
                      onChange={(e) => setDocForm((p) => ({ ...p, notes: e.target.value }))}
                      className={INPUT}
                      placeholder="Optional notes"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>File URL</label>
                    <input
                      type="url"
                      value={docForm.fileUrl}
                      onChange={(e) => setDocForm((p) => ({ ...p, fileUrl: e.target.value }))}
                      className={INPUT}
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className={LABEL}>File Name</label>
                    <input
                      type="text"
                      value={docForm.fileName}
                      onChange={(e) => setDocForm((p) => ({ ...p, fileName: e.target.value }))}
                      className={INPUT}
                      placeholder="license.pdf"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {formSubmitting ? "Saving..." : "Save Document"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddDoc(false); setFormError(""); }}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Doc list */}
          {docsLoading ? (
            <div className="px-5 py-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-slate-50 animate-pulse rounded mb-2" />
              ))}
            </div>
          ) : agentDocs.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <FileText className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No compliance documents yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {agentDocs.map((doc) => (
                <div key={doc.id} className="px-5 py-3 flex items-center gap-3">
                  <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-md ${
                    COMPLIANCE_STATUS_COLORS[doc.status] || "bg-slate-100 text-slate-600"
                  }`}>
                    {COMPLIANCE_DOC_TYPE_LABELS[doc.docType] || doc.docType}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{doc.title}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      {doc.issueDate && <span>Issued: {formatDate(doc.issueDate)}</span>}
                      {doc.expiryDate && (
                        <span className={expiryColor(doc.expiryDate)}>
                          Expires: {formatDate(doc.expiryDate)}
                        </span>
                      )}
                      {doc.fileName && <span>{doc.fileName}</span>}
                    </div>
                  </div>
                  <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                    COMPLIANCE_STATUS_COLORS[doc.status] || "bg-slate-100 text-slate-600"
                  }`}>
                    {doc.status === "active" ? "Active" : doc.status === "expired" ? "Expired" : "Expiring"}
                  </span>
                  <button
                    onClick={() => handleDeleteDoc(doc.id)}
                    disabled={actionLoading === doc.id}
                    className="p-1.5 text-slate-300 hover:text-red-500 disabled:opacity-50 transition-colors shrink-0"
                    title="Delete document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Status Card ───────────────────────────────────────────────

function StatusCard({
  icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
