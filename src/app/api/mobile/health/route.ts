// ── GET /api/mobile/health ────────────────────────────────────
// Simple health check for the mobile app to verify backend reachability.
// No auth required — used during startup diagnostics.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  });
}
