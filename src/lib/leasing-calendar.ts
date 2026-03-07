// ============================================================
// AI Leasing Agent — Google Calendar Auto-Book (Pro/Team)
//
// Free tier: derive slots from availabilityWindows in qualCriteria
// Pro/Team: read Google Calendar, find open 1-hour slots 9AM–8PM ET
// ============================================================

import prisma from "@/lib/prisma";
import { getUserGmailAccount, getValidToken } from "@/lib/gmail";
import { createCalendarEvent, deleteCalendarEvent } from "@/lib/google-calendar";

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";
const SLOT_DURATION_MS = 60 * 60 * 1000; // 1 hour
const BUFFER_MS = 60 * 60 * 1000; // 1 hour buffer around events
const DAY_START_HOUR = 9;  // 9 AM ET
const DAY_END_HOUR = 20;   // 8 PM ET

// ── Types ────────────────────────────────────────────────────

export interface TimeSlot {
  start: Date;
  end: Date;
  label: string;
}

export interface FeatureGatedError {
  code: "feature_gated";
  feature: string;
  requiredTier: string;
}

interface AvailabilityWindow {
  dayOfWeek: number; // 0=Sun, 6=Sat
  startTime: string; // "17:00"
  endTime: string;   // "20:00"
}

// ── Helpers ──────────────────────────────────────────────────

