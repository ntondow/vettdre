"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  syncGoogleCalendar,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getEventTypeColor,
} from "@/lib/google-calendar";

// ============================================================
// Interfaces
// ============================================================

export interface CalendarEventData {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string; // ISO
  endAt: string; // ISO
  allDay: boolean;
  eventType: string;
  status: string;
  color: string;
  contactId: string | null;
  contactName: string | null;
  dealId: string | null;
  dealName: string | null;
  propertyAddress: string | null;
  unitNumber: string | null;
  attendees: { email: string; name?: string; status?: string }[] | null;
  source: string;
}

export interface ShowingSlotData {
  id: string;
  propertyAddress: string;
  unitNumber: string | null;
  startAt: string; // ISO
  endAt: string; // ISO
  duration: number;
  isBooked: boolean;
  bookedByName: string | null;
  bookedByEmail: string | null;
  bookedByPhone: string | null;
  bookedAt: string | null; // ISO
  contactId: string | null;
  calendarEventId: string | null;
  notes: string | null;
  createdAt: string; // ISO
}

// ============================================================
// Auth Helper
// ============================================================

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;
  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
  });
  return user;
}

// ============================================================
// Calendar Events
// ============================================================

/**
 * Get calendar events for a date range, with optional filters.
 */
export async function getCalendarEvents(
  startDate: string,
  endDate: string,
  filters?: {
    eventType?: string;
    contactId?: string;
  }
): Promise<CalendarEventData[]> {
  const user = await getUser();
  if (!user) return [];

  const where: Record<string, unknown> = {
    orgId: user.orgId,
    startAt: {
      gte: new Date(startDate),
      lte: new Date(endDate),
    },
  };

  if (filters?.eventType) {
    where.eventType = filters.eventType;
  }
  if (filters?.contactId) {
    where.contactId = filters.contactId;
  }

  const events = await prisma.calendarEvent.findMany({
    where,
    orderBy: { startAt: "asc" },
    include: {
      contact: {
        select: { firstName: true, lastName: true },
      },
      deal: {
        select: { name: true },
      },
    },
  });

  const serialized: CalendarEventData[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    allDay: event.allDay,
    eventType: event.eventType,
    status: event.status,
    color: event.color,
    contactId: event.contactId,
    contactName: event.contact
      ? `${event.contact.firstName} ${event.contact.lastName}`
      : null,
    dealId: event.dealId,
    dealName: event.deal?.name ?? null,
    propertyAddress: event.propertyAddress,
    unitNumber: event.unitNumber,
    attendees: event.attendees as CalendarEventData["attendees"],
    source: event.source,
  }));

  return serialized;
}

/**
 * Create a new calendar event (wraps the google-calendar lib).
 */
export async function createEvent(data: {
  title: string;
  description?: string;
  location?: string;
  startAt: string; // ISO string
  endAt: string;
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
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);

    const event = await createCalendarEvent({
      userId: user.id,
      orgId: user.orgId,
      title: data.title,
      description: data.description,
      location: data.location,
      startAt,
      endAt,
      allDay: data.allDay,
      eventType: data.eventType,
      contactId: data.contactId,
      propertyAddress: data.propertyAddress,
      unitNumber: data.unitNumber,
      dealId: data.dealId,
      attendees: data.attendees,
      color: data.color,
      syncToGoogle: data.syncToGoogle,
    });

    revalidatePath("/calendar");
    return { success: true, id: event.id };
  } catch (err) {
    console.error("[Calendar] Create event error:", err);
    return {
      error: err instanceof Error ? err.message : "Failed to create event",
    };
  }
}

/**
 * Update an existing calendar event.
 */
