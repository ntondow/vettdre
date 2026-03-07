// ============================================================
// Leasing Email Webhook — Inbound Email Processing
//
// POST: Receives pre-parsed email from mail provider
// Auth: Bearer token via EMAIL_WEBHOOK_SECRET
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  extractOrgSlug,
  parseLeasingEmail,
  parseFromField,
  normalizeEmail,
} from "@/lib/leasing-email";
import { processInboundMessage } from "@/lib/leasing-engine";
import { detectIlsSource, parseIlsEmail } from "@/lib/ils-parser";
import type { IlsLead } from "@/lib/ils-parser";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Rate limiting (simple in-memory) ─────────────────────────

const emailRateMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 20; // 20 emails per sender per 10 min

function checkEmailRate(email: string): boolean {
  const now = Date.now();
  const timestamps = emailRateMap.get(email) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return false;
  recent.push(now);
  emailRateMap.set(email, recent);
  return true;
}

// ── POST /api/leasing/email ──────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Auth: Bearer token
  const authHeader = request.headers.get("authorization");
  const secret = process.env.EMAIL_WEBHOOK_SECRET;

  if (!secret || !authHeader || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body (multipart/form-data or JSON)
  let from: string;
  let to: string;
  let subject: string;
  let textBody: string;

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    from = String(formData.get("from") || "");
    to = String(formData.get("to") || "");
    subject = String(formData.get("subject") || "");
    textBody = String(formData.get("text") || "");

    // Fall back to HTML if no text body
    if (!textBody) {
      const html = String(formData.get("html") || "");
      textBody = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }
  } else {
    const body = await request.json();
    from = body.from || "";
    to = body.to || "";
    subject = body.subject || "";
    textBody = body.text || "";

    if (!textBody && body.html) {
      textBody = body.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }
  }

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from or to" }, { status: 400 });
  }

  // 3. Extract org slug from "to" address
  // Handle comma-separated or array of recipients
  const toAddresses = to.split(",").map((a) => a.trim());
  let orgSlug: string | null = null;
  for (const addr of toAddresses) {
    const extracted = extractOrgSlug(addr) || extractOrgSlug(addr.replace(/.*</, "").replace(/>.*/, ""));
    if (extracted) {
      orgSlug = extracted;
      break;
    }
  }

  if (!orgSlug) {
    return NextResponse.json({ ok: true, skipped: "no_matching_address" });
  }

  // 4. Look up org by slug
  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
  });

  if (!org) {
    return NextResponse.json({ ok: true, skipped: "org_not_found" });
  }

  // 5. Find active leasing config for this org
  const config = await prisma.leasingConfig.findFirst({
    where: { orgId: org.id, isActive: true },
  });

  if (!config) {
    return NextResponse.json({ ok: true, skipped: "no_config" });
  }

  // 6. Gate: email must be enabled AND tier must be Pro/Team
  if (!config.emailEnabled || config.tier === "free") {
    return NextResponse.json({ ok: true, skipped: "email_not_enabled" });
  }

  // 7. Detect ILS source (StreetEasy, Apartments.com, Zillow)
  let ilsLead: IlsLead | null = null;
  try {
    const ilsSource = detectIlsSource(from, subject);
    if (ilsSource) {
      ilsLead = parseIlsEmail(ilsSource, subject, textBody);
    }
  } catch (err) {
    // ILS parsing failure → fall back to regular email processing
    console.error("[leasing-email] ILS parse failed (falling back):", err);
    ilsLead = null;
  }

  // 8. Parse sender — use ILS lead data if available
  const sender = parseFromField(from);
  const prospectEmail = ilsLead?.email
    ? normalizeEmail(ilsLead.email)
    : normalizeEmail(sender.address);
  const prospectName = ilsLead?.name || sender.name;

  // 9. Rate limit
  if (!checkEmailRate(prospectEmail)) {
    console.log(`[leasing-email] Rate limited: ${prospectEmail}`);
    return NextResponse.json({ ok: true, skipped: "rate_limited" });
  }

  // 10. Parse email body — use ILS extracted message if available
  const messageBody = ilsLead?.message || parseLeasingEmail(textBody);
  if (!messageBody) {
    return NextResponse.json({ ok: true, skipped: "empty_body" });
  }

  // 11. Process through the leasing engine
  try {
    await processInboundMessage(
      prospectEmail,       // from (email address as identifier)
      config.id,           // to (config ID for email routing)
      messageBody,
      `email_${Date.now()}`, // messageSid equivalent
      {
        channel: "email",
        prospectEmail,
        prospectName,
        emailSubject: subject || null,
        ...(ilsLead ? {
          ilsLead: {
            source: ilsLead.source,
            phone: ilsLead.phone,
            moveInDate: ilsLead.moveInDate,
            bedrooms: ilsLead.bedrooms,
            listingRef: ilsLead.listingRef,
            message: ilsLead.message,
          },
        } : {}),
      },
    );
  } catch (err) {
    console.error("[leasing-email] Processing error:", err);
    // Return 200 to prevent mail provider retries
  }

  return NextResponse.json({ ok: true });
}
