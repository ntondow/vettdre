import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import twilio from "twilio";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const params = new URLSearchParams(body);

  // Validate Twilio signature
  const signature = request.headers.get("x-twilio-signature") || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const url = request.url;
    const paramsObj: Record<string, string> = {};
    params.forEach((v, k) => { paramsObj[k] = v; });
    const isValid = twilio.validateRequest(authToken, signature, url, paramsObj);
    if (!isValid) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const from = params.get("From") || "";
  const to = params.get("To") || "";
  const callSid = params.get("CallSid") || "";

  try {
    // Find the phone number record
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: { number: to, status: "active" },
    });

    if (!phoneNumber) {
      return new NextResponse(
        "<Response><Say>The number you have reached is not in service.</Say></Response>",
        { headers: { "Content-Type": "text/xml" } },
      );
    }

    // Try to match caller to a CRM contact
    const contact = await prisma.contact.findFirst({
      where: {
        orgId: phoneNumber.organizationId,
        OR: [{ phone: from }, { secondaryPhone: from }],
      },
    });

    // Save call record
    await prisma.phoneCall.create({
      data: {
        phoneNumberId: phoneNumber.id,
        userId: phoneNumber.userId,
        contactId: contact?.id || null,
        direction: "inbound",
        from,
        to,
        status: "ringing",
        twilioSid: callSid,
      },
    });

    // Log activity
    if (contact) {
      await prisma.activity.create({
        data: {
          orgId: phoneNumber.organizationId,
          contactId: contact.id,
          userId: phoneNumber.userId,
          type: "call",
          direction: "inbound",
          subject: "Incoming call",
        },
      });
    }

    // If forwarding number is set, dial it
    if (phoneNumber.forwardingNumber) {
      return new NextResponse(
        `<Response><Dial timeout="30" callerId="${to}">${phoneNumber.forwardingNumber}</Dial></Response>`,
        { headers: { "Content-Type": "text/xml" } },
      );
    }

    // No forwarding number — play voicemail
    return new NextResponse(
      `<Response><Say voice="alice">The person you are trying to reach is unavailable. Please leave a message after the beep.</Say><Record maxLength="120" transcribe="true" action="https://app.vettdre.com/api/twilio/status" /></Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  } catch (error) {
    console.error("Twilio voice webhook error:", error);
    return new NextResponse(
      "<Response><Say>An error occurred. Please try again later.</Say></Response>",
      { headers: { "Content-Type": "text/xml" } },
    );
  }
}
