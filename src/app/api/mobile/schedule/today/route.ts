// ── GET /api/mobile/schedule/today ─────────────────────────────
// Returns today's calendar events and tasks for the authenticated user.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const { orgId, userId } = ctx;

    // Resolve timezone from query param, user profile, or default to NYC
    const tz =
      req.nextUrl.searchParams.get("tz") || ctx.timezone || "America/New_York";

    // Compute today's midnight-to-midnight in the user's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const localDate = formatter.format(now); // e.g. "2026-04-01"
    const startOfDay = new Date(`${localDate}T00:00:00`);
    const endOfDay = new Date(`${localDate}T23:59:59.999`);

    // Convert local bounds to UTC for DB query
    const offsetMs = now.getTime() - new Date(
      now.toLocaleString("en-US", { timeZone: tz })
    ).getTime();
    const startUTC = new Date(startOfDay.getTime() + offsetMs);
    const endUTC = new Date(endOfDay.getTime() + offsetMs);

    // Fetch events and tasks in parallel
    const [events, tasks] = await Promise.all([
      // Calendar events for today
      prisma.calendarEvent.findMany({
        where: {
          orgId,
          OR: [
            // Events starting today
            { startAt: { gte: startUTC, lt: endUTC } },
            // All-day events that overlap today
            {
              allDay: true,
              startAt: { lte: endUTC },
              endAt: { gte: startUTC },
            },
          ],
        },
        orderBy: { startAt: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          location: true,
          startAt: true,
          endAt: true,
          allDay: true,
          eventType: true,
          status: true,
          color: true,
          propertyAddress: true,
          unitNumber: true,
          attendees: true,
          contact: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),

      // Tasks due today (or overdue)
      prisma.task.findMany({
        where: {
          orgId,
          assignedTo: userId,
          status: { in: ["pending", "in_progress"] },
          dueAt: { lte: endUTC },
        },
        orderBy: { dueAt: "asc" },
        select: {
          id: true,
          title: true,
          type: true,
          priority: true,
          status: true,
          dueAt: true,
          contact: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
    ]);

    return NextResponse.json(
      serialize({
        events: events.map((e) => ({
          ...e,
          contactName: e.contact
            ? `${e.contact.firstName || ""} ${e.contact.lastName || ""}`.trim() || null
            : null,
          contactId: e.contact?.id || null,
        })),
        tasks: tasks.map((t) => ({
          ...t,
          contactName: t.contact
            ? `${t.contact.firstName || ""} ${t.contact.lastName || ""}`.trim() || null
            : null,
          contactId: t.contact?.id || null,
        })),
      })
    );
  } catch (error: unknown) {
    console.error("[mobile/schedule/today] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedule" },
      { status: 500 }
    );
  }
}
