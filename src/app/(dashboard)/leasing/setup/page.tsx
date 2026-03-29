"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Trash2, Check, Copy, Phone, Sparkles, ArrowRight, Loader2, MessageSquare, ExternalLink, AlertTriangle, RefreshCw, FileSpreadsheet, Mail } from "lucide-react";
import { createPropertyWithLeasing, getOnboardingEnrichment, sendTestText } from "../actions";
import type { OnboardingErrorCode } from "../actions";
import { AMENITY_OPTIONS } from "@/lib/leasing-types";
import type { UnitInput, OnboardingEnrichment } from "@/lib/leasing-types";

// ── Step Indicator ────────────────────────────────────────────

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
            s === current ? "bg-blue-600 scale-125" : s < current ? "bg-blue-400" : "bg-slate-200"
          }`} />
          {s < 3 && <div className={`w-8 h-0.5 transition-colors duration-300 ${s < current ? "bg-blue-400" : "bg-slate-200"}`} />}
        </div>
      ))}
      <span className="ml-3 text-xs text-slate-400 font-medium">{current}/3</span>
    </div>
  );
}

// ── Unit Row ──────────────────────────────────────────────────

const BEDROOM_OPTIONS = ["Studio", "1", "2", "3", "4", "5"];

function UnitRow({
  unit, index, onChange, onRemove, canRemove,
}: {
  unit: UnitInput; index: number;
  onChange: (i: number, u: UnitInput) => void;
  onRemove: (i: number) => void;
  canRemove: boolean;
}) {
  return (
    <div className="flex items-start gap-2 sm:gap-3 p-3 bg-white rounded-lg border border-slate-200">
      {/* Unit # */}
      <div className="w-20 shrink-0">
        <label className="text-[11px] text-slate-400 font-medium mb-1 block">Unit #</label>
        <input
          type="text"
          value={unit.unit}
          onChange={(e) => onChange(index, { ...unit, unit: e.target.value })}
          placeholder="4A"
          className="w-full border border-slate-200 rounded-md px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Bedrooms */}
      <div className="w-24 shrink-0">
        <label className="text-[11px] text-slate-400 font-medium mb-1 block">Beds</label>
        <select
          value={unit.bedrooms}
          onChange={(e) => onChange(index, { ...unit, bedrooms: e.target.value })}
          className="w-full border border-slate-200 rounded-md px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {BEDROOM_OPTIONS.map((b) => (
            <option key={b} value={b === "Studio" ? "0" : b}>{b}</option>
          ))}
        </select>
      </div>

      {/* Price */}
      <div className="w-28 shrink-0">
        <label className="text-[11px] text-slate-400 font-medium mb-1 block">Rent/mo</label>
        <div className="relative">
          <span className="absolute left-2.5 top-2 text-sm text-slate-400">$</span>
          <input
            type="number"
            value={unit.rentPrice || ""}
            onChange={(e) => onChange(index, { ...unit, rentPrice: Number(e.target.value) })}
            placeholder="2,500"
            className="w-full border border-slate-200 rounded-md pl-6 pr-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Available Date */}
      <div className="flex-1 min-w-0 hidden sm:block">
        <label className="text-[11px] text-slate-400 font-medium mb-1 block">Available</label>
        <input
          type="date"
          value={unit.availableDate || ""}
          onChange={(e) => onChange(index, { ...unit, availableDate: e.target.value })}
          className="w-full border border-slate-200 rounded-md px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Remove */}
      {canRemove && (
        <button
          onClick={() => onRemove(index)}
          className="mt-6 p-1.5 text-slate-300 hover:text-red-500 transition-colors"
          aria-label="Remove unit"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function LeasingSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("New York");
  const [state, setState] = useState("NY");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [enrichment, setEnrichment] = useState<OnboardingEnrichment | null>(null);
  const [enriching, setEnriching] = useState(false);

  // Step 2
  const [units, setUnits] = useState<UnitInput[]>([
    { unit: "", bedrooms: "1", bathrooms: "1", rentPrice: 0 },
  ]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // Step 3
  const [result, setResult] = useState<{
    twilioNumber: string | null;
    orgSlug: string | null;
    configId: string;
    propertyId: string;
    propertyAddress: string;
    listings: any[];
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testSent, setTestSent] = useState(false);

  // Error state
  const [setupError, setSetupError] = useState<{ message: string; code?: OnboardingErrorCode } | null>(null);

  // ── Enrichment Trigger ────────────────────────────────────

  const tryEnrich = useCallback(async (addr: string, z: string) => {
    if (!addr || addr.length < 5) return;
    const isNYC = state === "NY" || city.toLowerCase().includes("new york") ||
      city.toLowerCase().includes("brooklyn") || city.toLowerCase().includes("bronx") ||
      city.toLowerCase().includes("queens") || city.toLowerCase().includes("staten");
    if (!isNYC) return;

    setEnriching(true);
    try {
      const full = `${addr} ${city} ${state} ${z}`.trim();
      const data = await getOnboardingEnrichment(full);
      if (data) {
        setEnrichment(data);
        // Auto-fill total units if available and user hasn't added units yet
        if (data.totalUnits && data.totalUnits > 0 && enrichment === null) {
          // Don't auto-fill units, just show enrichment
        }
      }
    } catch { /* skip */ }
    setEnriching(false);
  }, [city, state, enrichment]);

  // ── Handlers ──────────────────────────────────────────────

  const handleStep1Next = () => {
    if (!address.trim()) return;
    if (!phone.trim()) return;
    setStep(2);
  };

  const handleUnitChange = (index: number, updated: UnitInput) => {
    setUnits((prev) => prev.map((u, i) => (i === index ? updated : u)));
  };

  const handleUnitRemove = (index: number) => {
    setUnits((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddUnit = () => {
    setUnits((prev) => [...prev, { unit: "", bedrooms: "1", bathrooms: "1", rentPrice: 0 }]);
  };

  const toggleAmenity = (id: string) => {
    setAmenities((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  const ERROR_MESSAGES: Record<string, string> = {
    property_limit: "You've reached your property limit. Upgrade your plan to add more properties.",
    listing_limit: "Adding these units would exceed your listing limit. Upgrade your plan or remove some units.",
    twilio_failed: "We couldn't provision a phone number right now. Please try again in a moment.",
    database_failed: "Something went wrong saving your property. No charges were made — please try again.",
    auth_failed: "Your session expired. Please refresh the page and try again.",
  };

  const handleSetupAI = async () => {
    // Validate: at least 1 unit with bedrooms and price
    const validUnits = units.filter((u) => u.bedrooms && u.rentPrice > 0);
    if (validUnits.length === 0) return;

    setLoading(true);
    setSetupError(null);
    try {
      const res = await createPropertyWithLeasing({
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        units: validUnits,
        amenities,
        additionalNotes: notes.trim() || undefined,
        escalationPhone: formatPhoneInput(phone),
      });

      if (res.error) {
        const code = res.errorCode;
        setSetupError({
          message: (code && ERROR_MESSAGES[code]) || res.error,
          code,
        });
        setLoading(false);
        return;
      }

      setResult({
        twilioNumber: res.twilioNumber || null,
        orgSlug: res.orgSlug || null,
        configId: res.config?.id || "",
        propertyId: res.property?.id || "",
        propertyAddress: address,
        listings: res.listings || [],
      });
      setStep(3);
    } catch {
      setSetupError({
        message: "Network error — please check your connection and try again.",
        code: "unknown",
      });
    }
    setLoading(false);
  };

  const handleCopy = () => {
    if (result?.twilioNumber) {
      navigator.clipboard.writeText(result.twilioNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTestText = async () => {
    if (!result?.configId) return;
    setTestSending(true);
    try {
      const res = await sendTestText(result.configId, formatPhoneInput(phone));
      if (res.success) {
        setTestSent(true);
      } else {
        alert(res.error || "Failed to send test text");
      }
    } catch {
      alert("Failed to send test text");
    }
    setTestSending(false);
  };

  // ── Format phone ──────────────────────────────────────────

  function formatPhoneInput(p: string): string {
    const digits = p.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return p.startsWith("+") ? p : `+1${digits}`;
  }

  function formatPhoneDisplay(p: string): string {
    const digits = p.replace(/\D/g, "");
    const d = digits.startsWith("1") ? digits.slice(1) : digits;
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return p;
  }

  // ── Listing snippets ──────────────────────────────────────

  function getSnippets() {
    if (!result) return [];
    const num = result.twilioNumber || "[number]";
    const listing = result.listings?.[0];
    const beds = listing?.bedrooms === "0" ? "Studio" : `${listing?.bedrooms || "?"}BR`;
    const price = listing?.rentPrice ? `$${Number(listing.rentPrice).toLocaleString()}` : "$X,XXX";
    const hood = enrichment?.neighborhood || enrichment?.borough || city;

    return [
      {
        label: "For Craigslist",
        text: `Spacious ${beds} in ${hood}, ${price}/mo. Text ${num} for info & showings.`,
      },
      {
        label: "For StreetEasy / Zillow",
        text: `${address} - ${beds} ${price}. For instant response, text ${num}`,
      },
    ];
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-8">
      <div className="max-w-lg mx-auto px-4">
        {/* Header */}
        <div className="text-center pt-8 pb-2">
          <div className="inline-flex items-center gap-2 text-blue-600 mb-2">
            <MessageSquare size={20} />
            <span className="text-sm font-semibold tracking-wide uppercase">AI Leasing Agent</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {step === 1 && "Your Property"}
            {step === 2 && "Your Units"}
            {step === 3 && "Your AI Is Live!"}
          </h1>
          {step < 3 && (
            <p className="text-sm text-slate-500 mt-1">
              {step === 1 && "Where's your building?"}
              {step === 2 && "What's available for rent?"}
            </p>
          )}
        </div>

        <StepDots current={step} />

        {/* ── STEP 1: Property ──────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Address */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Street Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onBlur={() => tryEnrich(address, zip)}
                placeholder="532 Neptune Ave"
                className="w-full border border-slate-200 rounded-lg px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>

            {/* City / State / ZIP */}
            <div className="grid grid-cols-5 gap-3">
              <div className="col-span-2">
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-1">
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">State</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  maxLength={2}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">ZIP</label>
                <input
                  type="text"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  onBlur={() => tryEnrich(address, zip)}
                  placeholder="11224"
                  maxLength={5}
                  className="w-full border border-slate-200 rounded-lg px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* NYC Enrichment Card */}
            {enriching && (
              <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-lg px-4 py-3">
                <Loader2 size={16} className="animate-spin" />
                Looking up your building...
              </div>
            )}
            {enrichment && !enriching && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg px-4 py-3 border border-blue-100">
                <div className="flex items-start gap-2">
                  <Sparkles size={16} className="text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">We found your building</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {[
                        enrichment.floors && `${enrichment.floors}-story`,
                        enrichment.buildingClass && (enrichment.buildingClass.startsWith("D") || enrichment.buildingClass.startsWith("R") ? "elevator" : enrichment.buildingClass.startsWith("C") ? "walk-up" : null),
                        "building",
                        enrichment.yearBuilt && enrichment.yearBuilt > 0 && `built ${enrichment.yearBuilt}`,
                        enrichment.totalUnits && `${enrichment.totalUnits} units`,
                        enrichment.neighborhood || enrichment.borough,
                      ].filter(Boolean).join(", ")}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Phone */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Your Phone Number</label>
              <p className="text-xs text-slate-400 mb-1.5">We'll text you when the AI needs your help</p>
              <div className="relative">
                <Phone size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(212) 555-1234"
                  className="w-full border border-slate-200 rounded-lg pl-10 pr-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Next */}
            <button
              onClick={handleStep1Next}
              disabled={!address.trim() || !phone.trim()}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-3.5 text-base font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-2"
            >
              Next <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* ── STEP 2: Units ─────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Unit Rows */}
            <div className="space-y-2">
              {units.map((u, i) => (
                <UnitRow
                  key={i}
                  unit={u}
                  index={i}
                  onChange={handleUnitChange}
                  onRemove={handleUnitRemove}
                  canRemove={units.length > 1}
                />
              ))}
            </div>

            <button
              onClick={handleAddUnit}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium py-1"
            >
              <Plus size={16} /> Add Another Unit
            </button>

            {/* Amenities */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Amenities</label>
              <div className="grid grid-cols-2 gap-1.5">
                {AMENITY_OPTIONS.map((a) => (
                  <label
                    key={a.id}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors text-sm ${
                      amenities.includes(a.id)
                        ? "border-blue-300 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={amenities.includes(a.id)}
                      onChange={() => toggleAmenity(a.id)}
                      className="sr-only"
                    />
                    <span className="text-base">{a.icon}</span>
                    <span className="truncate">{a.label}</span>
                    {amenities.includes(a.id) && <Check size={14} className="ml-auto text-blue-600 shrink-0" />}
                  </label>
                ))}
              </div>
            </div>

            {/* Additional Notes */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Anything else renters should know?</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Close to F train, utilities included, no smoking..."
                rows={3}
                className="w-full border border-slate-200 rounded-lg px-3.5 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Error Banner */}
            {setupError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-red-800">{setupError.message}</p>
                    {setupError.code === "property_limit" || setupError.code === "listing_limit" ? (
                      <a
                        href="/settings/billing?upgrade=leasing_pro"
                        className="text-xs text-red-600 hover:text-red-800 underline mt-1 inline-block"
                      >
                        View upgrade options
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSetupAI}
                disabled={loading || units.filter((u) => u.bedrooms && u.rentPrice > 0).length === 0}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-3.5 text-base font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <><Loader2 size={18} className="animate-spin" /> Setting Up...</>
                ) : setupError ? (
                  <><RefreshCw size={18} /> Try Again</>
                ) : (
                  <><Sparkles size={18} /> Set Up My AI</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Live! ─────────────────────────────────── */}
        {step === 3 && result && (
          <div className="space-y-6">
            {/* Success Header */}
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Check size={32} className="text-green-600" />
              </div>
              <p className="text-slate-600 text-sm">Your AI leasing agent is ready to go.</p>
            </div>

            {/* Phone Number */}
            {result.twilioNumber && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">Your AI's Phone Number</p>
                <p className="text-3xl font-bold text-slate-900 tracking-tight">
                  {formatPhoneDisplay(result.twilioNumber)}
                </p>
                <button
                  onClick={handleCopy}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Number</>}
                </button>
              </div>
            )}

            {/* Email Address (Pro) */}
            {result.orgSlug && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">Email Channel (Pro)</p>
                <p className="text-lg font-semibold text-slate-900 tracking-tight flex items-center justify-center gap-2">
                  <Mail size={18} className="text-blue-600" />
                  leasing-{result.orgSlug}@mail.vettdre.com
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  Forward listing inquiries here — AI replies via email. Available on Pro tier.
                </p>

                {/* ILS Forwarding Instructions */}
                <div className="mt-4 pt-4 border-t border-slate-100 text-left">
                  <p className="text-xs font-semibold text-slate-700 mb-2">Forward ILS Leads</p>
                  <p className="text-[11px] text-slate-500 mb-2">
                    When StreetEasy or Apartments.com send you a lead notification, your AI will automatically
                    parse the prospect's details and respond within seconds.
                  </p>
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-slate-600">
                      <strong>StreetEasy:</strong> Settings → Lead Notifications → set email to{" "}
                      <span className="font-mono text-blue-600">leasing-{result.orgSlug}@mail.vettdre.com</span>
                    </p>
                    <p className="text-[11px] text-slate-600">
                      <strong>Apartments.com:</strong> Lead Settings → Notification Email → set to{" "}
                      <span className="font-mono text-blue-600">leasing-{result.orgSlug}@mail.vettdre.com</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Test Text — THE most important element */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-5 text-white">
              <p className="font-semibold text-lg mb-1">Try it now</p>
              <p className="text-blue-100 text-sm mb-4">
                We'll send a realistic prospect text to your phone from the AI's number.
              </p>
              <button
                onClick={handleTestText}
                disabled={testSending || testSent}
                className="w-full flex items-center justify-center gap-2 bg-white text-blue-700 rounded-lg py-3.5 font-semibold text-base hover:bg-blue-50 disabled:opacity-70 transition-colors"
              >
                {testSending ? (
                  <><Loader2 size={18} className="animate-spin" /> Sending...</>
                ) : testSent ? (
                  <><Check size={18} /> Check Your Phone!</>
                ) : (
                  <><Phone size={18} /> Send Me a Test Text</>
                )}
              </button>
              {testSent && (
                <p className="text-blue-200 text-xs mt-2 text-center">
                  You just got a text from a prospect. Reply to it — the AI handles everything.
                </p>
              )}
            </div>

            {/* Listing Snippets */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-sm font-medium text-slate-800 mb-3">Copy-paste for your listings</p>
              <div className="space-y-3">
                {getSnippets().map((s, i) => (
                  <div key={i} className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 font-medium mb-1">{s.label}</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{s.text}</p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(s.text); }}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                    >
                      <Copy size={12} /> Copy
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Bulk Import Link */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <FileSpreadsheet size={20} className="text-blue-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">Adding lots of units?</p>
                <p className="text-xs text-slate-500">Import from a CSV or Excel spreadsheet</p>
              </div>
              <a
                href={`/leasing/setup/bulk-import?propertyId=${result.propertyId}&configId=${result.configId}`}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
              >
                Import &rarr;
              </a>
            </div>

            {/* Quick Tips */}
            <div className="bg-amber-50 rounded-xl border border-amber-100 p-4">
              <p className="text-sm font-medium text-amber-800 mb-2">Quick tip</p>
              <p className="text-sm text-amber-700">
                Put this number on your Craigslist, StreetEasy, and Zillow listings. The AI answers 24/7 and texts you when someone's ready for a showing.
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <button
                onClick={() => router.push("/leasing")}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-3.5 text-base font-semibold hover:bg-blue-700 transition-colors"
              >
                <MessageSquare size={18} /> View Conversations
              </button>
              <p className="text-center text-xs text-slate-400">
                Free plan: 25 AI messages/day &middot; 3 properties &middot; SMS only
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
