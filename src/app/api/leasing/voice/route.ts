// ============================================================
// Leasing Voice Webhook — Initial Call Handler
//
// POST: Twilio hits this when someone calls the leasing number.
// Returns TwiML with greeting + <Gather> for speech input.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import prisma from "@/lib/prisma";
import { normalizePhone } from "@/lib/leasing-types";
import { checkLeasingFeature } from "@/lib/leasing-limits";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const VOICE = "Polly.Joanna-Neural";

function twiml(body: string): NextResponse {
  return new NextResponse(body, {
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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

  const to = normalizePhone(params.get("To") || "");

  if (!to) {
    return twiml(`<Response><Say voice="${VOICE}">Sorry, this number is not currently available.</Say></Response>`);
  }

  // Look up config by phone number
  try {
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: { number: to, status: "active" },
    });

    if (!phoneNumber) {
      return twiml(`<Response><Say voice="${VOICE}">Sorry, this number is not currently available. Please try again later.</Say></Response>`);
    }

    const config = await prisma.leasingConfig.findFirst({
      where: { twilioNumberId: phoneNumber.id, isActive: true },
      include: { property: { select: { name: true, address: true } } },
    });

    if (!config || !config.voiceEnabled) {
      return twiml(`<Response><Say voice="${VOICE}">Sorry, this number is not currently available. Please try again later.</Say></Response>`);
    }

    // Check feature gate (Team tier)
    const hasVoice = await checkLeasingFeature(config.id, "voice_channel");
    if (!hasVoice) {
      return twiml(`<Response><Say voice="${VOICE}">Sorry, this number is not currently available. Please try again later.</Say></Response>`);
    }

    // Build greeting
    const buildingName = config.property.name || config.property.address || "our property";
    const aiName = config.aiName || "your leasing assistant";
    const greeting = escapeXml(
      config.greeting ||
      `Hi, thanks for calling ${buildingName}. I'm ${aiName}, your leasing assistant. How can I help you today?`
    );

    return twiml(`<Response>
  <Gather input="speech" speechTimeout="3" speechModel="phone_call" action="/api/leasing/voice/transcription" method="POST" timeout="10">
    <Say voice="${VOICE}">${greeting}</Say>
  </Gather>
  <Say voice="${VOICE}">I didn't catch that. Please call back and try again.</Say>
</Response>`);
  } catch (error) {
    console.error("[LEASING VOICE] Initial call error:", error);
    return twiml(`<Response><Say voice="${VOICE}">Sorry, we're experiencing technical difficulties. Please try again later.</Say></Response>`);
  }
}
