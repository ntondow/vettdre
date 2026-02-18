#!/bin/bash
# Run from inside your vettdre directory:
#   bash add-contact-detail.sh

set -e
echo "🏗️  Adding Contact Detail page..."

# ============================================================
# 1. CONTACT DETAIL PAGE
# ============================================================
mkdir -p "src/app/(dashboard)/contacts/[id]"

echo "📄 Writing contact detail page..."
cat > "src/app/(dashboard)/contacts/[id]/page.tsx" << 'EOF'
import { notFound } from "next/navigation";
import Header from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import ContactDetail from "./contact-detail";

async function getContact(id: string) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
  });
  if (!user) return null;

  return prisma.contact.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      assignedAgent: { select: { fullName: true, email: true } },
      activities: { orderBy: { occurredAt: "desc" }, take: 20 },
    },
  });
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) notFound();

  return (
    <>
      <Header title={`${contact.firstName} ${contact.lastName}`} subtitle={contact.email || undefined} />
      <ContactDetail contact={contact} />
    </>
  );
}
EOF

# ============================================================
# 2. CONTACT DETAIL CLIENT COMPONENT
# ============================================================
echo "📝 Writing contact detail component..."
cat > "src/app/(dashboard)/contacts/[id]/contact-detail.tsx" << 'EOF'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateContact } from "./actions";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  status: string;
  source: string | null;
  tags: string[];
  qualificationScore: number | null;
  notes: string | null;
  lastContactedAt: Date | null;
  lastActivityAt: Date | null;
  totalActivities: number;
  createdAt: Date;
  assignedAgent: { fullName: string; email: string } | null;
  activities: Array<{
    id: string;
    type: string;
    subject: string | null;
    body: string | null;
    occurredAt: Date;
  }>;
}

const statusOptions = ["lead", "active", "client", "past_client", "archived"];
const sourceOptions = ["website", "referral", "zillow", "realtor.com", "streeteasy", "open_house", "cold_call", "social_media", "other"];

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
}

function formatDate(date: Date | string | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(date));
}

