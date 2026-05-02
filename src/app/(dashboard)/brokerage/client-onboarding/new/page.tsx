"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  Settings,
} from "lucide-react";
import { createOnboarding, getAgentRosterForOnboarding } from "../actions";
import { getDocumentTemplates } from "../vault-actions";
import { getBrokerageSettings } from "../../settings/actions";
import { computeMissingProfileFields } from "@/components/profile-completion-banner";

// ── Types ────────────────────────────────────────────────────

interface TemplateOption {
  id: string;
  name: string;
  description: string | null;
  category: string;
  isDefault: boolean;
  fields: unknown[];
}

// Slice 13-cross-cut: roster entry carries the linked User row so the form
// can warn when the selected agent's profile is incomplete. `user` is null
// for BrokerAgents without a linked User (pending/invited hires); slice
// 13's helper handles that shape and returns [] (no warning).
interface AgentRosterEntry {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  user: { fullName: string | null; phone: string | null; licenseNumber: string | null } | null;
}

// Placeholder styling (B-025): italic + lighter weight + slate-400 so a hint
// like "4,500" can't be mistaken for a filled value (which renders default
// non-italic, slate-900). Without this, managers were submitting the form
// thinking the fee was prefilled — then bouncing on validation.
const INPUT = "w-full rounded-lg border border-slate-300 px-3 py-2.5 sm:py-2 text-base sm:text-sm placeholder:italic placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500";
const LABEL = "block text-sm font-medium text-slate-700 mb-1";

