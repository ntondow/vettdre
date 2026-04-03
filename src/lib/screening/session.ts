/**
 * Applicant Session Management — Access Token Hardening
 *
 * The URL token (/screen/{token}) is a one-time entry point that establishes
 * a short-lived server-side session via httpOnly cookie. After initial load,
 * the token alone is no longer sufficient — the session cookie is required.
 *
 * Security properties:
 * - Session stored in Redis (24-hour TTL)
 * - httpOnly, secure, sameSite=lax cookie
 * - Session bound to specific token (prevents cross-application reuse)
 * - Cookie scoped to /screen/{token} path
 */

import crypto from "crypto";
import { getRedisClient } from "@/lib/rate-limit";

const SESSION_TTL_SECONDS = 86400; // 24 hours
const COOKIE_NAME = "vettdre_screen_session";

// ── Types ────────────────────────────────────────────────────

interface SessionData {
  applicationId: string;
  applicantIds: string[];
  token: string;
  createdAt: string;
  ip: string;
}

export interface SessionValidationResult {
  valid: boolean;
  applicationId?: string;
  applicantIds?: string[];
  error?: string;
}

// ── Create Session ───────────────────────────────────────────

/**
 * Create a new applicant session and return the cookie value + options.
 * Called on the initial GET /api/screen/[token] when no valid session exists.
 */
export async function createApplicantSession(
  token: string,
  applicationId: string,
  applicantIds: string[],
  ip: string,
): Promise<{
  sessionId: string;
  cookieName: string;
  cookieValue: string;
  cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax" | "strict" | "none";
    path: string;
    maxAge: number;
  };
}> {
  const redis = getRedisClient();
  const sessionId = crypto.randomUUID();

  const data: SessionData = {
    applicationId,
    applicantIds,
    token,
    createdAt: new Date().toISOString(),
    ip,
  };

  await redis.set(`screen_session:${sessionId}`, JSON.stringify(data), {
    ex: SESSION_TTL_SECONDS,
  });

  return {
    sessionId,
    cookieName: COOKIE_NAME,
    cookieValue: sessionId,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      // Path must cover both /screen/{token} (page) and /api/screen/{token} (API)
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    },
  };
}

// ── Validate Session ─────────────────────────────────────────

/**
 * Validate an applicant session from cookie + token.
 * Used by all POST /api/screen/[token]/* endpoints.
 */
export async function validateApplicantSession(
  token: string,
  cookieHeader: string | null,
): Promise<SessionValidationResult> {
  if (!cookieHeader) {
    return {
      valid: false,
      error: "No session. Please reopen your application link.",
    };
  }

  // Parse the session cookie from the cookie header
  const sessionId = parseCookieValue(cookieHeader, COOKIE_NAME);
  if (!sessionId) {
    return {
      valid: false,
      error: "No session. Please reopen your application link.",
    };
  }

  const redis = getRedisClient();
  const raw = await redis.get(`screen_session:${sessionId}`);
  if (!raw) {
    return {
      valid: false,
      error: "Session expired. Please reopen your application link.",
    };
  }

  const data: SessionData =
    typeof raw === "string" ? JSON.parse(raw) : (raw as SessionData);

  // Verify the session belongs to this token
  if (data.token !== token) {
    return { valid: false, error: "Invalid session for this application." };
  }

  return {
    valid: true,
    applicationId: data.applicationId,
    applicantIds: data.applicantIds,
  };
}

// ── Cookie Parser ────────────────────────────────────────────

function parseCookieValue(
  cookieHeader: string,
  name: string,
): string | null {
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

// ── Exports ──────────────────────────────────────────────────

export { COOKIE_NAME, SESSION_TTL_SECONDS };