export async function updateEvent(
  eventId: string,
  data: {
    title?: string;
    description?: string;
    location?: string;
    startAt?: string; // ISO string
    endAt?: string;
    allDay?: boolean;
    eventType?: string;
    status?: string;
    color?: string;
    contactId?: string;
  }
) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    // Verify event belongs to the user's org
    const existing = await prisma.calendarEvent.findFirst({
      where: { id: eventId, orgId: user.orgId },
    });
    if (!existing) return { error: "Event not found" };

    const updates: Record<string, unknown> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.location !== undefined) updates.location = data.location;
    if (data.startAt !== undefined) updates.startAt = new Date(data.startAt);
    if (data.endAt !== undefined) updates.endAt = new Date(data.endAt);
    if (data.allDay !== undefined) updates.allDay = data.allDay;
    if (data.eventType !== undefined) updates.eventType = data.eventType;
    if (data.status !== undefined) updates.status = data.status;
    if (data.color !== undefined) updates.color = data.color;
    if (data.contactId !== undefined) updates.contactId = data.contactId;

    await updateCalendarEvent(eventId, updates as Parameters<typeof updateCalendarEvent>[1]);

    revalidatePath("/calendar");
    return { success: true };
  } catch (err) {
    console.error("[Calendar] Update event error:", err);
    return {
      error: err instanceof Error ? err.message : "Failed to update event",
    };
  }
}

/**
 * Delete a calendar event.
 */
export async function deleteEvent(eventId: string) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    // Verify event belongs to the user's org
    const existing = await prisma.calendarEvent.findFirst({
      where: { id: eventId, orgId: user.orgId },
    });
    if (!existing) return { error: "Event not found" };

    await deleteCalendarEvent(eventId);

    revalidatePath("/calendar");
    return { success: true };
  } catch (err) {
    console.error("[Calendar] Delete event error:", err);
    return {
      error: err instanceof Error ? err.message : "Failed to delete event",
    };
  }
}

/**
 * Sync events from Google Calendar.
 */
export async function syncCalendar() {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    const result = await syncGoogleCalendar(user.id, user.orgId);
    revalidatePath("/calendar");
    return { success: true, synced: result.synced };
  } catch (err) {
    console.error("[Calendar] Sync error:", err);
    return {
      error: err instanceof Error ? err.message : "Failed to sync calendar",
    };
  }
}

// ============================================================
// Showing Slots
// ============================================================

/**
 * Create bulk showing slots for a property within a time range.
 * Generates consecutive slots from startTime to endTime using the
 * specified duration and optional break between slots.
 */
export async function createShowingSlots(data: {
  propertyAddress: string;
  unitNumber?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  duration: number; // minutes
  breakMinutes?: number;
}) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    const { propertyAddress, unitNumber, date, startTime, endTime, duration } =
      data;
    const breakMinutes = data.breakMinutes ?? 0;

    // Parse the date + start/end times into Date objects
    const dayStart = new Date(`${date}T${startTime}:00`);
    const dayEnd = new Date(`${date}T${endTime}:00`);

    if (dayEnd <= dayStart) {
      return { error: "End time must be after start time" };
    }
    if (duration <= 0) {
      return { error: "Duration must be positive" };
    }

    const slots: {
      orgId: string;
      userId: string;
      propertyAddress: string;
      unitNumber: string | null;
      startAt: Date;
      endAt: Date;
      duration: number;
    }[] = [];

    let current = new Date(dayStart);
    while (current.getTime() + duration * 60 * 1000 <= dayEnd.getTime()) {
      const slotEnd = new Date(current.getTime() + duration * 60 * 1000);

      slots.push({
        orgId: user.orgId,
        userId: user.id,
        propertyAddress,
        unitNumber: unitNumber || null,
        startAt: new Date(current),
        endAt: slotEnd,
        duration,
      });

      // Advance by duration + break
      current = new Date(slotEnd.getTime() + breakMinutes * 60 * 1000);
    }

    if (slots.length === 0) {
      return { error: "No slots fit in the given time range" };
    }

    await prisma.showingSlot.createMany({ data: slots });

    revalidatePath("/calendar");
    return { success: true, count: slots.length };
  } catch (err) {
    console.error("[Calendar] Create showing slots error:", err);
    return {
      error:
        err instanceof Error ? err.message : "Failed to create showing slots",
    };
  }
}

