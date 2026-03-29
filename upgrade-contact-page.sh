#!/bin/bash
# Run from inside your vettdre directory:
#   bash upgrade-contact-page.sh

set -e
echo "🏗️  Upgrading Contact Detail page to full dossier..."

# ============================================================
# 1. EXPANDED SERVER ACTIONS
# ============================================================
echo "⚡ Writing expanded server actions..."
cat > "src/app/(dashboard)/contacts/[id]/actions.ts" << 'ACTIONSEOF'
"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return user;
}

export async function updateContact(contactId: string, formData: FormData) {
  const user = await getAuthUser();
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

export async function addNote(contactId: string, body: string) {
  const user = await getAuthUser();
  await prisma.activity.create({
    data: {
      orgId: user.orgId,
      contactId,
      userId: user.id,
      type: "note",
      subject: "Note added",
      body: body.trim(),
    },
  });
  await prisma.contact.updateMany({
    where: { id: contactId, orgId: user.orgId },
    data: { lastActivityAt: new Date(), totalActivities: { increment: 1 } },
  });
  revalidatePath(`/contacts/${contactId}`);
  return { success: true };
}

export async function logInteraction(contactId: string, type: string, subject: string, body: string) {
  const user = await getAuthUser();
  await prisma.activity.create({
    data: {
      orgId: user.orgId,
      contactId,
      userId: user.id,
      type: type as any,
      direction: "outbound",
      subject: subject.trim(),
      body: body.trim() || null,
    },
  });
  await prisma.contact.updateMany({
    where: { id: contactId, orgId: user.orgId },
    data: {
      lastContactedAt: new Date(),
      lastActivityAt: new Date(),
      totalActivities: { increment: 1 },
    },
  });
  revalidatePath(`/contacts/${contactId}`);
  return { success: true };
}

export async function createTask(contactId: string, formData: FormData) {
  const user = await getAuthUser();
  const title = formData.get("title") as string;
  if (!title) throw new Error("Title is required");

  await prisma.task.create({
    data: {
      orgId: user.orgId,
      contactId,
      assignedTo: user.id,
      createdBy: user.id,
      title: title.trim(),
      description: (formData.get("description") as string)?.trim() || null,
      type: (formData.get("type") as any) || "follow_up",
      priority: (formData.get("priority") as any) || "medium",
      dueAt: formData.get("dueAt") ? new Date(formData.get("dueAt") as string) : null,
    },
  });
  revalidatePath(`/contacts/${contactId}`);
  return { success: true };
}

export async function completeTask(taskId: string, contactId: string) {
  const user = await getAuthUser();
  await prisma.task.updateMany({
    where: { id: taskId, orgId: user.orgId },
    data: { status: "completed", completedAt: new Date(), completedBy: user.id },
  });
  revalidatePath(`/contacts/${contactId}`);
  return { success: true };
}

export async function updateTags(contactId: string, tags: string[]) {
  const user = await getAuthUser();
  await prisma.contact.updateMany({
    where: { id: contactId, orgId: user.orgId },
    data: { tags },
  });
  revalidatePath(`/contacts/${contactId}`);
  return { success: true };
}
ACTIONSEOF

# ============================================================
# 2. UPDATED PAGE.TSX - FETCHES EVERYTHING
# ============================================================
echo "📄 Writing expanded page..."
cat > "src/app/(dashboard)/contacts/[id]/page.tsx" << 'PAGEEOF'
import { notFound } from "next/navigation";
import Header from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import ContactDossier from "./contact-dossier";

async function getContact(id: string) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) return null;

  const contact = await prisma.contact.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      assignedAgent: { select: { fullName: true, email: true } },
      activities: { orderBy: { occurredAt: "desc" }, take: 50, include: { user: { select: { fullName: true } } } },
      deals: { orderBy: { createdAt: "desc" }, include: { property: { select: { address: true, city: true, state: true } }, pipeline: { select: { name: true } } } },
      tasks: { orderBy: { dueAt: "asc" }, where: { status: { not: "completed" } } },
      showings: { orderBy: { scheduledAt: "desc" }, take: 10, include: { property: { select: { address: true, city: true, state: true } } } },
      enrichmentProfiles: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  return contact;
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) notFound();
  return <ContactDossier contact={contact} />;
}
PAGEEOF

