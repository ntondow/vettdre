// ============================================================
// Leasing Benchmark Computation Cron
//
// POST: Computes anonymous cross-building benchmarks daily.
// Called by Cloud Scheduler at 3 AM ET.
//
// Cloud Scheduler setup:
// gcloud scheduler jobs create http leasing-benchmarks \
//   --schedule="0 3 * * *" \
//   --uri="https://YOUR_DOMAIN/api/leasing/benchmarks" \
//   --http-method=POST \
//   --headers="Authorization=Bearer YOUR_CRON_SECRET" \
//   --time-zone="America/New_York" \
//   --attempt-deadline=120s
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { computeBenchmarks } from "@/lib/leasing-benchmarks";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  // Authenticate via Bearer token
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[LEASING BENCHMARKS] CRON_SECRET not configured");
    return new NextResponse("Server configuration error", { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Idempotency: check if already computed today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.leasingBenchmark.findFirst({
    where: { date: today },
  });

  if (existing) {
    return NextResponse.json({ computed: false, reason: "already_computed_today" });
  }

  const startTime = Date.now();

  try {
    await computeBenchmarks();
    const durationMs = Date.now() - startTime;
    return NextResponse.json({ computed: true, duration_ms: durationMs });
  } catch (error) {
    console.error("[LEASING BENCHMARKS] Computation error:", error);
    return NextResponse.json({ computed: false, error: "computation_failed" }, { status: 500 });
  }
}
