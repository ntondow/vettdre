// ============================================================
// Web Chat API — POST /api/leasing/chat
//
// Public endpoint for web chat widget communication.
// Rate limited: 20 messages per IP per hour.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkLeasingFeature } from "@/lib/leasing-limits";
import { processWebChatMessage } from "@/lib/leasing-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Rate Limiting (in-memory, per-IP) ───────────────────────

const RATE_LIMIT = 20; // messages per hour
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const ipCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipCounts.get(ip);

  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Clean up stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipCounts) {
    if (now > entry.resetAt) ipCounts.delete(ip);
  }
}, 10 * 60 * 1000);

// ── POST Handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 });
    }

    // Parse body
    const body = await req.json();
    const { configSlug, prospectName, prospectEmail, prospectPhone, message, conversationId } = body as {
      configSlug: string;
      prospectName: string;
      prospectEmail?: string;
      prospectPhone?: string;
      message: string;
      conversationId?: string;
    };

    if (!configSlug || !prospectName || !message) {
      return NextResponse.json({ error: "configSlug, prospectName, and message are required" }, { status: 400 });
    }

    if (message.length > 2000) {
      return NextResponse.json({ error: "Message too long (max 2000 characters)" }, { status: 400 });
    }

    // Look up config by slug
    const config = await prisma.leasingConfig.findFirst({
      where: { slug: configSlug, isActive: true },
      select: { id: true, webChatEnabled: true },
    });

    if (!config) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    // Check web chat is enabled + feature gate
    if (!config.webChatEnabled) {
      return NextResponse.json({ error: "Web chat is not enabled for this property" }, { status: 403 });
    }

    const hasFeature = await checkLeasingFeature(config.id, "web_chat");
    if (!hasFeature) {
      return NextResponse.json({ error: "Web chat requires a Team subscription" }, { status: 403 });
    }

    // Process message through AI engine
    const result = await processWebChatMessage(
      config.id,
      message,
      prospectName,
      prospectEmail,
      prospectPhone,
      conversationId,
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[LEASING CHAT API] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