# ============================================================
# 3. FULL DOSSIER COMPONENT
# ============================================================
echo "📝 Writing contact dossier component (this is the big one)..."
cat > "src/app/(dashboard)/contacts/[id]/contact-dossier.tsx" << 'DOSSIEREOF'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateContact, addNote, logInteraction, createTask, completeTask, updateTags } from "./actions";

// ---- TYPES ----
interface Contact {
  id: string; firstName: string; lastName: string; email: string | null; phone: string | null;
  secondaryPhone: string | null; address: string | null; city: string | null; state: string | null;
  zip: string | null; status: string; source: string | null; tags: string[]; qualificationScore: number | null;
  notes: string | null; lastContactedAt: Date | null; lastActivityAt: Date | null; totalActivities: number;
  createdAt: Date; updatedAt: Date;
  assignedAgent: { fullName: string; email: string } | null;
  activities: Array<{ id: string; type: string; direction: string | null; subject: string | null; body: string | null; occurredAt: Date; user: { fullName: string } | null }>;
  deals: Array<{ id: string; name: string | null; dealValue: any; status: string; stageId: string; property: { address: string; city: string; state: string } | null; pipeline: { name: string } }>;
  tasks: Array<{ id: string; title: string; type: string; priority: string; status: string; dueAt: Date | null }>;
  showings: Array<{ id: string; scheduledAt: Date; status: string; feedback: string | null; interestLevel: string | null; property: { address: string; city: string; state: string } }>;
  enrichmentProfiles: Array<{ id: string; employer: string | null; jobTitle: string | null; industry: string | null; incomeRangeLow: number | null; incomeRangeHigh: number | null; linkedinUrl: string | null; aiSummary: string | null; aiInsights: any; profilePhotoUrl: string | null }>;
}

// ---- HELPERS ----
const fmt = (d: Date | string | null) => d ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d)) : "—";
const fmtFull = (d: Date | string | null) => d ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(d)) : "—";
const statusColors: Record<string, string> = { lead: "bg-blue-50 text-blue-700", active: "bg-emerald-50 text-emerald-700", client: "bg-purple-50 text-purple-700", past_client: "bg-slate-100 text-slate-600", archived: "bg-slate-100 text-slate-400" };
const priorityColors: Record<string, string> = { urgent: "bg-red-50 text-red-700", high: "bg-orange-50 text-orange-700", medium: "bg-amber-50 text-amber-700", low: "bg-slate-100 text-slate-600" };
const activityIcons: Record<string, string> = { email: "✉️", call: "📞", text: "💬", showing: "🏠", note: "📝", meeting: "🤝", document: "📄", system: "⚙️" };
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

