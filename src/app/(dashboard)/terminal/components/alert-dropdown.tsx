"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Check, MapPin, Grid3X3, User, Map } from "lucide-react";
import { getUnreadAlertCount, getAlerts, markAlertsRead, markAllAlertsRead } from "../actions";

// ── Types ─────────────────────────────────────────────────────

interface Alert {
  id: string;
  read: boolean;
  notifiedAt: string;
  watchlist: {
    watchType: "bbl" | "block" | "owner" | "nta";
    watchValue: string;
    label: string | null;
  };
  event: {
    id: string;
    eventType: string;
    bbl: string;
    borough: number;
    aiBrief: string | null;
    detectedAt: string;
  };
}

interface Props {
  onAlertClick: (eventId: string, bbl: string) => void;
}

const WATCH_ICONS = {
  bbl: MapPin,
  block: Grid3X3,
  owner: User,
  nta: Map,
};

const EVENT_BADGES: Record<string, { label: string; color: string }> = {
  SALE_RECORDED: { label: "Sale", color: "text-[#30D158]" },
  LOAN_RECORDED: { label: "Loan", color: "text-[#0A84FF]" },
  NEW_BUILDING_PERMIT: { label: "Permit", color: "text-[#0A84FF]" },
  MAJOR_ALTERATION: { label: "Alt-1", color: "text-[#0A84FF]" },
  HPD_VIOLATION: { label: "HPD", color: "text-[#FF6B6B]" },
  DOB_STOP_WORK: { label: "SWO", color: "text-[#FF6B6B]" },
  ECB_HIGH_PENALTY: { label: "ECB", color: "text-[#FF6B6B]" },
  STALLED_SITE: { label: "Stalled", color: "text-[#FFD93D]" },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ── Component ────────────────────────────────────────────────

export default function AlertDropdown({ onAlertClick }: Props) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Poll unread count every 60s
  const refreshCount = useCallback(async () => {
    try {
      const count = await getUnreadAlertCount();
      setUnreadCount(count);
    } catch {
      // Silent failure
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 60_000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  // Load alerts when opening
  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAlerts({ limit: 20 });
      setAlerts(data);
    } catch {
      // Silent failure
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpen = () => {
    if (!open) {
      loadAlerts();
    }
    setOpen(!open);
  };

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleAlertClick = async (alert: Alert) => {
    if (!alert.read) {
      await markAlertsRead([alert.id]);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alert.id ? { ...a, read: true } : a)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    onAlertClick(alert.event.id, alert.event.bbl);
    setOpen(false);
  };

  const handleMarkAllRead = async () => {
    await markAllAlertsRead();
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setUnreadCount(0);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button with badge */}
      <button
        onClick={handleOpen}
        className="relative p-1 text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
        aria-label={`Alerts${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell size={14} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-[#0A84FF] text-white text-[8px] font-bold min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-0.5">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] bg-[#161B22] border border-[#21262D] rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#21262D]">
            <h3 className="text-xs font-semibold text-[#E6EDF3]">Alerts</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[10px] text-[#0A84FF] hover:text-[#0A84FF]/80 font-medium"
              >
                <Check size={10} />
                Mark all read
              </button>
            )}
          </div>

          {/* Alert list */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading && alerts.length === 0 ? (
              <div className="flex justify-center py-8">
                <div className="w-4 h-4 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[#484F58] text-xs">No alerts yet</p>
                <p className="text-[#484F58] text-[10px] mt-1">Create watchlists to get notified</p>
              </div>
            ) : (
              alerts.map((alert) => {
                const WatchIcon = WATCH_ICONS[alert.watchlist.watchType];
                const badge = EVENT_BADGES[alert.event.eventType];
                const brief = alert.event.aiBrief
                  ? alert.event.aiBrief.slice(0, 80) + (alert.event.aiBrief.length > 80 ? "..." : "")
                  : null;

                return (
                  <button
                    key={alert.id}
                    onClick={() => handleAlertClick(alert)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-[#1C2333] transition-colors border-l-2 ${
                      alert.read ? "border-l-transparent" : "border-l-[#0A84FF]"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <WatchIcon size={12} className="text-[#8B949E] mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[11px] font-mono text-[#E6EDF3] truncate">
                            {alert.event.bbl}
                          </span>
                          {badge && (
                            <span className={`text-[9px] font-semibold ${badge.color}`}>
                              {badge.label}
                            </span>
                          )}
                          <span className="text-[9px] text-[#484F58] ml-auto shrink-0">
                            {relativeTime(alert.notifiedAt)}
                          </span>
                        </div>
                        {brief && (
                          <p className="text-[10px] text-[#8B949E] leading-tight line-clamp-2">
                            {brief}
                          </p>
                        )}
                        <p className="text-[9px] text-[#484F58] mt-0.5 truncate">
                          via {alert.watchlist.label || alert.watchlist.watchValue}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
