"use client";

import FeatureGate from "@/components/ui/feature-gate";
import type { EnrichmentResult, ContactResult, ScoredContact, ScoredAddress } from "@/lib/contact-enrichment-pipeline";

// ============================================================
// Props & Helpers
// ============================================================

interface Props {
  enrichment: EnrichmentResult | null;
  loading: boolean;
  // Fallback data from existing data-fusion pipeline (phone groups, HPD, etc.)
  legacyPhoneGroups?: Map<string, { phone: string; names: string[]; sources: string[]; addresses: string[]; count: number }>;
  legacyHpdContacts?: any[];
  legacyRankedContacts?: any[];
  legacyPdlEnrichment?: any;
  legacyApolloEnrichment?: any;
  // Skip trace (manual)
  skipTraceResult?: any;
  skipTracing?: boolean;
  onSkipTrace?: () => void;
  // Interactions
  onNameClick?: (name: string) => void;
  onSmsClick?: (phone: string, name?: string) => void;
}

const fmtPhone = (ph: string) => {
  const digits = (ph || "").replace(/\D/g, "").slice(-10);
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === "1") return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return ph || "—";
};

const confidenceColor = (c: number) =>
  c >= 80 ? "bg-emerald-100 text-emerald-700" :
  c >= 60 ? "bg-blue-100 text-blue-700" :
  c >= 40 ? "bg-amber-100 text-amber-700" :
  "bg-slate-100 text-slate-600";

const typeLabel = (t: string) =>
  t === "direct" ? "Direct" :
  t === "work" ? "Work" :
  t === "office" ? "Office" :
  t === "generic" ? "Generic" : "";

const sourceColors: Record<string, string> = {
  apollo: "bg-orange-100 text-orange-700",
  pdl: "bg-blue-100 text-blue-700",
  hpd: "bg-teal-100 text-teal-700",
  ny_dos: "bg-purple-100 text-purple-700",
};

const getSourceColor = (src: string) => sourceColors[src] || "bg-slate-100 text-slate-600";

// ============================================================
// Primary Contact Card
// ============================================================

