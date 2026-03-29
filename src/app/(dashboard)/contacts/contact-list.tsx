"use client";

import { useState } from "react";
import { deleteContact, bulkEnrichContacts } from "./actions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CONTACT_TYPE_META } from "@/lib/contact-types";
import type { ContactType } from "@/lib/contact-types";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  status: string;
  source: string | null;
  contactType: string;
  qualificationScore: number | null;
  createdAt: Date;
}

const TYPE_FILTERS: { key: ContactType | "all"; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "👥" },
  { key: "landlord", label: "Landlords", icon: "🏢" },
  { key: "buyer", label: "Buyers", icon: "🏠" },
  { key: "seller", label: "Sellers", icon: "💰" },
  { key: "renter", label: "Renters", icon: "🔑" },
];

export default function ContactList({ contacts }: { contacts: Contact[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<string | null>(null);
  const [enrichResult, setEnrichResult] = useState<{ enriched: number; newPhones: number; newEmails: number } | null>(null);
  const [typeFilter, setTypeFilter] = useState<ContactType | "all">("all");

  const filtered = typeFilter === "all" ? contacts : contacts.filter(c => c.contactType === typeFilter);

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await deleteContact(id);
      router.refresh();
    } finally {
      setDeleting(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} contact${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all(Array.from(selected).map(id => deleteContact(id)));
      setSelected(new Set());
      router.refresh();
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkEnrich = async () => {
    if (selected.size === 0) return;
    const creditEstimate = selected.size;
    if (!confirm(`Enrich ${selected.size} contact${selected.size > 1 ? "s" : ""}?\n\nThis will use approximately ${creditEstimate} Apollo credits. Continue?`)) return;
    setBulkEnriching(true);
    setEnrichResult(null);
    setEnrichProgress(`Enriching ${selected.size} contacts...`);
    try {
      const result = await bulkEnrichContacts(Array.from(selected));
      setEnrichResult(result);
      setEnrichProgress(null);
      setSelected(new Set());
      router.refresh();
      setTimeout(() => setEnrichResult(null), 8000);
    } catch (err) {
      console.error("Bulk enrich error:", err);
      setEnrichProgress(null);
    } finally {
      setBulkEnriching(false);
    }
  };

  // Count per type for filter pills
  const typeCounts: Record<string, number> = { all: contacts.length };
  for (const c of contacts) {
    typeCounts[c.contactType] = (typeCounts[c.contactType] || 0) + 1;
  }

  if (contacts.length === 0) return null;

  return (
    <div>
      {/* Type filter pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
        {TYPE_FILTERS.map((f) => {
          const count = typeCounts[f.key] || 0;
          const active = typeFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => { setTypeFilter(f.key); setSelected(new Set()); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
              <span className={`text-xs ${active ? "text-blue-200" : "text-slate-400"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Enrichment result toast */}
        {enrichResult && (
          <div className="flex items-center gap-3 px-5 py-2.5 bg-emerald-50 border-b border-emerald-200" style={{ animation: "slide-up 200ms ease-out" }}>
            <span className="text-emerald-600 font-bold text-sm">Enrichment Complete</span>
            <span className="text-xs text-emerald-700">
              {enrichResult.enriched} enriched, {enrichResult.newPhones} new phones, {enrichResult.newEmails} new emails
            </span>
            <button onClick={() => setEnrichResult(null)} className="ml-auto text-emerald-400 hover:text-emerald-600 text-xs">&times;</button>
          </div>
        )}

        {/* Bulk actions bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-5 py-2.5 bg-blue-50 border-b border-blue-100">
            <span className="text-sm font-medium text-blue-700">{selected.size} selected</span>
            <button onClick={handleBulkEnrich} disabled={bulkEnriching}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
              {bulkEnriching ? enrichProgress || "Enriching..." : `Enrich ${selected.size}`}
            </button>
            <button onClick={handleBulkDelete} disabled={bulkDeleting}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg disabled:opacity-50">
              {bulkDeleting ? "Deleting..." : `Delete ${selected.size}`}
            </button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Clear</button>
          </div>
        )}

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100">
          {filtered.map((contact) => {
            const typeMeta = CONTACT_TYPE_META[contact.contactType as ContactType] || CONTACT_TYPE_META.renter;
            return (
              <Link key={contact.id} href={`/contacts/${contact.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                  {contact.firstName[0]}{contact.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">{contact.firstName} {contact.lastName}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${typeMeta.bgColor} ${typeMeta.color}`}>
                      {typeMeta.icon} {typeMeta.label}
                    </span>
                    {contact.qualificationScore !== null && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        contact.qualificationScore >= 80 ? "bg-emerald-50 text-emerald-700" :
                        contact.qualificationScore >= 60 ? "bg-amber-50 text-amber-700" :
                        "bg-slate-100 text-slate-600"
                      }`}>{contact.qualificationScore}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {contact.email || contact.phone || "No contact info"}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-600 active:bg-emerald-100">
                      <span className="text-lg">📞</span>
                    </a>
                  )}
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} onClick={(e) => e.stopPropagation()}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-50 text-blue-600 active:bg-blue-100">
                      <span className="text-lg">✉️</span>
                    </a>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Desktop Table View */}
        <table className="w-full hidden md:table">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="w-10 px-3 py-3">
                <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              </th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Score</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((contact) => {
              const typeMeta = CONTACT_TYPE_META[contact.contactType as ContactType] || CONTACT_TYPE_META.renter;
              return (
                <tr key={contact.id} className={`hover:bg-slate-50 transition-colors ${selected.has(contact.id) ? "bg-blue-50/40" : ""}`}>
                  <td className="w-10 px-3 py-3">
                    <input type="checkbox" checked={selected.has(contact.id)} onChange={() => toggleSelect(contact.id)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/contacts/${contact.id}`} className="flex items-center gap-3 group">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                        {contact.firstName[0]}{contact.lastName[0]}
                      </div>
                      <span className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">{contact.firstName} {contact.lastName}</span>
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeMeta.bgColor} ${typeMeta.color}`}>
                      {typeMeta.icon} {typeMeta.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-600">{contact.email || "—"}</td>
                  <td className="px-5 py-3 text-sm text-slate-600">{contact.phone || "—"}</td>
                  <td className="px-5 py-3 text-sm text-slate-600">{contact.source || "—"}</td>
                  <td className="px-5 py-3">
                    {contact.qualificationScore !== null ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        contact.qualificationScore >= 80 ? "bg-emerald-50 text-emerald-700" :
                        contact.qualificationScore >= 60 ? "bg-amber-50 text-amber-700" :
                        "bg-slate-100 text-slate-600"
                      }`}>
                        {contact.qualificationScore}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Pending</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 capitalize">
                      {contact.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={(e) => handleDelete(e, contact.id, `${contact.firstName} ${contact.lastName}`)}
                      disabled={deleting === contact.id}
                      className="text-xs text-slate-400 hover:text-red-600 transition-colors"
                    >
                      {deleting === contact.id ? "..." : "Delete"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Empty filter state */}
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-slate-400 text-sm">No {typeFilter === "all" ? "" : TYPE_FILTERS.find(f => f.key === typeFilter)?.label.toLowerCase() + " "}contacts found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