// ---- MAIN COMPONENT ----
export default function ContactDossier({ contact }: { contact: Contact }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "details" | "activity" | "deals" | "tasks">("overview");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick action states
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const enrichment = contact.enrichmentProfiles[0] || null;
  const scoreColor = contact.qualificationScore === null ? "bg-slate-100 text-slate-500 border-slate-200" : contact.qualificationScore >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : contact.qualificationScore >= 60 ? "bg-amber-50 text-amber-700 border-amber-200" : contact.qualificationScore >= 40 ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-red-50 text-red-700 border-red-200";
  const scoreLabel = contact.qualificationScore === null ? "Not scored" : contact.qualificationScore >= 80 ? "Hot Lead" : contact.qualificationScore >= 60 ? "Warm" : contact.qualificationScore >= 40 ? "Developing" : "Cold";

  // Handlers
  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setSaving(true); setError(null);
    try { await updateContact(contact.id, new FormData(e.currentTarget)); setEditing(false); router.refresh(); }
    catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setNoteLoading(true);
    try { await addNote(contact.id, noteText); setNoteText(""); router.refresh(); }
    catch {} finally { setNoteLoading(false); }
  };

  const handleLogInteraction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try { await logInteraction(contact.id, fd.get("type") as string, fd.get("subject") as string, fd.get("body") as string); setLogOpen(false); router.refresh(); }
    catch {}
  };

  const handleCreateTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try { await createTask(contact.id, new FormData(e.currentTarget)); setTaskOpen(false); router.refresh(); }
    catch {}
  };

  const handleCompleteTask = async (taskId: string) => {
    try { await completeTask(taskId, contact.id); router.refresh(); } catch {}
  };

  const handleAddTag = async () => {
    if (!tagInput.trim() || contact.tags.includes(tagInput.trim())) return;
    const newTags = [...contact.tags, tagInput.trim()];
    await updateTags(contact.id, newTags); setTagInput(""); router.refresh();
  };

  const handleRemoveTag = async (tag: string) => {
    const newTags = contact.tags.filter(t => t !== tag);
    await updateTags(contact.id, newTags); router.refresh();
  };

  const tabs = [
    { key: "overview", label: "Overview", icon: "📋" },
    { key: "details", label: "Details", icon: "📝" },
    { key: "activity", label: `Activity (${contact.activities.length})`, icon: "📊" },
    { key: "deals", label: `Deals (${contact.deals.length})`, icon: "💰" },
    { key: "tasks", label: `Tasks (${contact.tasks.length})`, icon: "✅" },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ===== HEADER BAR ===== */}
      <div className="bg-white border-b border-slate-200">
        <div className="px-8 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-5">
              <Link href="/contacts" className="text-slate-400 hover:text-slate-600 text-sm">&larr; Back</Link>
              <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 text-xl font-bold flex items-center justify-center">
                {contact.firstName[0]}{contact.lastName[0]}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold text-slate-900">{contact.firstName} {contact.lastName}</h1>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[contact.status] || "bg-slate-100 text-slate-600"}`}>
                    {contact.status.replace("_", " ")}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                  {contact.email && <span>✉️ {contact.email}</span>}
                  {contact.phone && <span>📞 {contact.phone}</span>}
                  {(contact.city || contact.state) && <span>📍 {[contact.city, contact.state].filter(Boolean).join(", ")}</span>}
                </div>
              </div>
            </div>
            <div className={`rounded-xl border px-5 py-3 text-center ${scoreColor}`}>
              <p className="text-3xl font-bold">{contact.qualificationScore ?? "—"}</p>
              <p className="text-xs font-medium mt-0.5">{scoreLabel}</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 mt-4">
            <button onClick={() => { setActiveTab("activity"); setLogOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">✉️ Email</button>
            <button onClick={() => { setActiveTab("activity"); setLogOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">📞 Log Call</button>
            <button onClick={() => { setActiveTab("activity"); setLogOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">💬 Text</button>
            <button onClick={() => { setActiveTab("tasks"); setTaskOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">✅ Add Task</button>
            <div className="h-5 w-px bg-slate-200 mx-1" />
            {/* Tags */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {contact.tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className="text-slate-400 hover:text-red-500">&times;</button>
                </span>
              ))}
              <div className="flex items-center">
                <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleAddTag())} placeholder="+ tag" className="w-16 text-xs px-1.5 py-0.5 border border-transparent focus:border-slate-300 rounded focus:outline-none focus:w-24 transition-all" />
              </div>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="px-8 flex gap-0">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              <span className="mr-1.5">{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== TAB CONTENT ===== */}
      <div className="px-8 py-6">

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-3 gap-6">
            {/* AI Profile */}
            <div className="col-span-2 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">🧠</span>
                  <h3 className="text-sm font-semibold text-slate-700">AI Profile</h3>
                  <span className="ml-auto text-xs text-slate-400">{enrichment ? "Enriched" : "Pending enrichment"}</span>
                </div>
                {enrichment?.aiSummary ? (
                  <p className="text-sm text-slate-700 leading-relaxed">{enrichment.aiSummary}</p>
                ) : (
                  <div className="bg-slate-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-slate-500">AI profile will be generated when enrichment data is available. This contact will be analyzed for employment, income, property ownership, and social presence.</p>
                  </div>
                )}
                {enrichment && (
                  <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-slate-100">
                    <InfoField label="Employer" value={enrichment.employer} />
                    <InfoField label="Job Title" value={enrichment.jobTitle} />
                    <InfoField label="Industry" value={enrichment.industry} />
                    {enrichment.incomeRangeLow && (
                      <InfoField label="Est. Income" value={`$${(enrichment.incomeRangeLow/1000).toFixed(0)}K - $${((enrichment.incomeRangeHigh || enrichment.incomeRangeLow)/1000).toFixed(0)}K`} />
                    )}
                    {enrichment.linkedinUrl && (
                      <InfoField label="LinkedIn" value={enrichment.linkedinUrl} />
                    )}
                  </div>
                )}
              </div>

              {/* Quick Note */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">📝 Add a Note</h3>
                <div className="flex gap-3">
                  <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2} placeholder="Type a note about this contact..." className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  <button onClick={handleAddNote} disabled={noteLoading || !noteText.trim()} className="self-end px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">{noteLoading ? "..." : "Save"}</button>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-700">Recent Activity</h3>
                  <button onClick={() => setActiveTab("activity")} className="text-xs text-blue-600 font-medium">View all</button>
                </div>
                {contact.activities.length > 0 ? (
                  <div className="space-y-3">
                    {contact.activities.slice(0, 5).map(a => (
                      <div key={a.id} className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm flex-shrink-0">{activityIcons[a.type] || "📋"}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-slate-900 font-medium">{a.subject || `${a.type} ${a.direction || ""}`}</p>
                            <span className="text-xs text-slate-400 flex-shrink-0 ml-3">{fmtFull(a.occurredAt)}</span>
                          </div>
                          {a.body && <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{a.body}</p>}
                          {a.user && <p className="text-xs text-slate-400 mt-0.5">by {a.user.fullName}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-4">No activity yet</p>
                )}
              </div>
            </div>

            {/* Right Sidebar */}
            <div className="space-y-6">
              {/* Upcoming Tasks */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">✅ Open Tasks</h3>
                  <button onClick={() => { setActiveTab("tasks"); setTaskOpen(true); }} className="text-xs text-blue-600 font-medium">+ Add</button>
                </div>
                {contact.tasks.length > 0 ? (
                  <div className="space-y-2">
                    {contact.tasks.slice(0, 5).map(t => (
                      <div key={t.id} className="flex items-start gap-2 group">
                        <button onClick={() => handleCompleteTask(t.id)} className="w-4 h-4 mt-0.5 rounded border border-slate-300 flex-shrink-0 hover:bg-emerald-50 hover:border-emerald-400 transition-colors" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700">{t.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${priorityColors[t.priority]}`}>{t.priority}</span>
                            {t.dueAt && <span className="text-xs text-slate-400">{fmt(t.dueAt)}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-3">No open tasks</p>
                )}
              </div>

              {/* Active Deals */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">💰 Deals</h3>
                </div>
                {contact.deals.length > 0 ? (
                  <div className="space-y-3">
                    {contact.deals.map(d => (
                      <div key={d.id} className="p-3 bg-slate-50 rounded-lg">
                        <p className="text-sm font-medium text-slate-900">{d.name || "Untitled deal"}</p>
                        {d.property && <p className="text-xs text-slate-500 mt-0.5">{d.property.address}, {d.property.city}</p>}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{d.pipeline.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${d.status === "won" ? "bg-emerald-50 text-emerald-700" : d.status === "lost" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{d.status}</span>
                          {d.dealValue && <span className="text-xs text-slate-500">${Number(d.dealValue).toLocaleString()}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-3">No deals yet</p>
                )}
              </div>

              {/* Recent Showings */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">🏠 Recent Showings</h3>
                {contact.showings.length > 0 ? (
                  <div className="space-y-2">
                    {contact.showings.slice(0, 5).map(s => (
                      <div key={s.id} className="flex items-center justify-between py-1.5">
                        <div>
                          <p className="text-sm text-slate-700">{s.property.address}</p>
                          <p className="text-xs text-slate-400">{fmt(s.scheduledAt)}</p>
                        </div>
                        {s.interestLevel && (
                          <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${s.interestLevel === "hot" ? "bg-red-50 text-red-600" : s.interestLevel === "warm" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"}`}>{s.interestLevel}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-3">No showings yet</p>
                )}
              </div>

              {/* Contact Stats */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">📈 Stats</h3>
                <div className="space-y-2.5">
                  <div className="flex justify-between"><span className="text-sm text-slate-500">Total activities</span><span className="text-sm font-medium">{contact.totalActivities}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-slate-500">Last contacted</span><span className="text-sm font-medium">{fmt(contact.lastContactedAt)}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-slate-500">Created</span><span className="text-sm font-medium">{fmt(contact.createdAt)}</span></div>
                  {contact.assignedAgent && <div className="flex justify-between"><span className="text-sm text-slate-500">Agent</span><span className="text-sm font-medium">{contact.assignedAgent.fullName}</span></div>}
                  {contact.source && <div className="flex justify-between"><span className="text-sm text-slate-500">Source</span><span className="text-sm font-medium capitalize">{contact.source.replace("_", " ")}</span></div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DETAILS TAB */}
        {activeTab === "details" && (
          <div className="max-w-3xl">
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Contact Information</h3>
                {!editing && <button onClick={() => setEditing(true)} className="text-sm text-blue-600 font-medium hover:text-blue-700">Edit</button>}
              </div>
              {editing ? (
                <form onSubmit={handleSave} className="p-5 space-y-4">
                  {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">First name *</label><input name="firstName" defaultValue={contact.firstName} required className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Last name *</label><input name="lastName" defaultValue={contact.lastName} required className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                  </div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input name="email" type="email" defaultValue={contact.email || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Phone</label><input name="phone" defaultValue={contact.phone || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Secondary phone</label><input name="secondaryPhone" defaultValue={contact.secondaryPhone || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                  </div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Address</label><input name="address" defaultValue={contact.address || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                  <div className="grid grid-cols-3 gap-4">
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">City</label><input name="city" defaultValue={contact.city || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">State</label><input name="state" defaultValue={contact.state || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label><input name="zip" defaultValue={contact.zip || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Status</label><select name="status" defaultValue={contact.status} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">{statusOptions.map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Source</label><select name="source" defaultValue={contact.source || ""} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"><option value="">Select...</option>{sourceOptions.map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}</select></div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setEditing(false)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                    <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
                  </div>
                </form>
              ) : (
                <div className="p-5 grid grid-cols-3 gap-6">
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
          </div>
        )}

        {/* ACTIVITY TAB */}
        {activeTab === "activity" && (
          <div className="max-w-3xl space-y-4">
            {/* Log Interaction */}
            {logOpen ? (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Log Interaction</h3>
                <form onSubmit={handleLogInteraction} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <select name="type" className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"><option value="call">📞 Call</option><option value="email">✉️ Email</option><option value="text">💬 Text</option><option value="meeting">🤝 Meeting</option></select>
                    <input name="subject" required placeholder="Subject (e.g., Follow-up call)" className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <textarea name="body" rows={3} placeholder="Notes about this interaction..." className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setLogOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">Log It</button>
                  </div>
                </form>
              </div>
            ) : (
              <button onClick={() => setLogOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">+ Log Interaction</button>
            )}

            {/* Quick Note */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex gap-3">
                <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2} placeholder="Quick note..." className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                <button onClick={handleAddNote} disabled={noteLoading || !noteText.trim()} className="self-end px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg disabled:opacity-50">{noteLoading ? "..." : "Add Note"}</button>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              {contact.activities.length > 0 ? (
                <div className="space-y-4">
                  {contact.activities.map((a, i) => (
                    <div key={a.id} className={`flex gap-3 pb-4 ${i < contact.activities.length - 1 ? "border-b border-slate-100" : ""}`}>
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-base flex-shrink-0">{activityIcons[a.type] || "📋"}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-900">{a.subject || `${a.type} ${a.direction || ""}`.trim()}</p>
                          <span className="text-xs text-slate-400 ml-3 flex-shrink-0">{fmtFull(a.occurredAt)}</span>
                        </div>
                        {a.body && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{a.body}</p>}
                        {a.user && <p className="text-xs text-slate-400 mt-1">by {a.user.fullName}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-8">No activity recorded yet. Log a call, email, or note above.</p>
              )}
            </div>
          </div>
        )}

        {/* DEALS TAB */}
        {activeTab === "deals" && (
          <div className="max-w-3xl">
            {contact.deals.length > 0 ? (
              <div className="space-y-4">
                {contact.deals.map(d => (
                  <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-slate-900">{d.name || "Untitled deal"}</h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${d.status === "won" ? "bg-emerald-50 text-emerald-700" : d.status === "lost" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>{d.status}</span>
                    </div>
                    {d.property && <p className="text-sm text-slate-500 mt-1">{d.property.address}, {d.property.city}, {d.property.state}</p>}
                    <div className="flex items-center gap-4 mt-3">
                      <span className="text-sm text-slate-600">Pipeline: {d.pipeline.name}</span>
                      {d.dealValue && <span className="text-sm font-medium text-slate-900">${Number(d.dealValue).toLocaleString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                <p className="text-3xl mb-3">💰</p>
                <p className="text-sm text-slate-500">No deals linked to this contact yet.</p>
              </div>
            )}
          </div>
        )}

        {/* TASKS TAB */}
        {activeTab === "tasks" && (
          <div className="max-w-3xl space-y-4">
            {taskOpen ? (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Create Task</h3>
                <form onSubmit={handleCreateTask} className="space-y-3">
                  <input name="title" required placeholder="Task title (e.g., Follow up with preapproval)" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <textarea name="description" rows={2} placeholder="Description (optional)" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  <div className="grid grid-cols-3 gap-3">
                    <select name="type" className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"><option value="follow_up">Follow Up</option><option value="call">Call</option><option value="email">Email</option><option value="showing">Showing</option><option value="document">Document</option><option value="meeting">Meeting</option></select>
                    <select name="priority" className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"><option value="medium">Medium</option><option value="urgent">Urgent</option><option value="high">High</option><option value="low">Low</option></select>
                    <input name="dueAt" type="date" className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setTaskOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">Create Task</button>
                  </div>
                </form>
              </div>
            ) : (
              <button onClick={() => setTaskOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">+ Create Task</button>
            )}
            {contact.tasks.length > 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {contact.tasks.map(t => (
                  <div key={t.id} className="flex items-center gap-4 p-4">
                    <button onClick={() => handleCompleteTask(t.id)} className="w-5 h-5 rounded border-2 border-slate-300 flex-shrink-0 hover:bg-emerald-50 hover:border-emerald-400 transition-colors" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${priorityColors[t.priority]}`}>{t.priority}</span>
                        <span className="text-xs text-slate-400 capitalize">{t.type.replace("_"," ")}</span>
                        {t.dueAt && <span className="text-xs text-slate-400">Due {fmt(t.dueAt)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : !taskOpen ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-3xl mb-3">✅</p>
                <p className="text-sm text-slate-500">No open tasks. Create one above.</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
DOSSIEREOF

echo ""
echo "✅ Contact page upgraded to full dossier!"
echo ""
echo "Refresh http://localhost:3000/contacts and click on a contact to see the new layout."
