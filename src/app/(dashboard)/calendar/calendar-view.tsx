"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Plus, X, ChevronDown,
  Clock, MapPin, Users, Pencil, Trash2,
} from "lucide-react";
import {
  getCalendarEvents, createEvent, updateEvent, deleteEvent,
  syncCalendar, getTasksForCalendar,
  type CalendarEventData,
} from "./actions";

// ============================================================
// CONSTANTS & HELPERS
// ============================================================

const VIEW_MODES = ["month", "week", "day", "agenda"] as const;
type ViewMode = (typeof VIEW_MODES)[number];

const EVENT_TYPES = [
  { value: "showing", label: "Showing", icon: "🟣", color: "#8B5CF6" },
  { value: "meeting", label: "Meeting", icon: "🔵", color: "#3B82F6" },
  { value: "open_house", label: "Open House", icon: "🟢", color: "#10B981" },
  { value: "inspection", label: "Inspection", icon: "🟡", color: "#F59E0B" },
  { value: "closing", label: "Closing", icon: "🔴", color: "#EF4444" },
  { value: "task_deadline", label: "Task", icon: "🟤", color: "#6366F1" },
  { value: "deal_milestone", label: "Milestone", icon: "⚫", color: "#EC4899" },
  { value: "general", label: "General", icon: "⚪", color: "#6B7280" },
];

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6 AM – 10 PM

function getEventIcon(type: string): string {
  return EVENT_TYPES.find((t) => t.value === type)?.icon || "⚪";
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function fmtDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(date);
}

function fmtShortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function fmtHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

function isPastDay(date: Date): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d < now;
}

