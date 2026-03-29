// ============================================================
// AI Leasing Agent — Email Channel Utilities
//
// Inbound email parsing, outbound email sending, address generation
// ============================================================

import prisma from "@/lib/prisma";
import { getUserGmailAccount, getValidToken } from "@/lib/gmail";
import { sendEmail } from "@/lib/gmail-send";

// ── Types ────────────────────────────────────────────────────

export interface ParsedEmail {
  fromAddress: string;
  fromName: string | null;
  subject: string;
  body: string;
}

// ── Address Generation ───────────────────────────────────────

/**
 * Generate deterministic leasing email address for an org.
 * Format: leasing-{orgSlug}@mail.vettdre.com
 */
export function generateLeasingEmail(orgSlug: string): string {
  return `leasing-${orgSlug}@mail.vettdre.com`;
}

/**
 * Extract org slug from a leasing email address.
 * "leasing-acme-realty@mail.vettdre.com" → "acme-realty"
 */
export function extractOrgSlug(email: string): string | null {
  const match = email.toLowerCase().match(/^leasing-([^@]+)@mail\.vettdre\.com$/);
  return match ? match[1] : null;
}

// ── Email Parsing ────────────────────────────────────────────

/**
 * Parse inbound email body: strip quoted replies, signatures, disclaimers.
 * Returns clean prospect message only.
 */
export function parseLeasingEmail(rawBody: string): string {
  let body = rawBody;

  // Strip everything after "On [date] ... wrote:" pattern
  body = body.replace(/\r?\nOn\s+.{10,80}\s+wrote:\s*\n[\s\S]*/i, "");

  // Strip "-----Original Message-----" and everything after
  body = body.replace(/\r?\n-{3,}[\s]*Original Message[\s]*-{3,}[\s\S]*/i, "");

  // Strip "From:" header block in forwarded/replied emails
  body = body.replace(/\r?\nFrom:\s+.+[\s\S]*/i, "");

  // Strip quoted lines (lines starting with >)
  body = body.split("\n").filter((line) => !line.trimStart().startsWith(">")).join("\n");

  // Strip email signatures: "-- \n" marker (RFC standard)
  body = body.replace(/\r?\n--\s*\r?\n[\s\S]*/, "");

  // Strip "Sent from my iPhone/Android/etc"
  body = body.replace(/\r?\nSent from my\s+\w+[\s\S]*/i, "");

  // Strip "Get Outlook for iOS/Android"
  body = body.replace(/\r?\nGet Outlook for\s+\w+[\s\S]*/i, "");

  // Strip common sign-offs followed by a name on the next line
  // "Best," / "Thanks," / "Regards," / "Cheers," / "Best regards,"
  body = body.replace(/\r?\n(Best|Thanks|Thank you|Regards|Cheers|Best regards|Kind regards|Sincerely|Warm regards),?\s*\r?\n[A-Z][a-z]+[\s\S]*/i, "");

  // Strip legal disclaimers (paragraphs containing "confidential" or "privileged communication")
  const lines = body.split("\n");
  const cleaned: string[] = [];
  let skipParagraph = false;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("confidential") || lower.includes("privileged communication") || lower.includes("intended recipient")) {
      skipParagraph = true;
      continue;
    }
    if (skipParagraph && line.trim() === "") {
      skipParagraph = false;
      continue;
    }
    if (!skipParagraph) {
      cleaned.push(line);
    }
  }

  return cleaned.join("\n").trim();
}

/**
 * Normalize email address: lowercase + trim.
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Parse "From" header into address and display name.
 * Handles: "John Doe <john@example.com>" or just "john@example.com"
 */
export function parseFromField(from: string): { address: string; name: string | null } {
  const match = from.match(/^"?([^"<]*?)"?\s*<([^>]+)>/);
  if (match) {
    return { address: normalizeEmail(match[2]), name: match[1].trim() || null };
  }
  return { address: normalizeEmail(from), name: null };
}

// ── Email Sending ────────────────────────────────────────────

/**
 * Send a leasing reply email via the org's Gmail or fallback platform account.
 */
export async function sendLeasingReply(
  config: { orgId: string; property: { name: string; address: string | null } },
  toEmail: string,
  toName: string | null,
  subject: string,
  body: string,
): Promise<void> {
  // Ensure subject has "Re: " prefix
  const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;

  // Convert plain text body to simple HTML
  const bodyHtml = body
    .split("\n")
    .map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`)
    .join("");

  // Try org's connected Gmail account
  const gmailAccount = await findOrgGmailAccount(config.orgId);

  if (gmailAccount) {
    await sendEmail({
      gmailAccountId: gmailAccount.id,
      orgId: config.orgId,
      to: toName ? `"${toName}" <${toEmail}>` : toEmail,
      subject: replySubject,
      bodyHtml,
    });
    return;
  }

  // Fallback: platform Gmail account
  const fallbackEmail = process.env.LEASING_FALLBACK_EMAIL;
  if (!fallbackEmail) {
    console.error("[leasing-email] No Gmail account connected and no fallback configured");
    throw new Error("No email sending capability available");
  }

  // Find fallback Gmail account by email
  const fallbackAccount = await prisma.gmailAccount.findFirst({
    where: { email: fallbackEmail, isActive: true },
  });

  if (!fallbackAccount) {
    console.error(`[leasing-email] Fallback email account ${fallbackEmail} not found in database`);
    throw new Error("Fallback email account not configured");
  }

  await sendEmail({
    gmailAccountId: fallbackAccount.id,
    orgId: config.orgId,
    to: toName ? `"${toName}" <${toEmail}>` : toEmail,
    subject: replySubject,
    bodyHtml,
  });
}

// ── Helpers ──────────────────────────────────────────────────

async function findOrgGmailAccount(orgId: string) {
  const orgUsers = await prisma.user.findMany({
    where: { orgId, role: { in: ["owner", "admin"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  for (const user of orgUsers) {
    const account = await getUserGmailAccount(user.id);
    if (account) {
      // Verify token is still valid
      try {
        await getValidToken(account.id);
        return account;
      } catch {
        continue;
      }
    }
  }
  return null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