function PrimaryContactCard({ contact, onNameClick, onSmsClick }: {
  contact: ContactResult;
  onNameClick?: (name: string) => void;
  onSmsClick?: (phone: string, name?: string) => void;
}) {
  const bestPhone = contact.phones.find(p => p.isPrimary) || contact.phones[0];
  const bestEmail = contact.emails.find(e => e.isPrimary) || contact.emails[0];
  const overallConfidence = Math.max(bestPhone?.confidence || 0, bestEmail?.confidence || 0);

  return (
    <div className="bg-white rounded-xl border-2 border-blue-200 p-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {contact.photoUrl ? (
            <img src={contact.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
              {contact.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-slate-900 cursor-pointer hover:text-blue-600"
              onClick={() => onNameClick?.(contact.name)}>
              {contact.name}
            </p>
            {contact.title && (
              <p className="text-xs text-slate-500">
                {contact.title}{contact.company ? ` at ${contact.company}` : ""}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + confidenceColor(overallConfidence)}>
            {overallConfidence}% match
          </span>
          {contact.sourcesWithResults.length > 1 && (
            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
              {contact.sourcesWithResults.length} sources
            </span>
          )}
        </div>
      </div>

      {/* Piercing path context */}
      {contact.piercingPath && (
        <div className="mb-3 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg">
          <p className="text-[10px] text-violet-600 font-medium">Ownership Path</p>
          <p className="text-xs text-violet-800 font-semibold">{contact.piercingPath}</p>
        </div>
      )}

      {/* Phone & Email Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {bestPhone && (
          <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-emerald-600 uppercase font-medium mb-0.5">Best Phone</p>
                <a href={"tel:" + bestPhone.value} className="text-base font-bold text-slate-900 hover:text-emerald-600">
                  {fmtPhone(bestPhone.value)}
                </a>
              </div>
              <div className="flex gap-1.5">
                <a href={"tel:" + bestPhone.value}
                  className="px-2.5 py-1 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors">
                  Call
                </a>
                {onSmsClick && (
                  <button onClick={() => onSmsClick(bestPhone.value, contact.name)}
                    className="px-2.5 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                    SMS
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={"text-[9px] font-bold px-1.5 py-0.5 rounded " + confidenceColor(bestPhone.confidence)}>
                {bestPhone.confidence}%
              </span>
              {typeLabel(bestPhone.type) && (
                <span className="text-[9px] text-slate-500">{typeLabel(bestPhone.type)}</span>
              )}
              <span className={"text-[9px] px-1.5 py-0.5 rounded " + getSourceColor(bestPhone.source)}>
                {bestPhone.sourceDetail || bestPhone.source}
              </span>
              {bestPhone.confirmedBy && bestPhone.confirmedBy.length > 1 && (
                <span className="text-[9px] font-bold text-emerald-600">Confirmed by {bestPhone.confirmedBy.length} sources</span>
              )}
            </div>
          </div>
        )}

        {bestEmail && (
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <div>
              <p className="text-[10px] text-blue-600 uppercase font-medium mb-0.5">Best Email</p>
              <a href={"mailto:" + bestEmail.value} className="text-sm font-bold text-slate-900 hover:text-blue-600 truncate block">
                {bestEmail.value}
              </a>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={"text-[9px] font-bold px-1.5 py-0.5 rounded " + confidenceColor(bestEmail.confidence)}>
                {bestEmail.confidence}%
              </span>
              {typeLabel(bestEmail.type) && (
                <span className="text-[9px] text-slate-500">{typeLabel(bestEmail.type)}</span>
              )}
              <span className={"text-[9px] px-1.5 py-0.5 rounded " + getSourceColor(bestEmail.source)}>
                {bestEmail.sourceDetail || bestEmail.source}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* LinkedIn */}
      {contact.linkedIn && (
        <div className="mt-2.5">
          <a href={contact.linkedIn.startsWith("http") ? contact.linkedIn : "https://" + contact.linkedIn}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" /></svg>
            {contact.linkedIn.replace("https://www.linkedin.com/in/", "").replace(/\/$/, "")}
          </a>
        </div>
      )}

      {/* Enrichment sources footer */}
      <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-100">
        <span className="text-[10px] text-slate-400">Sources checked:</span>
        {contact.sourcesChecked.map((s, i) => (
          <span key={i} className={"text-[9px] px-1.5 py-0.5 rounded " + (
            contact.sourcesWithResults.includes(s) ? "bg-emerald-50 text-emerald-600 font-bold" : "bg-slate-50 text-slate-400"
          )}>{s}</span>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// All Contacts List (phones + emails)
// ============================================================

function AllContactsList({ contact, onSmsClick }: {
  contact: ContactResult;
  onSmsClick?: (phone: string, name?: string) => void;
}) {
  // Skip if only 1 phone and 1 email (already shown in primary card)
  if (contact.phones.length <= 1 && contact.emails.length <= 1) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold text-slate-900">All Contact Info</span>
        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
          {contact.phones.length} phone{contact.phones.length !== 1 ? "s" : ""}, {contact.emails.length} email{contact.emails.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* All phones */}
      {contact.phones.length > 0 && (
        <div className="space-y-2 mb-3">
          <p className="text-[10px] text-slate-400 uppercase font-medium">Phone Numbers</p>
          {contact.phones.map((ph, i) => (
            <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg p-2.5">
              <div className="flex items-center gap-2">
                <a href={"tel:" + ph.value} className="text-sm font-bold text-slate-900 hover:text-emerald-600">
                  {fmtPhone(ph.value)}
                </a>
                <span className={"text-[9px] font-bold px-1.5 py-0.5 rounded " + confidenceColor(ph.confidence)}>
                  {ph.confidence}%
                </span>
                {typeLabel(ph.type) && (
                  <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{typeLabel(ph.type)}</span>
                )}
                <span className={"text-[9px] px-1.5 py-0.5 rounded " + getSourceColor(ph.source)}>
                  {ph.sourceDetail || ph.source}
                </span>
                {ph.confirmedBy && ph.confirmedBy.length > 1 && (
                  <span className="text-[9px] font-bold text-emerald-600">{ph.confirmedBy.length}x confirmed</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <a href={"tel:" + ph.value} className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100 transition-colors">Call</a>
                {onSmsClick && (
                  <button onClick={() => onSmsClick(ph.value, contact.name)}
                    className="p-1 text-blue-500 hover:bg-blue-50 rounded" title="Send SMS">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All emails */}
      {contact.emails.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-slate-400 uppercase font-medium">Email Addresses</p>
          {contact.emails.map((em, i) => (
            <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg p-2.5">
              <div className="flex items-center gap-2">
                <a href={"mailto:" + em.value} className="text-sm font-medium text-blue-600 hover:underline truncate max-w-[250px]">
                  {em.value}
                </a>
                <span className={"text-[9px] font-bold px-1.5 py-0.5 rounded " + confidenceColor(em.confidence)}>
                  {em.confidence}%
                </span>
                {typeLabel(em.type) && (
                  <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{typeLabel(em.type)}</span>
                )}
                <span className={"text-[9px] px-1.5 py-0.5 rounded " + getSourceColor(em.source)}>
                  {em.sourceDetail || em.source}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Addresses */}
      {contact.addresses.length > 0 && (
        <div className="space-y-2 mt-3">
          <p className="text-[10px] text-slate-400 uppercase font-medium">Known Addresses</p>
          {contact.addresses.map((addr, i) => (
            <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2.5">
              <span className="text-xs text-slate-700">{addr.value}</span>
              <span className={"text-[9px] px-1.5 py-0.5 rounded " + (
                addr.type === "mailing" ? "bg-slate-200 text-slate-600" :
                addr.type === "business" ? "bg-blue-100 text-blue-600" :
                addr.type === "registered_agent" ? "bg-purple-100 text-purple-600" :
                "bg-slate-100 text-slate-500"
              )}>{addr.type.replace("_", " ")}</span>
              <span className={"text-[9px] px-1.5 py-0.5 rounded " + getSourceColor(addr.source)}>
                {addr.source}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Enrichment Status Bar
// ============================================================

function EnrichmentStatusBar({ enrichment }: { enrichment: EnrichmentResult }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {enrichment.fromCache && (
        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
          Cached result (7-day)
        </span>
      )}
      {enrichment.bestPhoneConfidence > 0 && (
        <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + confidenceColor(enrichment.bestPhoneConfidence)}>
          Phone: {enrichment.bestPhoneConfidence}% confidence
        </span>
      )}
      {enrichment.bestEmailConfidence > 0 && (
        <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + confidenceColor(enrichment.bestEmailConfidence)}>
          Email: {enrichment.bestEmailConfidence}% confidence
        </span>
      )}
    </div>
  );
}

// ============================================================
// Loading Skeleton
// ============================================================

function ContactSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="bg-white rounded-xl border border-blue-200 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-slate-200" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-slate-200 rounded mb-1.5" />
            <div className="h-3 w-48 bg-slate-100 rounded" />
          </div>
          <div className="h-5 w-20 bg-slate-200 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 rounded-lg p-3 h-16" />
          <div className="bg-blue-50 rounded-lg p-3 h-16" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function ContactIntelligenceSection({
  enrichment,
  loading,
  legacyPhoneGroups,
  legacyHpdContacts,
  legacyRankedContacts,
  legacyPdlEnrichment,
  legacyApolloEnrichment,
  skipTraceResult,
  skipTracing,
  onSkipTrace,
  onNameClick,
  onSmsClick,
}: Props) {
  const hasEnrichment = enrichment && enrichment.primaryContact;
  const hasLegacyData = (legacyPhoneGroups && legacyPhoneGroups.size > 0) ||
    (legacyHpdContacts && legacyHpdContacts.length > 0) ||
    (legacyRankedContacts && legacyRankedContacts.length > 0);

  // If still loading and no data yet, show skeleton
  if (loading && !hasEnrichment && !hasLegacyData) {
    return (
      <FeatureGate feature="bp_owner_contact" blur>
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">📞</span>
            <h3 className="text-sm font-bold text-slate-900">Contact Intelligence</h3>
            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium animate-pulse">
              Enriching...
            </span>
          </div>
          <ContactSkeleton />
        </div>
      </FeatureGate>
    );
  }

  // If we have enrichment data from the new pipeline, render the enhanced view
  if (hasEnrichment) {
    const primary = enrichment!.primaryContact!;

    return (
      <FeatureGate feature="bp_owner_contact" blur>
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">📞</span>
              <h3 className="text-sm font-bold text-slate-900">Contact Intelligence</h3>
              <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full font-medium">
                {enrichment!.totalPhones} phone{enrichment!.totalPhones !== 1 ? "s" : ""}, {enrichment!.totalEmails} email{enrichment!.totalEmails !== 1 ? "s" : ""}
              </span>
              {loading && (
                <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-600 border-t-transparent" />
              )}
            </div>
            <EnrichmentStatusBar enrichment={enrichment!} />
          </div>

          <div className="space-y-3">
            {/* Primary contact card */}
            <PrimaryContactCard
              contact={primary}
              onNameClick={onNameClick}
              onSmsClick={onSmsClick}
            />

            {/* All contacts expanded list */}
            <AllContactsList
              contact={primary}
              onSmsClick={onSmsClick}
            />

            {/* Manual skip trace as fallback if enrichment confidence is low */}
            {enrichment!.bestPhoneConfidence < 60 && onSkipTrace && !skipTraceResult && (
              <div className="bg-white rounded-xl border border-violet-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔍</span>
                    <span className="text-sm font-bold text-slate-900">Need more results?</span>
                  </div>
                  <button onClick={onSkipTrace} disabled={skipTracing}
                    className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
                    {skipTracing ? "Searching..." : "Skip Trace ($0.02)"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </FeatureGate>
    );
  }

  // No enrichment data — show nothing (the existing contact section in building-profile handles legacy display)
  return null;
}
