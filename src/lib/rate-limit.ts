/**
 * Rate Limiting — Upstash Redis + @upstash/ratelimit
 *
 * Provides tiered rate limiters for different endpoint sensitivity levels.
 * Uses sliding window algorithm for smooth request distribution.
 *
 * Required env vars:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ── Redis Client (lazy singleton) ────────────────────────────

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error(
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for rate limiting",
      );
    }
    _redis = new Redis({ url, token });
  }
  return _redis;
}

/** Check if Upstash Redis is configured (graceful degradation in dev) */
export function isRateLimitEnabled(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

// ── Limiter Factory ──────────────────────────────────────────

function createLimiter(
  prefix: string,
  requests: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
): Ratelimit {
  return new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `rl:${prefix}`,
    analytics: true,
  });
}

// ── Limiters ─────────────────────────────────────────────────

/** General API: 60 requests/minute per IP */
export const generalLimiter = () => createLimiter("general", 60, "1 m");

/** OTP request: 3 per 15 minutes per phone/email */
export const otpRequestLimiter = () => createLimiter("otp-req", 3, "15 m");

/** OTP verification: 5 attempts per 15 minutes per IP */
export const otpVerifyLimiter = () => createLimiter("otp-verify", 5, "15 m");

/** Application creation: 10 per hour per agent */
export const applicationCreateLimiter = () =>
  createLimiter("app-create", 10, "1 h");

/** Document upload: 20 per hour per application token */
export const documentUploadLimiter = () =>
  createLimiter("doc-upload", 20, "1 h");

/** Payment endpoint: 5 per hour per application token */
export const paymentLimiter = () => createLimiter("payment", 5, "1 h");

/** Token access (initial wizard load): 30 per minute per IP */
export const tokenAccessLimiter = () =>
  createLimiter("token-access", 30, "1 m");

/** PDF report download: 10 per hour per user */
export const reportDownloadLimiter = () =>
  createLimiter("report-dl", 10, "1 h");

/** Screening endpoint (agent-facing): 30 per minute per user */
export const screeningApiLimiter = () =>
  createLimiter("screening-api", 30, "1 m");

// ── Helper ───────────────────────────────────────────────────

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  limit: number;
}

/**
 * Check rate limit for a given limiter and identifier.
 * Returns rate limit headers suitable for HTTP responses.
 */
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string,
): Promise<RateLimitResult> {
  const result = await limiter.limit(identifier);
  return {
    success: result.success,
    remaining: result.remaining,
    reset: result.reset,
    limit: result.limit,
  };
}

/**
 * Build standard rate-limit response headers.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": result.reset.toString(),
    "Retry-After": Math.ceil(
      Math.max(0, (result.reset - Date.now()) / 1000),
    ).toString(),
  };
}

// ── Convenience: extract IP from request ─────────────────────

export function getClientIP(request: Request): string {
  // Prefer x-forwarded-for (Cloud Run sets this)
  const forwarded =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
}

// ── Redis direct access (for SSN pass-through, sessions, OTP) ─

export { Redis };
export function getRedisClient(): Redis {
  return getRedis();
}
