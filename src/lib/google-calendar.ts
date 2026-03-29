import prisma from "@/lib/prisma";
import { getUserGmailAccount, getValidToken } from "@/lib/gmail";

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

// ============================================================
// Helpers
// ============================================================

/** Get a valid Google Calendar access token for a user */
async function getCalendarToken(userId: string): Promise<string> {
  const account = await getUserGmailAccount(userId);
  if (!account) throw new Error("No Google account connected");
  return getValidToken(account.id);
}

/** Map event type to a default hex color */
export function getEventTypeColor(type: string): string {
  const colors: Record<string, string> = {
    showing: "#8B5CF6",
    meeting: "#3B82F6",
    open_house: "#10B981",
    inspection: "#F59E0B",
    closing: "#EF4444",
    task_deadline: "#6366F1",
    deal_milestone: "#EC4899",
    general: "#6B7280",
  };
  return colors[type] || colors.general;
}

/** Map Google Calendar event status to our internal status */
function mapGoogleStatus(googleStatus?: string): string {
  switch (googleStatus) {
    case "confirmed":
      return "confirmed";
    case "tentative":
      return "tentative";
    case "cancelled":
      return "cancelled";
    default:
      return "confirmed";
  }
}

/** Format a Date as YYYY-MM-DD for all-day events */
function toDateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Build Google Calendar datetime body for create/update */
function buildGoogleEventBody(params: {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  attendees?: { email: string; name?: string }[];
}) {
  const body: Record<string, unknown> = {
    summary: params.title,
    description: params.description || undefined,
    location: params.location || undefined,
  };

  if (params.allDay) {
    body.start = { date: toDateString(params.startAt), timeZone: "America/New_York" };
    body.end = { date: toDateString(params.endAt), timeZone: "America/New_York" };
  } else {
    body.start = { dateTime: params.startAt.toISOString(), timeZone: "America/New_York" };
    body.end = { dateTime: params.endAt.toISOString(), timeZone: "America/New_York" };
  }

  if (params.attendees && params.attendees.length > 0) {
    body.attendees = params.attendees.map((a) => ({
      email: a.email,
      displayName: a.name || undefined,
    }));
  }

  return body;
}

// ============================================================
// Google Calendar API helpers
// ============================================================

interface GoogleCalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  attendees?: {
    email?: string;
    displayName?: string;
    responseStatus?: string;
  }[];
  recurringEventId?: string;
  recurrence?: string[];
  updated?: string;
  created?: string;
  organizer?: { email?: string };
}

interface GoogleCalendarListResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
}

// ============================================================
// Sync
// ============================================================

/**
 * Sync events from Google Calendar into the local database.
 * Fetches the past 30 days and the next 90 days.
 * Upserts each event using the orgId + googleEventId unique constraint.
 */
