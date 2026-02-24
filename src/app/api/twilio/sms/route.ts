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
  const messageBody = params.get("Body") || "";
  const messageSid = params.get("MessageSid") || "";
  const numMedia = parseInt(params.get("NumMedia") || "0", 10);

  // Collect media URLs
  const mediaUrls: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const url = params.get(`MediaUrl${i}`);
    if (url) mediaUrls.push(url);
  }

  try {
    // Find the phone number record by the "To" number
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: { number: to, status: "active" },
    });

    if (!phoneNumber) {
      console.error(`Incoming SMS to unknown number: ${to}`);
      return new NextResponse("<Response></Response>", {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Try to match sender to a CRM contact
    const contact = await prisma.contact.findFirst({
      where: {
        orgId: phoneNumber.organizationId,
        OR: [{ phone: from }, { secondaryPhone: from }],
      },
    });

    // Save to database
    await prisma.smsMessage.create({
      data: {
        phoneNumberId: phoneNumber.id,
        userId: phoneNumber.userId,
        contactId: contact?.id || null,
        direction: "inbound",
        from,
        to,
        body: messageBody,
        status: "received",
        twilioSid: messageSid,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : [],
      },
    });

    // Log activity if contact matched
    if (contact) {
      await prisma.activity.create({
        data: {
          orgId: phoneNumber.organizationId,
          contactId: contact.id,
          userId: phoneNumber.userId,
          type: "text",
          direction: "inbound",
          subject: "SMS received",
          body: messageBody,
        },
      });
      await prisma.contact.update({
        where: { id: contact.id },
        data: { lastActivityAt: new Date() },
      });
    }
  } catch (error) {
    console.error("Twilio SMS webhook error:", error);
  }

  // Return empty TwiML (no auto-reply)
  return new NextResponse("<Response></Response>", {
    headers: { "Content-Type": "text/xml" },
  });
}