export default function ContactDetail({ contact }: { contact: Contact }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "activity" | "notes">("details");

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData(e.currentTarget);
      await updateContact(contact.id, formData);
      setEditing(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return "bg-slate-100 text-slate-500";
    if (score >= 80) return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (score >= 60) return "bg-amber-50 text-amber-700 border-amber-200";
    if (score >= 40) return "bg-orange-50 text-orange-700 border-orange-200";
    return "bg-red-50 text-red-700 border-red-200";
  };

  const getScoreLabel = (score: number | null) => {
    if (score === null) return "Not scored";
    if (score >= 80) return "Hot";
    if (score >= 60) return "Warm";
    if (score >= 40) return "Developing";
    return "Cold";
  };

  return (
    <div className="p-8">
      <div className="flex gap-8">
        {/* LEFT COLUMN - Profile Card */}
        <div className="w-80 flex-shrink-0 space-y-4">
          {/* Profile Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 text-lg font-bold flex items-center justify-center">
                {contact.firstName[0]}{contact.lastName[0]}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{contact.firstName} {contact.lastName}</h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 capitalize">{contact.status}</span>
              </div>
            </div>

            {/* Score */}
            <div className={`rounded-lg border p-4 mb-5 ${getScoreColor(contact.qualificationScore)}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider">AI Score</p>
                <span className="text-2xl font-bold">{contact.qualificationScore ?? "—"}</span>
              </div>
              <p className="text-xs mt-1">{getScoreLabel(contact.qualificationScore)}</p>
            </div>

            {/* Quick Info */}
            <div className="space-y-3">
              {contact.email && (
                <div className="flex items-center gap-2.5">
                  <span className="text-base">✉️</span>
                  <a href={`mailto:${contact.email}`} className="text-sm text-blue-600 hover:underline truncate">{contact.email}</a>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-2.5">
                  <span className="text-base">📞</span>
                  <a href={`tel:${contact.phone}`} className="text-sm text-blue-600 hover:underline">{contact.phone}</a>
                </div>
              )}
              {(contact.city || contact.state) && (
                <div className="flex items-center gap-2.5">
                  <span className="text-base">📍</span>
                  <span className="text-sm text-slate-600">{[contact.city, contact.state].filter(Boolean).join(", ")}</span>
                </div>
              )}
              {contact.source && (
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🔗</span>
                  <span className="text-sm text-slate-600 capitalize">{contact.source.replace("_", " ")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Activity Stats</h3>
            <div className="space-y-2.5">
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">Total activities</span>
                <span className="text-sm font-medium text-slate-900">{contact.totalActivities}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">Last contacted</span>
                <span className="text-sm font-medium text-slate-900">{contact.lastContactedAt ? formatDate(contact.lastContactedAt) : "Never"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">Created</span>
                <span className="text-sm font-medium text-slate-900">{formatDate(contact.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Assigned Agent */}
          {contact.assignedAgent && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Assigned Agent</h3>
              <p className="text-sm text-slate-900">{contact.assignedAgent.fullName}</p>
              <p className="text-xs text-slate-500">{contact.assignedAgent.email}</p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN - Tabs */}
        <div className="flex-1 min-w-0">
          {/* Tab Bar */}
          <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1 mb-4">
            {(["details", "activity", "notes"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                  activeTab === tab ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* DETAILS TAB */}
          {activeTab === "details" && (
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Contact Information</h3>
                {!editing && (
                  <button onClick={() => setEditing(true)} className="text-sm text-blue-600 font-medium hover:text-blue-700">Edit</button>
                )}
              </div>

              {editing ? (
                <form onSubmit={handleSave} className="p-5 space-y-4">
                  {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">First name *</label>
                      <input name="firstName" defaultValue={contact.firstName} required className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Last name *</label>
                      <input name="lastName" defaultValue={contact.lastName} required className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input name="email" type="email" defaultValue={contact.email || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                      <input name="phone" defaultValue={contact.phone || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Secondary phone</label>
                      <input name="secondaryPhone" defaultValue={contact.secondaryPhone || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                    <input name="address" defaultValue={contact.address || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                      <input name="city" defaultValue={contact.city || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                      <input name="state" defaultValue={contact.state || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
                      <input name="zip" defaultValue={contact.zip || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                      <select name="status" defaultValue={contact.status} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        {statusOptions.map((s) => <option key={s} value={s} className="capitalize">{s.replace("_", " ")}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
                      <select name="source" defaultValue={contact.source || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="">Select source...</option>
                        {sourceOptions.map((s) => <option key={s} value={s} className="capitalize">{s.replace("_", " ")}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setEditing(false)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                    <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
                  </div>
                </form>
              ) : (
                <div className="p-5 grid grid-cols-2 gap-6">
                  <InfoField label="First name" value={contact.firstName} />
                  <InfoField label="Last name" value={contact.lastName} />
                  <InfoField label="Email" value={contact.email} />
                  <InfoField label="Phone" value={contact.phone} />
                  <InfoField label="Secondary phone" value={contact.secondaryPhone} />
                  <InfoField label="Address" value={contact.address} />
                  <InfoField label="City" value={contact.city} />
                  <InfoField label="State" value={contact.state} />
                  <InfoField label="ZIP" value={contact.zip} />
                  <InfoField label="Source" value={contact.source} />
                  <InfoField label="Status" value={contact.status} />
                  <InfoField label="Tags" value={contact.tags.length > 0 ? contact.tags.join(", ") : null} />
                </div>
              )}
            </div>
          )}

          {/* ACTIVITY TAB */}
          {activeTab === "activity" && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              {contact.activities.length > 0 ? (
                <div className="space-y-4">
                  {contact.activities.map((activity) => (
                    <div key={activity.id} className="flex gap-3 pb-4 border-b border-slate-100 last:border-0">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm flex-shrink-0">
                        {activity.type === "email" ? "✉️" : activity.type === "call" ? "📞" : activity.type === "note" ? "📝" : activity.type === "showing" ? "🏠" : "📋"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900">{activity.subject || `${activity.type} activity`}</p>
                        {activity.body && <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{activity.body}</p>}
                        <p className="text-xs text-slate-400 mt-1">{formatDate(activity.occurredAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-3xl mb-3">📋</p>
                  <p className="text-sm text-slate-500">No activity yet. Interactions will appear here as you communicate with this contact.</p>
                </div>
              )}
            </div>
          )}

          {/* NOTES TAB */}
          {activeTab === "notes" && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              {contact.notes ? (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{contact.notes}</p>
              ) : (
                <div className="text-center py-8">
                  <p className="text-3xl mb-3">📝</p>
                  <p className="text-sm text-slate-500">No notes yet. Click Edit on the Details tab to add notes.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
EOF

# ============================================================
# 3. SERVER ACTIONS FOR UPDATE
# ============================================================
echo "⚡ Writing update actions..."
cat > "src/app/(dashboard)/contacts/[id]/actions.ts" << 'EOF'
"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateContact(contactId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");

  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  if (!firstName || !lastName) throw new Error("First and last name are required");

  await prisma.contact.updateMany({
    where: { id: contactId, orgId: user.orgId },
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: (formData.get("email") as string)?.trim() || null,
      phone: (formData.get("phone") as string)?.trim() || null,
      secondaryPhone: (formData.get("secondaryPhone") as string)?.trim() || null,
      address: (formData.get("address") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() || null,
      state: (formData.get("state") as string)?.trim() || null,
      zip: (formData.get("zip") as string)?.trim() || null,
      status: (formData.get("status") as string) || "lead",
      source: (formData.get("source") as string)?.trim() || null,
    },
  });

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
  return { success: true };
}
EOF

# ============================================================
# 4. UPDATE CONTACT LIST TO BE CLICKABLE
# ============================================================
echo "🔗 Making contact list clickable..."
cat > "src/app/(dashboard)/contacts/contact-list.tsx" << 'EOF'
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
EOF

echo ""
echo "✅ Contact detail page added!"
echo ""
echo "Click any contact name in the list to view their full profile."
echo "Click 'Edit' to update their information."