/**
 * Get showing slots for a property address.
 */
export async function getShowingSlots(
  propertyAddress: string
): Promise<ShowingSlotData[]> {
  const user = await getUser();
  if (!user) return [];

  const slots = await prisma.showingSlot.findMany({
    where: {
      orgId: user.orgId,
      propertyAddress,
    },
    orderBy: { startAt: "asc" },
  });

  const serialized: ShowingSlotData[] = slots.map((slot) => ({
    id: slot.id,
    propertyAddress: slot.propertyAddress,
    unitNumber: slot.unitNumber,
    startAt: slot.startAt.toISOString(),
    endAt: slot.endAt.toISOString(),
    duration: slot.duration,
    isBooked: slot.isBooked,
    bookedByName: slot.bookedByName,
    bookedByEmail: slot.bookedByEmail,
    bookedByPhone: slot.bookedByPhone,
    bookedAt: slot.bookedAt?.toISOString() ?? null,
    contactId: slot.contactId,
    calendarEventId: slot.calendarEventId,
    notes: slot.notes,
    createdAt: slot.createdAt.toISOString(),
  }));

  return serialized;
}

/**
 * Get all properties with upcoming showing slots.
 * Returns unique addresses with counts of available and booked slots.
 */
export async function getShowingProperties(): Promise<
  {
    propertyAddress: string;
    unitNumber: string | null;
    totalSlots: number;
    availableSlots: number;
    bookedSlots: number;
    nextAvailable: string | null; // ISO
  }[]
> {
  const user = await getUser();
  if (!user) return [];

  const now = new Date();

  // Get all upcoming slots grouped by property
  const slots = await prisma.showingSlot.findMany({
    where: {
      orgId: user.orgId,
      startAt: { gte: now },
    },
    orderBy: { startAt: "asc" },
    select: {
      propertyAddress: true,
      unitNumber: true,
      isBooked: true,
      startAt: true,
    },
  });

  // Group by propertyAddress + unitNumber
  const grouped = new Map<
    string,
    {
      propertyAddress: string;
      unitNumber: string | null;
      totalSlots: number;
      availableSlots: number;
      bookedSlots: number;
      nextAvailable: Date | null;
    }
  >();

  for (const slot of slots) {
    const key = `${slot.propertyAddress}|${slot.unitNumber ?? ""}`;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        propertyAddress: slot.propertyAddress,
        unitNumber: slot.unitNumber,
        totalSlots: 1,
        availableSlots: slot.isBooked ? 0 : 1,
        bookedSlots: slot.isBooked ? 1 : 0,
        nextAvailable: slot.isBooked ? null : slot.startAt,
      });
    } else {
      existing.totalSlots++;
      if (slot.isBooked) {
        existing.bookedSlots++;
      } else {
        existing.availableSlots++;
        if (!existing.nextAvailable) {
          existing.nextAvailable = slot.startAt;
        }
      }
    }
  }

  return Array.from(grouped.values()).map((g) => ({
    propertyAddress: g.propertyAddress,
    unitNumber: g.unitNumber,
    totalSlots: g.totalSlots,
    availableSlots: g.availableSlots,
    bookedSlots: g.bookedSlots,
    nextAvailable: g.nextAvailable?.toISOString() ?? null,
  }));
}

/**
 * Book a showing slot from the public booking page.
 * NO authentication required — this is called by prospective clients.
 * Creates a CalendarEvent linked to the slot and a Contact (lead) in the CRM.
 */
