import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getEventTypeColor } from "@/lib/google-calendar";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slotId, name, email, phone, notes } = body;

    if (!slotId || !name || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Find the slot
    const slot = await prisma.showingSlot.findUnique({ where: { id: slotId } });
    if (!slot) {
      return NextResponse.json({ error: "Showing slot not found" }, { status: 404 });
    }
    if (slot.isBooked) {
      return NextResponse.json({ error: "This slot is already booked" }, { status: 409 });
    }

    // Parse name
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || name;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

    // Find or create contact as lead
    let contact = await prisma.contact.findFirst({
      where: { orgId: slot.orgId, email: email.toLowerCase() },
    });

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          orgId: slot.orgId,
          assignedTo: slot.userId,
          firstName,
          lastName,
          email: email.toLowerCase(),
          phone: phone || null,
          status: "lead",
          source: "showing_scheduler",
          sourceDetail: slot.propertyAddress,
        },
      });
    }

    // Create calendar event
    const eventColor = getEventTypeColor("showing");
    const unitLabel = slot.unitNumber ? ` #${slot.unitNumber}` : "";
    const calendarEvent = await prisma.calendarEvent.create({
      data: {
        orgId: slot.orgId,
        userId: slot.userId,
        title: `Showing: ${slot.propertyAddress}${unitLabel} - ${name}`,
        description: notes || null,
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
        attendees: [{ email, name, status: "accepted" }],
        source: "scheduler",
      },
    });

    // Mark slot as booked
    await prisma.showingSlot.update({
      where: { id: slotId },
      data: {
        isBooked: true,
        bookedByName: name,
        bookedByEmail: email.toLowerCase(),
        bookedByPhone: phone || null,
        bookedAt: new Date(),
        contactId: contact.id,
        calendarEventId: calendarEvent.id,
        notes: notes || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[API] Book showing error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
