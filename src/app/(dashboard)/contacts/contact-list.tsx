"use client";

import { useState } from "react";
import { deleteContact } from "./actions";
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

  if (contacts.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
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
            <tr key={contact.id} className="hover:bg-slate-50 transition-colors">
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