export async function syncGoogleCalendar(
  userId: string,
  orgId: string
): Promise<{ synced: number }> {
  let token: string;
  try {
    token = await getCalendarToken(userId);
  } catch (err) {
    console.error("[Calendar Sync] Failed to get token:", err);
    throw err;
  }

  const now = new Date();
  const timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  let allEvents: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;

  // Paginate through all events in the date window
  try {
    do {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "500",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(
        `${GCAL_BASE}/calendars/primary/events?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error("[Calendar Sync] Google API error:", res.status, errText);
        throw new Error(`Google Calendar API error: ${res.status}`);
      }

      const data = (await res.json()) as GoogleCalendarListResponse;
      if (data.items) {
        allEvents = allEvents.concat(data.items);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch (err) {
    console.error("[Calendar Sync] Failed to fetch events:", err);
    throw err;
  }

  let synced = 0;

  for (const event of allEvents) {
    try {
      // Skip events without an id
      if (!event.id) continue;

      // Determine start/end times
      const isAllDay = !!event.start?.date;
      let startAt: Date;
      let endAt: Date;

      if (isAllDay) {
        // All-day events: date is "YYYY-MM-DD"
        startAt = new Date(event.start!.date! + "T00:00:00Z");
        endAt = new Date(event.end?.date
          ? event.end.date + "T00:00:00Z"
          : event.start!.date! + "T23:59:59Z");
      } else {
        startAt = new Date(event.start?.dateTime || event.start?.date || now.toISOString());
        endAt = new Date(event.end?.dateTime || event.end?.date || now.toISOString());
      }

      // Map attendees
      const attendees = event.attendees
        ? event.attendees.map((a) => ({
            email: a.email || "",
            name: a.displayName || undefined,
            status: a.responseStatus || "needsAction",
          }))
        : [];

      const status = mapGoogleStatus(event.status);
      const isRecurring = !!event.recurringEventId || (event.recurrence && event.recurrence.length > 0);

      await prisma.calendarEvent.upsert({
        where: {
          orgId_googleEventId: {
            orgId,
            googleEventId: event.id,
          },
        },
        create: {
          orgId,
          userId,
          googleEventId: event.id,
          googleCalendarId: "primary",
          title: event.summary || "(No title)",
          description: event.description || null,
          location: event.location || null,
          startAt,
          endAt,
          allDay: isAllDay,
          timezone: event.start?.timeZone || "America/New_York",
          recurring: isRecurring || false,
          recurrenceRule: event.recurrence ? event.recurrence.join(";") : null,
          eventType: "general",
          status,
          color: getEventTypeColor("general"),
          attendees: attendees.length > 0 ? attendees : undefined,
          source: "google",
          syncedAt: new Date(),
          lastModified: event.updated ? new Date(event.updated) : null,
        },
        update: {
          title: event.summary || "(No title)",
          description: event.description || null,
          location: event.location || null,
          startAt,
          endAt,
          allDay: isAllDay,
          status,
          attendees: attendees.length > 0 ? attendees : undefined,
          syncedAt: new Date(),
          lastModified: event.updated ? new Date(event.updated) : null,
        },
      });

      synced++;
    } catch (err) {
      // Log per-event errors but continue syncing others
      console.error(
        `[Calendar Sync] Failed to upsert event ${event.id}:`,
        err
      );
    }
  }

  return { synced };
}

// ============================================================
// Create
// ============================================================

/**
 * Create a calendar event locally and (optionally) in Google Calendar.
 * syncToGoogle defaults to true.
 */
export async function createCalendarEvent(params: {
  userId: string;
  orgId: string;
  title: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  eventType?: string;
  contactId?: string;
  propertyAddress?: string;
  unitNumber?: string;
  dealId?: string;
  attendees?: { email: string; name?: string }[];
  color?: string;
  syncToGoogle?: boolean;
}) {
  const syncToGoogle = params.syncToGoogle !== false;
  let googleEventId: string | null = null;
  let googleCalendarId: string | null = null;

  // Create in Google Calendar first (if opted in)
  if (syncToGoogle) {
    try {
      const token = await getCalendarToken(params.userId);
      const gcalBody = buildGoogleEventBody({
        title: params.title,
        description: params.description,
        location: params.location,
        startAt: params.startAt,
        endAt: params.endAt,
        allDay: params.allDay,
        attendees: params.attendees,
      });

      const res = await fetch(`${GCAL_BASE}/calendars/primary/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(gcalBody),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("[Calendar Create] Google API error:", res.status, errText);
        // Continue creating locally even if Google fails
      } else {
        const created = (await res.json()) as GoogleCalendarEvent;
        googleEventId = created.id;
        googleCalendarId = "primary";
      }
    } catch (err) {
      console.error("[Calendar Create] Google API call failed:", err);
      // Continue creating locally
    }
  }

  const eventType = params.eventType || "general";
  const color = params.color || getEventTypeColor(eventType);

  const event = await prisma.calendarEvent.create({
    data: {
      orgId: params.orgId,
      userId: params.userId,
      googleEventId,
      googleCalendarId,
      title: params.title,
      description: params.description || null,
      location: params.location || null,
      startAt: params.startAt,
      endAt: params.endAt,
      allDay: params.allDay || false,
      timezone: "America/New_York",
      eventType,
      contactId: params.contactId || null,
      propertyAddress: params.propertyAddress || null,
      unitNumber: params.unitNumber || null,
      dealId: params.dealId || null,
      status: "confirmed",
      color,
      attendees: params.attendees
        ? params.attendees.map((a) => ({
            email: a.email,
            name: a.name || undefined,
            status: "needsAction",
          }))
        : undefined,
      source: googleEventId ? "google" : "vettdre",
      syncedAt: googleEventId ? new Date() : null,
    },
  });

  return event;
}

