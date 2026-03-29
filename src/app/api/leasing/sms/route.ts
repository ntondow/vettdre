import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { processInboundMessage } from "@/lib/leasing-engine";
import { normalizePhone } from "@/lib/leasing-types";

export const dynamic = "force-dynamic";

// ── Rate Limiting ─────────────────────────────────────────────

const PHONE_LIMIT = 10;
const PHONE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const GLOBAL_LIMIT = 100;
const GLOBAL_WINDOW_MS = 60 * 1000; // 1 minute
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface RateEntry {
  count: number;
  windowStart: number;
}

const phoneRateMap = new Map<string, RateEntry>();
let globalRate: RateEntry = { count: 0, windowStart: Date.now() };

let cleanupScheduled = false;
if (!cleanupScheduled) {
  cleanupScheduled = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of phoneRateMap) {
      if (now - entry.windowStart > PHONE_WINDOW_MS) {
        phoneRateMap.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

function isRateLimited(phone: string): boolean {
  const now = Date.now();

  // Global rate check
  if (now - globalRate.windowStart > GLOBAL_WINDOW_MS) {
    globalRate = { count: 1, windowStart: now };
  } else {
    globalRate.count++;
    if (globalRate.count > GLOBAL_LIMIT) {
      console.log(JSON.stringify({
        event: "rate_limit_hit",
        phone,
        type: "global",
        count: globalRate.count,
        windowMs: GLOBAL_WINDOW_MS,
      }));
      return true;
    }
  }

  // Per-phone rate check
  const entry = phoneRateMap.get(phone);
  if (!entry || now - entry.windowStart > PHONE_WINDOW_MS) {
    phoneRateMap.set(phone, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  if (entry.count > PHONE_LIMIT) {
    console.log(JSON.stringify({
      event: "rate_limit_hit",
      phone,
      type: "per_phone",
      count: entry.count,
      windowMs: PHONE_WINDOW_MS,
    }));
    return true;
  }

  return false;
}

// ── Twilio SMS Webhook ────────────────────────────────────────
// Receives inbound SMS, delegates to the conversation engine

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

  const from = normalizePhone(params.get("From") || "");
  const to = normalizePhone(params.get("To") || "");
  const messageBody = params.get("Body") || "";
  const messageSid = params.get("MessageSid") || "";

  if (!from || !to || !messageBody) {
    return new NextResponse("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Rate limit check — return 200 but skip AI processing
  if (isRateLimited(from)) {
    return new NextResponse("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Process asynchronously but within Twilio's timeout
  // We don't use TwiML response — we send via API for better control
  try {
    await processInboundMessage(from, to, messageBody, messageSid);
  } catch (error) {
    console.error("[leasing/sms] Webhook processing error:", error);
  }

  // Return empty TwiML (response sent via API, not TwiML)
  return new NextResponse("<Response></Response>", {
    headers: { "Content-Type": "text/xml" },
  });
}
