"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  syncGmail, sendNewEmail, replyToEmail, markThreadAsRead,
  getThreads, getThreadMessages, getContactsForAutocomplete,
  findContactByEmail, quickCreateContact,
  type ThreadSummary,
} from "./actions";
import { togglePinThread, bulkArchive, bulkDelete } from "./bulk-actions";
import { applyLabel, removeLabel, type LabelData } from "./label-actions";
import { incrementTemplateUsage } from "./template-actions";
import { getCRMContext, type CRMContext } from "./crm-actions";
import BulkActionBar from "./components/bulk-action-bar";
import SnoozePicker from "./components/snooze-picker";
import LabelPicker from "./components/label-picker";
import FollowUpBanner from "./components/follow-up-banner";
import CRMSidebar from "./components/crm-sidebar";
import QuickReplyBar from "./components/quick-reply-bar";

interface Email {
  id: string;
  gmailMessageId: string;
  threadId: string | null;
  contactId: string | null;
  direction: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  snippet: string | null;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  receivedAt: string;
  aiParsed: boolean;
  leadSource: string | null;
  leadIntent: string | null;
  extractedName: string | null;
  extractedPhone: string | null;
  extractedBudget: string | null;
  extractedArea: string | null;
  aiSummary: string | null;
  sentimentScore: number | null;
  contact: { id: string; firstName: string; lastName: string } | null;
}

interface Template {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  category: string | null;
}

const sourceColors: Record<string, string> = {
  streeteasy: "bg-emerald-500 text-white",
  zillow: "bg-blue-500 text-white",
  realtor: "bg-amber-500 text-white",
  apartments_com: "bg-purple-500 text-white",
  renthop: "bg-orange-500 text-white",
  referral: "bg-teal-500 text-white",
  website: "bg-indigo-500 text-white",
  cold: "bg-slate-400 text-white",
  unknown: "bg-slate-200 text-slate-500",
};

const sourceLabels: Record<string, string> = {
  streeteasy: "StreetEasy",
  zillow: "Zillow",
  realtor: "Realtor",
  apartments_com: "Apartments.com",
  renthop: "RentHop",
  referral: "Referral",
  website: "Website",
  cold: "Cold",
};

const urgencyConfig: Record<number, { label: string; color: string; dot: string }> = {
  1: { label: "Browsing", color: "text-slate-400", dot: "bg-slate-300" },
  2: { label: "Interested", color: "text-blue-500", dot: "bg-blue-400" },
  3: { label: "Active", color: "text-amber-600", dot: "bg-amber-400" },
  4: { label: "Hot Lead", color: "text-orange-600", dot: "bg-orange-500" },
  5: { label: "Urgent", color: "text-red-600 font-bold", dot: "bg-red-500" },
};

const categoryConfig: Record<string, { icon: string; label: string; color: string }> = {
  lead: { icon: "🔴", label: "Lead", color: "text-red-600" },
  personal: { icon: "👤", label: "Personal", color: "text-indigo-600" },
  newsletter: { icon: "📰", label: "Newsletter", color: "text-purple-600" },
  transactional: { icon: "🧾", label: "Receipt", color: "text-slate-500" },
  spam: { icon: "🚫", label: "Spam", color: "text-slate-400" },
};

const gmailFolders = [
  { id: "INBOX", label: "Inbox", icon: "📥" },
  { id: "SENT", label: "Sent", icon: "📤" },
  { id: "STARRED", label: "Starred", icon: "⭐" },
  { id: "DRAFT", label: "Drafts", icon: "📝" },
  { id: "TRASH", label: "Trash", icon: "🗑️" },
  { id: "SPAM", label: "Spam", icon: "⚠️" },
  { id: "ALL", label: "All Mail", icon: "📁" },
];

// Avatar color by first letter
function getAvatarColor(name: string): string {
  const first = (name || "?")[0].toUpperCase();
  const code = first.charCodeAt(0);
  if (code <= 69) return "bg-blue-500";       // A-E
  if (code <= 74) return "bg-emerald-500";     // F-J
  if (code <= 79) return "bg-amber-500";       // K-O
  if (code <= 84) return "bg-purple-500";      // P-T
  return "bg-rose-500";                        // U-Z
}

const fmtTime = (d: string) => {
  const date = new Date(d);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60 * 60 * 1000) return Math.max(1, Math.floor(diff / 60000)) + "m";
  if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + "h";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (diff < 7 * 24 * 60 * 60 * 1000) return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
};