// ============================================================
// Update
// ============================================================

/**
 * Update an existing calendar event locally and (if linked) in Google Calendar.
 */
export async function updateCalendarEvent(
  eventId: string,
  updates: Partial<{
    title: string;
    description: string;
    location: string;
    startAt: Date;
    endAt: Date;
    allDay: boolean;
    status: string;
    color: string;
    contactId: string;
    eventType: string;
  }>
) {
  const existing = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
  });

  if (!existing) {
    throw new Error("Calendar event not found");
  }

  // Sync update to Google Calendar if we have a googleEventId
  if (existing.googleEventId) {
    try {
      const token = await getCalendarToken(existing.userId);

      // Build PATCH body — only include fields that changed
      const patchBody: Record<string, unknown> = {};

      if (updates.title !== undefined) patchBody.summary = updates.title;
      if (updates.description !== undefined) patchBody.description = updates.description;
      if (updates.location !== undefined) patchBody.location = updates.location;
      if (updates.status !== undefined) patchBody.status = updates.status;

      // Handle time updates
      const isAllDay = updates.allDay ?? existing.allDay;
      const startAt = updates.startAt ?? existing.startAt;
      const endAt = updates.endAt ?? existing.endAt;

      if (updates.startAt !== undefined || updates.endAt !== undefined || updates.allDay !== undefined) {
        if (isAllDay) {
          patchBody.start = { date: toDateString(startAt), timeZone: "America/New_York" };
          patchBody.end = { date: toDateString(endAt), timeZone: "America/New_York" };
        } else {
          patchBody.start = { dateTime: startAt.toISOString(), timeZone: "America/New_York" };
          patchBody.end = { dateTime: endAt.toISOString(), timeZone: "America/New_York" };
        }
      }

      const res = await fetch(
        `${GCAL_BASE}/calendars/primary/events/${existing.googleEventId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(patchBody),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error("[Calendar Update] Google API error:", res.status, errText);
        // Continue updating locally even if Google fails
      }
    } catch (err) {
      console.error("[Calendar Update] Google API call failed:", err);
      // Continue updating locally
    }
  }

  // Update local DB
  const event = await prisma.calendarEvent.update({
    where: { id: eventId },
    data: {
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.location !== undefined && { location: updates.location }),
      ...(updates.startAt !== undefined && { startAt: updates.startAt }),
      ...(updates.endAt !== undefined && { endAt: updates.endAt }),
      ...(updates.allDay !== undefined && { allDay: updates.allDay }),
      ...(updates.status !== undefined && { status: updates.status }),
      ...(updates.color !== undefined && { color: updates.color }),
      ...(updates.contactId !== undefined && { contactId: updates.contactId }),
      ...(updates.eventType !== undefined && { eventType: updates.eventType }),
      syncedAt: existing.googleEventId ? new Date() : undefined,
    },
  });

  return event;
}

// ============================================================
// Delete
// ============================================================

/**
 * Delete a calendar event from local DB and (if linked) from Google Calendar.
 */
export async function deleteCalendarEvent(eventId: string) {
  const existing = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
  });

  if (!existing) {
    throw new Error("Calendar event not found");
  }

  // Delete from Google Calendar if linked
  if (existing.googleEventId) {
    try {
      const token = await getCalendarToken(existing.userId);

      const res = await fetch(
        `${GCAL_BASE}/calendars/primary/events/${existing.googleEventId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // 204 = success, 410 = already deleted — both are fine
      if (!res.ok && res.status !== 410) {
        const errText = await res.text();
        console.error("[Calendar Delete] Google API error:", res.status, errText);
        // Continue deleting locally even if Google fails
      }
    } catch (err) {
      console.error("[Calendar Delete] Google API call failed:", err);
      // Continue deleting locally
    }
  }

  // Delete from local DB
  await prisma.calendarEvent.delete({
    where: { id: eventId },
  });

  return { deleted: true };
}