function isWeekend(date: Date): boolean {
  return date.getDay() === 0 || date.getDay() === 6;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getMonthDays(date: Date): Date[] {
  const first = startOfMonth(date);
  const last = endOfMonth(date);
  const start = startOfWeek(first);
  const days: Date[] = [];
  let current = new Date(start);
  while (days.length < 42) {
    days.push(new Date(current));
    current = addDays(current, 1);
    if (days.length >= 35 && current > last && current.getDay() === 0) break;
  }
  return days;
}

function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function getDuration(start: string, end: string): string {
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function toLocalISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toLocalISOTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// Overlap layout algorithm for week/day time grids (Google Calendar style)
function layoutOverlappingEvents(events: CalendarEventData[]): Map<string, { left: number; width: number }> {
  const result = new Map<string, { left: number; width: number }>();
  if (events.length === 0) return result;

  const sorted = [...events].sort((a, b) => {
    const d = new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    if (d !== 0) return d;
    return (
      new Date(b.endAt).getTime() - new Date(b.startAt).getTime() -
      (new Date(a.endAt).getTime() - new Date(a.startAt).getTime())
    );
  });

  // Group into clusters of mutually overlapping events
  const clusters: CalendarEventData[][] = [];
  let cluster: CalendarEventData[] = [];
  let cEnd = 0;

  for (const event of sorted) {
    const s = new Date(event.startAt).getTime();
    const e = new Date(event.endAt).getTime();
    if (cluster.length === 0 || s < cEnd) {
      cluster.push(event);
      cEnd = Math.max(cEnd, e);
    } else {
      clusters.push(cluster);
      cluster = [event];
      cEnd = e;
    }
  }
  if (cluster.length > 0) clusters.push(cluster);

  for (const cl of clusters) {
    const columns: number[] = [];
    const colMap = new Map<string, number>();
    for (const ev of cl) {
      const s = new Date(ev.startAt).getTime();
      const e = new Date(ev.endAt).getTime();
      let col = 0;
      while (col < columns.length && columns[col] > s) col++;
      if (col >= columns.length) columns.push(0);
      columns[col] = e;
      colMap.set(ev.id, col);
    }
    const n = columns.length;
    for (const ev of cl) {
      const col = colMap.get(ev.id)!;
      result.set(ev.id, { left: col / n, width: 1 / n });
    }
  }
  return result;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function CalendarView({ gmailConnected }: { gmailConnected: boolean }) {
  const [view, setView] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showingCreatorOpen, setShowingCreatorOpen] = useState(false);

  // Unified modal state: view | edit | create
  const [modalMode, setModalMode] = useState<"view" | "edit" | "create" | null>(null);
  const [modalEvent, setModalEvent] = useState<CalendarEventData | null>(null);
  const [prefill, setPrefill] = useState<{ startAt?: string; endAt?: string } | null>(null);

  const getDateRange = useCallback((): [string, string] => {
    if (view === "month") {
      const first = startOfMonth(currentDate);
      const gridStart = startOfWeek(first);
      const gridEnd = addDays(gridStart, 42);
      return [gridStart.toISOString(), gridEnd.toISOString()];
    } else if (view === "week") {
      const start = startOfWeek(currentDate);
      return [start.toISOString(), addDays(start, 7).toISOString()];
    } else if (view === "day") {
      const start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      return [start.toISOString(), addDays(start, 1).toISOString()];
    } else {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return [start.toISOString(), addDays(start, 14).toISOString()];
    }
  }, [view, currentDate]);

  const loadEvents = useCallback(async () => {
    const [startDate, endDate] = getDateRange();
    const filters = eventTypeFilter ? { eventType: eventTypeFilter } : undefined;
    const [evts, tasks] = await Promise.all([
      getCalendarEvents(startDate, endDate, filters),
      getTasksForCalendar(startDate, endDate),
    ]);
    setEvents([...evts, ...tasks]);
    setLoading(false);
  }, [getDateRange, eventTypeFilter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleSync = async () => {
    if (!gmailConnected) return;
    setSyncing(true);
    try {
      await syncCalendar();
      await loadEvents();
    } catch (err) {
      console.error("Calendar sync error:", err);
    }
    setSyncing(false);
  };

  useEffect(() => {
    if (gmailConnected) handleSync();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (dir: number) => {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else if (view === "day") d.setDate(d.getDate() + dir);
    else d.setDate(d.getDate() + dir * 14);
    setCurrentDate(d);
  };

  const handleDayClick = (date: Date) => {
    setCurrentDate(date);
    setView("day");
  };

  const handleQuickCreate = (date: Date) => {
    const start = new Date(date);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(10, 0, 0, 0);
    setPrefill({ startAt: start.toISOString(), endAt: end.toISOString() });
    setModalEvent(null);
    setModalMode("create");
  };

  const handleTimeSlotClick = (date: Date, hour: number) => {
    const start = new Date(date);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 60);
    setPrefill({ startAt: start.toISOString(), endAt: end.toISOString() });
    setModalEvent(null);
    setModalMode("create");
  };

  const handleEventClick = (event: CalendarEventData) => {
    setModalEvent(event);
    setModalMode("view");
  };

  const handleCreateEvent = () => {
    setPrefill(null);
    setModalEvent(null);
    setModalMode("create");
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("Delete this event?")) return;
    await deleteEvent(eventId);
    setModalMode(null);
    setModalEvent(null);
    await loadEvents();
  };

  const handleSaveEvent = async (data: Record<string, unknown>) => {
    if (modalMode === "edit" && modalEvent) {
      await updateEvent(modalEvent.id, data as Parameters<typeof updateEvent>[1]);
    } else {
      await createEvent(data as Parameters<typeof createEvent>[0]);
    }
    setModalMode(null);
    setModalEvent(null);
    setPrefill(null);
    await loadEvents();
  };

  const closeModal = () => {
    setModalMode(null);
    setModalEvent(null);
    setPrefill(null);
  };

  const eventCount = events.length;
  const activeFilter = EVENT_TYPES.find((t) => t.value === eventTypeFilter);

  const titleLabel = (() => {
    if (view === "month")
      return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(currentDate);
    if (view === "week") {
      const ws = startOfWeek(currentDate);
      const we = addDays(ws, 6);
      if (ws.getMonth() === we.getMonth())
        return `${fmtShortDate(ws)} \u2013 ${we.getDate()}, ${we.getFullYear()}`;
      return `${fmtShortDate(ws)} \u2013 ${fmtShortDate(we)}, ${we.getFullYear()}`;
    }
    if (view === "day") return fmtDate(currentDate);
    return "Upcoming 2 Weeks";
  })();

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* ---- HEADER ---- */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200">
        {/* Left: actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateEvent}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> New Event
          </button>
          {gmailConnected && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {syncing ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                  Syncing...
                </span>
              ) : (
                "Sync"
              )}
            </button>
          )}
          <button
            onClick={() => setShowingCreatorOpen(true)}
            className="px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            Showings
          </button>
        </div>

        {/* Center: navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-[240px] text-center">
            <h2 className="text-xl font-bold text-slate-900 leading-tight">{titleLabel}</h2>
            <span className="text-[11px] text-slate-400 font-medium">
              {eventCount} event{eventCount !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={() => navigate(1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            Today
          </button>
        </div>

        {/* Right: filter + view switcher */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors text-slate-600"
            >
              {activeFilter && (
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeFilter.color }} />
              )}
              {activeFilter?.label || "All types"}
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setFilterOpen(false)} />
                <div
                  className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-30"
                  style={{ animation: "slide-up 150ms ease-out" }}
                >
                  <button
                    onClick={() => {
                      setEventTypeFilter(null);
                      setFilterOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${
                      !eventTypeFilter ? "font-semibold text-blue-600" : "text-slate-600"
                    }`}
                  >
                    All types
                  </button>
                  {EVENT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => {
                        setEventTypeFilter(t.value);
                        setFilterOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 ${
                        eventTypeFilter === t.value ? "font-semibold text-blue-600" : "text-slate-600"
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            {VIEW_MODES.map((m) => (
              <button
                key={m}
                onClick={() => setView(m)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                  view === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---- CONTENT ---- */}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-pulse space-y-4 w-full max-w-md">
                <div className="h-8 bg-slate-100 rounded w-48 mx-auto" />
                <div className="h-64 bg-slate-100 rounded" />
              </div>
            </div>
          ) : (
            <div key={`${view}-${currentDate.toISOString()}`} style={{ animation: "fade-in 150ms ease-out" }} className="h-full">
              {view === "month" && (
                <MonthView
                  currentDate={currentDate}
                  events={events}
                  onDayClick={handleDayClick}
                  onEventClick={handleEventClick}
                  onQuickCreate={handleQuickCreate}
                />
              )}
              {view === "week" && (
                <WeekView
                  currentDate={currentDate}
                  events={events}
                  onTimeSlotClick={handleTimeSlotClick}
                  onEventClick={handleEventClick}
                />
              )}
              {view === "day" && (
                <DayView
                  currentDate={currentDate}
                  events={events}
                  onTimeSlotClick={handleTimeSlotClick}
                  onEventClick={handleEventClick}
                />
              )}
              {view === "agenda" && <AgendaView events={events} onEventClick={handleEventClick} />}
            </div>
          )}
        </div>
        <MiniCalendarSidebar
          currentDate={currentDate}
          events={events}
          onDateSelect={(d) => {
            setCurrentDate(d);
            if (view === "month") setView("day");
          }}
        />
      </div>

      {/* ---- UNIFIED MODAL ---- */}
      {modalMode && (
        <UnifiedEventModal
          mode={modalMode}
          event={modalEvent}
          prefill={prefill}
          onClose={closeModal}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          onEditMode={() => setModalMode("edit")}
        />
      )}

      {/* ---- SHOWING CREATOR ---- */}
      {showingCreatorOpen && (
        <ShowingCreator
          onClose={() => setShowingCreatorOpen(false)}
          onCreated={() => {
            setShowingCreatorOpen(false);
            loadEvents();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// MONTH VIEW
// ============================================================

function MonthView({
  currentDate,
  events,
  onDayClick,
  onEventClick,
  onQuickCreate,
}: {
  currentDate: Date;
  events: CalendarEventData[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEventData) => void;
  onQuickCreate: (date: Date) => void;
}) {
  const days = getMonthDays(currentDate);
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const numWeeks = Math.ceil(days.length / 7);

  const getEventsForDay = (date: Date) => events.filter((e) => isSameDay(new Date(e.startAt), date));

  return (
    <div className="h-full flex flex-col">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-slate-200">
        {weekDays.map((d, i) => (
          <div
            key={d}
            className={`px-2 py-2 text-xs font-semibold text-center ${
              i === 0 || i === 6 ? "text-slate-400" : "text-slate-500"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div
        className="flex-1 grid grid-cols-7"
        style={{ gridTemplateRows: `repeat(${numWeeks}, 1fr)` }}
      >
        {days.map((day, i) => {
          const dayEvents = getEventsForDay(day);
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          const today = isToday(day);
          const weekend = isWeekend(day);
          const selected = isSameDay(day, currentDate);

          return (
            <div
              key={i}
              onClick={() => onDayClick(day)}
              className={`group relative border-b border-r border-slate-100 px-1.5 py-1 overflow-hidden cursor-pointer transition-colors ${
                today
                  ? "bg-blue-50/60 border-l-[3px] border-l-blue-500"
                  : weekend && isCurrentMonth
                    ? "bg-slate-50/40"
                    : !isCurrentMonth
                      ? "bg-slate-50/50"
                      : ""
              } ${selected && !today ? "ring-2 ring-blue-400 ring-inset" : ""} hover:bg-blue-50/40`}
            >
              {/* Date number */}
              <div className="flex items-center justify-between mb-0.5">
                <div
                  className={`text-xs font-medium w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
                    today
                      ? "bg-blue-600 text-white font-bold"
                      : isCurrentMonth
                        ? "text-slate-700"
                        : "text-slate-300"
                  }`}
                >
                  {day.getDate()}
                </div>
                {/* Quick create "+" button on hover */}
                <button
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onQuickCreate(day);
                  }}
                  className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[11px] leading-none font-bold hover:bg-blue-600"
                >
                  +
                </button>
              </div>

              {/* Event pills */}
              <div className="space-y-[3px]">
                {dayEvents.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onEventClick(e);
                    }}
                    className="text-[10px] px-1.5 py-[3px] rounded truncate font-medium cursor-pointer transition-all duration-150 hover:scale-[1.02] hover:shadow-sm"
                    style={{
                      backgroundColor: e.color + "15",
                      color: e.color,
                      borderLeft: `4px solid ${e.color}`,
                    }}
                  >
                    {e.allDay ? "" : fmtTime(e.startAt) + " "}
                    {e.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-slate-500 font-medium bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded-full cursor-pointer transition-colors inline-block">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// WEEK VIEW
// ============================================================

function WeekView({
  currentDate,
  events,
  onTimeSlotClick,
  onEventClick,
}: {
  currentDate: Date;
  events: CalendarEventData[];
  onTimeSlotClick: (date: Date, hour: number) => void;
  onEventClick: (event: CalendarEventData) => void;
}) {
  const days = getWeekDays(currentDate);
  const now = new Date();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, (now.getHours() - 7) * 60);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getTimedEvents = (date: Date) => events.filter((e) => !e.allDay && isSameDay(new Date(e.startAt), date));
  const getAllDayEvents = (date: Date) => events.filter((e) => e.allDay && isSameDay(new Date(e.startAt), date));
  const hasAllDay = days.some((d) => getAllDayEvents(d).length > 0);

  return (
    <div className="h-full flex flex-col">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="border-r border-slate-100" />
        {days.map((d, i) => (
          <div
            key={i}
            className={`text-center py-2 border-r border-slate-100 transition-colors ${isToday(d) ? "bg-blue-50" : ""}`}
          >
            <div className="text-[10px] font-semibold text-slate-400 uppercase">
              {new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d)}
            </div>
            <div
              className={`text-lg font-bold mx-auto w-9 h-9 flex items-center justify-center rounded-full ${
                isToday(d) ? "bg-blue-600 text-white" : "text-slate-700"
              }`}
            >
              {d.getDate()}
            </div>
          </div>
        ))}
      </div>

      {/* All-day row */}
      {hasAllDay && (
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-slate-200 bg-slate-50/50">
          <div className="text-[9px] text-slate-400 font-medium px-1 py-1 border-r border-slate-100">all-day</div>
          {days.map((d, i) => {
            const allDay = getAllDayEvents(d);
            return (
              <div key={i} className="px-1 py-1 border-r border-slate-100 space-y-0.5">
                {allDay.map((e) => (
                  <div
                    key={e.id}
                    onClick={() => onEventClick(e)}
                    className="text-[10px] px-1.5 py-0.5 rounded truncate font-medium cursor-pointer transition-all duration-150 hover:scale-[1.02]"
                    style={{ backgroundColor: e.color + "25", color: e.color, borderLeft: `3px solid ${e.color}` }}
                  >
                    {e.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Time grid: flex layout with independent day columns for correct event positioning */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="flex min-h-full">
          {/* Time gutter */}
          <div className="w-[60px] flex-shrink-0">
            {HOURS.map((hour) => (
              <div key={hour} className="h-[60px] border-r border-b border-slate-100 px-1 flex items-start justify-end">
                <span className="text-[10px] text-slate-400 font-medium -mt-1.5 pr-1">{fmtHour(hour)}</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d, di) => {
            const dayEvents = getTimedEvents(d);
            const layout = layoutOverlappingEvents(dayEvents);
            const todayCol = isToday(d);

            return (
              <div key={di} className="flex-1 relative">
                {/* Background grid slots */}
                {HOURS.map((hour) => {
                  const isNowSlot = todayCol && now.getHours() === hour;
                  return (
                    <div
                      key={hour}
                      className={`h-[60px] border-r border-b border-slate-100 cursor-pointer hover:bg-blue-50/30 transition-colors ${
                        todayCol ? "bg-blue-50/10" : isWeekend(d) ? "bg-slate-50/30" : ""
                      }`}
                      onClick={() => onTimeSlotClick(d, hour)}
                    >
                      {isNowSlot && (
                        <div
                          className="absolute left-0 right-0 border-t-2 border-red-500 z-10 pointer-events-none"
                          style={{ top: `${(hour - 6) * 60 + (now.getMinutes() / 60) * 60}px` }}
                        >
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm shadow-red-300 -mt-[5px] -ml-1 animate-pulse" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Events positioned absolutely within this day column */}
                {dayEvents.map((e) => {
                  const pos = layout.get(e.id) || { left: 0, width: 1 };
                  const startDate = new Date(e.startAt);
                  const endDate = new Date(e.endAt);
                  const startHour = startDate.getHours() + startDate.getMinutes() / 60;
                  const endHour = endDate.getHours() + endDate.getMinutes() / 60;
                  const topPx = (startHour - 6) * 60;
                  const heightPx = Math.max((endHour - startHour) * 60, 20);

                  return (
                    <div
                      key={e.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onEventClick(e);
                      }}
                      className="absolute rounded px-1.5 py-0.5 text-[10px] font-medium cursor-pointer overflow-hidden transition-all duration-150 hover:scale-[1.02] hover:shadow-md z-[5]"
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        left: `${pos.left * 100}%`,
                        width: `calc(${pos.width * 100}% - 2px)`,
                        backgroundColor: e.color + "20",
                        borderLeft: `3px solid ${e.color}`,
                        color: e.color,
                      }}
                    >
                      <div className="font-bold truncate">{e.title}</div>
                      {heightPx > 30 && <div className="truncate opacity-80">{fmtTime(e.startAt)}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DAY VIEW
// ============================================================

function DayView({
  currentDate,
  events,
  onTimeSlotClick,
  onEventClick,
}: {
  currentDate: Date;
  events: CalendarEventData[];
  onTimeSlotClick: (date: Date, hour: number) => void;
  onEventClick: (event: CalendarEventData) => void;
}) {
  const now = new Date();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayEvents = events.filter((e) => !e.allDay && isSameDay(new Date(e.startAt), currentDate));
  const allDayEvents = events.filter((e) => e.allDay && isSameDay(new Date(e.startAt), currentDate));
  const layout = layoutOverlappingEvents(dayEvents);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, (now.getHours() - 7) * 80);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex">
      {/* Main timeline */}
      <div className="flex-1 flex flex-col">
        <div className="px-4 py-2 bg-white border-b border-slate-200">
          <h3 className={`text-sm font-bold ${isToday(currentDate) ? "text-blue-600" : "text-slate-900"}`}>
            {isToday(currentDate) ? "Today \u2014 " : ""}
            {fmtDate(currentDate)}
          </h3>
        </div>

        {/* All day events */}
        {allDayEvents.length > 0 && (
          <div className="px-4 py-2 border-b border-slate-200 bg-slate-50/50 space-y-1">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">All Day</span>
            {allDayEvents.map((e) => (
              <div
                key={e.id}
                onClick={() => onEventClick(e)}
                className="text-xs px-2 py-1 rounded font-medium cursor-pointer transition-all duration-150 hover:scale-[1.01]"
                style={{ backgroundColor: e.color + "20", color: e.color, borderLeft: `4px solid ${e.color}` }}
              >
                {getEventIcon(e.eventType)} {e.title}
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto" ref={scrollRef}>
          <div className="flex">
            {/* Time gutter */}
            <div className="w-16 flex-shrink-0">
              {HOURS.map((hour) => (
                <div key={hour} className="h-[80px] px-2 py-3 text-right border-r border-b border-slate-100">
                  <span className="text-xs text-slate-400 font-medium">{fmtHour(hour)}</span>
                </div>
              ))}
            </div>

            {/* Day area with events positioned inside */}
            <div className="flex-1 relative">
              {/* Background slots */}
              {HOURS.map((hour) => {
                const isNowSlot = isToday(currentDate) && now.getHours() === hour;
                return (
                  <div
                    key={hour}
                    className="h-[80px] border-b border-slate-100 cursor-pointer hover:bg-blue-50/30 transition-colors"
                    onClick={() => onTimeSlotClick(currentDate, hour)}
                  >
                    {isNowSlot && (
                      <div
                        className="absolute left-0 right-0 border-t-2 border-red-500 z-10 pointer-events-none"
                        style={{ top: `${(hour - 6) * 80 + (now.getMinutes() / 60) * 80}px` }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm shadow-red-300 -mt-1.5 -ml-1 animate-pulse" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Events positioned absolutely within the day area */}
              {dayEvents.map((e) => {
                const pos = layout.get(e.id) || { left: 0, width: 1 };
                const startDate = new Date(e.startAt);
                const endDate = new Date(e.endAt);
                const startHour = startDate.getHours() + startDate.getMinutes() / 60;
                const endHour = endDate.getHours() + endDate.getMinutes() / 60;
                const topPx = (startHour - 6) * 80;
                const heightPx = Math.max((endHour - startHour) * 80, 30);

                return (
                  <div
                    key={e.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onEventClick(e);
                    }}
                    className="absolute rounded-lg px-3 py-1.5 cursor-pointer transition-all duration-150 hover:scale-[1.01] hover:shadow-md z-[5]"
                    style={{
                      top: `${topPx}px`,
                      height: `${heightPx}px`,
                      left: `${pos.left * 100}%`,
                      width: `calc(${pos.width * 100}% - 8px)`,
                      backgroundColor: e.color + "12",
                      borderLeft: `4px solid ${e.color}`,
                    }}
                  >
                    <div className="text-xs font-bold" style={{ color: e.color }}>
                      {e.title}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {fmtTime(e.startAt)} \u2014 {fmtTime(e.endAt)}
                    </div>
                    {e.contactName && (
                      <div className="text-[10px] text-emerald-600 font-medium">{e.contactName}</div>
                    )}
                    {e.location && <div className="text-[10px] text-slate-400 truncate">{e.location}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Day sidebar: event list */}
      <div className="w-[280px] border-l border-slate-200 bg-white flex-shrink-0 overflow-y-auto">
        <div className="px-4 py-3 border-b border-slate-200">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Events Today</h4>
        </div>
        {[...allDayEvents, ...dayEvents].length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-400">No events</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {[
              ...allDayEvents,
              ...dayEvents.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
            ].map((e) => (
              <div
                key={e.id}
                onClick={() => onEventClick(e)}
                className="px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
                  <span className="text-xs font-bold text-slate-900 truncate">{e.title}</span>
                </div>
                <div className="text-[10px] text-slate-500 ml-3.5">
                  {e.allDay
                    ? "All day"
                    : `${fmtTime(e.startAt)} \u2014 ${fmtTime(e.endAt)} \u00B7 ${getDuration(e.startAt, e.endAt)}`}
                </div>
                {e.contactName && (
                  <div className="text-[10px] text-emerald-600 font-medium ml-3.5 mt-0.5">{e.contactName}</div>
                )}
                {e.propertyAddress && (
                  <div className="text-[10px] text-slate-400 ml-3.5">{e.propertyAddress}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// AGENDA VIEW
// ============================================================

function AgendaView({
  events,
  onEventClick,
}: {
  events: CalendarEventData[];
  onEventClick: (event: CalendarEventData) => void;
}) {
  const grouped = new Map<string, CalendarEventData[]>();
  const sorted = [...events].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  for (const e of sorted) {
    const key = toLocalISODate(new Date(e.startAt));
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }

  if (grouped.size === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <span className="text-4xl block mb-2">📅</span>
          <p className="text-sm text-slate-500">No upcoming events</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-1">
      {Array.from(grouped.entries()).map(([dateStr, dayEvents]) => {
        const date = new Date(dateStr + "T12:00:00");
        const today = isToday(date);
        const tomorrow = isSameDay(date, addDays(new Date(), 1));
        const past = isPastDay(date);
        const label = today ? "Today" : tomorrow ? "Tomorrow" : "";

        return (
          <div key={dateStr}>
            {/* Sticky date header */}
            <div
              className={`sticky top-0 z-10 flex items-center gap-2 py-2.5 px-3 -mx-3 backdrop-blur-sm ${
                today ? "bg-blue-50/90 border-l-4 border-l-blue-500 rounded-r-lg" : "bg-white/90"
              }`}
            >
              {label && (
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    today ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {label}
                </span>
              )}
              <span className={`text-sm font-bold ${today ? "text-blue-700" : "text-slate-700"}`}>
                {fmtDate(date)}
              </span>
              <span className="text-xs text-slate-400">{dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="space-y-2 mt-2 mb-4">
              {dayEvents.map((e, i) => (
                <div
                  key={e.id}
                  onClick={() => onEventClick(e)}
                  className={`flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer transition-all duration-150 hover:border-blue-300 hover:shadow-sm hover:scale-[1.005] ${
                    past && !today ? "opacity-60" : ""
                  }`}
                  style={{
                    animation: "slide-up 150ms ease-out both",
                    animationDelay: `${Math.min(i * 30, 300)}ms`,
                  }}
                >
                  <div
                    className="w-1 h-full min-h-[40px] rounded-full flex-shrink-0"
                    style={{ backgroundColor: e.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{getEventIcon(e.eventType)}</span>
                      <span className="text-sm font-bold text-slate-900">{e.title}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {e.allDay
                        ? "All day"
                        : `${fmtTime(e.startAt)} \u2014 ${fmtTime(e.endAt)} \u00B7 ${getDuration(e.startAt, e.endAt)}`}
                    </div>
                    {e.contactName && (
                      <div className="text-xs text-emerald-600 font-medium mt-0.5">with {e.contactName}</div>
                    )}
                    {(e.propertyAddress || e.location) && (
                      <div className="text-xs text-slate-400 mt-0.5">{e.propertyAddress || e.location}</div>
                    )}
                    {e.dealName && (
                      <div className="text-xs text-purple-600 font-medium mt-0.5">Deal: {e.dealName}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// UNIFIED EVENT MODAL (View + Edit + Create)
// ============================================================

function UnifiedEventModal({
  mode,
  event,
  prefill,
  onClose,
  onSave,
  onDelete,
  onEditMode,
}: {
  mode: "view" | "edit" | "create";
  event: CalendarEventData | null;
  prefill: { startAt?: string; endAt?: string } | null;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  onDelete: (eventId: string) => void;
  onEditMode: () => void;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setEntered(true));
  }, []);

  // ---- VIEW MODE ----
  if (mode === "view" && event) {
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-colors duration-200 ${
          entered ? "bg-black/35" : "bg-black/0"
        }`}
        onClick={onClose}
      >
        <div
          className={`bg-white rounded-2xl shadow-2xl w-full max-w-md transition-all duration-200 ${
            entered ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Color bar */}
          <div className="h-1.5 rounded-t-2xl" style={{ backgroundColor: event.color }} />

          <div className="p-5">
            {/* Title row */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{event.title}</h3>
                <span className="text-[11px] text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded capitalize mt-1 inline-block">
                  {event.eventType.replace("_", " ")}
                </span>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Details */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 text-sm text-slate-600">
                <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>
                  {event.allDay
                    ? "All day"
                    : `${fmtTime(event.startAt)} \u2014 ${fmtTime(event.endAt)} \u00B7 ${getDuration(event.startAt, event.endAt)}`}
                </span>
                <span className="text-slate-400">{fmtShortDate(new Date(event.startAt))}</span>
              </div>

              {event.location && (
                <div className="flex items-center gap-2.5 text-sm text-slate-600">
                  <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span>{event.location}</span>
                </div>
              )}

              {event.propertyAddress && (
                <div className="flex items-center gap-2.5 text-sm text-slate-600">
                  <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span>
                    {event.propertyAddress}
                    {event.unitNumber ? ` #${event.unitNumber}` : ""}
                  </span>
                </div>
              )}

              {event.contactName && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <Link
                    href={`/contacts/${event.contactId}`}
                    className="text-emerald-600 font-medium hover:underline"
                  >
                    {event.contactName}
                  </Link>
                </div>
              )}

              {event.dealName && (
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="text-slate-400 flex-shrink-0 text-xs w-4 text-center">💰</span>
                  <Link href="/pipeline" className="text-purple-600 font-medium hover:underline">
                    {event.dealName}
                  </Link>
                </div>
              )}

              {event.description && (
                <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{event.description}</div>
              )}

              {event.attendees && (event.attendees as { email: string; name?: string; status?: string }[]).length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase mb-1.5">Attendees</p>
                  <div className="space-y-1">
                    {(event.attendees as { email: string; name?: string; status?: string }[]).map((a, i) => (
                      <div key={i} className="text-xs text-slate-600 flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            a.status === "accepted"
                              ? "bg-emerald-500"
                              : a.status === "declined"
                                ? "bg-red-500"
                                : "bg-slate-300"
                          }`}
                        />
                        {a.name || a.email}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-slate-400 pt-1">Source: {event.source}</div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2">
            {event.source !== "google" && !event.id.startsWith("task-") && (
              <>
                <button
                  onClick={onEditMode}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => onDelete(event.id)}
                  className="flex items-center gap-1.5 px-3.5 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </>
            )}
            <div className="flex-1" />
            <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-2 py-1">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- CREATE / EDIT MODE ----
  return <EventForm event={event} prefill={prefill} onSave={onSave} onClose={onClose} entered={entered} />;
}

// ============================================================
// EVENT FORM (used inside UnifiedEventModal for create/edit)
// ============================================================

function EventForm({
  event,
  prefill,
  onSave,
  onClose,
  entered,
}: {
  event: CalendarEventData | null;
  prefill: { startAt?: string; endAt?: string } | null;
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
  entered: boolean;
}) {
  const now = new Date();
  const defaultStart =
    prefill?.startAt ||
    event?.startAt ||
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0).toISOString();
  const defaultEnd =
    prefill?.endAt || event?.endAt || new Date(new Date(defaultStart).getTime() + 60 * 60000).toISOString();

  const [title, setTitle] = useState(event?.title || "");
  const [eventType, setEventType] = useState(event?.eventType || "general");
  const [date, setDate] = useState(toLocalISODate(new Date(defaultStart)));
  const [startTime, setStartTime] = useState(toLocalISOTime(new Date(defaultStart)));
  const [endTime, setEndTime] = useState(toLocalISOTime(new Date(defaultEnd)));
  const [allDay, setAllDay] = useState(event?.allDay || false);
  const [location, setLocation] = useState(event?.location || "");
  const [propertyAddress, setPropertyAddress] = useState(event?.propertyAddress || "");
  const [unitNumber, setUnitNumber] = useState(event?.unitNumber || "");
  const [description, setDescription] = useState(event?.description || "");
  const [color, setColor] = useState(event?.color || "#3B82F6");
  const [syncToGoogle, setSyncToGoogle] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const et = EVENT_TYPES.find((t) => t.value === eventType);
    if (et && !event) setColor(et.color);
  }, [eventType, event]);

  // Auto-set duration
  useEffect(() => {
    if (event) return;
    const durations: Record<string, number> = {
      showing: 30,
      meeting: 60,
      open_house: 120,
      inspection: 60,
      closing: 120,
      general: 60,
    };
    const dur = durations[eventType] || 60;
    const [h, m] = startTime.split(":").map(Number);
    const total = h * 60 + m + dur;
    setEndTime(`${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
  }, [eventType, startTime, event]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const startAt = new Date(`${date}T${startTime}:00`).toISOString();
    const endAt = allDay
      ? new Date(`${date}T23:59:59`).toISOString()
      : new Date(`${date}T${endTime}:00`).toISOString();
    await onSave({
      title: title.trim(),
      description: description || undefined,
      location: location || propertyAddress || undefined,
      startAt,
      endAt,
      allDay,
      eventType,
      propertyAddress: propertyAddress || undefined,
      unitNumber: unitNumber || undefined,
      color,
      syncToGoogle,
    });
    setSaving(false);
  };

  const showProperty = ["showing", "open_house", "closing", "inspection"].includes(eventType);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-colors duration-200 ${
        entered ? "bg-black/35" : "bg-black/0"
      }`}
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col transition-all duration-200 ${
          entered ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">{event ? "Edit Event" : "New Event"}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-slate-500">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Type selector */}
          <div>
            <label className="text-xs font-medium text-slate-500">Type</label>
            <div className="grid grid-cols-4 gap-1.5 mt-1">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setEventType(t.value)}
                  className={`px-2 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
                    eventType === t.value
                      ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date & time */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {!allDay && (
              <>
                <div>
                  <label className="text-xs font-medium text-slate-500">Start</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">End</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            All day
          </label>

          {/* Property fields (conditional) */}
          {showProperty && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-500">Property Address</label>
                <input
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                  placeholder="123 Main St"
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Unit</label>
                <input
                  value={unitNumber}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  placeholder="4B"
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* Location */}
          <div>
            <label className="text-xs font-medium text-slate-500">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location or address"
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-slate-500">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes..."
              rows={3}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Options */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={syncToGoogle}
                onChange={(e) => setSyncToGoogle(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              Sync to Google Calendar
            </label>
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-slate-500">Color:</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-6 h-6 rounded border-0 cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg disabled:opacity-50 shadow-sm transition-colors"
          >
            {saving ? "Saving..." : event ? "Update Event" : "Save Event"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SHOWING SLOT CREATOR
// ============================================================

function ShowingCreator({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [address, setAddress] = useState("");
  const [unit, setUnit] = useState("");
  const [date, setDate] = useState(toLocalISODate(addDays(new Date(), 1)));
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("14:00");
  const [duration, setDuration] = useState(30);
  const [breakMin, setBreakMin] = useState(0);
  const [creating, setCreating] = useState(false);

  const previewSlots: { start: string; end: string }[] = [];
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let currentMin = sh * 60 + sm;
  const endMinVal = eh * 60 + em;
  while (currentMin + duration <= endMinVal) {
    const sH = Math.floor(currentMin / 60);
    const sM = currentMin % 60;
    const eM2 = currentMin + duration;
    const eH = Math.floor(eM2 / 60);
    const eM3 = eM2 % 60;
    previewSlots.push({
      start: `${String(sH).padStart(2, "0")}:${String(sM).padStart(2, "0")}`,
      end: `${String(eH).padStart(2, "0")}:${String(eM3).padStart(2, "0")}`,
    });
    currentMin += duration + breakMin;
  }

  const fmtSlotTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  const handleCreate = async () => {
    if (!address.trim()) return;
    setCreating(true);
    try {
      const { createShowingSlots } = await import("./actions");
      await createShowingSlots({
        propertyAddress: address.trim(),
        unitNumber: unit || undefined,
        date,
        startTime,
        endTime,
        duration,
        breakMinutes: breakMin,
      });
      onCreated();
    } catch (err) {
      console.error("Create showing slots error:", err);
      alert("Failed to create slots");
    }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/35 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "modal-in 200ms ease-out" }}
      >
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Create Showing Slots</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-500">Property Address</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="125 Kent Ave, Brooklyn"
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Unit</label>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="4B"
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500">From</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">To</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Break Between</label>
              <select
                value={breakMin}
                onChange={(e) => setBreakMin(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={0}>No break</option>
                <option value={5}>5 min</option>
                <option value={10}>10 min</option>
                <option value={15}>15 min</option>
              </select>
            </div>
          </div>

          {previewSlots.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Preview ({previewSlots.length} slots)</p>
              <div className="grid grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto">
                {previewSlots.map((s, i) => (
                  <div
                    key={i}
                    className="text-xs px-2.5 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg font-medium"
                  >
                    {fmtSlotTime(s.start)} \u2014 {fmtSlotTime(s.end)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !address.trim() || previewSlots.length === 0}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg disabled:opacity-50 shadow-sm transition-colors"
          >
            {creating ? "Creating..." : `Create ${previewSlots.length} Slots`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MINI CALENDAR SIDEBAR
// ============================================================

function MiniCalendarSidebar({
  currentDate,
  events,
  onDateSelect,
}: {
  currentDate: Date;
  events: CalendarEventData[];
  onDateSelect: (date: Date) => void;
}) {
  const [miniMonth, setMiniMonth] = useState(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));

  // Keep mini calendar in sync when currentDate month changes
  useEffect(() => {
    setMiniMonth(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
  }, [currentDate.getFullYear(), currentDate.getMonth()]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = getMonthDays(miniMonth);
  const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const hasEvents = (date: Date) => events.some((e) => isSameDay(new Date(e.startAt), date));

  const navigateMini = (dir: number) => {
    const d = new Date(miniMonth);
    d.setMonth(d.getMonth() + dir);
    setMiniMonth(d);
  };

  // Upcoming events (next 7 days)
  const upcoming = events
    .filter((e) => {
      const d = new Date(e.startAt);
      const n = new Date();
      n.setHours(0, 0, 0, 0);
      return d >= n && d <= addDays(n, 7);
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 10);

  return (
    <div className="w-[220px] border-l border-slate-200 bg-white flex-shrink-0 overflow-y-auto hidden xl:block">
      {/* Mini Calendar */}
      <div className="p-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => navigateMini(-1)}
            className="w-6 h-6 rounded hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <p className="text-xs font-bold text-slate-700">
            {new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(miniMonth)}
          </p>
          <button
            onClick={() => navigateMini(1)}
            className="w-6 h-6 rounded hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0">
          {weekDays.map((d) => (
            <div key={d} className="text-[9px] font-semibold text-slate-400 text-center py-0.5">
              {d}
            </div>
          ))}
          {days.slice(0, Math.ceil(days.length / 7) * 7).map((day, i) => {
            const isCurrentMonth = day.getMonth() === miniMonth.getMonth();
            const todayMini = isToday(day);
            const selected = isSameDay(day, currentDate);
            const has = hasEvents(day);
            return (
              <button
                key={i}
                onClick={() => onDateSelect(day)}
                className={`w-full aspect-square flex flex-col items-center justify-center text-[10px] font-medium rounded-full relative transition-colors ${
                  selected
                    ? "bg-blue-600 text-white"
                    : todayMini
                      ? "bg-blue-100 text-blue-700 font-bold"
                      : isCurrentMonth
                        ? "text-slate-700 hover:bg-blue-50"
                        : "text-slate-300 hover:bg-slate-50"
                }`}
              >
                {day.getDate()}
                {has && !selected && (
                  <span className="absolute bottom-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Upcoming Events */}
      <div className="p-3">
        <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Upcoming</h4>
        {upcoming.length === 0 ? (
          <p className="text-xs text-slate-400">No upcoming events</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((e) => {
              const eDate = new Date(e.startAt);
              const label = isToday(eDate)
                ? "Today"
                : isSameDay(eDate, addDays(new Date(), 1))
                  ? "Tomorrow"
                  : fmtShortDate(eDate);
              return (
                <div
                  key={e.id}
                  className="cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
                  onClick={() => onDateSelect(eDate)}
                >
                  <div className="text-[9px] text-slate-400 font-medium">{label}</div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: e.color }}
                    />
                    <span className="text-[11px] font-medium text-slate-700 truncate">
                      {e.allDay ? "" : fmtTime(e.startAt) + " "}
                      {e.title}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
