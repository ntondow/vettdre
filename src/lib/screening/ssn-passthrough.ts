/**
 * SSN Pass-Through — Redis-Only Ephemeral Storage
 *
 * SSNs are NEVER persisted to the database. Instead:
 * 1. Applicant enters SSN in wizard → sent to /api/screen/[token]/submit-ssn
 * 2. SSN stored in Redis with 30-minute TTL → returns a one-time reference ID
 * 3. Pipeline retrieves SSN via reference ID, passes directly to CRS API, deletes immediately
 *
 * Security properties:
 * - Redis encrypted in transit (TLS) + Upstash encrypts at rest
 * - 30-minute automatic TTL expiry
 * - Deleted immediately after credit pull (single use)
 * - Reference ID is a crypto.randomUUID() — not guessable
 * - No SSN data in database at any point
 */

import crypto from "crypto";
import { getRedisClient } from "@/lib/rate-limit";

const SSN_TTL_SECONDS = 1800; // 30 minutes
const SSN_PREFIX = "ssn_ref:";

// ── Store SSN ────────────────────────────────────────────────

/**
 * Store an SSN in Redis and return a one-time reference ID.
 * The SSN is stored with a 30-minute TTL and auto-expires.
 */
export async function storeSSN(
  ssn: string,
  applicantId: string,
): Promise<string> {
  const redis = getRedisClient();
  const refId = crypto.randomUUID();

  // Store with applicant binding for extra safety
  await redis.set(
    `${SSN_PREFIX}${refId}`,
    JSON.stringify({ ssn: ssn.replace(/\D/g, ""), applicantId }),
    { ex: SSN_TTL_SECONDS },
  );

  return refId;
}

// ── Retrieve & Delete SSN ────────────────────────────────────

export interface SSNRetrievalResult {
  success: boolean;
  ssn?: string;
  error?: string;
}

/**
 * Retrieve SSN from Redis by reference ID, then immediately delete it.
 * Single-use: after retrieval, the reference is gone.
 * Also verifies the applicantId matches (prevents cross-applicant SSN theft).
 */
export async function retrieveAndDeleteSSN(
  refId: string,
  applicantId: string,
): Promise<SSNRetrievalResult> {
  const redis = getRedisClient();
  const key = `${SSN_PREFIX}${refId}`;

  // Atomic get-and-delete to prevent race conditions (two parallel calls both reading)
  // Upstash Redis supports GETDEL (Redis 6.2+)
  let raw: string | null = null;
  try {
    raw = await redis.getdel(key) as string | null;
  } catch {
    // Fallback: non-atomic get + delete if GETDEL not supported
    raw = await redis.get(key) as string | null;
    if (raw) await redis.del(key);
  }

  if (!raw) {
    return {
      success: false,
      error: "SSN reference expired or already used. Applicant must re-enter SSN.",
    };
  }

  const data = typeof raw === "string" ? JSON.parse(raw) : (raw as { ssn: string; applicantId: string });

  // Verify applicant binding
  if (data.applicantId !== applicantId) {
    console.error(
      `[SSN Pass-Through] Applicant mismatch: expected ${applicantId}, got ${data.applicantId}`,
    );
    return { success: false, error: "SSN reference does not match applicant." };
  }

  return { success: true, ssn: data.ssn };
}

// ── Validate SSN Format ──────────────────────────────────────

/**
 * Validate SSN format: exactly 9 digits after stripping non-digits.
 * Does NOT accept 000, 666, or 9xx area numbers (SSA rules).
 */
export function isValidSSN(ssn: string): boolean {
  const digits = ssn.replace(/\D/g, "");
  if (digits.length !== 9) return false;
  // SSA doesn't issue SSNs starting with 000, 666, or 900-999
  const area = parseInt(digits.slice(0, 3), 10);
  if (area === 0 || area === 666 || area >= 900) return false;
  // Group and serial cannot be all zeros
  const group = parseInt(digits.slice(3, 5), 10);
  const serial = parseInt(digits.slice(5, 9), 10);
  if (group === 0 || serial === 0) return false;
  return true;
}

/**
 * Extract last 4 digits of SSN for display purposes (PDF, UI).
 */
export function ssnLast4(ssn: string): string {
  const digits = ssn.replace(/\D/g, "");
  return digits.slice(-4);
}