// Currency display helper (B-026). Format on blur, not live, so the cursor
// stays put while the user is typing. Internal state is digits-only; the
// formatted string is computed for display only.
function formatCurrency(val: string): string {
  if (!val) return "";
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  return num.toLocaleString("en-US", {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// Slice 13-cross-cut: inline profile-completeness warning rendered below the
// agent picker. Reuses slice 13's `computeMissingProfileFields` so the
// manager and the agent see exactly the same field set; if a future field
// gates "complete", both surfaces pick it up at once.
//
// Early-return guards (in priority order):
//   1. No selected agent yet → render nothing (initial paint before roster load).
//   2. BrokerAgent.user is null → no User row, can't determine completeness;
//      this is the normal state for pending/invited hires, not a warning state.
//   3. computeMissingProfileFields returns [] → fields all present.
//
// Copy branches on `isSelf` per the slice spec: second-person when the
// manager picks themselves, third-person otherwise. Both link to
// /settings/profile (same target as slice 13's agent banner).
function ProfileCompletenessWarning({
  selectedAgent,
  isSelf,
}: {
  selectedAgent: AgentRosterEntry | null;
  isSelf: boolean;
}) {
  if (!selectedAgent) return null;
  if (!selectedAgent.user) return null;
  const missingFields = computeMissingProfileFields(selectedAgent.user);
  if (missingFields.length === 0) return null;

  const fieldsList = missingFields.join(", ");
  const message = isSelf
    ? `Heads up — your profile is missing: ${fieldsList}. The signed documents will render placeholders for any missing fields. Complete your profile at /settings/profile before filing.`
    : `Heads up — ${selectedAgent.firstName}'s profile is missing: ${fieldsList}. The signed documents will render placeholders for any missing fields. Ask ${selectedAgent.firstName} to complete their profile at /settings/profile before filing.`;

  return (
    <div
      data-testid="onboarding-agent-profile-warning"
      className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
      <p className="leading-relaxed">{message}</p>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────

export default function NewOnboardingPage() {
  const router = useRouter();

  const [brokerageName, setBrokerageName] = useState("");
  const [loading, setLoading] = useState(true);

  // Agent roster (slice 7a / B-024). Roster empty for plain agents → form
  // shows read-only self label. currentAgent always present for self label.
  const [agentRoster, setAgentRoster] = useState<AgentRosterEntry[]>([]);
  const [currentAgent, setCurrentAgent] = useState<AgentRosterEntry | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");

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
  const [feeAmount, setFeeAmount] = useState("");
  const [effectiveThrough, setEffectiveThrough] = useState("");
  const [deliveryChannels, setDeliveryChannels] = useState<Set<"email" | "sms">>(new Set(["email"]));
  const [linkOnly, setLinkOnly] = useState(false);
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // B-023: retryable flag distinguishes thrown framework errors (transient,
  // typically 503/cold-start/pool blip) from action-returned errors (validation,
  // permission, business state — not retryable by hammering Send Invite).
  const [submitRetryable, setSubmitRetryable] = useState(false);

  // B-026: focus state per currency input. While focused, value reverts to
  // raw digits so editing is natural; on blur it formats with commas.
  const [feeAmountFocused, setFeeAmountFocused] = useState(false);
  const [monthlyRentFocused, setMonthlyRentFocused] = useState(false);

  // Load brokerage info + templates + agent roster
  useEffect(() => {
    async function load() {
      try {
        const [settings, tmplResult, rosterResult] = await Promise.all([
          getBrokerageSettings(),
          getDocumentTemplates(),
          getAgentRosterForOnboarding(),
        ]);
        setBrokerageName(settings.name || "Your Brokerage");

        if (tmplResult.success && Array.isArray(tmplResult.data)) {
          const tmps = tmplResult.data as unknown as TemplateOption[];
          setTemplates(tmps);
          // Pre-check default templates
          const defaults = new Set(tmps.filter((t) => t.isDefault).map((t) => t.id));
          setSelectedTemplateIds(defaults);
        }

        if (rosterResult.success && rosterResult.data) {
          setAgentRoster(rosterResult.data.roster);
          setCurrentAgent(rosterResult.data.currentAgent);
          // Default the picker to the current user.
          if (rosterResult.data.currentAgent) {
            setSelectedAgentId(rosterResult.data.currentAgent.id);
          }
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
    if (deliveryChannels.has("sms") && !linkOnly && !clientPhone.trim()) e.clientPhone = "Phone number is required for SMS delivery";
    const fee = parseFloat(feeAmount);
    if (!fee || fee <= 0) e.feeAmount = "Fee amount is required";
    if (templates.length > 0 && selectedTemplateIds.size === 0) e.templates = "Select at least one document";
    return e;
  }

  async function handleSubmit() {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    setSubmitError("");
    setSubmitRetryable(false);

    // B-029: only forward the personal note when the delivery actually carries
    // it (email channel). SMS-only and link-only deliveries discard the note
    // server-side, so don't send it from the client either.
    const includePersonalNote = !linkOnly && deliveryChannels.has("email");

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
        commissionFlat: parseFloat(feeAmount) || 0,
        effectiveThrough: effectiveThrough || undefined,
        selectedTemplateIds: templates.length > 0 ? Array.from(selectedTemplateIds) : undefined,
        deliveryMethod: linkOnly ? "link" : Array.from(deliveryChannels).join("+") as "email" | "sms" | "email+sms",
        notes: includePersonalNote ? (notes.trim() || undefined) : undefined,
        agentId: selectedAgentId || undefined,
      });

      if (result.success && result.data) {
        const id = (result.data as { id: string }).id;
        router.push(`/brokerage/client-onboarding/${id}`);
      } else {
        // Action returned a structured error (validation / permission / state).
        // Not retryable — same submit will yield the same error.
        setSubmitError(result.error ?? "Failed to create onboarding");
        setSubmitRetryable(false);
      }
    } catch {
      // B-023: thrown errors from the action call are typically transient
      // (Cloud Run cold-start, Supabase pooler reconnect, gateway 503).
      // Surface a recovery affordance instead of a dead-end "unexpected error."
      setSubmitError("Service is busy. Please try again in a few seconds.");
      setSubmitRetryable(true);
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
          <div
            data-testid="onboarding-submit-error"
            className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{submitError}</span>
            {submitRetryable && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                data-testid="onboarding-submit-retry"
                className="font-medium underline hover:text-red-800 disabled:opacity-50 disabled:no-underline"
              >
                Try again
              </button>
            )}
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

        {/* Agent assignment (slice 7a / B-024).
            Roster present (admin/broker/manager) → dropdown. Otherwise → read-only self label. */}
        {agentRoster.length > 0 ? (
          <section
            data-testid="onboarding-agent-picker"
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm"
          >
            <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-slate-400" /> Filing Agent
            </h2>
            <label className={LABEL}>
              Agent this onboarding is for
            </label>
            <select
              className={INPUT}
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
            >
              {agentRoster.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName} ({a.email})
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">
              Defaults to you. Pick another agent in your brokerage to file this onboarding on their behalf.
            </p>
            <ProfileCompletenessWarning
              selectedAgent={agentRoster.find((a) => a.id === selectedAgentId) ?? null}
              isSelf={!!currentAgent && selectedAgentId === currentAgent.id}
            />
          </section>
        ) : currentAgent ? (
          <div
            data-testid="onboarding-agent-self-label"
            className="bg-slate-50 rounded-xl border border-slate-200 p-4"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-600">
                Agent:{" "}
                <span className="font-medium text-slate-800">
                  {currentAgent.firstName} {currentAgent.lastName}
                </span>
              </span>
            </div>
          </div>
        ) : null}

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
              <label className={LABEL}>Phone {deliveryChannels.has("sms") && !linkOnly && <span className="text-red-500">*</span>}</label>
              <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className={`${INPUT} ${errors.clientPhone ? "border-red-300 ring-1 ring-red-300" : ""}`} placeholder="(555) 123-4567" />
              {errors.clientPhone && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.clientPhone}</p>}
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
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">{selectedTemplateIds.size} selected</span>
                {/* Slice 19-B1: discovery affordance for the existing vault.
                    Inline placement so admins notice it while picking
                    templates ("wait, I want to add one"). The vault page
                    itself is RBAC-gated by manage_templates so agents who
                    click through hit the auth check there, not here. */}
                <Link
                  href="/brokerage/client-onboarding/vault"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  <Settings className="w-3 h-3" />
                  Manage templates
                </Link>
              </div>
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
                <input
                  type="text"
                  inputMode="decimal"
                  value={monthlyRentFocused ? monthlyRent : formatCurrency(monthlyRent)}
                  onFocus={() => setMonthlyRentFocused(true)}
                  onBlur={() => setMonthlyRentFocused(false)}
                  onChange={(e) => setMonthlyRent(e.target.value.replace(/[^0-9.]/g, ""))}
                  className={INPUT + " pl-7"}
                  placeholder="3,500"
                />
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
              <label className={LABEL}>Fee Due at Signing *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={feeAmountFocused ? feeAmount : formatCurrency(feeAmount)}
                  onFocus={() => setFeeAmountFocused(true)}
                  onBlur={() => setFeeAmountFocused(false)}
                  onChange={(e) => setFeeAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  className={INPUT + " pl-7"}
                  placeholder="4,500"
                />
              </div>
              {errors.feeAmount && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.feeAmount}</p>}
            </div>
            <div>
              <label className={LABEL}>Effective Through</label>
              <input type="date" value={effectiveThrough} onChange={(e) => setEffectiveThrough(e.target.value)} className={INPUT} />
            </div>
          </div>
        </section>

        {/* Delivery Method */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-800 mb-2">Delivery Method</h2>
          <p className="text-xs text-slate-500 mb-4">Select one or both — the client will receive the signing link on each channel</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {([
              { value: "email" as const, label: "Email", icon: Mail, desc: "Send via email" },
              { value: "sms" as const, label: "SMS", icon: MessageSquare, desc: "Send via text" },
            ]).map(({ value, label, icon: Icon, desc }) => {
              const isActive = !linkOnly && deliveryChannels.has(value);
              return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  if (linkOnly) {
                    setLinkOnly(false);
                    setDeliveryChannels(new Set([value]));
                    return;
                  }
                  setDeliveryChannels((prev) => {
                    const next = new Set(prev);
                    if (next.has(value)) {
                      if (next.size > 1) next.delete(value);
                    } else {
                      next.add(value);
                    }
                    return next;
                  });
                }}
                className={`rounded-lg border-2 p-3 text-left transition-all ${
                  isActive ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300 active:bg-slate-50"
                }`}
              >
                <Icon className={`w-4 h-4 mb-1 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                <div className={`text-sm font-medium ${isActive ? "text-blue-700" : "text-slate-700"}`}>{label}</div>
                <div className="text-xs text-slate-500 hidden sm:block">{desc}</div>
              </button>);
            })}
            <button
              type="button"
              onClick={() => {
                setLinkOnly(true);
                setDeliveryChannels(new Set());
              }}
              className={`rounded-lg border-2 p-3 text-left transition-all ${
                linkOnly ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300 active:bg-slate-50"
              }`}
            >
              <Link2 className={`w-4 h-4 mb-1 ${linkOnly ? "text-blue-600" : "text-slate-400"}`} />
              <div className={`text-sm font-medium ${linkOnly ? "text-blue-700" : "text-slate-700"}`}>Link</div>
              <div className="text-xs text-slate-500 hidden sm:block">Share manually</div>
            </button>
          </div>
          {!linkOnly && deliveryChannels.size === 2 && (
            <p className="mt-3 text-xs text-blue-600 font-medium">Client will receive both an email and a text message</p>
          )}
        </section>

        {/* Notes (B-029): only render when delivery includes email. SMS-only
            and link-only deliveries discard the note server-side, so showing
            the field at all just wastes manager input. The state variable
            persists if delivery toggles back to email — no data loss on
            accidental clicks. */}
        {!linkOnly && deliveryChannels.has("email") && (
          <section
            data-testid="onboarding-personal-note"
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm"
          >
            <h2 className="text-base font-semibold text-slate-800 mb-3">Personal Note</h2>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Include a personal note in the invite email (optional)" className={INPUT + " resize-none"} />
          </section>
        )}

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-2 pb-safe">
          <button
            onClick={() => router.back()}
            className="px-4 py-2.5 sm:py-2 text-sm font-medium text-slate-600 hover:text-slate-800 active:text-slate-900 rounded-lg sm:rounded-none"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg px-6 py-3 sm:py-2.5 transition-colors"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Send Invite
          </button>
        </div>
      </div>
    </div>
  );
}
