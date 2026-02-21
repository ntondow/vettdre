"use client";

import { useState } from "react";
import Link from "next/link";
import type { CRMContext } from "../crm-actions";

const statusColors: Record<string, string> = {
  lead: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700",
  client: "bg-purple-100 text-purple-700",
  past_client: "bg-slate-100 text-slate-600",
  archived: "bg-slate-100 text-slate-400",
};

const engagementColors: Record<string, string> = {
  High: "text-emerald-600 bg-emerald-50",
  Medium: "text-amber-600 bg-amber-50",
  Low: "text-slate-500 bg-slate-50",
  None: "text-slate-400 bg-slate-50",
};

const fmtDate = (d: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(d));
const fmtMoney = (v: string) => {
  const n = parseFloat(v);
  return n >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
};

function getAvatarColor(name: string): string {
  const first = (name || "?")[0].toUpperCase();
  const code = first.charCodeAt(0);
  if (code <= 69) return "bg-blue-500";
  if (code <= 74) return "bg-emerald-500";
  if (code <= 79) return "bg-amber-500";
  if (code <= 84) return "bg-purple-500";
  return "bg-rose-500";
}

function CollapsibleSection({ title, count, defaultOpen = true, children }: {
  title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {title} {count !== undefined && <span className="text-slate-400">({count})</span>}
        </span>
        <span className={`text-slate-400 text-xs transition-transform ${open ? "rotate-180" : ""}`}>&#9660;</span>
      </button>
      <div className={`overflow-hidden transition-all duration-200 ${open ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="px-3 pb-3">{children}</div>
      </div>
    </div>
  );
}

export default function CRMSidebar({
  context, loading, senderEmail, senderName, onCreateLead, onCreateContact,
}: {
  context: CRMContext | null; loading: boolean; senderEmail: string | null; senderName: string | null;
  onCreateLead: () => void; onCreateContact: () => void;
}) {
  if (loading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-slate-100 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-100 rounded w-3/4" />
            <div className="h-3 bg-slate-100 rounded w-1/2" />
          </div>
        </div>
        <div className="h-8 bg-slate-100 rounded" />
        <div className="space-y-2">
          <div className="h-3 bg-slate-100 rounded w-full" />
          <div className="h-3 bg-slate-100 rounded w-2/3" />
        </div>
        <div className="h-20 bg-slate-100 rounded" />
      </div>
    );
  }

  if (!context) {
    return (
      <div className="p-4">
        <div className="text-center py-8">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto ${getAvatarColor(senderName || senderEmail || "?")}`}>
            {(senderName || senderEmail || "?")[0].toUpperCase()}
          </div>
          <p className="text-sm font-semibold text-slate-700 mt-3">{senderName || "Unknown Sender"}</p>
          <p className="text-xs text-slate-400 mt-0.5">{senderEmail || "No email"}</p>
          <p className="text-[10px] text-slate-400 mt-1">Not in your contacts</p>
          <div className="mt-4 space-y-2">
            <button onClick={onCreateLead}
              className="w-full px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors">
              Create Lead
            </button>
            <button onClick={onCreateContact}
              className="w-full px-3 py-2 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
              Create Contact
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { contact, enrichment, deals, activities, tasks, followUps, engagementScore } = context;
  if (!contact) return null;

  const fullName = `${contact.firstName} ${contact.lastName}`.trim();
  const initial = (fullName || "?")[0].toUpperCase();

  return (
    <div className="divide-y divide-slate-100">
      {/* Contact Card */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {enrichment?.profilePhotoUrl ? (
            <img src={enrichment.profilePhotoUrl} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-white shadow" />
          ) : (
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold shadow ${getAvatarColor(fullName)}`}>
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <Link href={`/contacts/${contact.id}`} className="font-bold text-slate-900 hover:text-blue-600 text-sm block truncate transition-colors">
              {fullName}
            </Link>
            {enrichment?.jobTitle && (
              <p className="text-xs text-slate-500 truncate">{enrichment.jobTitle}{enrichment.employer ? ` @ ${enrichment.employer}` : ""}</p>
            )}
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${statusColors[contact.status] || "bg-slate-100 text-slate-500"}`}>
                {contact.status.replace("_", " ")}
              </span>
              {contact.qualificationScore !== null && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700">
                  Score: {contact.qualificationScore}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Engagement badge */}
        <div className={`mt-3 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between ${engagementColors[engagementScore.level]}`}>
          <span>Engagement: {engagementScore.level}</span>
          <span>{engagementScore.total}/100</span>
        </div>

        {/* Contact details */}
        <div className="mt-3 space-y-1 text-xs text-slate-500">
          {contact.email && (
            <p className="truncate flex items-center gap-1.5">
              <span className="text-slate-400">📧</span> {contact.email}
            </p>
          )}
          {contact.phone && (
            <p className="flex items-center gap-1.5">
              <span className="text-slate-400">📞</span>
              <a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline">{contact.phone}</a>
            </p>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1 mt-3">
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex-1 py-1.5 text-center text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded transition-colors" title="Call">
              📞 Call
            </a>
          )}
          <Link href={`/contacts/${contact.id}`} className="flex-1 py-1.5 text-center text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded transition-colors" title="View">
            👤 View
          </Link>
        </div>

        {enrichment?.linkedinUrl && (
          <a href={enrichment.linkedinUrl} target="_blank" rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline">
            🔗 LinkedIn Profile
          </a>
        )}
      </div>

      {/* Deals */}
      <CollapsibleSection title="Deals" count={deals.length}>
        {deals.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No deals yet — <Link href="/pipeline" className="text-blue-600 hover:underline">Create Deal</Link></p>
        ) : (
          <div className="space-y-1.5">
            {deals.map(d => (
              <Link key={d.id} href="/pipeline"
                className="block bg-slate-50 rounded-lg border border-slate-100 px-2.5 py-2 hover:bg-slate-100 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 truncate">{d.name || "Untitled Deal"}</span>
                  <span className={`text-[10px] font-bold ${d.status === "won" ? "text-emerald-600" : d.status === "lost" ? "text-red-500" : "text-blue-600"}`}>
                    {d.status.toUpperCase()}
                  </span>
                </div>
                {d.dealValue && <p className="text-[10px] text-slate-400 mt-0.5">{fmtMoney(d.dealValue)}</p>}
              </Link>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Activity */}
      <CollapsibleSection title="Activity" count={activities.length}>
        {activities.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No activity recorded</p>
        ) : (
          <div className="space-y-1">
            {activities.slice(0, 5).map(a => (
              <div key={a.id} className="flex items-center gap-2 text-xs py-0.5">
                <span className="text-slate-400 flex-shrink-0 w-12">{fmtDate(a.occurredAt)}</span>
                <span className="text-slate-600 truncate flex-1">{a.type}{a.subject ? `: ${a.subject}` : ""}</span>
                {a.direction && (
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${a.direction === "inbound" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                    {a.direction === "inbound" ? "IN" : "OUT"}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Tasks */}
      <CollapsibleSection title="Tasks" count={tasks.length}>
        {tasks.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No open tasks</p>
        ) : (
          <div className="space-y-1">
            {tasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs py-0.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  t.priority === "urgent" ? "bg-red-500" : t.priority === "high" ? "bg-orange-500" : "bg-slate-300"
                }`} />
                <span className="text-slate-600 truncate flex-1">{t.title}</span>
                {t.dueAt && <span className="text-slate-400 flex-shrink-0 text-[10px]">{fmtDate(t.dueAt)}</span>}
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Follow-ups */}
      {followUps.length > 0 && (
        <CollapsibleSection title="Follow-ups" count={followUps.length}>
          <div className="space-y-1">
            {followUps.map(f => (
              <div key={f.id} className="bg-amber-50 border border-amber-200 rounded px-2 py-1.5 text-xs text-amber-800">
                {f.reason.replace(/_/g, " ")} — due {fmtDate(f.dueAt)}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
