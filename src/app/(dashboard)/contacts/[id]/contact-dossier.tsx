"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateContact, addNote, logInteraction, createTask, completeTask, updateTags, deleteContact, updateContactTypeData, findPeopleAtCompany, addPersonAsContact } from "./actions";
import { enrichContact } from "./enrich-actions";
import { sendNewEmail } from "@/app/(dashboard)/messages/actions";
import { CONTACT_TYPE_META } from "@/lib/contact-types";
import type { ContactType } from "@/lib/contact-types";

// ---- TYPES ----
interface Contact {
  id: string; firstName: string; lastName: string; email: string | null; phone: string | null;
  secondaryPhone: string | null; address: string | null; city: string | null; state: string | null;
  zip: string | null; status: string; source: string | null; tags: string[]; qualificationScore: number | null;
  contactType: string; typeData: any;
  notes: string | null; lastContactedAt: Date | null; lastActivityAt: Date | null; totalActivities: number;
  createdAt: Date; updatedAt: Date;
  assignedAgent: { fullName: string; email: string } | null;
  activities: Array<{ id: string; type: string; direction: string | null; subject: string | null; body: string | null; occurredAt: Date; user: { fullName: string } | null }>;
  deals: Array<{ id: string; name: string | null; dealValue: any; status: string; stageId: string; property: { address: string; city: string; state: string } | null; pipeline: { name: string } }>;
  tasks: Array<{ id: string; title: string; type: string; priority: string; status: string; dueAt: Date | null }>;
  showings: Array<{ id: string; scheduledAt: Date; status: string; feedback: string | null; interestLevel: string | null; property: { address: string; city: string; state: string } }>;
  enrichmentProfiles: Array<{ id: string; employer: string | null; jobTitle: string | null; industry: string | null; incomeRangeLow: number | null; incomeRangeHigh: number | null; linkedinUrl: string | null; aiSummary: string | null; aiInsights: any; profilePhotoUrl: string | null; dataSources?: string[]; rawData?: any }>;
  emailMessages?: Array<{ id: string; direction: string; fromEmail: string; fromName: string | null; toEmails: string[]; subject: string | null; snippet: string | null; receivedAt: string; isRead: boolean; leadSource: string | null; aiSummary: string | null; sentimentScore: number | null }>;
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
  const [activeTab, setActiveTab] = useState<"overview" | "details" | "activity" | "deals" | "tasks" | "emails">("overview");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick action states
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<any>(null);
  const [emailComposeOpen, setEmailComposeOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [companyPeople, setCompanyPeople] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [addingPerson, setAddingPerson] = useState<string | null>(null);
  const [addedPeople, setAddedPeople] = useState<Set<string>>(new Set());

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteContact(contact.id);
      router.push("/contacts");
    } catch (err) {
      console.error("Delete error:", err);
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const handleEnrich = async () => {
    setEnriching(true);
    try {
      const result = await enrichContact(contact.id);
      setEnrichResult(result);
      router.refresh();
    } catch (err) { console.error("Enrichment error:", err); }
    setEnriching(false);
  };
  const handleSendEmail = async () => {
    if (!contact.email || !emailSubject) return;
    setEmailSending(true);
    try {
      await sendNewEmail(contact.email, emailSubject, emailBody || "<p></p>", contact.id);
      setEmailComposeOpen(false);
      setEmailSubject("");
      setEmailBody("");
      router.refresh();
    } catch (err) {
      console.error("Send error:", err);
    }
    setEmailSending(false);
  };

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
    { key: "emails", label: `Emails (${contact.emailMessages?.length || 0})`, icon: "📬" },
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
                  {(() => {
                    const typeMeta = CONTACT_TYPE_META[contact.contactType as ContactType] || CONTACT_TYPE_META.renter;
                    return (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${typeMeta.bgColor} ${typeMeta.color}`}>
                        {typeMeta.icon} {typeMeta.label}
                      </span>
                    );
                  })()}
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
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1.5">
                <button onClick={() => { setEditing(true); setActiveTab("details"); }} className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">Edit</button>
                <button onClick={() => setDeleteConfirm(true)} className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">Delete</button>
              </div>
              <div className={`rounded-xl border px-5 py-3 text-center ${scoreColor}`}>
                <p className="text-3xl font-bold">{contact.qualificationScore ?? "—"}</p>
                <p className="text-xs font-medium mt-0.5">{scoreLabel}</p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 mt-4">
            <button onClick={() => { setActiveTab("emails"); setEmailComposeOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">✉️ Email</button>
            <button onClick={() => { setActiveTab("activity"); setLogOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">📞 Log Call</button>
            <button onClick={() => { setActiveTab("activity"); setLogOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">💬 Log Text</button>
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
            {/* AI Lead Intelligence */}
            <div className="col-span-2 space-y-6">
              <div className={"rounded-xl border p-6 " + (
                enrichResult?.grade === "A" ? "bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-300" :
                enrichResult?.grade === "B" ? "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300" :
                enrichResult?.grade === "C" ? "bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-300" :
                "bg-white border-slate-200"
              )}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🧠</span>
                    <h3 className="text-sm font-bold text-slate-900">AI Lead Intelligence</h3>
                    {enrichment?.dataSources && enrichment.dataSources.length > 0 && (
                      <div className="flex gap-1">
                        {enrichment.dataSources.map((s: string, i: number) => (
                          <span key={i} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={handleEnrich} disabled={enriching}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg">
                    {enriching ? "Analyzing..." : enrichment?.rawData ? "Re-verify" : "Verify & Enrich"}
                  </button>
                </div>

                {enrichment?.aiSummary && (
                  <p className="text-sm text-slate-700 leading-relaxed mb-4">{enrichment.aiSummary}</p>
                )}

                {(() => {
                  const data = enrichResult || (enrichment?.rawData && typeof enrichment.rawData === "object" ? enrichment.rawData as any : null);
                  if (!data) return (
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                      <p className="text-sm text-slate-500">Click <strong>Verify & Enrich</strong> to analyze this contact with PDL and NYC property records.</p>
                    </div>
                  );
                  return (
                    <div className="space-y-4">
                      {/* Score */}
                      {data.signals?.length > 0 && (
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className={"text-3xl font-black " + (
                              data.grade === "A" ? "text-emerald-700" : data.grade === "B" ? "text-blue-700" :
                              data.grade === "C" ? "text-amber-700" : "text-slate-500"
                            )}>{data.score || 0}</span>
                            <span className={"text-xl font-black px-2.5 py-1 rounded " + (
                              data.grade === "A" ? "bg-emerald-200 text-emerald-800" : data.grade === "B" ? "bg-blue-200 text-blue-800" :
                              data.grade === "C" ? "bg-amber-200 text-amber-800" : "bg-slate-200 text-slate-600"
                            )}>{data.grade || "?"}</span>
                          </div>
                          <div className="space-y-1">
                            {data.signals.slice(0, 8).map((s: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5">
                                  <span className={s.points >= 10 ? "text-emerald-500" : "text-slate-400"}>{s.points >= 10 ? "🔥" : "✓"}</span>
                                  <span className="text-slate-700 font-medium">{s.label}</span>
                                  <span className="text-slate-400 ml-1">{s.detail}</span>
                                </div>
                                <span className={"font-bold " + (s.points >= 10 ? "text-emerald-600" : "text-slate-500")}>+{s.points}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Merged Contact Info with Source Badges */}
                      {data.merged && (
                        <div className="pt-3 border-t border-slate-200/60">
                          <div className="flex items-center gap-2 mb-2">
                            {data.merged.dataSources?.map((s: string, i: number) => (
                              <span key={i} className={"text-[9px] px-1.5 py-0.5 rounded font-bold " + (
                                s === "Apollo" ? "bg-indigo-100 text-indigo-700" :
                                s === "Apollo_Org" ? "bg-violet-100 text-violet-700" :
                                s === "PDL" ? "bg-blue-100 text-blue-700" :
                                "bg-slate-100 text-slate-600"
                              )}>{s}</span>
                            ))}
                          </div>

                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                            {data.merged.title && (
                              <div><span className="text-slate-400">Title:</span> <span className="text-slate-900 font-medium">{data.merged.title}</span></div>
                            )}
                            {data.merged.company && (
                              <div><span className="text-slate-400">Company:</span> <span className="text-slate-900 font-medium">{data.merged.company}</span></div>
                            )}

                            {/* Emails with source verification */}
                            {data.merged.emails?.length > 0 && (
                              <div className="col-span-2">
                                <span className="text-slate-400">Emails:</span>
                                <div className="mt-1 space-y-1">
                                  {data.merged.emails.slice(0, 3).map((em: string, i: number) => {
                                    const sources = data.merged.emailSources?.[em.toLowerCase()] || [];
                                    const verified = sources.length > 1;
                                    return (
                                      <div key={i} className="flex items-center gap-1.5">
                                        <a href={"mailto:" + em} className="text-blue-600 hover:underline">{em}</a>
                                        {verified && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded font-bold">Verified</span>}
                                        <span className="text-[9px] text-slate-400">{sources.join(" + ")}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Phones with source verification */}
                            {data.merged.phones?.length > 0 && (
                              <div className="col-span-2">
                                <span className="text-slate-400">Phones:</span>
                                <div className="mt-1 space-y-1">
                                  {data.merged.phones.slice(0, 3).map((ph: string, i: number) => {
                                    const clean = ph.replace(/\D/g, "").slice(-10);
                                    const sources = data.merged.phoneSources?.[clean] || [];
                                    const verified = sources.length > 1;
                                    return (
                                      <div key={i} className="flex items-center gap-1.5">
                                        <a href={"tel:" + ph} className={"font-bold hover:underline " + (verified ? "text-emerald-700" : "text-slate-900")}>{ph}</a>
                                        {verified && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded font-bold">Verified</span>}
                                        <span className="text-[9px] text-slate-400">{sources.join(" + ")}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {data.merged.linkedinUrl && (
                              <div className="col-span-2">
                                <a href={data.merged.linkedinUrl.startsWith("http") ? data.merged.linkedinUrl : "https://" + data.merged.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">🔗 LinkedIn Profile</a>
                              </div>
                            )}
                          </div>

                          {/* Company Intel (from Apollo Org) */}
                          {data.merged.companyIndustry && (
                            <div className="mt-3 pt-2 border-t border-slate-100">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1.5">Company Intelligence</p>
                              <div className="flex items-start gap-2">
                                {data.merged.companyLogo && (
                                  <img src={data.merged.companyLogo} alt="" className="w-6 h-6 rounded object-contain border border-slate-200" />
                                )}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs flex-1">
                                  <div><span className="text-slate-400">Industry:</span> <span className="text-slate-700">{data.merged.companyIndustry}</span></div>
                                  {data.merged.companySize && <div><span className="text-slate-400">Size:</span> <span className="text-slate-700">{data.merged.companySize} employees</span></div>}
                                  {data.merged.companyRevenue && <div><span className="text-slate-400">Revenue:</span> <span className="text-slate-700">{data.merged.companyRevenue}</span></div>}
                                  {data.merged.companyWebsite && (
                                    <div><a href={data.merged.companyWebsite.startsWith("http") ? data.merged.companyWebsite : "https://" + data.merged.companyWebsite} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">🌐 Website</a></div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Fallback: show PDL-only data if no merged data */}
                      {!data.merged && data.pdl && (
                        <div className="pt-3 border-t border-slate-200/60">
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">People Data Labs</span>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mt-2">
                            {data.pdl.jobTitle && <div><span className="text-slate-400">Title:</span> <span className="text-slate-900 font-medium">{data.pdl.jobTitle}</span></div>}
                            {data.pdl.jobCompany && <div><span className="text-slate-400">Company:</span> <span className="text-slate-900 font-medium">{data.pdl.jobCompany}</span></div>}
                            {data.pdl.phones?.length > 0 && <div><span className="text-slate-400">Phone:</span> <a href={"tel:" + data.pdl.phones[0]} className="text-emerald-700 font-bold">{data.pdl.phones[0]}</a></div>}
                            {data.pdl.emails?.length > 0 && <div><span className="text-slate-400">Email:</span> <a href={"mailto:" + data.pdl.emails[0]} className="text-blue-600">{data.pdl.emails[0]}</a></div>}
                            {data.pdl.linkedin && <div className="col-span-2"><a href={data.pdl.linkedin.startsWith("http") ? data.pdl.linkedin : "https://" + data.pdl.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">🔗 LinkedIn</a></div>}
                          </div>
                        </div>
                      )}

                      {/* NYC Properties */}
                      {data.nycProperties?.length > 0 && (
                        <div className="pt-3 border-t border-slate-200/60">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">NYC Properties</span>
                            <span className="text-[10px] text-slate-500">{data.nycProperties.length} found</span>
                          </div>
                          <div className="space-y-1">
                            {data.nycProperties.slice(0, 5).map((prop: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs bg-slate-50 rounded p-2">
                                <div>
                                  <span className="font-medium text-slate-900">{prop.address}</span>
                                  <span className="text-slate-400 ml-1">{prop.borough}</span>
                                </div>
                                <span className="text-indigo-700 font-bold">{prop.units} units</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Legacy enrichment fields */}
                {enrichment && !enrichResult && !enrichment.rawData && (
                  <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-slate-100">
                    <InfoField label="Employer" value={enrichment.employer} />
                    <InfoField label="Job Title" value={enrichment.jobTitle} />
                    <InfoField label="Industry" value={enrichment.industry} />
                  </div>
                )}
              </div>

              {/* Type Profile */}
              <TypeProfileCard contact={contact} />

              {/* People at Company — for landlord contacts with a company */}
              {contact.contactType === "landlord" && (() => {
                const typeData = contact.typeData as any;
                const enrichment = contact.enrichmentProfiles[0];
                const entityName = typeData?.entityName
                  || (enrichment?.rawData as any)?.apolloPerson?.company
                  || enrichment?.employer
                  || null;
                if (!entityName) return null;
                return (
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-700">👥 People at {entityName}</h3>
                      <button
                        onClick={async () => {
                          setLoadingPeople(true);
                          try {
                            const result = await findPeopleAtCompany(contact.id);
                            setCompanyPeople(result.people);
                            setCompanyName(result.companyName);
                          } catch (err) { console.error("Find people error:", err); }
                          setLoadingPeople(false);
                        }}
                        disabled={loadingPeople}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-200 disabled:opacity-50 transition-colors"
                      >
                        {loadingPeople ? "Searching..." : companyPeople.length > 0 ? "Refresh" : "Find People"}
                      </button>
                    </div>
                    {loadingPeople && (
                      <div className="flex items-center gap-2 py-4 justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent"></div>
                        <span className="text-xs text-slate-500">Searching Apollo (free)...</span>
                      </div>
                    )}
                    {!loadingPeople && companyPeople.length > 0 && (
                      <div className="space-y-2">
                        {companyPeople.map((person: any, i: number) => (
                          <div key={person.apolloId || i} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
                            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                              {(person.firstName?.[0] || "")}{(person.lastName?.[0] || "")}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">{person.firstName} {person.lastName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {person.title && <span className="text-xs text-slate-500 truncate">{person.title}</span>}
                                {person.seniority && (
                                  <span className={"text-[9px] px-1.5 py-0.5 rounded font-bold " + (
                                    person.seniority === "c_suite" ? "bg-purple-100 text-purple-700" :
                                    person.seniority === "vp" ? "bg-blue-100 text-blue-700" :
                                    person.seniority === "director" ? "bg-cyan-100 text-cyan-700" :
                                    "bg-slate-100 text-slate-600"
                                  )}>{person.seniority.replace("_", " ")}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {person.hasEmail && <span className="text-[9px] text-emerald-600 font-medium">✉️ email</span>}
                                {person.hasPhone && <span className="text-[9px] text-emerald-600 font-medium">📞 phone</span>}
                              </div>
                            </div>
                            {addedPeople.has(person.apolloId) ? (
                              <span className="text-[10px] text-emerald-600 font-bold">Added ✓</span>
                            ) : (
                              <button
                                onClick={async () => {
                                  setAddingPerson(person.apolloId);
                                  try {
                                    await addPersonAsContact(
                                      { firstName: person.firstName, lastName: person.lastName, title: person.title, orgName: person.orgName },
                                      contact.id,
                                    );
                                    setAddedPeople(prev => new Set([...prev, person.apolloId]));
                                  } catch (err) { console.error("Add person error:", err); }
                                  setAddingPerson(null);
                                }}
                                disabled={addingPerson === person.apolloId}
                                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold rounded border border-blue-200 disabled:opacity-50 transition-colors"
                              >
                                {addingPerson === person.apolloId ? "..." : "+ Add"}
                              </button>
                            )}
                          </div>
                        ))}
                        <p className="text-[10px] text-slate-400 text-center mt-1">Apollo People Search (free, no credits used)</p>
                      </div>
                    )}
                    {!loadingPeople && companyPeople.length === 0 && companyName && (
                      <p className="text-xs text-slate-400 text-center py-2">No results yet. Click "Find People" to search.</p>
                    )}
                  </div>
                );
              })()}

              {/* Organization Intelligence — from Apollo Org enrichment */}
              {contact.contactType === "landlord" && (() => {
                const enrichment = contact.enrichmentProfiles[0];
                const orgData = (enrichment?.rawData as any)?.apolloOrg;
                if (!orgData) return null;
                return (
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">🏢</span>
                      <h3 className="text-sm font-semibold text-slate-700">Organization Intelligence</h3>
                      <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold">Apollo</span>
                    </div>
                    <div className="flex items-start gap-3">
                      {orgData.logoUrl && (
                        <img src={orgData.logoUrl} alt="" className="w-10 h-10 rounded-lg object-contain border border-slate-200 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-slate-900">{orgData.name}</p>
                        {orgData.shortDescription && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{orgData.shortDescription}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                      {orgData.industry && (
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <p className="text-[10px] text-slate-400 uppercase">Industry</p>
                          <p className="text-xs font-medium text-slate-900 mt-0.5">{orgData.industry}</p>
                        </div>
                      )}
                      {orgData.employeeCount && (
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <p className="text-[10px] text-slate-400 uppercase">Employees</p>
                          <p className="text-xs font-medium text-slate-900 mt-0.5">{orgData.employeeCount.toLocaleString()}</p>
                        </div>
                      )}
                      {orgData.revenue && (
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <p className="text-[10px] text-slate-400 uppercase">Revenue</p>
                          <p className="text-xs font-medium text-slate-900 mt-0.5">{orgData.revenue}</p>
                        </div>
                      )}
                      {orgData.foundedYear && (
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <p className="text-[10px] text-slate-400 uppercase">Founded</p>
                          <p className="text-xs font-medium text-slate-900 mt-0.5">{orgData.foundedYear}</p>
                        </div>
                      )}
                      {orgData.phone && (
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <p className="text-[10px] text-slate-400 uppercase">Phone</p>
                          <a href={"tel:" + orgData.phone} className="text-xs font-medium text-blue-600 mt-0.5 hover:underline">{orgData.phone}</a>
                        </div>
                      )}
                      {orgData.website && (
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <p className="text-[10px] text-slate-400 uppercase">Website</p>
                          <a href={orgData.website.startsWith("http") ? orgData.website : "https://" + orgData.website} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-blue-600 mt-0.5 hover:underline truncate block">{orgData.website.replace(/^https?:\/\//, "")}</a>
                        </div>
                      )}
                    </div>
                    {orgData.address && (
                      <p className="text-xs text-slate-500 mt-2">📍 {orgData.address}{orgData.city ? `, ${orgData.city}` : ""}{orgData.state ? `, ${orgData.state}` : ""}</p>
                    )}
                    {orgData.linkedinUrl && (
                      <a href={orgData.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">🔗 LinkedIn</a>
                    )}
                  </div>
                );
              })()}

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

        {/* EMAILS TAB */}
        {activeTab === "emails" && (
          <div className="max-w-3xl space-y-4">
            {/* Compose */}
            {contact.email && (
              emailComposeOpen ? (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Send Email to {contact.firstName}</h3>
                  <div className="space-y-3">
                    <div className="text-xs text-slate-400">To: {contact.email}</div>
                    <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="Write your message..."
                      rows={6}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    <div className="flex gap-2">
                      <button onClick={() => setEmailComposeOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                      <button onClick={handleSendEmail} disabled={emailSending || !emailSubject}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                        {emailSending ? "Sending..." : "Send Email"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button onClick={() => setEmailComposeOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
                  ✉️ Compose Email
                </button>
              )
            )}

            {/* Email List */}
            {contact.emailMessages && contact.emailMessages.length > 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {contact.emailMessages.map(email => (
                  <div key={email.id} className={`p-4 ${!email.isRead ? "bg-blue-50/30" : ""}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${email.direction === "outbound" ? "text-blue-600" : "text-slate-700"}`}>
                          {email.direction === "outbound" ? "Sent" : (email.fromName || email.fromEmail)}
                        </span>
                        {email.leadSource && email.leadSource !== "unknown" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">{email.leadSource}</span>
                        )}
                        {email.sentimentScore && email.sentimentScore >= 4 && (
                          <span className="text-[10px] font-bold text-red-600">Urgent</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">{fmtFull(email.receivedAt)}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-900">{email.subject || "(no subject)"}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{email.snippet}</p>
                    {email.aiSummary && <p className="text-xs text-slate-400 mt-1 italic">AI: {email.aiSummary}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-3xl mb-3">📬</p>
                <p className="text-sm text-slate-500">No emails linked to this contact.</p>
                <p className="text-xs text-slate-400 mt-1">
                  <Link href="/messages" className="text-blue-600 hover:underline">Sync Gmail</Link> to see email history.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Contact</h3>
            <p className="text-sm text-slate-600 mb-1">
              Are you sure you want to delete <strong>{contact.firstName} {contact.lastName}</strong>?
            </p>
            <p className="text-xs text-slate-400 mb-5">This will remove the contact and unlink all associated emails. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(false)} disabled={deleting} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                {deleting ? "Deleting..." : "Delete Contact"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Type Profile Card ──

function TypeProfileCard({ contact }: { contact: Contact }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localData, setLocalData] = useState<Record<string, any>>(contact.typeData || {});
  const router = useRouter();
  const typeMeta = CONTACT_TYPE_META[contact.contactType as ContactType] || CONTACT_TYPE_META.renter;

  const update = (key: string, value: any) => setLocalData(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(localData)) {
      if (v !== "" && v !== undefined && v !== null) cleaned[k] = v;
    }
    await updateContactTypeData(contact.id, Object.keys(cleaned).length > 0 ? cleaned : null);
    setEditing(false);
    setSaving(false);
    router.refresh();
  };

  const data = contact.typeData || {};
  const inputCls = "w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const selectCls = `${inputCls} bg-white`;
  const valCls = "text-sm text-slate-900";
  const lblCls = "text-xs font-medium text-slate-400 uppercase tracking-wider";

  return (
    <div className={`rounded-xl border p-5 ${typeMeta.bgColor} border-slate-200`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeMeta.icon}</span>
          <h3 className={`text-sm font-bold ${typeMeta.color}`}>{typeMeta.label} Profile</h3>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); setLocalData(contact.typeData || {}); }} className="px-3 py-1 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-white/60">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "..." : "Save"}</button>
          </div>
        ) : (
          <button onClick={() => { setEditing(true); setLocalData(contact.typeData || {}); }} className="text-xs text-blue-600 font-medium hover:text-blue-700">Edit</button>
        )}
      </div>

      {contact.contactType === "landlord" && (
        editing ? (
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lblCls}>Entity Name</label><input className={inputCls} value={localData.entityName || ""} onChange={e => update("entityName", e.target.value)} placeholder="Smith Holdings LLC" /></div>
            <div><label className={lblCls}>Entity Type</label>
              <select className={selectCls} value={localData.entityType || ""} onChange={e => update("entityType", e.target.value)}>
                <option value="">Select...</option><option value="individual">Individual</option><option value="llc">LLC</option><option value="corp">Corporation</option><option value="trust">Trust</option>
              </select>
            </div>
            <div><label className={lblCls}>Role</label>
              <select className={selectCls} value={localData.role || ""} onChange={e => update("role", e.target.value)}>
                <option value="">Select...</option><option value="Owner">Owner</option><option value="Manager">Manager</option><option value="Agent">Agent</option><option value="Super">Super</option><option value="Principal">Principal</option>
              </select>
            </div>
            <div><label className={lblCls}>Portfolio Size</label><input type="number" className={inputCls} value={localData.portfolioSize || ""} onChange={e => update("portfolioSize", e.target.value ? Number(e.target.value) : undefined)} placeholder="# buildings" /></div>
            <div><label className={lblCls}>Total Units</label><input type="number" className={inputCls} value={localData.totalUnits || ""} onChange={e => update("totalUnits", e.target.value ? Number(e.target.value) : undefined)} /></div>
            <div><label className={lblCls}>Preferred Contact</label>
              <select className={selectCls} value={localData.preferredContact || ""} onChange={e => update("preferredContact", e.target.value)}>
                <option value="">Select...</option><option value="phone">Phone</option><option value="email">Email</option><option value="in-person">In-Person</option><option value="mail">Mail</option>
              </select>
            </div>
            <div className="col-span-2"><label className={lblCls}>Mailing Address</label><input className={inputCls} value={localData.mailingAddress || ""} onChange={e => update("mailingAddress", e.target.value)} /></div>
            <div><label className={lblCls}>Exclusive Status</label>
              <select className={selectCls} value={localData.exclusiveStatus || ""} onChange={e => update("exclusiveStatus", e.target.value)}>
                <option value="">None</option><option value="verbal">Verbal</option><option value="written">Written</option><option value="expired">Expired</option>
              </select>
            </div>
            <div><label className={lblCls}>Decision Maker?</label>
              <select className={selectCls} value={localData.decisionMaker === true ? "yes" : localData.decisionMaker === false ? "no" : ""} onChange={e => update("decisionMaker", e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}>
                <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </div>
            <div><label className={lblCls}>Commission Terms</label><input className={inputCls} value={localData.commissionTerms || ""} onChange={e => update("commissionTerms", e.target.value)} /></div>
            <div><label className={lblCls}>Management Co.</label><input className={inputCls} value={localData.managementCompany || ""} onChange={e => update("managementCompany", e.target.value)} /></div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            {data.entityName && <div><p className={lblCls}>Entity</p><p className={valCls}>{data.entityName}</p></div>}
            {data.entityType && <div><p className={lblCls}>Type</p><p className={`${valCls} capitalize`}>{data.entityType}</p></div>}
            {data.role && <div><p className={lblCls}>Role</p><p className={valCls}>{data.role}</p></div>}
            {data.portfolioSize && <div><p className={lblCls}>Portfolio</p><p className={valCls}>{data.portfolioSize} buildings</p></div>}
            {data.totalUnits && <div><p className={lblCls}>Total Units</p><p className={valCls}>{data.totalUnits}</p></div>}
            {data.preferredContact && <div><p className={lblCls}>Preferred Contact</p><p className={`${valCls} capitalize`}>{data.preferredContact}</p></div>}
            {data.mailingAddress && <div className="col-span-2"><p className={lblCls}>Mailing Address</p><p className={valCls}>{data.mailingAddress}</p></div>}
            {data.managementCompany && <div><p className={lblCls}>Management Co.</p><p className={valCls}>{data.managementCompany}</p></div>}
            {data.exclusiveStatus && data.exclusiveStatus !== "none" && (
              <div><p className={lblCls}>Exclusive</p><p className={`${valCls} capitalize font-medium ${data.exclusiveStatus === "written" ? "text-emerald-700" : data.exclusiveStatus === "verbal" ? "text-amber-700" : "text-slate-500"}`}>{data.exclusiveStatus}</p></div>
            )}
            {data.decisionMaker !== undefined && <div><p className={lblCls}>Decision Maker</p><p className={valCls}>{data.decisionMaker ? "Yes" : "No"}</p></div>}
            {data.commissionTerms && <div><p className={lblCls}>Commission</p><p className={valCls}>{data.commissionTerms}</p></div>}
            {data.distressScore !== undefined && <div><p className={lblCls}>Distress Score</p><p className={`${valCls} font-bold ${data.distressScore >= 70 ? "text-red-600" : data.distressScore >= 40 ? "text-amber-600" : "text-emerald-600"}`}>{data.distressScore}/100</p></div>}
            {data.violationCount !== undefined && <div><p className={lblCls}>Violations</p><p className={`${valCls} ${data.violationCount > 0 ? "text-red-600 font-medium" : ""}`}>{data.violationCount}</p></div>}
            {!Object.keys(data).length && <p className="text-sm text-slate-400 col-span-3">No landlord details yet. Click Edit to add.</p>}
          </div>
        )
      )}

      {contact.contactType === "buyer" && (
        editing ? (
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lblCls}>Buyer Type</label>
              <select className={selectCls} value={localData.buyerType || ""} onChange={e => update("buyerType", e.target.value)}>
                <option value="">Select...</option><option value="first-time">First-Time</option><option value="investor">Investor</option><option value="upgrade">Upgrade</option><option value="downsize">Downsize</option><option value="pied-a-terre">Pied-a-terre</option>
              </select>
            </div>
            <div><label className={lblCls}>Property Type</label>
              <select className={selectCls} value={localData.propertyType || ""} onChange={e => update("propertyType", e.target.value)}>
                <option value="">Select...</option><option value="Condo">Condo</option><option value="Co-op">Co-op</option><option value="Townhouse">Townhouse</option><option value="Multi-family">Multi-family</option><option value="Land">Land</option>
              </select>
            </div>
            <div><label className={lblCls}>Budget Min ($)</label><input type="number" className={inputCls} value={localData.budgetMin || ""} onChange={e => update("budgetMin", e.target.value ? Number(e.target.value) : undefined)} /></div>
            <div><label className={lblCls}>Budget Max ($)</label><input type="number" className={inputCls} value={localData.budgetMax || ""} onChange={e => update("budgetMax", e.target.value ? Number(e.target.value) : undefined)} /></div>
            <div><label className={lblCls}>Bedrooms (min)</label><input type="number" className={inputCls} value={localData.bedroomsMin || ""} onChange={e => update("bedroomsMin", e.target.value ? Number(e.target.value) : undefined)} /></div>
            <div><label className={lblCls}>Bedrooms (max)</label><input type="number" className={inputCls} value={localData.bedroomsMax || ""} onChange={e => update("bedroomsMax", e.target.value ? Number(e.target.value) : undefined)} /></div>
            <div><label className={lblCls}>Pre-Approved?</label>
              <select className={selectCls} value={localData.preApproved === true ? "yes" : localData.preApproved === false ? "no" : ""} onChange={e => update("preApproved", e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}>
                <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </div>
            <div><label className={lblCls}>Cash Buyer?</label>
              <select className={selectCls} value={localData.cashBuyer === true ? "yes" : localData.cashBuyer === false ? "no" : ""} onChange={e => update("cashBuyer", e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}>
                <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </div>
            <div className="col-span-2"><label className={lblCls}>Target Neighborhoods</label><input className={inputCls} value={localData.targetNeighborhoods?.join(", ") || ""} onChange={e => update("targetNeighborhoods", e.target.value ? e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined)} placeholder="Upper West Side, Park Slope" /></div>
            <div><label className={lblCls}>Move Timeline</label>
              <select className={selectCls} value={localData.moveTimeline || ""} onChange={e => update("moveTimeline", e.target.value)}>
                <option value="">Select...</option><option value="Immediately">Immediately</option><option value="1-3 months">1-3 months</option><option value="3-6 months">3-6 months</option><option value="6-12 months">6-12 months</option><option value="Flexible">Flexible</option>
              </select>
            </div>
            <div><label className={lblCls}>Reason for Buying</label>
              <select className={selectCls} value={localData.reasonForBuying || ""} onChange={e => update("reasonForBuying", e.target.value)}>
                <option value="">Select...</option><option value="Investment">Investment</option><option value="Primary residence">Primary Residence</option><option value="Rental income">Rental Income</option><option value="Flip">Flip</option>
              </select>
            </div>
            {localData.preApproved && <div><label className={lblCls}>Pre-Approval Amt ($)</label><input type="number" className={inputCls} value={localData.preApprovalAmount || ""} onChange={e => update("preApprovalAmount", e.target.value ? Number(e.target.value) : undefined)} /></div>}
            {localData.preApproved && <div><label className={lblCls}>Lender</label><input className={inputCls} value={localData.lender || ""} onChange={e => update("lender", e.target.value)} /></div>}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            {data.buyerType && <div><p className={lblCls}>Buyer Type</p><p className={`${valCls} capitalize`}>{data.buyerType.replace("-", " ")}</p></div>}
            {data.propertyType && <div><p className={lblCls}>Property Type</p><p className={valCls}>{data.propertyType}</p></div>}
            {(data.budgetMin || data.budgetMax) && (
              <div><p className={lblCls}>Budget</p><p className={valCls}>{data.budgetMin ? `$${Number(data.budgetMin).toLocaleString()}` : "?"} – {data.budgetMax ? `$${Number(data.budgetMax).toLocaleString()}` : "?"}</p></div>
            )}
            {(data.bedroomsMin || data.bedroomsMax) && <div><p className={lblCls}>Bedrooms</p><p className={valCls}>{data.bedroomsMin || "?"} – {data.bedroomsMax || "?"}</p></div>}
            {data.preApproved !== undefined && <div><p className={lblCls}>Pre-Approved</p><p className={`${valCls} font-medium ${data.preApproved ? "text-emerald-700" : "text-slate-500"}`}>{data.preApproved ? "Yes" : "No"}{data.preApprovalAmount ? ` ($${Number(data.preApprovalAmount).toLocaleString()})` : ""}</p></div>}
            {data.cashBuyer && <div><p className={lblCls}>Cash Buyer</p><p className={`${valCls} font-medium text-emerald-700`}>Yes</p></div>}
            {data.targetNeighborhoods?.length > 0 && <div className="col-span-2"><p className={lblCls}>Target Areas</p><p className={valCls}>{data.targetNeighborhoods.join(", ")}</p></div>}
            {data.moveTimeline && <div><p className={lblCls}>Timeline</p><p className={valCls}>{data.moveTimeline}</p></div>}
            {data.reasonForBuying && <div><p className={lblCls}>Reason</p><p className={valCls}>{data.reasonForBuying}</p></div>}
            {data.lender && <div><p className={lblCls}>Lender</p><p className={valCls}>{data.lender}</p></div>}
            {!Object.keys(data).length && <p className="text-sm text-slate-400 col-span-3">No buyer details yet. Click Edit to add.</p>}
          </div>
        )
      )}

      {contact.contactType === "seller" && (
        editing ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className={lblCls}>Property Address</label><input className={inputCls} value={localData.propertyAddress || ""} onChange={e => update("propertyAddress", e.target.value)} placeholder="123 Broadway, Apt 4A" /></div>
            <div><label className={lblCls}>Property Type</label>
              <select className={selectCls} value={localData.propertyType || ""} onChange={e => update("propertyType", e.target.value)}>
                <option value="">Select...</option><option value="Condo">Condo</option><option value="Co-op">Co-op</option><option value="Townhouse">Townhouse</option><option value="Multi-family">Multi-family</option><option value="Land">Land</option>
              </select>
            </div>
            <div><label className={lblCls}>Condition</label>
              <select className={selectCls} value={localData.condition || ""} onChange={e => update("condition", e.target.value)}>
                <option value="">Select...</option><option value="Excellent">Excellent</option><option value="Good">Good</option><option value="Fair">Fair</option><option value="Needs work">Needs Work</option><option value="Gut renovation">Gut Renovation</option>
              </select>
            </div>
            <div><label className={lblCls}>Asking Price ($)</label><input type="number" className={inputCls} value={localData.askingPrice || ""} onChange={e => update("askingPrice", e.target.value ? Number(e.target.value) : undefined)} /></div>
            <div><label className={lblCls}>Mortgage Balance ($)</label><input type="number" className={inputCls} value={localData.mortgageBalance || ""} onChange={e => update("mortgageBalance", e.target.value ? Number(e.target.value) : undefined)} /></div>
            <div><label className={lblCls}>Reason for Selling</label>
              <select className={selectCls} value={localData.reasonForSelling || ""} onChange={e => update("reasonForSelling", e.target.value)}>
                <option value="">Select...</option><option value="Relocating">Relocating</option><option value="Downsizing">Downsizing</option><option value="Divorce">Divorce</option><option value="Estate">Estate</option><option value="Investment exit">Investment Exit</option><option value="Distress">Distress</option>
              </select>
            </div>
            <div><label className={lblCls}>Sell Timeline</label>
              <select className={selectCls} value={localData.sellTimeline || ""} onChange={e => update("sellTimeline", e.target.value)}>
                <option value="">Select...</option><option value="ASAP">ASAP</option><option value="1-3 months">1-3 months</option><option value="3-6 months">3-6 months</option><option value="Flexible">Flexible</option><option value="Testing the market">Testing the Market</option>
              </select>
            </div>
            <div><label className={lblCls}>Owner Occupied?</label>
              <select className={selectCls} value={localData.ownerOccupied === true ? "yes" : localData.ownerOccupied === false ? "no" : ""} onChange={e => update("ownerOccupied", e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}>
                <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No (Tenant-Occupied)</option>
              </select>
            </div>
            <div><label className={lblCls}>Tenant Situation</label><input className={inputCls} value={localData.tenantSituation || ""} onChange={e => update("tenantSituation", e.target.value)} placeholder="Vacant, Month-to-month..." /></div>
            <div><label className={lblCls}>Exclusive Agreement?</label>
              <select className={selectCls} value={localData.exclusiveAgreement === true ? "yes" : localData.exclusiveAgreement === false ? "no" : ""} onChange={e => update("exclusiveAgreement", e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}>
                <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </div>
            <div><label className={lblCls}>Commission (%)</label><input type="number" step="0.5" className={inputCls} value={localData.commissionRate || ""} onChange={e => update("commissionRate", e.target.value ? Number(e.target.value) : undefined)} /></div>
            <div><label className={lblCls}>Co-Broke (%)</label><input type="number" step="0.5" className={inputCls} value={localData.cobrokeRate || ""} onChange={e => update("cobrokeRate", e.target.value ? Number(e.target.value) : undefined)} /></div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            {data.propertyAddress && <div className="col-span-2"><p className={lblCls}>Property</p><p className={valCls}>{data.propertyAddress}</p></div>}
            {data.propertyType && <div><p className={lblCls}>Type</p><p className={valCls}>{data.propertyType}</p></div>}
            {data.askingPrice && <div><p className={lblCls}>Asking Price</p><p className={`${valCls} font-medium`}>${Number(data.askingPrice).toLocaleString()}</p></div>}
            {data.mortgageBalance && <div><p className={lblCls}>Mortgage</p><p className={valCls}>${Number(data.mortgageBalance).toLocaleString()}</p></div>}
            {data.askingPrice && data.mortgageBalance && <div><p className={lblCls}>Est. Equity</p><p className={`${valCls} font-medium ${(data.askingPrice - data.mortgageBalance) > 0 ? "text-emerald-700" : "text-red-600"}`}>${(data.askingPrice - data.mortgageBalance).toLocaleString()}</p></div>}
            {data.condition && <div><p className={lblCls}>Condition</p><p className={valCls}>{data.condition}</p></div>}
            {data.reasonForSelling && <div><p className={lblCls}>Reason</p><p className={valCls}>{data.reasonForSelling}</p></div>}
            {data.sellTimeline && <div><p className={lblCls}>Timeline</p><p className={`${valCls} ${data.sellTimeline === "ASAP" ? "text-red-600 font-medium" : ""}`}>{data.sellTimeline}</p></div>}
            {data.ownerOccupied !== undefined && <div><p className={lblCls}>Owner Occupied</p><p className={valCls}>{data.ownerOccupied ? "Yes" : "No"}</p></div>}
            {data.tenantSituation && <div><p className={lblCls}>Tenants</p><p className={valCls}>{data.tenantSituation}</p></div>}
            {data.exclusiveAgreement !== undefined && <div><p className={lblCls}>Exclusive</p><p className={`${valCls} font-medium ${data.exclusiveAgreement ? "text-emerald-700" : "text-slate-500"}`}>{data.exclusiveAgreement ? "Yes" : "No"}</p></div>}
            {data.commissionRate && <div><p className={lblCls}>Commission</p><p className={valCls}>{data.commissionRate}%{data.cobrokeRate ? ` (${data.cobrokeRate}% co-broke)` : ""}</p></div>}
            {data.listingStatus && <div><p className={lblCls}>Listing</p><p className={valCls}>{data.listingStatus}</p></div>}
            {!Object.keys(data).length && <p className="text-sm text-slate-400 col-span-3">No seller details yet. Click Edit to add.</p>}
          </div>
        )
      )}

      {contact.contactType === "renter" && (
        editing ? (
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lblCls}>Budget Min ($/mo)</label><input type="number" className={inputCls} value={localData.budgetMin || ""} onChange={e => update("budgetMin", e.target.value ? Number(e.target.value) : undefined)} /></div>
            <div><label className={lblCls}>Budget Max ($/mo)</label><input type="number" className={inputCls} value={localData.budgetMax || ""} onChange={e => update("budgetMax", e.target.value ? Number(e.target.value) : undefined)} /></div>
            <div><label className={lblCls}>Bedrooms</label>
              <select className={selectCls} value={localData.bedrooms || ""} onChange={e => update("bedrooms", e.target.value)}>
                <option value="">Select...</option><option value="Studio">Studio</option><option value="1BR">1BR</option><option value="2BR">2BR</option><option value="3BR">3BR</option><option value="4BR+">4BR+</option>
              </select>
            </div>
            <div><label className={lblCls}>Move-In Date</label><input type="date" className={inputCls} value={localData.moveInDate || ""} onChange={e => update("moveInDate", e.target.value)} /></div>
            <div className="col-span-2"><label className={lblCls}>Target Neighborhoods</label><input className={inputCls} value={localData.targetNeighborhoods?.join(", ") || ""} onChange={e => update("targetNeighborhoods", e.target.value ? e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined)} placeholder="East Village, LES, Williamsburg" /></div>
            <div><label className={lblCls}>Annual Income ($)</label><input type="number" className={inputCls} value={localData.annualIncome || ""} onChange={e => update("annualIncome", e.target.value ? Number(e.target.value) : undefined)} /></div>
            <div><label className={lblCls}>Credit Score</label>
              <select className={selectCls} value={localData.creditScore || ""} onChange={e => update("creditScore", e.target.value)}>
                <option value="">Unknown</option><option value="Excellent (750+)">Excellent (750+)</option><option value="Good (700-749)">Good (700-749)</option><option value="Fair (650-699)">Fair (650-699)</option><option value="Poor (<650)">Poor (&lt;650)</option>
              </select>
            </div>
            <div><label className={lblCls}>Employment</label>
              <select className={selectCls} value={localData.employmentStatus || ""} onChange={e => update("employmentStatus", e.target.value)}>
                <option value="">Select...</option><option value="Employed">Employed</option><option value="Self-employed">Self-Employed</option><option value="Student">Student</option><option value="Retired">Retired</option>
              </select>
            </div>
            <div><label className={lblCls}>Employer</label><input className={inputCls} value={localData.employer || ""} onChange={e => update("employer", e.target.value)} /></div>
            <div><label className={lblCls}>Guarantor</label>
              <select className={selectCls} value={localData.guarantor || ""} onChange={e => update("guarantor", e.target.value)}>
                <option value="">Select...</option><option value="Not needed">Not Needed</option><option value="Has guarantor">Has Guarantor</option><option value="Using service">Using Service</option><option value="Needs one">Needs One</option>
              </select>
            </div>
            <div><label className={lblCls}>Pets</label><input className={inputCls} value={localData.pets || ""} onChange={e => update("pets", e.target.value)} placeholder="Dog (small), Cat" /></div>
            <div><label className={lblCls}>Broker Fee OK?</label>
              <select className={selectCls} value={localData.brokerFee === true ? "yes" : localData.brokerFee === false ? "no" : ""} onChange={e => update("brokerFee", e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}>
                <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No (Owner-Pay Only)</option>
              </select>
            </div>
            <div><label className={lblCls}>Urgency</label>
              <select className={selectCls} value={localData.urgency || ""} onChange={e => update("urgency", e.target.value)}>
                <option value="">Select...</option><option value="Immediate">Immediate</option><option value="Soon">Soon (1-2 months)</option><option value="Flexible">Flexible</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            {(data.budgetMin || data.budgetMax) && <div><p className={lblCls}>Budget</p><p className={valCls}>{data.budgetMin ? `$${Number(data.budgetMin).toLocaleString()}` : "?"} – {data.budgetMax ? `$${Number(data.budgetMax).toLocaleString()}` : "?"}/mo</p></div>}
            {data.bedrooms && <div><p className={lblCls}>Bedrooms</p><p className={valCls}>{data.bedrooms}</p></div>}
            {data.moveInDate && <div><p className={lblCls}>Move-In</p><p className={valCls}>{new Date(data.moveInDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p></div>}
            {data.targetNeighborhoods?.length > 0 && <div className="col-span-2"><p className={lblCls}>Target Areas</p><p className={valCls}>{data.targetNeighborhoods.join(", ")}</p></div>}
            {data.annualIncome && (
              <div><p className={lblCls}>Income</p><p className={valCls}>${Number(data.annualIncome).toLocaleString()}/yr
                {data.budgetMax && <span className={`ml-1 text-xs ${data.annualIncome >= data.budgetMax * 40 ? "text-emerald-600" : "text-red-600"}`}>({data.annualIncome >= data.budgetMax * 40 ? "passes" : "fails"} 40x)</span>}
              </p></div>
            )}
            {data.creditScore && <div><p className={lblCls}>Credit</p><p className={valCls}>{data.creditScore}</p></div>}
            {data.employmentStatus && <div><p className={lblCls}>Employment</p><p className={valCls}>{data.employmentStatus}{data.employer ? ` at ${data.employer}` : ""}</p></div>}
            {data.guarantor && <div><p className={lblCls}>Guarantor</p><p className={valCls}>{data.guarantor}</p></div>}
            {data.pets && <div><p className={lblCls}>Pets</p><p className={valCls}>{data.pets}</p></div>}
            {data.brokerFee !== undefined && <div><p className={lblCls}>Broker Fee</p><p className={`${valCls} ${data.brokerFee ? "text-emerald-700" : "text-red-600"} font-medium`}>{data.brokerFee ? "Yes" : "No"}</p></div>}
            {data.urgency && <div><p className={lblCls}>Urgency</p><p className={`${valCls} ${data.urgency === "Immediate" ? "text-red-600 font-medium" : ""}`}>{data.urgency}</p></div>}
            {!Object.keys(data).length && <p className="text-sm text-slate-400 col-span-3">No renter details yet. Click Edit to add.</p>}
          </div>
        )
      )}
    </div>
  );
}