function formatSlotLabel(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

/** Get ET date from a JS date */
function toET(date: Date): Date {
  return new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
}

/** Create a Date in ET for a given day + hour */
function etDate(baseDate: Date, hour: number, minute = 0): Date {
  // Create date in ET
  const d = new Date(baseDate);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Get Google Calendar token for the org owner */
async function getOrgCalendarToken(orgId: string): Promise<{ token: string; userId: string } | null> {
  // Find the org owner or admin who has Google Calendar connected
  const orgUsers = await prisma.user.findMany({
    where: { orgId, role: { in: ["owner", "admin"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  for (const user of orgUsers) {
    const account = await getUserGmailAccount(user.id);
    if (account) {
      try {
        const token = await getValidToken(account.id);
        return { token, userId: user.id };
      } catch {
        // Token invalid/expired, try next user
        continue;
      }
    }
  }
  return null;
}

/** Fetch busy times from Google Calendar */
async function fetchBusyTimes(token: string, timeMin: Date, timeMax: Date): Promise<{ start: Date; end: Date }[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "500",
  });

  const res = await fetch(`${GCAL_BASE}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Google Calendar API error: ${res.status}`);
  }

  const data = await res.json();
  const events: { start: Date; end: Date }[] = [];

  for (const event of data.items || []) {
    if (event.status === "cancelled") continue;
    const start = event.start?.dateTime ? new Date(event.start.dateTime) : event.start?.date ? new Date(event.start.date) : null;
    const end = event.end?.dateTime ? new Date(event.end.dateTime) : event.end?.date ? new Date(event.end.date) : null;
    if (start && end) {
      events.push({ start, end });
    }
  }

  return events;
}

/** Check if a slot overlaps with any busy time (including buffer) */
function isSlotFree(slot: TimeSlot, busyTimes: { start: Date; end: Date }[]): boolean {
  const slotStart = slot.start.getTime();
  const slotEnd = slot.end.getTime();

  for (const busy of busyTimes) {
    const busyStart = busy.start.getTime() - BUFFER_MS;
    const busyEnd = busy.end.getTime() + BUFFER_MS;
    // Overlap check
    if (slotStart < busyEnd && slotEnd > busyStart) {
      return false;
    }
  }
  return true;
}

// ── Free Tier: Derive from availabilityWindows ───────────────

function generateFreeSlots(windows: AvailabilityWindow[], daysAhead: number): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const now = new Date();

  for (let d = 0; d < daysAhead; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);
    const dayOfWeek = day.getDay();

    for (const w of windows) {
      if (w.dayOfWeek !== dayOfWeek) continue;

      const [startH, startM] = w.startTime.split(":").map(Number);
      const [endH, endM] = w.endTime.split(":").map(Number);

      // Generate 1-hour slots within the window
      let hour = startH;
      let minute = startM || 0;
      while (hour < endH || (hour === endH && minute < (endM || 0))) {
        const start = etDate(day, hour, minute);
        const end = new Date(start.getTime() + SLOT_DURATION_MS);

        // Skip past slots
        if (start > now) {
          slots.push({ start, end, label: formatSlotLabel(start) });
        }

        // Advance by 1 hour
        minute += 60;
        if (minute >= 60) {
          hour += Math.floor(minute / 60);
          minute = minute % 60;
        }
      }
    }
  }

  return slots;
}

// ── Pro/Team: Google Calendar Slots ──────────────────────────

async function generateProSlots(orgId: string, daysAhead: number): Promise<TimeSlot[]> {
  const calAuth = await getOrgCalendarToken(orgId);
  if (!calAuth) {
    // No Google Calendar connected — return null to signal fallback
    return [];
  }

  const now = new Date();
  const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const busyTimes = await fetchBusyTimes(calAuth.token, now, timeMax);

  const slots: TimeSlot[] = [];

  for (let d = 0; d < daysAhead; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);

    for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour++) {
      const start = etDate(day, hour, 0);
      const end = new Date(start.getTime() + SLOT_DURATION_MS);

      // Skip past slots
      if (start <= now) continue;

      const slot: TimeSlot = { start, end, label: formatSlotLabel(start) };
      if (isSlotFree(slot, busyTimes)) {
        slots.push(slot);
      }
    }
  }

  return slots;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Get available showing slots for a property.
 * Pro/Team: reads Google Calendar for real availability
 * Free: derives from availabilityWindows config
 */
export async function getLeasingAvailability(
  configId: string,
  daysAhead = 7,
): Promise<TimeSlot[]> {
  const config = await prisma.leasingConfig.findUnique({
    where: { id: configId },
    select: {
      tier: true,
      orgId: true,
      qualCriteria: true,
    },
  });

  if (!config) throw new Error("Leasing config not found");

  const qualCriteria = (config.qualCriteria && typeof config.qualCriteria === "object")
    ? config.qualCriteria as Record<string, any>
    : {};

  if (config.tier === "free") {
    // Free tier: use availability windows
    const windows: AvailabilityWindow[] = Array.isArray(qualCriteria.showingAvailability)
      ? qualCriteria.showingAvailability
      : [
        // Default: weekday evenings 5-8 PM + Saturday 10 AM - 2 PM
        { dayOfWeek: 1, startTime: "17:00", endTime: "20:00" },
        { dayOfWeek: 2, startTime: "17:00", endTime: "20:00" },
        { dayOfWeek: 3, startTime: "17:00", endTime: "20:00" },
        { dayOfWeek: 4, startTime: "17:00", endTime: "20:00" },
        { dayOfWeek: 5, startTime: "17:00", endTime: "20:00" },
        { dayOfWeek: 6, startTime: "10:00", endTime: "14:00" },
      ];
    return generateFreeSlots(windows, daysAhead);
  }

  // Pro/Team: try Google Calendar
  try {
    const proSlots = await generateProSlots(config.orgId, daysAhead);
    if (proSlots.length > 0) return proSlots;

    // If no slots (calendar not connected or empty), fall back to availability windows
    console.log(`[leasing-calendar] Pro config ${configId}: falling back to availability windows`);
  } catch (err) {
    // Google token expired/invalid — graceful fallback
    console.warn(`[leasing-calendar] Google Calendar fallback for config ${configId}:`, err);
  }

  // Fallback to free-tier logic
  const windows: AvailabilityWindow[] = Array.isArray(qualCriteria.showingAvailability)
    ? qualCriteria.showingAvailability
    : [
      { dayOfWeek: 1, startTime: "17:00", endTime: "20:00" },
      { dayOfWeek: 2, startTime: "17:00", endTime: "20:00" },
      { dayOfWeek: 3, startTime: "17:00", endTime: "20:00" },
      { dayOfWeek: 4, startTime: "17:00", endTime: "20:00" },
      { dayOfWeek: 5, startTime: "17:00", endTime: "20:00" },
      { dayOfWeek: 6, startTime: "10:00", endTime: "14:00" },
    ];
  return generateFreeSlots(windows, daysAhead);
}

/**
 * Book a showing slot on Google Calendar (Pro/Team only).
 * Creates Google Calendar event + Prisma CalendarEvent record.
 */
export async function bookShowingSlot(
  configId: string,
  slot: TimeSlot,
  prospect: { name: string; phone: string },
  unitLabel: string,
): Promise<{ eventId: string; calendarEventId: string }> {
  const config = await prisma.leasingConfig.findUnique({
    where: { id: configId },
    include: { property: true },
  });

  if (!config) throw new Error("Leasing config not found");

  if (config.tier === "free") {
    const err: FeatureGatedError = {
      code: "feature_gated",
      feature: "auto_book_calendar",
      requiredTier: "pro",
    };
    throw err;
  }

  const calAuth = await getOrgCalendarToken(config.orgId);
  if (!calAuth) {
    throw new Error("No Google Calendar connected");
  }

  const address = config.property.address || config.property.name;
  const title = `Showing — ${unitLabel} — ${prospect.name}`;
  const description = `Prospect: ${prospect.name}\nPhone: ${prospect.phone}\nProperty: ${address}\nUnit: ${unitLabel}\n\nAuto-booked by AI Leasing Agent`;

  // Create via the existing createCalendarEvent function
  const calEvent = await createCalendarEvent({
    userId: calAuth.userId,
    orgId: config.orgId,
    title,
    description,
    location: address || undefined,
    startAt: slot.start,
    endAt: slot.end,
    eventType: "showing",
    propertyAddress: address || undefined,
    unitNumber: unitLabel.replace(/^Unit\s*/i, ""),
    syncToGoogle: true,
  });

  return {
    eventId: calEvent.googleEventId || calEvent.id,
    calendarEventId: calEvent.id,
  };
}

/**
 * Cancel a showing slot. Deletes Google Calendar event + updates record.
 */
export async function cancelShowingSlot(calendarEventId: string): Promise<void> {
  await deleteCalendarEvent(calendarEventId);
}

/**
 * Get top N slots, preferring Saturday mornings and weekday evenings.
 *
 * Sort priority:
 * 1. Saturday 10 AM - 1 PM (morning showings)
 * 2. Weekday 5 PM - 8 PM (after work)
 * 3. Everything else
 */
export function getTopSlots(slots: TimeSlot[], count = 3): TimeSlot[] {
  if (slots.length <= count) return slots;

  const scored = slots.map((slot) => {
    const et = toET(slot.start);
    const day = et.getDay();
    const hour = et.getHours();

    let score = 0;

    // Saturday morning (10-13): highest priority
    if (day === 6 && hour >= 10 && hour < 13) score = 3;
    // Weekday evenings (17-20): second priority
    else if (day >= 1 && day <= 5 && hour >= 17 && hour < 20) score = 2;
    // Sunday afternoon: third priority
    else if (day === 0 && hour >= 12 && hour < 17) score = 1;

    return { slot, score };
  });

  // Sort by score desc, then by date asc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.slot.start.getTime() - b.slot.start.getTime();
  });

  return scored.slice(0, count).map((s) => s.slot);
}
