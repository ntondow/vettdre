"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  UserPlus,
  Loader2,
  AlertCircle,
  Mail,
  MessageSquare,
  Link2,
  Building2,
  User,
  FileText,
} from "lucide-react";
import { createOnboarding } from "../actions";
import { getBrokerageSettings } from "../../settings/actions";

// ── Types ────────────────────────────────────────────────────

interface BrokerageInfo {
  name: string;
  agentName: string;
  agentLicense: string;
}

const INPUT = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const LABEL = "block text-sm font-medium text-slate-700 mb-1";

// ── Component ────────────────────────────────────────────────

export default function NewOnboardingPage() {
  const router = useRouter();

  const [brokerageInfo, setBrokerageInfo] = useState<BrokerageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [commissionPct, setCommissionPct] = useState("8.33");
  const [termDays, setTermDays] = useState("30");
  const [deliveryMethod, setDeliveryMethod] = useState<"email" | "sms" | "link">("email");
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Load brokerage info
  useEffect(() => {
    async function load() {
      try {
        const settings = await getBrokerageSettings();
        setBrokerageInfo({
          name: settings.name || "Your Brokerage",
          agentName: "", // filled from auth context
          agentLicense: settings.companyLicenseNumber || "",
        });
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Validation
  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!clientFirstName.trim()) e.clientFirstName = "First name is required";
    if (!clientLastName.trim()) e.clientLastName = "Last name is required";
    if (!clientEmail.trim()) e.clientEmail = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim())) e.clientEmail = "Invalid email address";
    const pct = parseFloat(commissionPct);
    if (!pct || pct <= 0) e.commissionPct = "Commission must be greater than 0";
    if (pct > 100) e.commissionPct = "Commission cannot exceed 100%";
    return e;
  }

  async function handleSubmit(asDraft = false) {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const result = await createOnboarding({
        clientFirstName: clientFirstName.trim(),
        clientLastName: clientLastName.trim(),
        clientEmail: clientEmail.trim(),
        clientPhone: clientPhone.trim() || undefined,
        commissionPct: parseFloat(commissionPct) || 0,
        expiresInDays: parseInt(termDays, 10) || 30,
        deliveryMethod,
        notes: notes.trim() || undefined,
      });

      if (result.success && result.data) {
        const id = (result.data as { id: string }).id;
        router.push(`/brokerage/client-onboarding/${id}`);
      } else {
        setSubmitError(result.error ?? "Failed to create onboarding");
      }
    } catch {
      setSubmitError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5">
          <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-xl font-semibold text-slate-900">New Client Onboarding</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {submitError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {submitError}
          </div>
        )}

        {/* Brokerage info (read-only) */}
        {brokerageInfo && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">{brokerageInfo.name}</span>
            </div>
            <p className="text-xs text-slate-500">Documents will be generated with your brokerage and agent information.</p>
          </div>
        )}

        {/* Client Info */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400" />
            Client Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>First Name *</label>
              <input type="text" value={clientFirstName} onChange={(e) => setClientFirstName(e.target.value)} className={INPUT} placeholder="John" />
              {errors.clientFirstName && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.clientFirstName}</p>}
            </div>
            <div>
              <label className={LABEL}>Last Name *</label>
              <input type="text" value={clientLastName} onChange={(e) => setClientLastName(e.target.value)} className={INPUT} placeholder="Smith" />
              {errors.clientLastName && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.clientLastName}</p>}
            </div>
            <div>
              <label className={LABEL}>Email *</label>
              <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className={INPUT} placeholder="john@example.com" />
              {errors.clientEmail && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.clientEmail}</p>}
            </div>
            <div>
              <label className={LABEL}>Phone</label>
              <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className={INPUT} placeholder="(555) 123-4567" />
            </div>
          </div>
        </section>

        {/* Commission & Terms */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            Agreement Terms
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Commission %</label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(e.target.value)}
                  className={INPUT + " pr-8"}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
              </div>
              {errors.commissionPct && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.commissionPct}</p>}
              <p className="mt-1 text-xs text-slate-400">Percentage of annual rent (8.33% = one month)</p>
            </div>
            <div>
              <label className={LABEL}>Agreement Term (days)</label>
              <input type="number" min={1} max={365} value={termDays} onChange={(e) => setTermDays(e.target.value)} className={INPUT} />
              <p className="mt-1 text-xs text-slate-400">How long the representation agreement lasts</p>
            </div>
          </div>
        </section>

        {/* Delivery Method */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Delivery Method</h2>
          <div className="flex flex-wrap gap-3">
            {([
              { value: "email", label: "Email", icon: Mail, desc: "Send via email" },
              { value: "sms", label: "SMS", icon: MessageSquare, desc: "Send via text" },
              { value: "link", label: "Copy Link", icon: Link2, desc: "Share manually" },
            ] as const).map(({ value, label, icon: Icon, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => setDeliveryMethod(value)}
                className={`flex-1 min-w-[120px] rounded-lg border-2 p-3 text-left transition-all ${
                  deliveryMethod === value
                    ? "border-blue-600 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <Icon className={`w-4 h-4 mb-1 ${deliveryMethod === value ? "text-blue-600" : "text-slate-400"}`} />
                <div className={`text-sm font-medium ${deliveryMethod === value ? "text-blue-700" : "text-slate-700"}`}>{label}</div>
                <div className="text-xs text-slate-500">{desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Notes */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800 mb-3">Personal Note</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Include a personal note in the invite email (optional)"
            className={INPUT + " resize-none"}
          />
        </section>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg px-6 py-2.5 transition-colors"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Send Invite
          </button>
        </div>
      </div>
    </div>
  );
}
