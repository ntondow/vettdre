/**
 * Foundation/Speed Audit Z.5 — Cloud Run cold-start measurement endpoint.
 *
 * Purpose:
 * - Cold-start detection: `uptime_seconds` reports time since this Node
 *   container started. Near-zero on a cold start; larger on a warm hit.
 * - External monitoring target (status pages, uptime checks).
 * - Future Cloud Scheduler keepalive target (Phase 1+ decision driven
 *   by the 5-measurement baseline in
 *   `docs/handoff/speed-2026-q2-baselines.md` "Cold start baseline").
 *
 * Contract:
 * - Unauthenticated. Public-routes list in `src/lib/supabase/middleware.ts`
 *   exempts `/api/health` from auth + approval checks.
 * - No DB hit. Adding one would defeat the purpose of measuring
 *   container startup — DB latency is a separate concern.
 * - Minimal payload. No env vars beyond NODE_ENV. No secrets.
 * - Sentry-wrapped per Z.4's canonical pattern for cold-start
 *   visibility in Sentry traces. Note: when Cloud Scheduler keepalive
 *   lands (Phase 1+), this wrap will create ~1,440 spans/day of
 *   keepalive noise — see `z5-followup-unwrap-health-span` in
 *   SLICES-speed.md for the deliberate unwrap decision at that point.
 *
 * `git_sha`: harmless when GIT_COMMIT_SHA is unset (returns "unknown").
 * Cloud Build can populate via `_COMMIT_SHA` substitution later — out
 * of scope for Z.5; placeholder is in place for when that lands.
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

export async function GET() {
  return Sentry.startSpan(
    { name: "health.check", op: "http.server.health" },
    async () =>
      NextResponse.json({
        status: "ok",
        uptime_seconds: process.uptime(),
        timestamp: new Date().toISOString(),
        node_env: process.env.NODE_ENV,
        git_sha: process.env.GIT_COMMIT_SHA ?? "unknown",
      }),
  );
}
