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
  CheckSquare,
  Square,
  Lock,
  MapPin,
} from "lucide-react";
import { createOnboarding } from "../actions";
import { getDocumentTemplates } from "../vault-actions";
import { getBrokerageSettings } from "../../settings/actions";

// ── Types ────────────────────────────────────────────────────

interface TemplateOption {
  id: string;
  name: string;
  description: string | null;
  category: string;
  isDefault: boolean;
  fields: unknown[];
}

const INPUT = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const LABEL = "block text-sm font-medium text-slate-700 mb-1";

// ── Component ────────────────────────────────────────────────

export default function NewOnboardingPage() {
  const router = useRouter();

  const [brokerageName, setBrokerageName] = useState("");
  const [loading, setLoading] = useState(true);

  // Templates
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());

  // Client info
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  // Deal details
  const [propertyAddress, setPropertyAddress] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [moveInDate, setMoveInDate] = useState("");

  // Agreement terms
  const [commissionPct, setCommissionPct] = useState("8.33");
  const [termDays, setTermDays] = useState("30");
  const [deliveryMethod, setDeliveryMethod] = useState<"email" | "sms" | "link">("email");
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Load brokerage info + templates
  useEffect(() => {
    async function load() {
      try {
        const [settings, tmplResult] = await Promise.all([
          getBrokerageSettings(),
          getDocumentTemplates(),
        ]);
        setBrokerageName(settings.name || "Your Brokerage");

        if (tmplResult.success && Array.isArray(tmplResult.data)) {
          const tmps = tmplResult.data as unknown as TemplateOption[];
          setTemplates(tmps);
          // Pre-check default templates
          const defaults = new Set(tmps.filter((t) => t.isDefault).map((t) => t.id));
          setSelectedTemplateIds(defaults);
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggleTemplate(id: string) {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!clientFirstName.trim()) e.clientFirstName = "First name is required";
    if (!clientLastName.trim()) e.clientLastName = "Last name is required";
    if (!clientEmail.trim()) e.clientEmail = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim())) e.clientEmail = "Invalid email";
    const pct = parseFloat(commissionPct);
    if (!pct || pct <= 0) e.commissionPct = "Commission must be > 0";
    if (pct > 100) e.commissionPct = "Cannot exceed 100%";
    if (templates.length > 0 && selectedTemplateIds.size === 0) e.templates = "Select at least one document";
    return e;
  }

  async function handleSubmit() {
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
        propertyAddress: propertyAddress.trim() || undefined,
        unitNumber: unitNumber.trim() || undefined,
        monthlyRent: monthlyRent ? parseFloat(monthlyRent) : undefined,
        moveInDate: moveInDate || undefined,
        commissionPct: parseFloat(commissionPct) || 0,
        expiresInDays: parseInt(termDays, 10) || 30,
        selectedTemplateIds: templates.length > 0 ? Array.from(selectedTemplateIds) : undefined,
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
    return <div className="min-h-dvh bg-slate-50 flex items-center justify-center"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>;
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

        {/* Brokerage info */}
        {brokerageName && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">{brokerageName}</span>
            </div>
          </div>
        )}

        {/* Client Info */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400" /> Client Information
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

        {/* Document Selection */}
        {templates.length > 0 && (
          <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" /> Documents
              </h2>
              <span className="text-xs text-slate-500">{selectedTemplateIds.size} selected</span>
            </div>
            {errors.templates && <p className="mb-3 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.templates}</p>}
            <div className="space-y-2">
              {templates.map((t) => {
                const checked = selectedTemplateIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTemplate(t.id)}
                    className={`w-full flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-all ${
                      checked ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {checked ? <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" /> : <Square className="w-5 h-5 text-slate-300 flex-shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">{t.name}</span>
                        {t.isDefault && <Lock className="w-3 h-3 text-slate-300" />}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${t.category === "standard" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                          {t.category === "standard" ? "Standard" : "Custom"}
                        </span>
                      </div>
                      {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                      {Array.isArray(t.fields) && t.fields.length > 0 && (
                        <p className="text-xs text-slate-400 mt-0.5">{t.fields.length} fillable field{t.fields.length !== 1 ? "s" : ""}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Deal Details */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-400" /> Deal Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={LABEL}>Apartment Address</label>
              <input type="text" value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} className={INPUT} placeholder="123 Main St, New York, NY" />
            </div>
            <div>
              <label className={LABEL}>Unit Number</label>
              <input type="text" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} className={INPUT} placeholder="4B" />
            </div>
            <div>
              <label className={LABEL}>Monthly Rent</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                <input type="text" inputMode="decimal" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value.replace(/[^0-9.]/g, ""))} className={INPUT + " pl-7"} placeholder="3,500" />
              </div>
            </div>
            <div>
              <label className={LABEL}>Move-in Date</label>
              <input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} className={INPUT} />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">These values auto-fill into document templates that have matching fields.</p>
        </section>

        {/* Agreement Terms */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" /> Agreement Terms
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Commission %</label>
              <div className="relative">
                <input type="number" min={0} max={100} step={0.01} value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} className={INPUT + " pr-8"} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
              </div>
              {errors.commissionPct && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.commissionPct}</p>}
              <p className="mt-1 text-xs text-slate-400">8.33% = one month rent</p>
            </div>
            <div>
              <label className={LABEL}>Agreement Term (days)</label>
              <input type="number" min={1} max={365} value={termDays} onChange={(e) => setTermDays(e.target.value)} className={INPUT} />
            </div>
          </div>
        </section>

        {/* Delivery Method */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Delivery Method</h2>
          <div className="flex flex-wrap gap-3">
            {([
              { value: "email", label: "Email", icon: Mail, desc: "Send via email" },
              { value: "sms", label: "SMS", icon: MessageSquare, desc: "Coming soon", disabled: true },
              { value: "link", label: "Copy Link", icon: Link2, desc: "Share manually" },
            ] as const).map(({ value, label, icon: Icon, desc, ...rest }) => {
              const isDisabled = "disabled" in rest && (rest as { disabled?: boolean }).disabled;
              return (
              <button
                key={value}
                type="button"
                onClick={() => !isDisabled && setDeliveryMethod(value as "email" | "sms" | "link")}
                disabled={isDisabled}
                className={`flex-1 min-w-[120px] rounded-lg border-2 p-3 text-left transition-all ${
                  isDisabled ? "border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed" : deliveryMethod === value ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <Icon className={`w-4 h-4 mb-1 ${deliveryMethod === value && !isDisabled ? "text-blue-600" : "text-slate-400"}`} />
                <div className={`text-sm font-medium ${deliveryMethod === value && !isDisabled ? "text-blue-700" : "text-slate-700"}`}>{label}</div>
                <div className="text-xs text-slate-500">{desc}</div>
              </button>);
            })}
          </div>
        </section>

        {/* Notes */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800 mb-3">Personal Note</h2>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Include a personal note in the invite email (optional)" className={INPUT + " resize-none"} />
        </section>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button onClick={() => router.back()} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
          <button
            onClick={handleSubmit}
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