const fmtFull = (d: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(d));

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function MessagesView({
  gmailConnected,
  gmailEmail,
  templates,
  initialUnreadCount,
  initialLabels,
  followUpCount,
}: {
  gmailConnected: boolean;
  gmailEmail: string | null;
  templates: Template[];
  initialUnreadCount: number;
  initialLabels: LabelData[];
  followUpCount: number;
}) {
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Email[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [createModal, setCreateModal] = useState<{ email: string; name: string | null; phone?: string | null; source?: string | null; summary?: string | null } | null>(null);
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [labels] = useState<LabelData[]>(initialLabels);
  const [crmContext, setCrmContext] = useState<CRMContext | null>(null);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmVisible, setCrmVisible] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [gmailFolder, setGmailFolder] = useState("INBOX");
  const [autoSync, setAutoSync] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [lastSyncedAgo, setLastSyncedAgo] = useState("");
  const [newThreadFlash, setNewThreadFlash] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [toastExiting, setToastExiting] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const threadsRef = useRef<ThreadSummary[]>([]);

  // Keep ref in sync
  useEffect(() => { threadsRef.current = threads; }, [threads]);

  // Load auto-sync preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("vettdre_auto_sync");
    if (saved !== null) setAutoSync(saved !== "false");
  }, []);

  const toggleAutoSync = () => {
    setAutoSync(prev => {
      const next = !prev;
      localStorage.setItem("vettdre_auto_sync", String(next));
      return next;
    });
  };

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load threads
  const loadThreads = useCallback(async () => {
    const filters: any = {};
    if (gmailFolder !== "INBOX") filters.gmailFolder = gmailFolder;
    if (searchDebounced) filters.search = searchDebounced;
    switch (filter) {
      case "unread": filters.isRead = false; break;
      case "leads": filters.category = "lead"; break;
      case "personal": filters.category = "personal"; break;
      case "newsletters": filters.category = "newsletter"; break;
      case "snoozed": filters.isSnoozed = true; break;
      case "pinned": filters.isPinned = true; break;
      case "linked": filters.hasContact = true; break;
      case "unlinked": filters.hasContact = false; break;
      default:
        if (["streeteasy", "zillow", "realtor", "apartments_com", "renthop", "referral"].includes(filter)) {
          filters.leadSource = filter;
        }
    }
    const data = await getThreads(Object.keys(filters).length > 0 ? filters : undefined);
    setThreads(data);
    setLoading(false);
    return data;
  }, [searchDebounced, filter, gmailFolder]);

  useEffect(() => { if (gmailConnected) loadThreads(); }, [gmailConnected, loadThreads]);

  const selectedThread = threads.find(t => t.threadId === selectedThreadId) || null;

  const handleSelectThread = async (thread: ThreadSummary) => {
    setSelectedThreadId(thread.threadId);
    setComposeOpen(false);
    const msgsPromise = getThreadMessages(thread.threadId);
    if (thread.contactId) {
      setCrmLoading(true);
      getCRMContext(thread.contactId).then(ctx => { setCrmContext(ctx); setCrmLoading(false); });
    } else {
      setCrmContext(null);
      setCrmLoading(false);
    }
    const msgs = await msgsPromise;
    setThreadMessages(JSON.parse(JSON.stringify(msgs)));
    if (!thread.isRead) {
      await markThreadAsRead(thread.threadId);
      setThreads(prev => prev.map(t => t.threadId === thread.threadId ? { ...t, isRead: true } : t));
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try { await syncGmail(); await loadThreads(); setLastSyncedAt(new Date()); } catch (err) { console.error("Sync error:", err); }
    setSyncing(false);
  };

  const handleSenderClick = async (email: string, name: string | null, aiData?: any) => {
    const contact = await findContactByEmail(email);
    if (contact) { router.push("/contacts/" + contact.id); }
    else { setCreateModal({ email, name, phone: aiData?.extractedPhone, source: aiData?.leadSource, summary: aiData?.aiSummary }); }
  };

  const handleCheckboxToggle = (threadId: string, index: number, shiftKey: boolean) => {
    setSelectedThreadIds(prev => {
      const next = new Set(prev);
      if (shiftKey && lastClickedIndex !== null) {
        const start = Math.min(lastClickedIndex, index);
        const end = Math.max(lastClickedIndex, index);
        for (let i = start; i <= end; i++) next.add(threads[i].threadId);
      } else {
        next.has(threadId) ? next.delete(threadId) : next.add(threadId);
      }
      return next;
    });
    setLastClickedIndex(index);
  };

  const handleSelectAll = () => {
    setSelectedThreadIds(selectedThreadIds.size === threads.length ? new Set() : new Set(threads.map(t => t.threadId)));
  };

  const handlePin = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await togglePinThread(threadId);
    await loadThreads();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
      if (isTyping) return;

      switch (e.key) {
        case "c": e.preventDefault(); setComposeOpen(true); break;
        case "Escape": e.preventDefault(); setComposeOpen(false); setSelectedThreadId(null); break;
        case "/": e.preventDefault(); searchRef.current?.focus(); break;
        case "j": {
          e.preventDefault();
          const next = Math.min(focusedIndex + 1, threads.length - 1);
          setFocusedIndex(next);
          if (threads[next]) handleSelectThread(threads[next]);
          break;
        }
        case "k": {
          e.preventDefault();
          const prev = Math.max(focusedIndex - 1, 0);
          setFocusedIndex(prev);
          if (threads[prev]) handleSelectThread(threads[prev]);
          break;
        }
        case "e":
          if (selectedThreadId) { e.preventDefault(); bulkArchive([selectedThreadId]).then(loadThreads); }
          break;
        case "#":
          if (selectedThreadId) { e.preventDefault(); bulkDelete([selectedThreadId]).then(loadThreads); }
          break;
        case "s":
          if (selectedThreadId) { e.preventDefault(); togglePinThread(selectedThreadId).then(loadThreads); }
          break;
        case "p":
          if (selectedThreadId) { e.preventDefault(); togglePinThread(selectedThreadId).then(loadThreads); }
          break;
        case "?":
          e.preventDefault();
          setShortcutsOpen(prev => !prev);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusedIndex, threads, selectedThreadId]);

  // Auto-sync interval (60s)
  useEffect(() => {
    if (!autoSync || !gmailConnected) return;

    const doAutoSync = async () => {
      try {
        const prevIds = new Set(threadsRef.current.map(t => t.threadId));
        const result = await syncGmail();
        setLastSyncedAt(new Date());

        if (result && "synced" in result && (result as any).synced > 0) {
          const data = await loadThreads();
          if (data) {
            const fresh = new Set<string>();
            for (const t of data) {
              if (!prevIds.has(t.threadId)) fresh.add(t.threadId);
            }
            if (fresh.size > 0) {
              setNewThreadFlash(fresh);
              setToast(`${fresh.size} new email${fresh.size > 1 ? "s" : ""}`);
              setToastExiting(false);
              setTimeout(() => {
                setToastExiting(true);
                setTimeout(() => { setToast(null); setToastExiting(false); }, 200);
                setNewThreadFlash(new Set());
              }, 3000);
            }
          }
        }
      } catch (err) {
        console.error("Auto-sync error:", err);
      }
    };

    const interval = setInterval(doAutoSync, 60000);
    return () => clearInterval(interval);
  }, [autoSync, gmailConnected, loadThreads]);

  // Live "last synced" timer
  useEffect(() => {
    if (!lastSyncedAt) return;
    const update = () => {
      const diff = Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000);
      if (diff < 60) setLastSyncedAgo(`${diff}s ago`);
      else setLastSyncedAgo(`${Math.floor(diff / 60)}m ago`);
    };
    update();
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, [lastSyncedAt]);

  // Category counts
  const leadCount = threads.filter(t => t.category === "lead").length;
  const personalCount = threads.filter(t => t.category === "personal").length;
  const newsletterCount = threads.filter(t => t.category === "newsletter").length;
  const snoozedCount = threads.filter(t => t.isSnoozed).length;
  const pinnedCount = threads.filter(t => t.isPinned).length;

  const senderEmail = selectedThread?.participants.find(p => p.email !== gmailEmail)?.email || null;
  const senderName = selectedThread?.participants.find(p => p.email !== gmailEmail)?.name || null;

  if (!gmailConnected) {
    return (
      <div className="p-8">
        <div className="max-w-lg mx-auto text-center py-20">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📬</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Connect Gmail</h2>
          <p className="text-sm text-slate-500 mb-6">
            Connect your Gmail account to sync emails, auto-create leads, and send messages directly from VettdRE.
          </p>
          <Link href="/api/auth/gmail"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm">
            Connect Gmail Account
          </Link>
        </div>
      </div>
    );
  }

  const pinnedThreads = filter !== "pinned" ? threads.filter(t => t.isPinned) : [];
  const unpinnedThreads = filter !== "pinned" ? threads.filter(t => !t.isPinned) : threads;

  return (
    <div className="flex h-[calc(100vh-57px)]">
      {/* ==================== LEFT: Thread List ==================== */}
      <div className="w-[380px] flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">
        <BulkActionBar
          selectedThreadIds={Array.from(selectedThreadIds)}
          labels={labels}
          onAction={() => { setSelectedThreadIds(new Set()); loadThreads(); }}
          onClear={() => setSelectedThreadIds(new Set())}
        />

        {/* Gmail Folders */}
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-slate-100 bg-slate-50/50 overflow-x-auto scrollbar-hide">
          {gmailFolders.map(f => (
            <button key={f.id} onClick={() => { setGmailFolder(f.id); setFilter("all"); setSelectedThreadId(null); }}
              className={`px-2 py-1 text-[11px] rounded font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                gmailFolder === f.id
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              }`}>
              <span className="mr-0.5">{f.icon}</span>{f.label}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="p-3 border-b border-slate-200 space-y-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setComposeOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors">
              Compose
            </button>
            <button onClick={handleSync} disabled={syncing}
              className="px-3 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors">
              {syncing ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                  Syncing...
                </span>
              ) : "Sync"}
            </button>
            <button onClick={toggleAutoSync}
              className={`text-[10px] px-2 py-1 rounded-full font-medium transition-colors ${
                autoSync ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" : "bg-slate-100 text-slate-400 hover:bg-slate-200"
              }`} title={autoSync ? "Disable auto-sync" : "Enable auto-sync (every 60s)"}>
              {autoSync ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Auto
                </span>
              ) : "Auto: off"}
            </button>
            <div className="flex-1" />
            {lastSyncedAgo && (
              <span className="text-[10px] text-slate-400">Synced {lastSyncedAgo}</span>
            )}
            {initialUnreadCount > 0 && (
              <span className="text-xs font-bold text-blue-600">{initialUnreadCount} unread</span>
            )}
          </div>
          <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search emails... (press /)"
            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {gmailFolder === "INBOX" && (
            <>
              <div className="flex items-center gap-1 flex-nowrap overflow-x-auto scrollbar-hide">
                {[
                  { key: "all", label: "All" },
                  { key: "leads", label: `Leads${leadCount > 0 ? ` (${leadCount})` : ""}` },
                  { key: "personal", label: `Personal${personalCount > 0 ? ` (${personalCount})` : ""}` },
                  { key: "newsletters", label: `News${newsletterCount > 0 ? ` (${newsletterCount})` : ""}` },
                  { key: "snoozed", label: `Snoozed${snoozedCount > 0 ? ` (${snoozedCount})` : ""}` },
                  { key: "pinned", label: `Pinned${pinnedCount > 0 ? ` (${pinnedCount})` : ""}` },
                  { key: "unread", label: "Unread" },
                ].map(f => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`px-2.5 py-1 text-xs rounded-full font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                      filter === f.key ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>
              {filter === "leads" && (
                <div className="flex items-center gap-1 flex-wrap">
                  {["streeteasy", "zillow", "realtor", "referral"].map(src => (
                    <button key={src} onClick={() => setFilter(src)}
                      className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${sourceColors[src]}`}>
                      {sourceLabels[src]}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <FollowUpBanner followUpCount={followUpCount} onSelectThread={(threadId) => {
          const thread = threads.find(t => t.threadId === threadId);
          if (thread) handleSelectThread(thread);
        }} />

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto">
          {threads.length > 0 && (
            <div className="px-4 py-1.5 border-b border-slate-100 bg-slate-50/80">
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                <input type="checkbox" checked={selectedThreadIds.size === threads.length && threads.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-slate-300 text-blue-600 w-3.5 h-3.5" />
                Select all ({threads.length})
              </label>
            </div>
          )}

          {loading ? (
            /* Skeleton loader */
            <div className="divide-y divide-slate-100">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="px-4 py-3 animate-pulse [animation-duration:1.5s] flex items-start gap-3">
                  <div className="w-9 h-9 bg-slate-100 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between">
                      <div className="h-3.5 bg-slate-100 rounded w-28" />
                      <div className="h-3 bg-slate-100 rounded w-10" />
                    </div>
                    <div className="h-3.5 bg-slate-100 rounded w-3/4" />
                    <div className="h-3 bg-slate-100 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : threads.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">📭</span>
              </div>
              <p className="text-sm font-semibold text-slate-700">
                {search ? "No emails match your search" : "No threads found"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {search ? "Try a different search term" : "Sync your emails to get started"}
              </p>
              {search ? (
                <button onClick={() => { setSearch(""); setFilter("all"); }} className="mt-3 text-xs text-blue-600 font-medium hover:underline">
                  Clear filters
                </button>
              ) : (
                <button onClick={handleSync} className="mt-3 text-xs text-blue-600 font-medium hover:underline">
                  Sync your emails
                </button>
              )}
            </div>
          ) : (
            <>
              {pinnedThreads.length > 0 && (
                <>
                  <div className="px-4 py-1 bg-amber-50/80 border-b border-amber-100">
                    <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Pinned</span>
                  </div>
                  {pinnedThreads.map((thread, idx) => (
                    <ThreadRow key={thread.threadId} thread={thread} index={idx}
                      isSelected={selectedThreadId === thread.threadId} isChecked={selectedThreadIds.has(thread.threadId)}
                      onSelect={() => handleSelectThread(thread)} onCheck={(sk) => handleCheckboxToggle(thread.threadId, idx, sk)}
                      onPin={(e) => handlePin(thread.threadId, e)} gmailEmail={gmailEmail}
                      isNew={newThreadFlash.has(thread.threadId)} folder={gmailFolder} />
                  ))}
                  {unpinnedThreads.length > 0 && (
                    <div className="px-4 py-1 bg-slate-50/80 border-b border-slate-100">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">All Messages</span>
                    </div>
                  )}
                </>
              )}
              {unpinnedThreads.map((thread, idx) => {
                const actualIndex = pinnedThreads.length + idx;
                return (
                  <ThreadRow key={thread.threadId} thread={thread} index={actualIndex}
                    isSelected={selectedThreadId === thread.threadId} isChecked={selectedThreadIds.has(thread.threadId)}
                    onSelect={() => handleSelectThread(thread)} onCheck={(sk) => handleCheckboxToggle(thread.threadId, actualIndex, sk)}
                    onPin={(e) => handlePin(thread.threadId, e)} gmailEmail={gmailEmail}
                    isNew={newThreadFlash.has(thread.threadId)} folder={gmailFolder} />
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ==================== CENTER: Thread Detail ==================== */}
      <div className="flex-1 min-w-0 flex flex-col bg-slate-50 overflow-hidden">
        {selectedThread && threadMessages.length > 0 ? (
          <ThreadDetail
            thread={selectedThread} messages={threadMessages} gmailEmail={gmailEmail}
            templates={templates} labels={labels}
            onSenderClick={handleSenderClick}
            onReplySent={() => { loadThreads(); handleSelectThread(selectedThread); }}
            onLabelsChange={loadThreads}
          />
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl opacity-50">📬</span>
              </div>
              <p className="text-sm font-semibold text-slate-700">Select a conversation to view</p>
              <p className="text-xs text-slate-400 mt-1">Connected as {gmailEmail}</p>
              <div className="mt-4 flex items-center justify-center gap-3 text-[10px] text-slate-400">
                <span className="px-1.5 py-0.5 bg-slate-100 rounded font-mono animate-bounce [animation-duration:2s]">j</span>
                <span className="px-1.5 py-0.5 bg-slate-100 rounded font-mono animate-bounce [animation-duration:2s] [animation-delay:100ms]">k</span>
                <span>to navigate</span>
                <span className="px-1.5 py-0.5 bg-slate-100 rounded font-mono animate-bounce [animation-duration:2s] [animation-delay:200ms]">c</span>
                <span>to compose</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== RIGHT: CRM Sidebar ==================== */}
      {selectedThread && (
        <div className={`hidden xl:flex flex-col flex-shrink-0 border-l border-slate-200 bg-white overflow-hidden transition-all duration-200 ${crmVisible ? "w-[240px]" : "w-11"}`}>
          {/* Header with chevron toggle */}
          <div className={`border-b border-slate-200 flex items-center ${crmVisible ? "px-3 py-2 justify-between" : "justify-center py-2"}`}>
            {crmVisible && <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">CRM</h3>}
            <button onClick={() => setCrmVisible(!crmVisible)}
              className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"
              title={crmVisible ? "Collapse sidebar" : "Expand sidebar"}>
              <span className={`text-[10px] transition-transform ${crmVisible ? "" : "rotate-180"}`}>&#9654;</span>
            </button>
          </div>
          {crmVisible ? (
            <div className="flex-1 overflow-y-auto">
              <CRMSidebar
                context={crmContext} loading={crmLoading} senderEmail={senderEmail} senderName={senderName}
                onCreateLead={() => { if (senderEmail) setCreateModal({ email: senderEmail, name: senderName }); }}
                onCreateContact={() => { if (senderEmail) setCreateModal({ email: senderEmail, name: senderName }); }}
              />
            </div>
          ) : (
            /* Collapsed: icon strip */
            <div className="flex-1 flex flex-col items-center gap-3 pt-3 text-slate-400">
              <button onClick={() => setCrmVisible(true)} className="hover:text-slate-600 transition-colors" title="Contact">
                <span className="text-sm">👤</span>
              </button>
              <button onClick={() => setCrmVisible(true)} className="hover:text-slate-600 transition-colors" title="Deals">
                <span className="text-sm">💰</span>
              </button>
              <button onClick={() => setCrmVisible(true)} className="hover:text-slate-600 transition-colors" title="Activity">
                <span className="text-sm">📋</span>
              </button>
              <button onClick={() => setCrmVisible(true)} className="hover:text-slate-600 transition-colors" title="Tasks">
                <span className="text-sm">✅</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Compose Modal */}
      {composeOpen && (
        <ComposeModal
          templates={templates} gmailEmail={gmailEmail}
          onClose={() => setComposeOpen(false)}
          onSent={() => { setComposeOpen(false); loadThreads(); }}
        />
      )}

      {/* Quick Create Contact Modal */}
      {createModal && (
        <QuickCreateModal data={createModal} onClose={() => setCreateModal(null)}
          onCreated={(contactId) => { setCreateModal(null); router.push("/contacts/" + contactId); }} />
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg shadow-lg"
          style={{
            animation: toastExiting
              ? "slide-up 200ms ease-in reverse forwards"
              : "slide-up 200ms ease-out",
          }}
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          {toast}
        </div>
      )}

      {/* Keyboard shortcut hint */}
      <button onClick={() => setShortcutsOpen(true)}
        className="fixed bottom-4 right-4 w-7 h-7 bg-slate-200 hover:bg-slate-300 text-slate-500 text-xs font-bold rounded-full flex items-center justify-center z-30 shadow-sm transition-colors"
        title="Keyboard shortcuts (?)">
        ?
      </button>

      {/* Keyboard shortcuts modal */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={() => setShortcutsOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()} style={{ animation: "modal-in 200ms ease-out" }}>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Keyboard Shortcuts</h3>
              <button onClick={() => setShortcutsOpen(false)} className="w-6 h-6 rounded hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-2">
              {[
                ["c", "Compose new email"],
                ["j", "Next thread"],
                ["k", "Previous thread"],
                ["/", "Focus search"],
                ["e", "Archive thread"],
                ["#", "Delete thread"],
                ["s", "Star thread"],
                ["p", "Pin thread"],
                ["?", "Toggle shortcuts"],
                ["Esc", "Close / Deselect"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center gap-2">
                  <kbd className="bg-slate-100 text-slate-700 rounded px-2 py-1 font-mono text-xs font-semibold min-w-[28px] text-center">{key}</kbd>
                  <span className="text-xs text-slate-600">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// THREAD ROW
// ============================================================
function ThreadRow({
  thread, index, isSelected, isChecked, onSelect, onCheck, onPin, gmailEmail, isNew, folder,
}: {
  thread: ThreadSummary; index: number; isSelected: boolean; isChecked: boolean;
  onSelect: () => void; onCheck: (shiftKey: boolean) => void; onPin: (e: React.MouseEvent) => void;
  gmailEmail: string | null; isNew?: boolean; folder?: string;
}) {
  const cat = thread.category ? categoryConfig[thread.category] : null;
  const displayName = thread.latestDirection === "outbound"
    ? (thread.contactName || thread.latestToEmails?.[0] || thread.latestFromEmail)
    : (thread.latestFromName || thread.latestFromEmail);
  const initial = (displayName || "?")[0].toUpperCase();
  const avatarBg = getAvatarColor(displayName || "?");

  return (
    <div
      className={`group w-full text-left px-3 py-2.5 border-b border-slate-100 hover:bg-slate-50 hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)] transition-colors duration-100 cursor-pointer flex items-start gap-2.5 ${
        isSelected ? "bg-blue-50 shadow-[inset_3px_0_0_#2563eb]" : ""
      } ${isChecked ? "bg-blue-50/60" : ""} ${!thread.isRead ? "bg-blue-50/30" : ""} ${isNew ? "animate-pulse bg-blue-100" : ""}`}
    >
      <input type="checkbox" checked={isChecked} onChange={() => {}}
        onClick={(e) => { e.stopPropagation(); onCheck(e.shiftKey); }}
        className="mt-2.5 rounded border-slate-300 text-blue-600 flex-shrink-0 w-3.5 h-3.5" />

      {/* Avatar */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarBg}`}>
        {initial}
      </div>

      <div className="min-w-0 flex-1" onClick={onSelect}>
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-sm truncate ${!thread.isRead ? "font-semibold text-slate-900" : "font-medium text-slate-600"}`}>
            {(thread.latestDirection === "outbound" || folder === "SENT") ? "To: " : ""}{displayName}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            {thread.isPinned && <span className="text-[10px]">📌</span>}
            {thread.messageCount > 1 && (
              <span className="text-[10px] bg-slate-200 text-slate-600 w-5 h-5 flex items-center justify-center rounded-full font-bold">{thread.messageCount}</span>
            )}
            <span className="text-xs text-slate-400">{fmtTime(thread.lastMessageAt)}</span>
          </div>
        </div>
        <p className={`text-sm truncate ${!thread.isRead ? "font-bold text-slate-800" : "text-slate-500"}`}>
          {thread.subject || "(no subject)"}
        </p>
        <p className="text-xs text-slate-400 truncate mt-0.5">{thread.snippet}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {cat && thread.category !== "personal" && (
            <span className={`text-[10px] font-medium ${cat.color}`}>{cat.icon} {cat.label}</span>
          )}
          {thread.leadSource && thread.leadSource !== "unknown" && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${sourceColors[thread.leadSource] || sourceColors.unknown}`}>
              {sourceLabels[thread.leadSource] || thread.leadSource}
            </span>
          )}
          {thread.sentimentScore && thread.sentimentScore >= 3 && (
            <span className="flex items-center gap-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${urgencyConfig[thread.sentimentScore]?.dot}`} />
              <span className={`text-[10px] font-medium ${urgencyConfig[thread.sentimentScore]?.color}`}>
                {urgencyConfig[thread.sentimentScore]?.label}
              </span>
            </span>
          )}
          {thread.labels.map(l => (
            <span key={l.id} className="text-[9px] px-1.5 py-0.5 rounded-full font-bold border"
              style={{ borderColor: l.color, color: l.color }}>{l.icon ? `${l.icon} ` : ""}{l.name}</span>
          ))}
          {thread.contactName && (
            <span className="text-[10px] text-emerald-600 font-medium ml-auto">{thread.contactName}</span>
          )}
        </div>
      </div>

      <button onClick={onPin}
        className={`mt-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ${
          thread.isPinned ? "text-amber-500 opacity-100" : "text-slate-300 hover:text-amber-500"}`}
        title={thread.isPinned ? "Unpin" : "Pin"}>📌</button>
    </div>
  );
}

// ============================================================
// THREAD DETAIL
// ============================================================
function ThreadDetail({
  thread, messages, gmailEmail, templates, labels, onSenderClick, onReplySent, onLabelsChange,
}: {
  thread: ThreadSummary; messages: Email[]; gmailEmail: string | null; templates: Template[];
  labels: LabelData[]; onSenderClick: (email: string, name: string | null, aiData?: any) => void;
  onReplySent: () => void; onLabelsChange: () => void;
}) {
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [snoozePickerOpen, setSnoozePickerOpen] = useState(false);
  const [replyFocused, setReplyFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const lastTwo = new Set(messages.slice(-2).map(m => m.id));
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  // Scroll to bottom on thread load
  useEffect(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [thread.threadId]);

  const handleReply = async () => {
    if (!replyBody.trim()) return;
    setSending(true);
    const lastMsg = messages[messages.length - 1];
    const result = await replyToEmail(lastMsg.id, replyBody);
    setSending(false);
    if (result && "error" in result) {
      alert("Failed to send: " + result.error);
    } else {
      setReplyBody("");
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 1500);
      onReplySent();
    }
  };

  const contactInfo = thread.contactId && thread.contactName
    ? { firstName: thread.contactName.split(" ")[0] || "", lastName: thread.contactName.split(" ").slice(1).join(" ") || "", email: thread.participants.find(p => p.contactId === thread.contactId)?.email || null }
    : null;

  const aiMsg = messages.find(m => m.aiParsed && m.sentimentScore && m.sentimentScore >= 3);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Thread Header */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900 truncate min-w-0 flex-1">{thread.subject || "(no subject)"}</h2>
          <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">
            {messages.length} msg{messages.length !== 1 ? "s" : ""}
            {thread.contactName && <> · <Link href={"/contacts/" + thread.contactId} className="text-emerald-600 hover:underline font-medium">{thread.contactName}</Link></>}
          </span>
          {/* Inline action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {thread.labels.map(l => (
              <span key={l.id} className="text-[10px] px-1.5 py-0.5 rounded-full font-bold border inline-flex items-center gap-0.5"
                style={{ borderColor: l.color, color: l.color }}>
                {l.icon ? `${l.icon} ` : ""}{l.name}
                <button onClick={() => { removeLabel(thread.threadId, l.id); onLabelsChange(); }} className="hover:opacity-70">&times;</button>
              </span>
            ))}
            <div className="relative">
              <button onClick={() => setLabelPickerOpen(!labelPickerOpen)}
                className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                + Label
              </button>
              {labelPickerOpen && (
                <div className="absolute top-full right-0 mt-1 z-20">
                  <LabelPicker labels={labels} appliedLabelIds={thread.labels.map(l => l.id)}
                    onApply={(id) => { applyLabel(thread.threadId, id); onLabelsChange(); }}
                    onRemove={(id) => { removeLabel(thread.threadId, id); onLabelsChange(); }}
                    onClose={() => setLabelPickerOpen(false)} />
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => setSnoozePickerOpen(!snoozePickerOpen)}
                className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                Snooze
              </button>
              {snoozePickerOpen && (
                <div className="absolute top-full right-0 mt-1 z-20">
                  <SnoozePicker onSelect={async (dt) => {
                    const { snoozeThread } = await import("./bulk-actions");
                    await snoozeThread(thread.threadId, dt);
                    setSnoozePickerOpen(false); onLabelsChange();
                  }} onClose={() => setSnoozePickerOpen(false)} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Lead Banner */}
        {aiMsg && (
          <div className={`mt-3 p-3 rounded-lg flex items-center gap-3 flex-wrap ${
            (aiMsg.sentimentScore || 0) >= 4 ? "bg-red-50 border border-red-200" :
            (aiMsg.sentimentScore || 0) >= 3 ? "bg-amber-50 border border-amber-200" :
            "bg-slate-50 border border-slate-200"
          }`}>
            <span className="text-sm">{(aiMsg.sentimentScore || 0) >= 4 ? "🔥" : "⚡"}</span>
            <span className={`text-sm font-bold ${urgencyConfig[aiMsg.sentimentScore || 1]?.color}`}>
              {urgencyConfig[aiMsg.sentimentScore || 1]?.label}
            </span>
            {aiMsg.leadIntent && aiMsg.leadIntent !== "general" && (
              <span className="text-xs text-slate-600">{aiMsg.leadIntent.replace(/_/g, " ")}</span>
            )}
            {aiMsg.leadSource && aiMsg.leadSource !== "unknown" && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${sourceColors[aiMsg.leadSource] || sourceColors.unknown}`}>
                {sourceLabels[aiMsg.leadSource] || aiMsg.leadSource}
              </span>
            )}
            {aiMsg.extractedBudget && <span className="text-xs text-emerald-700 font-bold">{aiMsg.extractedBudget}</span>}
            {aiMsg.extractedArea && <span className="text-xs text-indigo-600 font-bold">{aiMsg.extractedArea}</span>}
            {aiMsg.extractedPhone && (
              <a href={"tel:" + aiMsg.extractedPhone} className="text-xs text-blue-600 font-bold hover:underline">{aiMsg.extractedPhone}</a>
            )}
            {aiMsg.aiSummary && <p className="text-xs text-slate-600 w-full mt-1 italic">{aiMsg.aiSummary}</p>}
          </div>
        )}
      </div>

      {/* Messages — Bubble Layout */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {messages.map((msg) => {
          const isExpanded = lastTwo.has(msg.id) || expandedIds.has(msg.id);
          const isOutbound = msg.direction === "outbound";
          const senderDisplayName = msg.fromName || msg.fromEmail;
          const avatarBg = getAvatarColor(senderDisplayName);
          const initial = (senderDisplayName || "?")[0].toUpperCase();

          return (
            <div key={msg.id} className="flex gap-2.5 w-full">
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5 ${isOutbound ? "bg-blue-600" : avatarBg}`}>
                {isOutbound ? "Y" : initial}
              </div>

              <div className={`flex-1 min-w-0 rounded-xl ${isOutbound ? "bg-blue-50 border border-blue-200 border-l-4 border-l-blue-500" : "bg-white border border-slate-200 border-l-4 border-l-slate-300"} shadow-sm hover:shadow-md transition-shadow duration-150`}>
                {/* Header */}
                <div className="px-4 py-2 flex items-center justify-between cursor-pointer" onClick={() => toggleExpand(msg.id)}>
                  <div className="flex items-center gap-2 min-w-0">
                    {!isOutbound ? (
                      <SenderInline email={msg.fromEmail} name={msg.fromName} contactId={msg.contact?.id || null}
                        onClick={() => onSenderClick(msg.fromEmail, msg.fromName, { extractedPhone: msg.extractedPhone, leadSource: msg.leadSource, aiSummary: msg.aiSummary })} />
                    ) : (
                      <span className="text-xs font-semibold text-blue-700">You</span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 flex-shrink-0 ml-3">{fmtFull(msg.receivedAt)}</span>
                </div>
                {/* Body */}
                {isExpanded ? (
                  <div className="px-4 pb-4 overflow-x-auto">
                    {msg.bodyHtml ? (
                      <div className="text-sm text-slate-700 prose prose-sm max-w-none w-full [&_img]:max-w-full [&_table]:w-full [&_a]:text-blue-600" dangerouslySetInnerHTML={{ __html: msg.bodyHtml }} />
                    ) : (
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.bodyText || msg.snippet}</p>
                    )}
                    {msg.hasAttachments && <p className="text-xs text-slate-400 mt-2 flex items-center gap-1"><span>📎</span> Attachments</p>}
                  </div>
                ) : (
                  <p className="px-4 pb-3 text-xs text-slate-400 truncate">{msg.snippet}</p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply area — pinned to bottom */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white">
        <QuickReplyBar templates={templates} contact={contactInfo} onSelect={(body) => setReplyBody(body)} />
        <div className="px-4 pb-3 pt-2">
          <div className="flex gap-2 items-end">
            <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)}
              onFocus={() => setReplyFocused(true)} onBlur={() => setReplyFocused(false)}
              placeholder="Write a reply..."
              rows={replyFocused || replyBody ? 4 : 1}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all" />
            <button onClick={handleReply} disabled={sending || !replyBody.trim()}
              className={`px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-all ${
                sendSuccess ? "bg-emerald-500" : "bg-blue-600 hover:bg-blue-700"
              }`}>
              {sending ? "..." : sendSuccess ? "Sent!" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SENDER INLINE
// ============================================================
function SenderInline({ email, name, contactId, onClick }: { email: string; name: string | null; contactId: string | null; onClick: () => void }) {
  return (
    <span onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex items-center gap-1.5 group cursor-pointer" title={contactId ? "View Contact" : "Create Lead/Contact"}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${contactId ? "bg-emerald-500" : "bg-blue-400"}`} />
      <span className="text-xs font-semibold text-slate-800 group-hover:underline group-hover:text-blue-600">
        {name || email}
      </span>
    </span>
  );
}

// ============================================================
// COMPOSE MODAL (overlay, not inline)
// ============================================================
function ComposeModal({ templates, gmailEmail, onClose, onSent }: { templates: Template[]; gmailEmail: string | null; onClose: () => void; onSent: () => void }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [contactId, setContactId] = useState<string | undefined>();
  const [suggestions, setSuggestions] = useState<Array<{ id: string; firstName: string; lastName: string; email: string | null }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleToChange = async (value: string) => {
    setTo(value);
    if (value.length >= 2) {
      const results = await getContactsForAutocomplete(value);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    } else { setShowSuggestions(false); }
  };

  const selectContact = (c: { id: string; firstName: string; lastName: string; email: string | null }) => {
    setTo(c.email || "");
    setContactId(c.id);
    setShowSuggestions(false);
  };

  const handleTemplate = (t: Template) => {
    if (body.trim() && !confirm("Replace current message with template?")) return;
    setSubject(t.subject || "");
    setBody(t.body);
    incrementTemplateUsage(t.id);
  };

  const handleSend = async () => {
    if (!to || !subject) return;
    setSending(true);
    const result = await sendNewEmail(to, subject, body || "<p></p>", contactId);
    setSending(false);
    if (result && "error" in result) { alert("Failed to send: " + result.error); }
    else { onSent(); }
  };

  // Group templates by category
  const grouped = templates.reduce<Record<string, Template[]>>((acc, t) => {
    const cat = t.category || "custom";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  const catLabels: Record<string, string> = {
    follow_up: "Follow Up", showing: "Showing", application: "Application", nurture: "Nurture",
    cold_outreach: "Cold Outreach", welcome: "Welcome", custom: "Custom", quick_reply: "Quick Reply",
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()} style={{ animation: "modal-in 200ms ease-out" }}>
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">New Message</h3>
          <button onClick={onClose} className="w-6 h-6 rounded hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600">&times;</button>
        </div>

        {/* To + Subject */}
        <div className="border-b border-slate-100">
          <div className="relative px-4 py-2 flex items-center gap-2 border-b border-slate-100">
            <span className="text-xs text-slate-400 font-medium w-12">To:</span>
            <input value={to} onChange={e => handleToChange(e.target.value)} placeholder="email or contact name"
              className="flex-1 text-sm focus:outline-none" />
            {showSuggestions && (
              <div className="absolute left-14 top-full z-10 w-[calc(100%-4rem)] bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {suggestions.map(c => (
                  <button key={c.id} onClick={() => selectContact(c)} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm">
                    <span className="font-medium">{c.firstName} {c.lastName}</span>
                    <span className="text-slate-400 ml-2">{c.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 py-2 flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium w-12">Subject:</span>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
              className="flex-1 text-sm focus:outline-none" />
          </div>
        </div>

        {/* Template pills */}
        {templates.length > 0 && (
          <div className="px-4 py-2.5 border-b border-slate-100 space-y-1.5 max-h-[120px] overflow-y-auto">
            {Object.entries(grouped).map(([cat, tmps]) => (
              <div key={cat} className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-400 font-medium w-16 flex-shrink-0">{catLabels[cat] || cat}</span>
                {tmps.map(t => (
                  <button key={t.id} onClick={() => handleTemplate(t)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 text-[11px] font-medium rounded-full border border-slate-200 hover:border-blue-300 transition-colors">
                    {t.name}
                  </button>
                ))}
              </div>
            ))}
            <Link href="/messages/templates" className="text-[10px] text-blue-600 hover:underline font-medium">
              + Manage Templates
            </Link>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message..."
            className="w-full h-full min-h-[200px] text-sm focus:outline-none resize-none" />
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {gmailEmail && `Sending as ${gmailEmail}`}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg font-medium transition-colors">
              Discard
            </button>
            <button onClick={handleSend} disabled={sending || !to || !subject}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg disabled:opacity-50 shadow-sm transition-colors flex items-center gap-1.5">
              {sending ? "Sending..." : "Send"}
              {!sending && <span className="text-blue-200">&#10148;</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// QUICK CREATE CONTACT MODAL
// ============================================================
function QuickCreateModal({
  data, onClose, onCreated,
}: {
  data: { email: string; name: string | null; phone?: string | null; source?: string | null; summary?: string | null };
  onClose: () => void; onCreated: (contactId: string) => void;
}) {
  const nameParts = (data.name || "").trim().split(/\s+/);
  const [firstName, setFirstName] = useState(nameParts[0] || "");
  const [lastName, setLastName] = useState(nameParts.slice(1).join(" ") || "");
  const [email] = useState(data.email);
  const [phone, setPhone] = useState(data.phone || "");
  const [notes, setNotes] = useState(data.summary || "");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (status: "lead" | "active") => {
    if (!firstName || !email) return;
    setCreating(true);
    const result = await quickCreateContact({
      firstName, lastName, email,
      phone: phone || undefined,
      source: data.source || "email",
      sourceDetail: data.source ? "Lead from " + (sourceLabels[data.source] || data.source) : "Created from Messages inbox",
      notes: notes || undefined, status,
    });
    setCreating(false);
    if (result && "error" in result) { alert("Failed: " + result.error); }
    else if (result && "contactId" in result) { onCreated(result.contactId); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">New Contact from Email</h3>
          <p className="text-xs text-slate-500 mt-0.5">Create a lead or contact from this sender</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500">First Name</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Last Name</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Email</label>
            <input value={email} disabled className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          {data.source && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Source:</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${sourceColors[data.source] || sourceColors.unknown}`}>
                {sourceLabels[data.source] || data.source}
              </span>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-slate-500">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
          </div>
        </div>
        <div className="p-5 border-t border-slate-200 flex items-center gap-2">
          <button onClick={() => handleCreate("lead")} disabled={creating || !firstName}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg disabled:opacity-50">
            {creating ? "..." : "Create Lead"}
          </button>
          <button onClick={() => handleCreate("active")} disabled={creating || !firstName}
            className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50">
            Create Contact
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
        </div>
      </div>
    </div>
  );
}
