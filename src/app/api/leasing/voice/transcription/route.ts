// ============================================================
// Leasing Voice Transcription Handler
//
// POST: Twilio sends SpeechResult after prospect speaks.
// Processes through AI, returns TwiML with spoken response + next Gather.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import prisma from "@/lib/prisma";
import { normalizePhone } from "@/lib/leasing-types";
import { processVoiceMessage } from "@/lib/leasing-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

// Sanitize AI text for TTS: remove markdown, URLs, special chars
function sanitizeForTts(text: string): string {
  return text
    // Remove markdown bold/italic
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    // Remove markdown bullet points
    .replace(/^[\s]*[-*•]\s+/gm, "")
    // Remove URLs
    .replace(/https?:\/\/\S+/g, "")
    // Remove special characters
    .replace(/[#>`~|]/g, "")
    // Replace $ amounts with spoken form
    .replace(/\$(\d{1,3}),(\d{3})/g, (_, a, b) => `${a} thousand ${parseInt(b) > 0 ? b : ""}`.trim())
    .replace(/\$(\d+)/g, "$1 dollars")
    // Collapse multiple spaces/newlines
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
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

  const speechResult = params.get("SpeechResult") || "";
  const confidence = parseFloat(params.get("Confidence") || "0");
  const callSid = params.get("CallSid") || "";
  const to = normalizePhone(params.get("To") || "");
  const from = normalizePhone(params.get("From") || "");
  const callDuration = params.get("CallDuration"); // Present on final callback

  if (!to || !from) {
    return twiml(`<Response><Say voice="${VOICE}">Sorry, something went wrong.</Say><Hangup/></Response>`);
  }

  // Handle empty/low-confidence speech
  if (!speechResult.trim() || confidence < 0.4) {
    // Track consecutive empty inputs
    try {
      const conversation = await prisma.leasingConversation.findFirst({
        where: { configId: { not: undefined }, prospectPhone: from, channel: "voice" },
        orderBy: { createdAt: "desc" },
      });

      if (conversation) {
        const qualData = (conversation.qualData as Record<string, any>) || {};
        const emptyCount = (qualData.voiceEmptyCount || 0) + 1;

        await prisma.leasingConversation.update({
          where: { id: conversation.id },
          data: { qualData: { ...qualData, voiceEmptyCount: emptyCount } },
        });

        // 3+ consecutive empty inputs → hang up
        if (emptyCount >= 3) {
          const buildingName = await getBuildingName(to);
          return twiml(`<Response><Say voice="${VOICE}">It seems like we're having trouble hearing you. Thanks for calling ${escapeXml(buildingName)}. Feel free to text this number anytime. Goodbye!</Say><Hangup/></Response>`);
        }
      }
    } catch (err) {
      console.error("[LEASING VOICE] Empty input tracking error:", err);
    }

    return twiml(`<Response>
  <Gather input="speech" speechTimeout="3" speechModel="phone_call" action="/api/leasing/voice/transcription" method="POST" timeout="10">
    <Say voice="${VOICE}">Sorry, I didn't catch that. Could you say that again?</Say>
  </Gather>
  <Say voice="${VOICE}">I'm still having trouble hearing you. Please try texting this number instead.</Say>
  <Hangup/>
</Response>`);
  }

  // Process through AI engine
  try {
    const result = await processVoiceMessage(to, from, speechResult, callSid);

    // Reset empty count on successful input
    try {
      const conv = await prisma.leasingConversation.findUnique({ where: { id: result.conversationId } });
      if (conv) {
        const qd = (conv.qualData as Record<string, any>) || {};
        if (qd.voiceEmptyCount) {
          await prisma.leasingConversation.update({
            where: { id: conv.id },
            data: { qualData: { ...qd, voiceEmptyCount: 0 } },
          });
        }
      }
    } catch { /* silent */ }

    const sanitized = escapeXml(sanitizeForTts(result.response));

    // Store call duration if provided
    if (callDuration && result.conversationId) {
      try {
        const conv = await prisma.leasingConversation.findUnique({ where: { id: result.conversationId } });
        const qd = (conv?.qualData as Record<string, any>) || {};
        await prisma.leasingConversation.update({
          where: { id: result.conversationId },
          data: { qualData: { ...qd, callDurationSeconds: parseInt(callDuration, 10) } },
        });
      } catch { /* silent */ }
    }

    // Check for goodbye
    if (result.isGoodbye) {
      const buildingName = await getBuildingName(to);
      const goodbye = sanitized.includes("oodbye") || sanitized.includes("ake care")
        ? sanitized
        : `${sanitized}. Thanks for calling ${escapeXml(buildingName)}. Goodbye!`;

      // Schedule post-call SMS summary
      try {
        await schedulePostCallSms(result.conversationId, from, to);
      } catch (err) {
        console.error("[LEASING VOICE] Failed to schedule post-call SMS:", err);
      }

      return twiml(`<Response><Say voice="${VOICE}">${goodbye}</Say><Hangup/></Response>`);
    }

    // Continue conversation loop
    return twiml(`<Response>
  <Gather input="speech" speechTimeout="3" speechModel="phone_call" action="/api/leasing/voice/transcription" method="POST" timeout="10">
    <Say voice="${VOICE}">${sanitized}</Say>
  </Gather>
  <Redirect method="POST">/api/leasing/voice/transcription</Redirect>
</Response>`);
  } catch (error) {
    console.error("[LEASING VOICE] Transcription processing error:", error);
    return twiml(`<Response>
  <Gather input="speech" speechTimeout="3" speechModel="phone_call" action="/api/leasing/voice/transcription" method="POST" timeout="10">
    <Say voice="${VOICE}">I'm sorry, I'm having a bit of trouble. Could you repeat that?</Say>
  </Gather>
  <Say voice="${VOICE}">Sorry about the trouble. Please try texting this number instead.</Say>
  <Hangup/>
</Response>`);
  }
}

// ── Helpers ───────────────────────────────────────────────────

async function getBuildingName(toNumber: string): Promise<string> {
  try {
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: { number: toNumber, status: "active" },
    });
    if (!phoneNumber) return "our property";

    const config = await prisma.leasingConfig.findFirst({
      where: { twilioNumberId: phoneNumber.id, isActive: true },
      include: { property: { select: { name: true, address: true } } },
    });

    return config?.property.name || config?.property.address || "our property";
  } catch {
    return "our property";
  }
}

async function schedulePostCallSms(
  conversationId: string,
  prospectPhone: string,
  toNumber: string,
): Promise<void> {
  // Get conversation summary for the SMS
  const conversation = await prisma.leasingConversation.findUnique({
    where: { id: conversationId },
    include: {
      config: { include: { property: { select: { name: true, address: true } } } },
    },
  });

  if (!conversation) return;

  const buildingName = conversation.config.property.name || conversation.config.property.address || "our property";
  const prospectName = conversation.prospectName || "there";

  // Create a follow-up that the cron will pick up
  await prisma.leasingFollowUp.create({
    data: {
      conversationId,
      type: "post_showing", // Reuse existing type
      scheduledFor: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes from now
      messageBody: `Hi ${prospectName}! Thanks for calling ${buildingName}. If you have any other questions, feel free to text this number anytime — I'm here to help!`,
    },
  });
}
