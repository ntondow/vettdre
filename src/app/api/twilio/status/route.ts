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

  const sid = params.get("CallSid") || params.get("MessageSid") || "";
  const status = (params.get("CallStatus") || params.get("MessageStatus") || "").toLowerCase();
  const duration = params.get("CallDuration") || params.get("Duration");
  const recordingUrl = params.get("RecordingUrl");

  if (!sid) {
    return NextResponse.json({ ok: true });
  }

  try {
    // Try to update a message first
    const sms = await prisma.smsMessage.findUnique({ where: { twilioSid: sid } });
    if (sms) {
      const smsStatusMap: Record<string, string> = {
        queued: "queued",
        sent: "sent",
        delivered: "delivered",
        undelivered: "failed",
        failed: "failed",
      };
      const mapped = smsStatusMap[status];
      if (mapped) {
        await prisma.smsMessage.update({
          where: { id: sms.id },
          data: { status: mapped as any },
        });
      }
      return NextResponse.json({ ok: true });
    }

    // Try to update a call
    const call = await prisma.phoneCall.findUnique({ where: { twilioSid: sid } });
    if (call) {
      const callStatusMap: Record<string, string> = {
        initiated: "initiated",
        ringing: "ringing",
        "in-progress": "answered",
        completed: "completed",
        busy: "missed",
        "no-answer": "missed",
        canceled: "missed",
        failed: "failed",
      };
      const mapped = callStatusMap[status];
      const updateData: Record<string, any> = {};
      if (mapped) updateData.status = mapped;
      if (duration) updateData.duration = parseInt(duration, 10);
      if (recordingUrl) updateData.recordingUrl = recordingUrl;

      if (Object.keys(updateData).length > 0) {
        await prisma.phoneCall.update({
          where: { id: call.id },
          data: updateData,
        });
      }
      return NextResponse.json({ ok: true });
    }
  } catch (error) {
    console.error("Twilio status callback error:", error);
  }

  return NextResponse.json({ ok: true });
}
