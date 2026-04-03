/**
 * Secure OTP Generation & Verification
 *
 * Security properties:
 * - crypto.randomInt() for CSPRNG generation (not Math.random)
 * - crypto.timingSafeEqual() for verification (prevents timing attacks)
 * - 5 attempt maximum per OTP → auto-invalidation
 * - 10-minute TTL with automatic Redis expiry
 * - Single-use: deleted immediately on successful verification
 * - Stored in Redis only (never in the database)
 */

import crypto from "crypto";
import { getRedisClient } from "@/lib/rate-limit";

const OTP_EXPIRY_SECONDS = 600; // 10 minutes
const MAX_ATTEMPTS = 5;

// ── OTP Data Shape in Redis ──────────────────────────────────

interface OtpData {
  code: string;
  attempts: number;
  createdAt: number;
}

// ── Generate ─────────────────────────────────────────────────

/** Generate a cryptographically secure 6-digit OTP */
export function generateSecureOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/** Create and store an OTP for an applicant in Redis. Returns the code. */
export async function createOTP(applicantId: string): Promise<string> {
  const redis = getRedisClient();
  const otp = generateSecureOTP();

  const data: OtpData = {
    code: otp,
    attempts: 0,
    createdAt: Date.now(),
  };

  await redis.set(`otp:${applicantId}`, JSON.stringify(data), {
    ex: OTP_EXPIRY_SECONDS,
  });

  return otp;
}

// ── Verify ───────────────────────────────────────────────────

export interface OtpVerifyResult {
  valid: boolean;
  error?: string;
  remainingAttempts?: number;
}

/**
 * Verify an OTP submission. Timing-safe comparison prevents timing attacks.
 * After MAX_ATTEMPTS failures, the OTP is invalidated and a new one must be requested.
 */
export async function verifyOTP(
  applicantId: string,
  submittedCode: string,
): Promise<OtpVerifyResult> {
  const redis = getRedisClient();
  const key = `otp:${applicantId}`;

  const raw = await redis.get(key);
  if (!raw) {
    return { valid: false, error: "Code expired. Please request a new one." };
  }

  const data: OtpData =
    typeof raw === "string" ? JSON.parse(raw) : (raw as OtpData);

  // Check attempt count BEFORE verifying (prevents race conditions)
  if (data.attempts >= MAX_ATTEMPTS) {
    await redis.del(key);
    return {
      valid: false,
      error: "Too many attempts. Please request a new code.",
    };
  }

  // Increment attempts and save back (preserving remaining TTL)
  data.attempts += 1;
  const remainingTTL = await redis.ttl(key);
  await redis.set(key, JSON.stringify(data), {
    ex: remainingTTL > 0 ? remainingTTL : OTP_EXPIRY_SECONDS,
  });

  // Timing-safe comparison — pad to consistent length
  const submitted = submittedCode.padEnd(6, "0").slice(0, 6);
  const stored = data.code.padEnd(6, "0").slice(0, 6);
  const isValid = crypto.timingSafeEqual(
    Buffer.from(submitted),
    Buffer.from(stored),
  );

  if (!isValid) {
    const remaining = MAX_ATTEMPTS - data.attempts;
    if (remaining <= 0) {
      await redis.del(key);
      return {
        valid: false,
        error: "Too many attempts. Please request a new code.",
      };
    }
    return {
      valid: false,
      error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      remainingAttempts: remaining,
    };
  }

  // OTP is valid — single use, delete immediately
  await redis.del(key);
  return { valid: true };
}

// ── Invalidate ───────────────────────────────────────────────

/** Force-invalidate an OTP (e.g., after rate limit exceeded). */
export async function invalidateOtp(applicantId: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`otp:${applicantId}`);
}
