"use client";

// Progressive contact list — renders contacts as they arrive
// HPD contacts first (instant), then enriched contacts stream in

import type { EnrichmentResult } from "@/lib/contact-enrichment-pipeline";
import ContactCard from "./contact-card";
import { SkeletonContactsList } from "./skeleton-components";

interface Props {
  /** HPD and ranked contacts from building data (instant) */
  hpdContacts: any[];
  rankedContacts: any[];
  /** Enriched contacts from pipeline */
  enrichment: EnrichmentResult | null;
  enrichmentLoading: boolean;
  /** Whether to show a limited view (max 3) */
  maxVisible?: number;
  onSmsClick?: (phone: string, name?: string) => void;
  onViewAll?: () => void;
}

interface NormalizedContact {
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  confidence?: number;
  source?: string;
}

export default function ContactsList({
  hpdContacts,
  rankedContacts,
  enrichment,
  enrichmentLoading,
  maxVisible,
  onSmsClick,
  onViewAll,
}: Props) {
  // Build merged contact list with dedup
  const contacts: NormalizedContact[] = [];
  const seenPhones = new Set<string>();
  const seenNames = new Set<string>();

  function addContact(c: NormalizedContact) {
    const key = c.phone?.replace(/\D/g, "") || c.name?.toLowerCase() || "";
    if (c.phone && seenPhones.has(c.phone.replace(/\D/g, ""))) return;
    if (!c.phone && seenNames.has(c.name?.toLowerCase())) return;
    if (c.phone) seenPhones.add(c.phone.replace(/\D/g, ""));
    seenNames.add(c.name?.toLowerCase());
    contacts.push(c);
  }

  // 1. Enrichment pipeline contacts first (highest quality)
  if (enrichment) {
    const primary = enrichment.primaryContact;
    if (primary) {
      addContact({
        name: primary.name || "Owner",
        role: primary.title || "Owner",
        phone: primary.phones?.[0]?.value || undefined,
        email: primary.emails?.[0]?.value || undefined,
        confidence: primary.phones?.[0]?.confidence || undefined,
        source: primary.sourcesWithResults?.join(", ") || "Enriched",
      });
    }
    if (enrichment.contacts) {
      for (const ac of enrichment.contacts) {
        if (ac.name === primary?.name) continue;
        addContact({
          name: ac.name,
          role: ac.title || undefined,
          phone: ac.phones?.[0]?.value || undefined,
          email: ac.emails?.[0]?.value || undefined,
          confidence: ac.phones?.[0]?.confidence || undefined,
          source: ac.source || undefined,
        });
      }
    }
  }

  // 2. Ranked contacts from building data
  if (Array.isArray(rankedContacts)) {
    for (const rc of rankedContacts) {
      addContact({
        name: rc.name || "",
        role: rc.role || rc.source || undefined,
        phone: rc.phone || undefined,
        email: rc.email || undefined,
        confidence: rc.score || undefined,
        source: rc.source || "HPD/DOB",
      });
    }
  }

  // 3. HPD contacts as fallback
  if (Array.isArray(hpdContacts)) {
    for (const hc of hpdContacts) {
      if (hc.type === "CorporateOwner" || hc.type === "Officer") {
        addContact({
          name: hc.corporateName || hc.contactName || hc.firstName + " " + hc.lastName || "",
          role: hc.title || hc.type || undefined,
          phone: undefined,
          email: undefined,
          source: "HPD Registration",
        });
      }
    }
  }

  // Filter to only contacts with useful info
  const validContacts = contacts.filter(c => c.name && c.name.length > 1);
  const displayContacts = maxVisible ? validContacts.slice(0, maxVisible) : validContacts;
  const hasMore = maxVisible && validContacts.length > maxVisible;

  if (validContacts.length === 0 && !enrichmentLoading) {
    return (
      <div className="text-xs text-slate-400 italic py-2">
        No direct contact information found
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Contacts</span>
        {enrichmentLoading && (
          <span className="flex items-center gap-1 text-[10px] text-blue-500">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
            Loading more...
          </span>
        )}
      </div>

      <div className="space-y-2">
        {displayContacts.map((c, i) => (
          <ContactCard key={`${c.name}-${c.phone || i}`} contact={c} onSmsClick={onSmsClick} />
        ))}

        {enrichmentLoading && validContacts.length === 0 && <SkeletonContactsList />}
      </div>

      {hasMore && onViewAll && (
        <button
          onClick={onViewAll}
          className="mt-2 text-[11px] text-blue-600 hover:text-blue-700 font-medium"
        >
          View all {validContacts.length} contacts on Ownership tab &rarr;
        </button>
      )}
    </div>
  );
}