export async function bookShowingSlot(
  slotId: string,
  data: {
    name: string;
    email: string;
    phone?: string;
    notes?: string;
  }
) {
  try {
    // Find the slot
    const slot = await prisma.showingSlot.findUnique({
      where: { id: slotId },
    });
    if (!slot) return { error: "Showing slot not found" };
    if (slot.isBooked) return { error: "This slot is already booked" };

    // Parse the booker's name into first/last
    const nameParts = data.name.trim().split(/\s+/);
    const firstName = nameParts[0] || data.name;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

    // Find or create the contact as a lead in the CRM
    let contact = await prisma.contact.findFirst({
      where: {
        orgId: slot.orgId,
        email: data.email.toLowerCase(),
      },
    });

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          orgId: slot.orgId,
          assignedTo: slot.userId,
          firstName,
          lastName,
          email: data.email.toLowerCase(),
          phone: data.phone || null,
          status: "lead",
          source: "showing_scheduler",
          sourceDetail: slot.propertyAddress,
        },
      });
    }

    // Create a CalendarEvent linked to the slot
    const eventColor = getEventTypeColor("showing");
    const unitLabel = slot.unitNumber ? ` #${slot.unitNumber}` : "";
    const calendarEvent = await prisma.calendarEvent.create({
      data: {
        orgId: slot.orgId,
        userId: slot.userId,
        title: `Showing: ${slot.propertyAddress}${unitLabel} - ${data.name}`,
        description: data.notes || null,
        location: `${slot.propertyAddress}${unitLabel}`,
        startAt: slot.startAt,
        endAt: slot.endAt,
        allDay: false,
        eventType: "showing",
        contactId: contact.id,
        propertyAddress: slot.propertyAddress,
        unitNumber: slot.unitNumber,
        status: "confirmed",
        color: eventColor,
        attendees: [
          {
            email: data.email,
            name: data.name,
            status: "accepted",
          },
        ],
        source: "scheduler",
      },
    });

    // Mark the slot as booked
    await prisma.showingSlot.update({
      where: { id: slotId },
      data: {
        isBooked: true,
        bookedByName: data.name,
        bookedByEmail: data.email.toLowerCase(),
        bookedByPhone: data.phone || null,
        bookedAt: new Date(),
        contactId: contact.id,
        calendarEventId: calendarEvent.id,
        notes: data.notes || null,
      },
    });

    return {
      success: true,
      eventId: calendarEvent.id,
      contactId: contact.id,
    };
  } catch (err) {
    console.error("[Calendar] Book showing slot error:", err);
    return {
      error:
        err instanceof Error ? err.message : "Failed to book showing slot",
    };
  }
}

// ============================================================
// Tasks for Calendar Display
// ============================================================

/**
 * Get tasks with due dates for calendar display.
 * Returns tasks as calendar-event-like objects so the UI can
 * render them alongside real calendar events.
 */
export async function getTasksForCalendar(
  startDate: string,
  endDate: string
): Promise<CalendarEventData[]> {
  const user = await getUser();
  if (!user) return [];

  const tasks = await prisma.task.findMany({
    where: {
      orgId: user.orgId,
      dueAt: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    },
    orderBy: { dueAt: "asc" },
    include: {
      contact: {
        select: { firstName: true, lastName: true },
      },
      deal: {
        select: { name: true },
      },
    },
  });

  // Map tasks to CalendarEventData shape so the calendar UI can render them
  const mapped: CalendarEventData[] = tasks.map((task) => {
    const dueAt = task.dueAt!.toISOString();
    // Tasks display as 30-minute blocks on the calendar
    const endAt = new Date(
      task.dueAt!.getTime() + 30 * 60 * 1000
    ).toISOString();

    const statusColor: Record<string, string> = {
      pending: "#F59E0B",
      in_progress: "#3B82F6",
      completed: "#10B981",
      skipped: "#9CA3AF",
      overdue: "#EF4444",
    };

    return {
      id: `task-${task.id}`,
      title: `[Task] ${task.title}`,
      description: task.description,
      location: null,
      startAt: dueAt,
      endAt,
      allDay: false,
      eventType: "task_deadline",
      status: task.status,
      color: statusColor[task.status] || "#6366F1",
      contactId: task.contactId,
      contactName: task.contact
        ? `${task.contact.firstName} ${task.contact.lastName}`
        : null,
      dealId: task.dealId,
      dealName: task.deal?.name ?? null,
      propertyAddress: null,
      unitNumber: null,
      attendees: null,
      source: "vettdre",
    };
  });

  return mapped;
}
