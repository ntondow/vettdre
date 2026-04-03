"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getApplication, updateDecision, sendInvite, withdrawApplication, getReportDownloadUrl } from "../actions";
import StatusBadge from "@/components/screening/StatusBadge";
import RiskScoreBadge from "@/components/screening/RiskScoreBadge";
import DecisionPanel from "@/components/screening/DecisionPanel";
import EventLog from "@/components/screening/EventLog";
import { DOCUMENT_TYPE_LABELS, STATUS_CONFIG } from "@/lib/screening/constants";

type Tab = "overview" | "credit" | "financial" | "documents" | "events";

const TAB_ITEMS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "credit", label: "Credit & Background" },
  { key: "financial", label: "Financial" },
  { key: "documents", label: "Documents" },
  { key: "events", label: "Activity Log" },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtCurrency(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDollars(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return "$" + Number(amount).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPercent(val: number | null | undefined): string {
  if (val == null) return "—";
  return Math.round(val) + "%";
}

const ROLE_LABELS: Record<string, string> = {
  main: "Primary Applicant",
  co_applicant: "Co-Applicant",
  guarantor: "Guarantor",
  occupant: "Occupant",
};

const APPLICANT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  invited: { bg: "bg-indigo-50", text: "text-indigo-600" },
  in_progress: { bg: "bg-amber-50", text: "text-amber-600" },
  submitted: { bg: "bg-blue-50", text: "text-blue-600" },
  complete: { bg: "bg-green-50", text: "text-green-600" },
};

export default function ScreeningDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [app, setApp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const loadApp = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getApplication(id);
      setApp(data);
    } catch (e) {
      setError("Failed to load application");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadApp(); }, [loadApp]);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setError(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  const showError = (msg: string) => {
    setError(msg);
    setSuccess(null);
    setTimeout(() => setError(null), 5000);
  };

  const handleDecision = async (decision: "approved" | "conditional" | "denied", notes?: string) => {
    try {
      const result = await updateDecision(id, decision, notes);
      if (result.success) {
        showSuccess(`Application ${decision}`);
        loadApp();
      } else {
        showError(result.error || "Failed to update decision");
      }
    } catch {
      showError("Failed to update decision");
    }
  };

  const handleSendInvite = async () => {
    try {
      const result = await sendInvite(id, "email");
      if (result.success) {
        showSuccess("Invite sent successfully");
        loadApp();
      } else {
        showError(result.error || "Failed to send invite");
      }
    } catch {
      showError("Failed to send invite");
    }
  };

  const handleDownloadReport = async () => {
    try {
      setDownloading(true);
      const result = await getReportDownloadUrl(id);
      if ("error" in result) {
        showError(result.error);
        return;
      }
      // Open signed URL in new tab — browser will handle the download
      window.open(result.url, "_blank");
    } catch {
      showError("Failed to download report");
    } finally {
      setDownloading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!confirm("Withdraw this screening application?")) return;
    try {
      const result = await withdrawApplication(id);
      if (result.success) {
        showSuccess("Application withdrawn");
        loadApp();
      } else {
        showError(result.error || "Failed to withdraw application");
      }
    } catch {
      showError("Failed to withdraw application");
    }
  };

  const handleReopenForPlaid = async () => {
    if (!confirm("Reopen this application so the applicant can complete Plaid bank connection?")) return;
    try {
      const { reopenForPlaid } = await import("../actions");
      const result = await reopenForPlaid(id);
      if (result.success) {
        showSuccess("Application reopened for Plaid completion. Applicant can now revisit their link.");
        loadApp();
      } else {
        showError(result.error || "Failed to reopen application");
      }
    } catch {
      showError("Failed to reopen application");
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6 animate-pulse">
        {/* Back link skeleton */}
        <div className="h-4 bg-slate-200 rounded w-32" />
        {/* Header skeleton */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-7 bg-slate-200 rounded w-72" />
            <div className="flex items-center gap-3">
              <div className="h-5 bg-slate-100 rounded-full w-20" />
              <div className="h-4 bg-slate-100 rounded w-28" />
              <div className="h-4 bg-slate-100 rounded w-32" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-8 bg-slate-200 rounded-lg w-24" />
          </div>
        </div>
        {/* Score cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
            <div className="h-4 bg-slate-200 rounded w-32" />
            <div className="h-16 bg-slate-100 rounded w-full" />
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
            <div className="h-4 bg-slate-200 rounded w-28" />
            <div className="h-16 bg-slate-100 rounded w-full" />
          </div>
        </div>
        {/* Tabs skeleton */}
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-slate-100 rounded-full w-24" />
          ))}
        </div>
        {/* Content card skeleton */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
          <div className="h-4 bg-slate-200 rounded w-40" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 bg-slate-100 rounded w-28" />
                <div className="h-4 bg-slate-100 rounded w-36" />
              </div>
            ))}
          </div>
        </div>
        {/* Applicants skeleton */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
          <div className="h-4 bg-slate-200 rounded w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="h-4 bg-slate-100 rounded w-32" />
            <div className="h-4 bg-slate-100 rounded w-40" />
            <div className="h-4 bg-slate-100 rounded w-44" />
            <div className="h-4 bg-slate-100 rounded w-28" />
          </div>
        </div>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-400 text-sm">Application not found</p>
        <Link href="/screening" className="text-blue-600 text-sm font-medium mt-2 inline-block hover:underline">
          Back to Screening
        </Link>
      </div>
    );
  }

  const primaryApplicant = app.applicants?.find((a: any) => a.role === "main");
  const otherApplicants = app.applicants?.filter((a: any) => a.role !== "main") || [];
  const wellness = app.wellnessProfile;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Back + Header */}
      <div>
        <Link href="/screening" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
          ← Back to Screening
        </Link>

        <div className="flex items-start justify-between mt-2">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{app.propertyAddress}</h1>
              {app.unitNumber && <span className="text-slate-400 text-lg">#{app.unitNumber}</span>}
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <StatusBadge status={app.status} />
              <span className="text-sm text-slate-500">
                {app.screeningTier === "enhanced" ? "Enhanced" : "Base"} Screening
              </span>
              <span className="text-sm text-slate-400">
                Created {fmtDate(app.createdAt)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Copy Applicant Link */}
            {app.accessToken && (
              <button
                onClick={() => {
                  const url = `${window.location.origin}/screen/${app.accessToken}`;
                  navigator.clipboard.writeText(url).then(() => showSuccess("Link copied to clipboard"));
                }}
                className="rounded-lg border border-slate-200 text-slate-600 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Copy Link
              </button>
            )}
            {app.reportPdfPath && (
              <button
                onClick={handleDownloadReport}
                disabled={downloading}
                className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {downloading ? "Downloading…" : "Download Report"}
              </button>
            )}
            {["draft", "invited"].includes(app.status) && (
              <button
                onClick={handleSendInvite}
                className="rounded-lg bg-blue-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                {app.status === "draft" ? "Send Invite" : "Resend Invite"}
              </button>
            )}
            {/* Reopen for Plaid if skipped */}
            {app.applicants?.some((a: any) => a.plaidSkipped && !a.plaidConnections?.length) &&
             !["withdrawn", "draft"].includes(app.status) && (
              <button
                onClick={handleReopenForPlaid}
                className="rounded-lg border border-blue-200 text-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-50 transition-colors"
              >
                Reopen for Plaid
              </button>
            )}
            {!["approved", "denied", "withdrawn"].includes(app.status) && (
              <button
                onClick={handleWithdraw}
                className="rounded-lg border border-red-200 text-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-50 transition-colors"
              >
                Withdraw
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toasts */}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">
          {error}
        </div>
      )}

      {/* Score + Decision Card */}
      {(app.vettdreRiskScore != null || app.status === "complete") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">VettdRE Risk Score</h3>
            <div className="flex items-center gap-4">
              <RiskScoreBadge score={app.vettdreRiskScore} recommendation={app.riskRecommendation} size="lg" />
              {app.riskRecommendation && (
                <div>
                  <p className="text-sm text-slate-500">AI Recommendation</p>
                  <p className="text-sm font-semibold capitalize text-slate-700">{app.riskRecommendation}</p>
                </div>
              )}
            </div>
            {app.riskFactors && Array.isArray(app.riskFactors) && app.riskFactors.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-medium text-slate-500">Key Factors</p>
                {app.riskFactors.map((f: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={f.impact > 0 ? "text-green-600" : f.impact < 0 ? "text-red-600" : "text-slate-500"}>
                      {f.impact > 0 ? "+" : ""}{f.impact}
                    </span>
                    <span className="text-slate-600">{f.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DecisionPanel
            applicationId={id}
            currentStatus={app.status}
            riskScore={app.vettdreRiskScore}
            recommendation={app.riskRecommendation}
            onDecision={handleDecision}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto no-scrollbar">
        {TAB_ITEMS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {tab === "overview" && (
          <OverviewTab
            app={app}
            primaryApplicant={primaryApplicant}
            otherApplicants={otherApplicants}
          />
        )}
        {tab === "credit" && <CreditTab applicants={app.applicants || []} />}
        {tab === "financial" && <FinancialTab wellness={wellness} applicants={app.applicants || []} monthlyRent={app.monthlyRent} />}
        {tab === "documents" && <DocumentsTab applicants={app.applicants || []} />}
        {tab === "events" && <EventsTab events={app.events || []} />}
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────

function OverviewTab({ app, primaryApplicant, otherApplicants }: { app: any; primaryApplicant: any; otherApplicants: any[] }) {
  return (
    <div className="space-y-4">
      {/* Property Info */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Property Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Address</p>
            <p className="text-slate-700 font-medium">{app.propertyAddress}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Unit</p>
            <p className="text-slate-700">{app.unitNumber || "—"}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Monthly Rent</p>
            <p className="text-slate-700 font-medium">{fmtDollars(app.monthlyRent)}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Lease Start</p>
            <p className="text-slate-700">{fmtDate(app.leaseStartDate)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4 pt-4 border-t border-slate-100">
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Tier</p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              app.screeningTier === "enhanced" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"
            }`}>
              {app.screeningTier === "enhanced" ? "Enhanced" : "Base"}
            </span>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Agent</p>
            <p className="text-slate-700">{app.agent?.fullName || "—"}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Invited</p>
            <p className="text-slate-700">{fmtDate(app.invitedAt)}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Completed</p>
            <p className="text-slate-700">{fmtDate(app.completedAt)}</p>
          </div>
        </div>
      </div>

      {/* Primary Applicant */}
      {primaryApplicant && (
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Primary Applicant</h3>
          <ApplicantCard applicant={primaryApplicant} />
        </div>
      )}

      {/* Other Applicants */}
      {otherApplicants.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Additional Applicants ({otherApplicants.length})</h3>
          {otherApplicants.map((a: any) => (
            <ApplicantCard key={a.id} applicant={a} />
          ))}
        </div>
      )}

      {/* Payments */}
      {app.payments?.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Payments</h3>
          <div className="space-y-2">
            {app.payments.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b border-slate-50 last:border-0">
                <div>
                  <p className="text-slate-700 font-medium">{fmtCurrency(p.amountCents)}</p>
                  <p className="text-xs text-slate-400">{p.payerType === "applicant" ? "Applicant" : "Organization"} — {p.paymentMethod || "Stripe"}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                    p.status === "succeeded" ? "bg-green-50 text-green-600" :
                    p.status === "pending" ? "bg-amber-50 text-amber-600" :
                    "bg-red-50 text-red-600"
                  }`}>
                    {p.status}
                  </span>
                  <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(p.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision Notes */}
      {app.decisionNotes && (
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Decision Notes</h3>
          <p className="text-sm text-slate-600">{app.decisionNotes}</p>
          {app.decisionAt && (
            <p className="text-xs text-slate-400 mt-2">Decided {fmtDateTime(app.decisionAt)}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Applicant Card ────────────────────────────────────────────

function ApplicantCard({ applicant }: { applicant: any }) {
  const statusColor = APPLICANT_STATUS_COLORS[applicant.status] || { bg: "bg-slate-50", text: "text-slate-500" };
  const formData = applicant.formData || {};

  return (
    <div className="border border-slate-100 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-slate-900">
            {applicant.firstName} {applicant.lastName}
          </span>
          <span className="text-xs text-slate-400">{ROLE_LABELS[applicant.role] || applicant.role}</span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColor.bg} ${statusColor.text}`}>
          {applicant.status.replace("_", " ")}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-slate-400 text-xs mb-0.5">Email</p>
          <p className="text-slate-700 truncate">{applicant.email}</p>
        </div>
        <div>
          <p className="text-slate-400 text-xs mb-0.5">Phone</p>
          <p className="text-slate-700">{applicant.phone || "—"}</p>
        </div>
        {formData.dateOfBirth && (
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Date of Birth</p>
            <p className="text-slate-700">{fmtDate(formData.dateOfBirth)}</p>
          </div>
        )}
        {formData.employer && (
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Employer</p>
            <p className="text-slate-700">{formData.employer}</p>
          </div>
        )}
        {formData.monthlyIncome && (
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Monthly Income</p>
            <p className="text-slate-700">{fmtDollars(formData.monthlyIncome)}</p>
          </div>
        )}
        {formData.currentAddress && (
          <div className="col-span-2">
            <p className="text-slate-400 text-xs mb-0.5">Current Address</p>
            <p className="text-slate-700">
              {formData.currentAddress}{formData.currentCity ? `, ${formData.currentCity}` : ""}
              {formData.currentState ? `, ${formData.currentState}` : ""} {formData.currentZip || ""}
            </p>
          </div>
        )}
      </div>

      {/* Wizard Progress */}
      {applicant.status === "in_progress" && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-500 mb-2">Application Progress</p>
          <div className="flex items-center gap-1">
            {[
              { step: 1, label: "Personal Info" },
              { step: 2, label: "E-Sign" },
              { step: 3, label: "Bank" },
              { step: 4, label: "Documents" },
              { step: 5, label: "Payment" },
              { step: 6, label: "Done" },
            ].map((s) => {
              const completed = (applicant.currentStep || 1) > s.step;
              const current = (applicant.currentStep || 1) === s.step;
              return (
                <div key={s.step} className="flex-1">
                  <div
                    className={`h-1.5 rounded-full mb-1 ${
                      completed ? "bg-green-500" : current ? "bg-blue-500" : "bg-slate-200"
                    }`}
                  />
                  <p className={`text-[10px] text-center ${
                    current ? "text-blue-600 font-semibold" : completed ? "text-green-600" : "text-slate-400"
                  }`}>
                    {s.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Plaid connections */}
      {applicant.plaidConnections?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-500 mb-1">Bank Connections</p>
          <div className="flex flex-wrap gap-2">
            {applicant.plaidConnections.map((pc: any) => (
              <span key={pc.id} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                {pc.institutionName || "Bank Account"}
                <span className={pc.status === "active" ? "text-emerald-500" : "text-amber-500"}>
                  ({pc.status})
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Plaid skipped indicator */}
      {applicant.plaidSkipped && !applicant.plaidConnections?.length && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded">
            Bank connection skipped — applicant chose to upload statements instead
          </span>
        </div>
      )}

      {/* E-sign status */}
      {applicant.signatures?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-500 mb-1">E-Signatures</p>
          <div className="flex flex-wrap gap-2">
            {applicant.signatures.map((sig: any) => (
              <span key={sig.id} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                {sig.documentType.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Credit Tab ──────────────────────────────────────────────

function CreditTab({ applicants }: { applicants: any[] }) {
  const allReports = applicants.flatMap((a: any) =>
    (a.creditReports || []).map((r: any) => ({ ...r, applicantName: `${a.firstName} ${a.lastName}`, applicantRole: a.role }))
  );

  if (allReports.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <p className="text-slate-400 text-sm">No credit reports available yet</p>
        <p className="text-xs text-slate-300 mt-1">Reports will appear once the applicant completes the screening and processing finishes</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {allReports.map((report: any) => (
        <div key={report.id} className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">
                {report.applicantName}
                <span className="text-xs text-slate-400 font-normal ml-2">{ROLE_LABELS[report.applicantRole] || report.applicantRole}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {report.bureau} — Pulled {fmtDate(report.createdAt)}
              </p>
            </div>
            {report.creditScore != null && (
              <div className="text-right">
                <span className={`text-2xl font-bold ${
                  report.creditScore >= 700 ? "text-green-600" :
                  report.creditScore >= 600 ? "text-amber-600" :
                  "text-red-600"
                }`}>
                  {report.creditScore}
                </span>
                <p className="text-xs text-slate-400">Credit Score</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-400 text-xs mb-0.5">Eviction Records</p>
              <p className={`font-medium ${report.evictionCount > 0 ? "text-red-600" : "text-green-600"}`}>
                {report.evictionCount ?? 0}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-0.5">Criminal Records</p>
              <p className={`font-medium ${report.criminalCount > 0 ? "text-red-600" : "text-green-600"}`}>
                {report.criminalCount ?? 0}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-0.5">Active Bankruptcy</p>
              <p className={`font-medium ${report.hasActiveBankruptcy ? "text-red-600" : "text-green-600"}`}>
                {report.hasActiveBankruptcy ? "Yes" : "No"}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Financial Tab ────────────────────────────────────────────

function FinancialTab({ wellness, applicants, monthlyRent }: { wellness: any; applicants: any[]; monthlyRent: number }) {
  if (!wellness) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <p className="text-slate-400 text-sm">Financial profile not yet computed</p>
        <p className="text-xs text-slate-300 mt-1">This section will populate after bank data is synced and analyzed</p>
      </div>
    );
  }

  const rentToIncome = wellness.estimatedMonthlyIncome > 0
    ? ((monthlyRent / wellness.estimatedMonthlyIncome) * 100)
    : null;

  return (
    <div className="space-y-4">
      {/* Income & Ratios */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Income & Affordability</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <MetricCard label="Est. Monthly Income" value={fmtDollars(wellness.estimatedMonthlyIncome)} />
          <MetricCard label="Monthly Rent" value={fmtDollars(monthlyRent)} />
          <MetricCard
            label="Rent-to-Income"
            value={rentToIncome != null ? `${Math.round(rentToIncome)}%` : "—"}
            color={rentToIncome != null ? (rentToIncome <= 30 ? "text-green-600" : rentToIncome <= 40 ? "text-amber-600" : "text-red-600") : undefined}
          />
          <MetricCard label="Avg. Monthly Balance" value={fmtDollars(wellness.avgMonthlyBalance)} />
        </div>
      </div>

      {/* Financial Health */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Financial Health Indicators</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <MetricCard
            label="Overdraft/NSF Fees"
            value={String(wellness.overdraftCount ?? 0)}
            color={wellness.overdraftCount > 0 ? "text-red-600" : "text-green-600"}
          />
          <MetricCard
            label="Negative Balance Days"
            value={String(wellness.negativeBalanceDays ?? 0)}
            color={wellness.negativeBalanceDays > 2 ? "text-red-600" : wellness.negativeBalanceDays > 0 ? "text-amber-600" : "text-green-600"}
          />
          <MetricCard label="Regular Deposits" value={wellness.hasRecurringDeposits ? "Yes" : "No"} color={wellness.hasRecurringDeposits ? "text-green-600" : "text-amber-600"} />
          <MetricCard label="Current Rent Payments" value={wellness.hasRentPayments ? "Yes" : "No"} color={wellness.hasRentPayments ? "text-green-600" : "text-slate-500"} />
        </div>
      </div>

      {/* Spending Breakdown */}
      {wellness.spendingBreakdown && typeof wellness.spendingBreakdown === "object" && (
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Monthly Spending Breakdown</h3>
          <div className="space-y-2">
            {Object.entries(wellness.spendingBreakdown)
              .filter(([, val]) => val != null && (val as number) > 0)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([category, amount]) => (
                <div key={category} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 capitalize">{category.replace(/_/g, " ")}</span>
                  <span className="text-slate-900 font-medium">{fmtDollars(amount as number)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Red Flags */}
      {wellness.redFlags && Array.isArray(wellness.redFlags) && wellness.redFlags.length > 0 && (
        <div className="bg-red-50 rounded-lg border border-red-200 p-5">
          <h3 className="text-sm font-semibold text-red-700 mb-2">Red Flags</h3>
          <ul className="space-y-1">
            {wellness.redFlags.map((flag: any, i: number) => (
              <li key={i} className="text-sm text-red-600 flex items-start gap-2">
                <span className="text-red-400 mt-0.5">•</span>
                <span>{typeof flag === "string" ? flag : flag.description || JSON.stringify(flag)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Plaid Connections */}
      {applicants.some((a: any) => a.plaidConnections?.length > 0) && (
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Connected Bank Accounts</h3>
          {applicants.filter((a: any) => a.plaidConnections?.length > 0).map((a: any) => (
            <div key={a.id} className="mb-3 last:mb-0">
              <p className="text-xs font-medium text-slate-500 mb-1">{a.firstName} {a.lastName}</p>
              {a.plaidConnections.map((pc: any) => (
                <div key={pc.id} className="flex items-center justify-between text-sm py-1">
                  <span className="text-slate-700">{pc.institutionName || "Bank Account"}</span>
                  <span className={`text-xs font-medium ${pc.status === "active" ? "text-green-600" : "text-amber-600"}`}>
                    {pc.status}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-slate-400 text-xs mb-0.5">{label}</p>
      <p className={`font-semibold ${color || "text-slate-900"}`}>{value}</p>
    </div>
  );
}

// ── Documents Tab ────────────────────────────────────────────

function DocumentsTab({ applicants }: { applicants: any[] }) {
  const allDocs = applicants.flatMap((a: any) =>
    (a.documents || []).map((d: any) => ({ ...d, applicantName: `${a.firstName} ${a.lastName}` }))
  );

  if (allDocs.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <p className="text-slate-400 text-sm">No documents uploaded yet</p>
        <p className="text-xs text-slate-300 mt-1">Documents will appear after the applicant uploads them during the screening process</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {allDocs.map((doc: any) => (
        <div key={doc.id} className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-700">
                {DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
              </h4>
              <p className="text-xs text-slate-400">{doc.applicantName} — Uploaded {fmtDate(doc.createdAt)}</p>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              doc.verificationStatus === "verified" ? "bg-green-50 text-green-600" :
              doc.verificationStatus === "suspicious" ? "bg-red-50 text-red-600" :
              doc.verificationStatus === "needs_review" ? "bg-amber-50 text-amber-600" :
              "bg-slate-50 text-slate-500"
            }`}>
              {(doc.verificationStatus || "pending").replace(/_/g, " ")}
            </span>
          </div>

          {doc.analysis && (
            <div className="border border-slate-100 rounded-lg p-3 mt-2 space-y-2">
              <p className="text-xs font-medium text-slate-500">AI Analysis</p>

              {/* Fraud Assessment */}
              {doc.analysis.fraudAssessment && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Fraud Assessment:</span>
                  <span className={`text-xs font-semibold ${
                    doc.analysis.fraudAssessment === "clean" ? "text-green-600" :
                    doc.analysis.fraudAssessment === "suspicious" ? "text-red-600" :
                    "text-amber-600"
                  }`}>
                    {doc.analysis.fraudAssessment}
                  </span>
                  {doc.analysis.confidenceScore != null && (
                    <span className="text-xs text-slate-400">({fmtPercent(doc.analysis.confidenceScore * 100)} confidence)</span>
                  )}
                </div>
              )}

              {/* Metadata Flags */}
              {doc.analysis.metadataFlags && Array.isArray(doc.analysis.metadataFlags) && doc.analysis.metadataFlags.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Metadata Flags:</p>
                  <div className="flex flex-wrap gap-1">
                    {doc.analysis.metadataFlags.map((flag: string, i: number) => (
                      <span key={i} className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{flag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Cross-verification */}
              {doc.analysis.crossVerificationNotes && (
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Cross-verification:</p>
                  <p className="text-xs text-slate-600">{doc.analysis.crossVerificationNotes}</p>
                </div>
              )}

              {/* Extracted Data */}
              {doc.analysis.extractedData && typeof doc.analysis.extractedData === "object" && Object.keys(doc.analysis.extractedData).length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Extracted Data:</p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {Object.entries(doc.analysis.extractedData).map(([key, val]) => (
                      <div key={key}>
                        <span className="text-slate-400 capitalize">{key.replace(/_/g, " ")}: </span>
                        <span className="text-slate-700">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Events Tab ───────────────────────────────────────────────

function EventsTab({ events }: { events: any[] }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Activity Log</h3>
      <EventLog events={events} />
    </div>
  );
}
