"use client";

import { useState } from "react";
import { deleteContact, bulkEnrichContacts } from "./actions";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  qualificationScore: number | null;
  createdAt: Date;
}

export default function ContactList({ contacts }: { contacts: Contact[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<string | null>(null);
  const [enrichResult, setEnrichResult] = useState<{ enriched: number; newPhones: number; newEmails: number } | null>(null);

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
    if (selected.size === contacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contacts.map(c => c.id)));
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
      // Auto-dismiss result after 8 seconds
      setTimeout(() => setEnrichResult(null), 8000);
    } catch (err) {
      console.error("Bulk enrich error:", err);
      setEnrichProgress(null);
    } finally {
      setBulkEnriching(false);
    }
  };

  if (contacts.length === 0) return null;

  return (
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
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="w-10 px-3 py-3">
              <input type="checkbox" checked={selected.size === contacts.length && contacts.length > 0} onChange={toggleAll}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            </th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Score</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
            <th className="px-5 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {contacts.map((contact) => (
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
              <td className="px-5 py-3 text-sm text-slate-600">{contact.email || "—"}</td>
              <td className="px-5 py-3 text-sm text-slate-600">{contact.phone || "—"}</td>
              <td className="px-5 py-3 text-sm text-slate-600">
                {contact.city && contact.state ? `${contact.city}, ${contact.state}` : contact.city || contact.state || "—"}
              </td>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
