"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MessageSquare, Plus, ArrowLeft, Phone, Send, Loader2, Settings,
  AlertTriangle, Calendar, CheckCircle2, XCircle, Skull, UserCircle2,
  Flame, ChevronDown, Search, Building2, Clock, Zap, ArrowUpRight, ListChecks, Bell, RefreshCw, WifiOff, Mail, Lock, SkipForward, PlayCircle, BookOpen, BarChart3, CreditCard, Globe, Users, Gift,
} from "lucide-react";
import { LeasingErrorBoundary } from "@/components/leasing/LeasingErrorBoundary";
import LimitBanner from "@/components/leasing/LimitBanner";
import {
  getLeasingConfigs,
  getConversations,
  getConversation,
  getConversationStats,
  resolveEscalation,
  confirmShowing,
  declineShowing,
  sendManualReply,
  markConversationDead,
  getUsageStats,
  getQueuedCount,
  getWaitlistAlerts,
  retryFailedMessage,
  checkGoogleCalendarConnected,
  getConversationFollowUps,
  skipFollowUp,
  sendFollowUpNow,
  createBillingPortalSession,
} from "./actions";
import type { WaitlistAlert, PendingFollowUp } from "./actions";
import type {
  LeasingConfigSummary,
  ConversationSummary,
  ConversationDetail,
  ConversationStats,
} from "@/lib/leasing-types";
import {
  CONVERSATION_STATUS_LABELS,
  CONVERSATION_STATUS_COLORS,
  TEMPERATURE_LABELS,
  TEMPERATURE_COLORS,
  ESCALATION_LABELS,
} from "@/lib/leasing-types";
import type { DetailedUsageStats } from "@/lib/leasing-limits";

// ── Helpers ─────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function displayName(c: ConversationSummary | ConversationDetail): string {
  if (c.prospectName) {
    const parts = c.prospectName.split(" ");
    if (parts.length > 1) return `${parts[0]} ${parts[parts.length - 1][0]}.`;
    return parts[0];
  }
  if (c.channel === "email" && c.prospectEmail) return c.prospectEmail;
  return c.prospectPhone.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3");
}

function trafficLight(c: ConversationSummary): string {
  if (c.status === "escalated") return "bg-red-500";
  if (c.status === "closed_lost" || c.status === "stale") return "bg-emerald-500";
  if (c.status === "showing_scheduled" || c.status === "qualified") return "bg-yellow-400";
  return "bg-yellow-400";
}

// ── Status Filter Pills ─────────────────────────────────────────

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "qualified", label: "Qualified" },
  { value: "showing_scheduled", label: "Showing" },
  { value: "escalated", label: "Escalated" },
  { value: "waitlisted", label: "Waitlisted" },
];

// ══════════════════════════════════════════════════════════════════
// Main Dashboard Component
// ══════════════════════════════════════════════════════════════════

export default function LeasingPageWrapper() {
  return <Suspense><LeasingPage /></Suspense>;
}

function LeasingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationParam = searchParams.get("conversation");

  // ── State ──────────────────────────────────────────────
  const [configs, setConfigs] = useState<LeasingConfigSummary[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<ConversationDetail | null>(null);
  const [stats, setStats] = useState<ConversationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [usage, setUsage] = useState<DetailedUsageStats | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [waitlistAlerts, setWaitlistAlerts] = useState<WaitlistAlert[]>([]);

  // Filters
  const [configFilter, setConfigFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Reply
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Connection state
  const [connectionLost, setConnectionLost] = useState(false);

  // Mobile view
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  // Google Calendar connection (Pro tier)
  const [calendarStatus, setCalendarStatus] = useState<{ connected: boolean; hasProConfig: boolean } | null>(null);

  // Follow-up cadence
  const [pendingFollowUps, setPendingFollowUps] = useState<PendingFollowUp[]>([]);
  const [followUpTier, setFollowUpTier] = useState<string>("free");

  // Push notifications
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const pollFailureCount = useRef(0);
  const conversationAutoSelected = useRef(false);

  // ── Load initial data ──────────────────────────────────
  useEffect(() => {
    getLeasingConfigs().then((res) => {
      if (!res.configs || res.configs.length === 0) {
        router.replace("/leasing/setup");
        return;
      }
      setConfigs(res.configs);
      setLoading(false);
      // Check Google Calendar connection for Pro tier
      checkGoogleCalendarConnected().then(setCalendarStatus).catch(() => {});
    });
  }, [router]);

  // ── Push notification prompt ───────────────────────────
  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    setPushSupported(supported);
    if (supported && !localStorage.getItem("push_prompt_dismissed") && Notification.permission === "default") {
      setShowPushBanner(true);
    }
  }, []);

  // ── Auto-select conversation from query param ────────
  useEffect(() => {
    if (conversationParam && !conversationAutoSelected.current && !loading && conversations.length > 0) {
      conversationAutoSelected.current = true;
      selectConversation(conversationParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationParam, loading, conversations]);

  // ── Load conversations on filter change ────────────────
  const loadConversations = useCallback(async () => {
    const res = await getConversations({
      configId: configFilter || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      search: search || undefined,
    });
    if (res.conversations) setConversations(res.conversations);
  }, [configFilter, statusFilter, search]);

  const loadStats = useCallback(async () => {
    const res = await getConversationStats(configFilter || undefined);
    if (res.stats) setStats(res.stats);
  }, [configFilter]);

  const loadUsage = useCallback(async () => {
    const [usageRes, queued] = await Promise.all([
      getUsageStats(configFilter || undefined),
      getQueuedCount(),
    ]);
    if (usageRes.usage) setUsage(usageRes.usage);
    setQueuedCount(queued);
  }, [configFilter]);

  const loadWaitlistAlerts = useCallback(async () => {
    const alerts = await getWaitlistAlerts(configFilter || undefined);
    setWaitlistAlerts(alerts);
  }, [configFilter]);

  useEffect(() => {
    if (!loading) {
      loadConversations();
      loadStats();
      loadUsage();
      loadWaitlistAlerts();
    }
  }, [loading, loadConversations, loadStats, loadUsage, loadWaitlistAlerts]);

  // ── 30s polling ────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    pollRef.current = setInterval(async () => {
      try {
        await Promise.all([
          loadConversations(),
          loadStats(),
          loadUsage(),
          loadWaitlistAlerts(),
        ]);
        // Refresh selected conversation detail
        if (selected) {
          const res = await getConversation(selected.id);
          if (res.conversation) setSelected(res.conversation);
        }
        // Reset failure count on success
        if (pollFailureCount.current > 0) {
          pollFailureCount.current = 0;
          setConnectionLost(false);
        }
      } catch (err) {
        pollFailureCount.current++;
        if (pollFailureCount.current >= 3) {
          setConnectionLost(true);
        }
      }
    }, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loading, loadConversations, loadStats, loadUsage, loadWaitlistAlerts, selected]);

  // ── Auto-scroll messages ───────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.messages]);

  // ── Select conversation ────────────────────────────────
  const selectConversation = async (id: string) => {
    setDetailLoading(true);
    setMobileShowDetail(true);
    const [convRes, fuRes] = await Promise.all([
      getConversation(id),
      getConversationFollowUps(id),
    ]);
    if (convRes.conversation) setSelected(convRes.conversation);
    setPendingFollowUps(fuRes.followUps || []);
    setFollowUpTier(fuRes.tier || "free");
    setDetailLoading(false);
  };

  // ── Actions ────────────────────────────────────────────
  const handleReply = async () => {
    if (!selected || !replyText.trim() || sending) return;
    setSending(true);
    setReplyError(null);
    try {
      const res = await sendManualReply(selected.id, replyText.trim());
      if (res.success) {
        setReplyText("");
        // Refresh conversation
        const updated = await getConversation(selected.id);
        if (updated.conversation) setSelected(updated.conversation);
        loadConversations();
      } else {
        setReplyError(res.error || "Failed to send message");
      }
    } catch {
      setReplyError("Network error — message not sent");
    }
    setSending(false);
  };

  const handleResolve = async () => {
    if (!selected) return;
    await resolveEscalation(selected.id);
    const updated = await getConversation(selected.id);
    if (updated.conversation) setSelected(updated.conversation);
    loadConversations();
    loadStats();
  };

  const handleConfirmShowing = async () => {
    if (!selected) return;
    await confirmShowing(selected.id);
    const updated = await getConversation(selected.id);
    if (updated.conversation) setSelected(updated.conversation);
    loadConversations();
    loadStats();
  };

  const handleDeclineShowing = async () => {
    if (!selected) return;
    await declineShowing(selected.id);
    const updated = await getConversation(selected.id);
    if (updated.conversation) setSelected(updated.conversation);
    loadConversations();
  };

  const handleMarkDead = async () => {
    if (!selected) return;
    await markConversationDead(selected.id);
    const updated = await getConversation(selected.id);
    if (updated.conversation) setSelected(updated.conversation);
    loadConversations();
    loadStats();
  };

  // ── Push permission request ───────────────────────────
  const requestPushPermission = async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setShowPushBanner(false);
        return;
      }
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) { setShowPushBanner(false); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      setShowPushBanner(false);
    } catch (err) {
      console.error("[push] Permission request failed:", err);
      setShowPushBanner(false);
    }
  };

  const dismissPushBanner = () => {
    setShowPushBanner(false);
    localStorage.setItem("push_prompt_dismissed", "1");
  };

  // ── Loading state ──────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Push Notification Banner */}
      {showPushBanner && pushSupported && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <Bell className="w-4 h-4 shrink-0" />
            <span>Get instant alerts when your AI needs help.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={requestPushPermission} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors">Enable notifications</button>
            <button onClick={dismissPushBanner} className="text-xs text-blue-500 hover:text-blue-700">Not now</button>
          </div>
        </div>
      )}
      {/* Stats Bar */}
      <LeasingErrorBoundary panelName="Stats Bar">
        {stats && (
          <div className="border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-6 text-sm overflow-x-auto no-scrollbar">
              <Stat label="Active" value={stats.activeConversations} />
              <Stat label="Showings This Week" value={stats.showingsThisWeek} />
              <Stat label="Hot Leads" value={stats.hotLeads} accent="text-red-600" />
              {stats.waitlistCount > 0 && (
                <Stat label="Waitlisted" value={stats.waitlistCount} accent="text-violet-600" />
              )}
              <Stat label="Messages Today" value={`${stats.messagesToday}/${stats.dailyLimit}`} />
              {stats.escalatedCount > 0 && (
                <Stat label="Escalated" value={stats.escalatedCount} accent="text-red-600" pulse />
              )}
              <div className="ml-auto flex items-center gap-2">
                {/* Plan badge */}
                {(() => {
                  const activeConf = configs.find(c => c.id === (configFilter || configs[0]?.id));
                  const t = activeConf?.tier || "free";
                  if (t === "free") return null;
                  return (
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${
                      t === "team" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {t}
                    </span>
                  );
                })()}
                <button
                  onClick={() => router.push("/leasing/setup")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Add Property</span>
                </button>
                {(configFilter || configs[0]?.id) && (
                  <>
                    <button
                      onClick={() => router.push(`/leasing/${configFilter || configs[0]?.id}/knowledge`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Knowledge Base</span>
                    </button>
                    <button
                      onClick={() => router.push(`/leasing/analytics?configId=${configFilter || configs[0]?.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Analytics</span>
                    </button>
                    <button
                      onClick={() => router.push(`/leasing/${configFilter || configs[0]?.id}/web-chat`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Web Chat</span>
                    </button>
                    <button
                      onClick={() => router.push(`/leasing/${configFilter || configs[0]?.id}/team`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Team</span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => router.push("/leasing/referral")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                >
                  <Gift className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Refer & Earn</span>
                </button>
                <button
                  onClick={() => router.push("/leasing/setup")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Settings</span>
                </button>
                {(() => {
                  const activeConf = configs.find(c => c.id === (configFilter || configs[0]?.id));
                  if (activeConf?.tier === "pro" || activeConf?.tier === "team") {
                    return (
                      <button
                        onClick={async () => {
                          const res = await createBillingPortalSession(activeConf.id);
                          if (res.url) window.location.href = res.url;
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Billing</span>
                      </button>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
        )}
      </LeasingErrorBoundary>

      {/* Upgrade Banner — limit hit */}
      {usage && (
        <LimitBanner
          messagesUsed={usage.messagesToday}
          messageLimit={usage.dailyLimit}
          pendingCount={queuedCount}
          configId={configFilter || configs[0]?.id || ""}
        />
      )}

      {/* Queued Messages Banner (when under limit but still have queued from before) */}
      {usage && usage.messagesToday < usage.dailyLimit && queuedCount > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5">
          <div className="flex items-center gap-3 text-sm">
            <Clock className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span className="text-blue-800">
              <strong>{queuedCount}</strong> queued message{queuedCount !== 1 ? "s" : ""} being processed from the rate limit period.
            </span>
          </div>
        </div>
      )}

      {/* Waitlist Match Banner — available units + waitlisted prospects */}
      {waitlistAlerts.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
          {waitlistAlerts.map((alert) => (
            <div key={alert.configId} className="flex items-center gap-3 text-sm">
              <Bell className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-amber-800">
                <strong>{alert.waitlistedCount}</strong> waitlisted prospect{alert.waitlistedCount !== 1 ? "s" : ""} match
                {alert.waitlistedCount === 1 ? "es" : ""} available unit{alert.availableListingCount !== 1 ? "s" : ""} at{" "}
                <strong>{alert.propertyName}</strong> — notify them?
              </span>
              <button
                onClick={() => {
                  setConfigFilter(alert.configId);
                  setStatusFilter("waitlisted");
                }}
                className="ml-auto flex-shrink-0 flex items-center gap-1 px-3 py-1 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors"
              >
                <ListChecks className="w-3 h-3" />
                Review Waitlist
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Google Calendar Connect Banner (Pro users without calendar) */}
      {calendarStatus && calendarStatus.hasProConfig && !calendarStatus.connected && (
        <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-2.5">
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="w-4 h-4 text-indigo-600 flex-shrink-0" />
            <span className="text-indigo-800">
              Connect Google Calendar to auto-book showings. Prospects pick a slot, it goes straight on your calendar.
            </span>
            <a
              href="/settings/gmail"
              className="ml-auto flex-shrink-0 flex items-center gap-1 px-3 py-1 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Calendar className="w-3 h-3" />
              Connect Calendar
            </a>
          </div>
        </div>
      )}

      {/* Connection Lost Banner */}
      {connectionLost && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
          <div className="flex items-center gap-3 text-sm">
            <WifiOff className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="text-amber-800">
              Connection lost — data may be stale. Retrying...
            </span>
            <button
              onClick={async () => {
                try {
                  await Promise.all([loadConversations(), loadStats(), loadUsage()]);
                  pollFailureCount.current = 0;
                  setConnectionLost(false);
                } catch { /* still lost */ }
              }}
              className="ml-auto flex-shrink-0 px-3 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200 transition-colors"
            >
              Retry Now
            </button>
          </div>
        </div>
      )}

      {/* Main: Two-Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Conversation List */}
        <LeasingErrorBoundary panelName="Conversation List">
        <div className={`w-full md:w-[380px] md:min-w-[340px] md:max-w-[420px] border-r border-slate-200 bg-white flex flex-col ${mobileShowDetail ? "hidden md:flex" : "flex"}`}>
          {/* Filters */}
          <div className="p-3 border-b border-slate-100 space-y-2">
            {/* Property filter */}
            {configs.length > 1 && (
              <div className="relative">
                <select
                  value={configFilter}
                  onChange={(e) => setConfigFilter(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 pr-8 bg-white text-slate-700 appearance-none"
                >
                  <option value="">All Properties</option>
                  {configs.map((c) => (
                    <option key={c.id} value={c.id}>{c.propertyAddress || c.propertyName}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            )}

            {/* Status pills */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    statusFilter === f.value
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {f.label}
                  {f.value === "escalated" && stats && stats.escalatedCount > 0 && (
                    <span className="ml-1 inline-flex w-4 h-4 items-center justify-center bg-red-500 text-white text-[10px] rounded-full">
                      {stats.escalatedCount}
                    </span>
                  )}
                  {f.value === "waitlisted" && stats && stats.waitlistCount > 0 && (
                    <span className="ml-1 inline-flex w-4 h-4 items-center justify-center bg-amber-500 text-white text-[10px] rounded-full">
                      {stats.waitlistCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, phone, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <MessageSquare className="w-10 h-10 text-slate-300 mb-3" />
                <p className="text-sm font-medium text-slate-500">No conversations yet</p>
                <p className="text-xs text-slate-400 mt-1">Conversations will appear here when prospects text or email your AI agent</p>
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                    selected?.id === c.id ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Channel icon + traffic light */}
                    <div className="flex flex-col items-center gap-1 mt-1 flex-shrink-0">
                      {c.channel === "email" ? (
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                      ) : c.channel === "web_chat" ? (
                        <Globe className="w-3.5 h-3.5 text-blue-400" />
                      ) : c.channel === "voice" ? (
                        <Phone className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <div className={`w-2.5 h-2.5 rounded-full ${trafficLight(c)} ${
                          c.status === "escalated" ? "animate-pulse" : ""
                        }`} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-slate-900 truncate">
                          {displayName(c)}
                          {c.detectedLanguage === "es" && <span className="ml-1" title="Español">🇪🇸</span>}
                          {c.detectedLanguage === "zh" && <span className="ml-1" title="中文">🇨🇳</span>}
                          {c.detectedLanguage === "ru" && <span className="ml-1" title="Русский">🇷🇺</span>}
                          {c.detectedLanguage === "he" && <span className="ml-1" title="עברית">🇮🇱</span>}
                        </span>
                        <span className="text-[11px] text-slate-400 flex-shrink-0">
                          {c.lastMessageAt ? timeAgo(c.lastMessageAt) : ""}
                        </span>
                      </div>

                      {/* Email subject */}
                      {c.channel === "email" && c.emailSubject && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate italic">
                          {c.emailSubject}
                        </p>
                      )}

                      {/* Unit + price */}
                      {(c.listingUnit || c.listingRent) && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {c.listingUnit ? `Unit ${c.listingUnit}` : ""}
                          {c.listingBedrooms ? ` · ${c.listingBedrooms === "0" || c.listingBedrooms === "studio" ? "Studio" : `${c.listingBedrooms}BR`}` : ""}
                          {c.listingRent ? ` · $${c.listingRent.toLocaleString()}` : ""}
                        </p>
                      )}

                      {/* Last message preview */}
                      {c.lastMessagePreview && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {c.lastMessageSender === "ai" ? "AI: " : c.lastMessageSender === "agent" ? "You: " : ""}
                          {c.lastMessagePreview}
                        </p>
                      )}

                      {/* Score + temperature + escalation */}
                      <div className="flex items-center gap-2 mt-1.5">
                        {c.leadScore != null && (
                          <span className="text-[11px] text-slate-500">Score: {c.leadScore}</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TEMPERATURE_COLORS[c.temperature] || "bg-slate-100 text-slate-500"}`}>
                          {TEMPERATURE_LABELS[c.temperature] || c.temperature}
                        </span>
                        {c.status === "escalated" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700 animate-pulse">
                            Escalated{c.showingAgentName ? ` → ${c.showingAgentName}` : ""}
                          </span>
                        )}
                        {c.status === "showing_scheduled" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-violet-100 text-violet-700 flex items-center gap-0.5">
                            <Calendar className="w-2.5 h-2.5" />
                            {c.showingAt
                              ? new Date(c.showingAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                              : "Showing"}
                          </span>
                        )}
                        {c.onWaitlist && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                            Waitlisted
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Usage Widget */}
          {usage && (
            <UsageWidget usage={usage} />
          )}
        </div>

        </LeasingErrorBoundary>

        {/* Right Panel: Conversation Detail */}
        <LeasingErrorBoundary panelName="Conversation Detail">
        <div className={`flex-1 flex flex-col bg-slate-50 ${!mobileShowDetail ? "hidden md:flex" : "flex"}`}>
          {detailLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : !selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <MessageSquare className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-500">Select a conversation</p>
              <p className="text-xs text-slate-400 mt-1">Click on a conversation to view the full thread</p>
            </div>
          ) : (
            <>
              {/* Detail Header */}
              <div className="bg-white border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-3">
                  {/* Mobile back button */}
                  <button
                    onClick={() => { setMobileShowDetail(false); }}
                    className="md:hidden p-1 -ml-1 text-slate-500 hover:text-slate-700"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-slate-900 truncate">{displayName(selected)}</h2>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        CONVERSATION_STATUS_COLORS[selected.status] || "bg-slate-100 text-slate-500"
                      }`}>
                        {CONVERSATION_STATUS_LABELS[selected.status] || selected.status}
                      </span>
                      {selected.qualData?.detectedLanguage === "es" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">
                          Español
                        </span>
                      )}
                      {selected.qualData?.detectedLanguage === "zh" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">
                          中文
                        </span>
                      )}
                      {selected.qualData?.detectedLanguage === "ru" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">
                          Русский
                        </span>
                      )}
                      {selected.qualData?.detectedLanguage === "he" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">
                          עברית
                        </span>
                      )}
                      {selected.qualData?.concessionOffered && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          🎁 Concession offered
                        </span>
                      )}
                      {selected.channel === "voice" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
                          📞 Voice call
                          {selected.qualData?.callDurationSeconds != null && (
                            <span className="text-green-500">
                              ({Math.floor(selected.qualData.callDurationSeconds / 60)}:{String(selected.qualData.callDurationSeconds % 60).padStart(2, "0")})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {selected.channel === "email" && selected.prospectEmail ? (
                        <>
                          <a href={`mailto:${selected.prospectEmail}`} className="flex items-center gap-1 hover:text-blue-600">
                            <Mail className="w-3 h-3" />
                            {selected.prospectEmail}
                          </a>
                          {selected.emailSubject && (
                            <>
                              <span className="text-slate-300">|</span>
                              <span className="truncate italic text-slate-400">{selected.emailSubject}</span>
                            </>
                          )}
                        </>
                      ) : (
                        <a href={`tel:${selected.prospectPhone}`} className="flex items-center gap-1 hover:text-blue-600">
                          <Phone className="w-3 h-3" />
                          {selected.prospectPhone.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}
                        </a>
                      )}
                      {selected.propertyAddress && (
                        <>
                          <span className="text-slate-300">|</span>
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {selected.propertyAddress}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex items-center gap-1">
                    {selected.status !== "closed_lost" && (
                      <button
                        onClick={handleMarkDead}
                        title="Mark as Dead"
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Skull className="w-4 h-4" />
                      </button>
                    )}
                    {selected.contactId && (
                      <button
                        onClick={() => router.push(`/contacts/${selected.contactId}`)}
                        title="View Contact"
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <UserCircle2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Escalation Banner */}
              {selected.status === "escalated" && (
                <div className="bg-red-50 border-b border-red-200 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-red-800">
                        Escalated: {ESCALATION_LABELS[selected.escalationReason || ""] || selected.escalationReason || "Unknown"}
                      </p>
                      {selected.showingAgentName && (
                        <p className="text-xs text-red-700 mt-1 flex items-center gap-1">
                          <Users className="w-3 h-3" /> Assigned to {selected.showingAgentName}
                        </p>
                      )}
                      {selected.aiSummary && (
                        <p className="text-xs text-red-700 mt-1">{selected.aiSummary}</p>
                      )}
                    </div>
                    <button
                      onClick={handleResolve}
                      className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors flex-shrink-0"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              )}

              {/* Missed escalation push re-prompt */}
              {selected.status === "escalated" && pushSupported && Notification.permission === "default" && !localStorage.getItem("push_prompt_dismissed") && selected.escalatedAt && (Date.now() - new Date(selected.escalatedAt).getTime() > 5 * 60 * 1000) && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
                  <Bell className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="text-xs text-amber-800 flex-1">You missed an escalation. Enable push notifications to get instant alerts.</span>
                  <button onClick={requestPushPermission} className="text-xs font-medium text-amber-700 hover:text-amber-900 underline shrink-0">Enable</button>
                </div>
              )}

              {/* Showing Banner */}
              {selected.showingAt && selected.status !== "closed_lost" && (
                <div className="bg-violet-50 border-b border-violet-200 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-violet-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-violet-800">
                        Showing {selected.status === "showing_scheduled" ? "confirmed" : "suggested"}:{" "}
                        {new Date(selected.showingAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                      {selected.listingUnit && (
                        <p className="text-xs text-violet-600">Unit {selected.listingUnit}</p>
                      )}
                    </div>
                    {selected.status !== "showing_scheduled" && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={handleConfirmShowing}
                          className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Confirm
                        </button>
                        <button
                          onClick={handleDeclineShowing}
                          className="px-3 py-1.5 bg-white text-slate-600 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Content Area: Messages + Qualification Sidebar */}
              <div className="flex-1 flex overflow-hidden">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <div className="max-w-2xl mx-auto space-y-3">
                    {selected.messages
                      .filter((m) => m.intentDetected !== "__test__")
                      .map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender === "prospect" ? "justify-start" : "justify-end"}`}
                      >
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                          msg.sender === "prospect"
                            ? "bg-white border border-slate-200 text-slate-800"
                            : msg.sender === "agent"
                              ? "bg-emerald-600 text-white"
                              : "bg-blue-600 text-white"
                        }`}>
                          {msg.sender === "agent" && (
                            <p className="text-[10px] opacity-75 mb-0.5">You (manual)</p>
                          )}
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                          <div className={`flex items-center gap-1.5 mt-1 ${
                            msg.sender === "prospect" ? "text-slate-400" : "text-white/60"
                          }`}>
                            <span className="text-[10px]">
                              {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </span>
                            {msg.sender === "ai" && msg.deliveryStatus === "delivered" && (
                              <span className="text-[10px] text-white/50">✓✓</span>
                            )}
                            {msg.sender === "ai" && (msg.deliveryStatus === "failed" || msg.deliveryStatus === "undelivered") && (
                              <span className="flex items-center gap-1">
                                <span className="text-[10px] text-red-300">✗ Delivery failed</span>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const res = await retryFailedMessage(msg.id);
                                    if (res.success && selected) {
                                      const refreshed = await getConversation(selected.id);
                                      if (refreshed.conversation) setSelected(refreshed.conversation);
                                    }
                                  }}
                                  className="text-[10px] text-red-200 hover:text-white underline flex items-center gap-0.5"
                                >
                                  <RefreshCw className="w-2.5 h-2.5" />Retry
                                </button>
                              </span>
                            )}
                            {msg.sender === "ai" && msg.deliveryStatus === "retry_sent" && (
                              <span className="text-[10px] text-amber-300">↻ Retried</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Qualification Sidebar (desktop only) */}
                <div className="hidden lg:block w-56 border-l border-slate-200 bg-white overflow-y-auto p-3">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Qualification</h4>
                  <div className="space-y-3">
                    <QualField label="Budget" value={selected.qualData.budget ? `$${Number(selected.qualData.budget).toLocaleString()}` : null} />
                    <QualField label="Move-in" value={selected.qualData.moveInDate} />
                    <QualField label="Bedrooms" value={selected.qualData.bedrooms} />
                    <QualField label="Household" value={selected.qualData.householdSize} />
                    <QualField label="Pets" value={selected.qualData.pets === true ? (selected.qualData.petDetails || "Yes") : selected.qualData.pets === false ? "No" : null} />
                    <QualField label="Employment" value={selected.qualData.employment} />
                    <QualField label="Email" value={selected.prospectEmail} />

                    {/* Temperature + Score */}
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Temperature</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TEMPERATURE_COLORS[selected.temperature] || ""}`}>
                          {TEMPERATURE_LABELS[selected.temperature] || selected.temperature}
                        </span>
                      </div>
                      {selected.qualData.leadScore != null && (
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-slate-500">Lead Score</span>
                          <span className="text-sm font-semibold text-slate-700">{selected.qualData.leadScore}</span>
                        </div>
                      )}
                    </div>

                    {/* AI Summary */}
                    {selected.aiSummary && selected.status !== "escalated" && (
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-xs text-slate-500 mb-1">AI Summary</p>
                        <p className="text-xs text-slate-600 leading-relaxed">{selected.aiSummary}</p>
                      </div>
                    )}

                    {/* Waitlist Status */}
                    {selected.onWaitlist && (
                      <div className="pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-1.5 mb-1">
                          <ListChecks className="w-3 h-3 text-amber-600" />
                          <p className="text-xs font-medium text-amber-700">On Waitlist</p>
                        </div>
                        {selected.waitlistUnits.length > 0 && (
                          <p className="text-xs text-slate-600">
                            Wants: {selected.waitlistUnits.join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Qualification Section (mobile only, collapsible) */}
              <MobileQualSection conv={selected} />

              {/* Follow-Up Sequence */}
              {pendingFollowUps.length > 0 || followUpTier === "free" ? (
                <FollowUpSequence
                  followUps={pendingFollowUps}
                  tier={followUpTier}
                  onSkip={async (id) => {
                    const res = await skipFollowUp(id);
                    if (res.success) {
                      setPendingFollowUps((prev) => prev.filter((f) => f.id !== id));
                    }
                  }}
                  onSendNow={async (id) => {
                    const res = await sendFollowUpNow(id);
                    if (res.success) {
                      setPendingFollowUps((prev) =>
                        prev.map((f) => f.id === id ? { ...f, scheduledFor: new Date().toISOString() } : f),
                      );
                    }
                  }}
                />
              ) : null}

              {/* Reply Input */}
              <div className="bg-white border-t border-slate-200 px-4 py-3">
                <form
                  onSubmit={(e) => { e.preventDefault(); handleReply(); }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    placeholder={
                      selected?.qualData?.detectedLanguage === "es" ? "Responder en español..." :
                      selected?.qualData?.detectedLanguage === "zh" ? "用中文回复..." :
                      selected?.qualData?.detectedLanguage === "ru" ? "Ответить по-русски..." :
                      selected?.qualData?.detectedLanguage === "he" ? "...השב בעברית" :
                      "Type a message..."
                    }
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 text-sm border border-slate-200 rounded-full px-4 py-2 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim() || sending}
                    className="p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>
                {replyError && (
                  <p className="text-xs text-red-600 mt-1 text-center">{replyError}</p>
                )}
                <p className="text-[10px] text-slate-400 mt-1 text-center">
                  {selected.channel === "email"
                    ? "Sent via email — conversation stays in AI mode"
                    : selected.channel === "voice"
                    ? "Sent via SMS to caller — voice call has ended"
                    : `Sent from AI's number (${selected.twilioNumber || "not assigned"}) — conversation stays in AI mode`}
                </p>
              </div>
            </>
          )}
        </div>
        </LeasingErrorBoundary>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function Stat({ label, value, accent, pulse }: { label: string; value: string | number; accent?: string; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${accent || "text-slate-900"} ${pulse ? "animate-pulse" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function QualField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-sm ${value ? "text-slate-700" : "text-slate-300 italic"}`}>
        {value || "Not collected"}
      </p>
    </div>
  );
}

function MobileQualSection({ conv }: { conv: ConversationDetail }) {
  const [open, setOpen] = useState(false);
  const hasData = conv.qualData.budget || conv.qualData.moveInDate || conv.qualData.bedrooms ||
    conv.qualData.householdSize || conv.qualData.pets !== undefined || conv.qualData.employment;

  if (!hasData) return null;

  return (
    <div className="lg:hidden border-t border-slate-200 bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2 flex items-center justify-between text-xs font-medium text-slate-600"
      >
        <span>Qualification Data</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-2">
          <QualField label="Budget" value={conv.qualData.budget ? `$${Number(conv.qualData.budget).toLocaleString()}` : null} />
          <QualField label="Move-in" value={conv.qualData.moveInDate} />
          <QualField label="Bedrooms" value={conv.qualData.bedrooms} />
          <QualField label="Household" value={conv.qualData.householdSize} />
          <QualField label="Pets" value={conv.qualData.pets === true ? (conv.qualData.petDetails || "Yes") : conv.qualData.pets === false ? "No" : null} />
          <QualField label="Employment" value={conv.qualData.employment} />
        </div>
      )}
    </div>
  );
}

function UsageWidget({ usage }: { usage: DetailedUsageStats }) {
  // Time until reset
  const msUntilReset = Math.max(0, new Date(usage.resetsAt).getTime() - Date.now());
  const hoursLeft = Math.floor(msUntilReset / 3600000);
  const minsLeft = Math.floor((msUntilReset % 3600000) / 60000);
  const pct = usage.dailyLimit > 0 ? Math.min(100, (usage.messagesToday / usage.dailyLimit) * 100) : 0;
  const atLimit = usage.messagesToday >= usage.dailyLimit;

  return (
    <div className="border-t border-slate-200 bg-white p-3 flex-shrink-0">
      <div className="text-[11px] font-medium text-slate-500 mb-1.5 flex items-center justify-between">
        <span>Today&apos;s Usage</span>
        <span className={atLimit ? "text-red-600 font-semibold" : ""}>{usage.messagesToday}/{usage.dailyLimit} msgs</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            atLimit ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-blue-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="text-[10px] text-slate-400 space-y-0.5">
        <div className="flex justify-between">
          <span>{usage.sentToday} sent | {usage.receivedToday} received</span>
          <span>{usage.newConversationsToday} new conv{usage.newConversationsToday !== 1 ? "s" : ""}</span>
        </div>
        {usage.showingsSuggestedToday > 0 && (
          <div>{usage.showingsSuggestedToday} showing{usage.showingsSuggestedToday !== 1 ? "s" : ""} suggested</div>
        )}
        <div className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          Resets in {hoursLeft}h {minsLeft}m
        </div>
      </div>

      {/* Weekly summary */}
      {usage.weeklyMessages > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
          This week: {usage.weeklyMessages} msgs · {usage.weeklyConversations} convs · {usage.weeklyShowings} showings
          {usage.weeklyLeases > 0 && <> · {usage.weeklyLeases} lease{usage.weeklyLeases !== 1 ? "s" : ""}</>}
        </div>
      )}

      {/* Upgrade CTA when at 80%+ */}
      {pct >= 80 && !atLimit && (
        <a
          href="/settings/billing?upgrade=leasing_pro"
          className="mt-2 flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 text-[11px] font-medium rounded-lg hover:bg-blue-100 transition-colors"
        >
          <ArrowUpRight className="w-3 h-3" />
          Upgrade for 200 msgs/day
        </a>
      )}
    </div>
  );
}

// ── Follow-Up Sequence ───────────────────────────────────────

const FOLLOW_UP_LABELS: Record<string, string> = {
  no_response: "Follow-up",
  touch_1: "Touch 1",
  touch_2: "Touch 2",
  touch_3: "Touch 3",
  showing_reminder: "Showing Reminder",
  post_showing: "Post-Showing",
  app_nudge: "Application Nudge",
  re_engage: "Re-engage",
  check_in: "Check-in",
  application_nudge: "Application",
};

function FollowUpSequence({
  followUps,
  tier,
  onSkip,
  onSendNow,
}: {
  followUps: PendingFollowUp[];
  tier: string;
  onSkip: (id: string) => void;
  onSendNow: (id: string) => void;
}) {
  const isFree = tier === "free";

  return (
    <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Follow-up Sequence</span>
        {isFree && followUps.length <= 1 && (
          <a
            href="/settings/billing?upgrade=leasing_pro"
            className="ml-auto flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-700"
          >
            <Lock className="w-3 h-3" />
            Pro: 3-touch cadence
          </a>
        )}
      </div>

      {followUps.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No pending follow-ups</p>
      ) : (
        <div className="space-y-1.5">
          {followUps.map((fu) => {
            const d = new Date(fu.scheduledFor);
            const label = FOLLOW_UP_LABELS[fu.type] || fu.type;
            const dateStr = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

            return (
              <div key={fu.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-slate-100">
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-slate-700">{label}</span>
                  <span className="text-[10px] text-slate-400 ml-2">{dateStr} · {timeStr}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => onSendNow(fu.id)}
                    title="Send now"
                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onSkip(fu.id)}
                    title="Skip"
                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
