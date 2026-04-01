// ── PATCH /api/mobile/tasks/[id] ────────────────────────────────
// Update a task: mark complete, snooze, or change status.
//
// Body examples:
//   { "status": "completed" }        — mark done
//   { "snoozeDays": 1 }              — push dueAt by N days
//   { "status": "in_progress" }      — start working

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["pending", "in_progress", "completed", "cancelled"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const { id } = await params;
    const body = await req.json();
    const { status, snoozeDays } = body;

    // Verify task belongs to the user
    const task = await prisma.task.findFirst({
      where: {
        id,
        orgId: ctx.orgId,
        assignedTo: ctx.userId,
      },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};

    // Handle status change
    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      data.status = status;
      if (status === "completed") {
        data.completedAt = new Date();
        data.completedBy = ctx.userId;
      }
    }

    // Handle snooze (push dueAt forward)
    if (snoozeDays && typeof snoozeDays === "number" && snoozeDays > 0) {
      const currentDue = task.dueAt || new Date();
      const newDue = new Date(currentDue);
      newDue.setDate(newDue.getDate() + Math.min(snoozeDays, 30)); // cap at 30 days
      data.dueAt = newDue;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid update fields provided" },
        { status: 400 }
      );
    }

    const updated = await prisma.task.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueAt: true,
        completedAt: true,
      },
    });

    return NextResponse.json(serialize(updated));
  } catch (error: unknown) {
    console.error("[mobile/tasks/[id]] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}
