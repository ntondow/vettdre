import { Prisma, PrismaClient } from "@prisma/client";
import * as Sentry from "@sentry/nextjs";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSlowQueryHandlerRegistered: boolean | undefined;
};

// Enforce connection pool limits for Supabase pooler
function getDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  // Only add pool params if not already configured
  if (url.includes("connection_limit")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return url + separator + "connection_limit=10&pool_timeout=30";
}

const isDev = process.env.NODE_ENV === "development";

// Foundation/Speed Audit Z.3 — slow query log.
//
// Switched from literal-string log config (`["error", "warn"]`) to the
// fully-object event/stdout form so we can listen for query events via
// $on("query") below. Stdout error/warn behavior is preserved exactly:
// dev still gets error+warn; prod still gets error only (no prod warn
// spam introduced as a side effect of this slice).
const log: Prisma.PrismaClientOptions["log"] = isDev
  ? [
      { emit: "event", level: "query" },
      { emit: "stdout", level: "error" },
      { emit: "stdout", level: "warn" },
    ]
  : [
      { emit: "event", level: "query" },
      { emit: "stdout", level: "error" },
    ];

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log,
    datasourceUrl: getDatasourceUrl(),
  });

// Cache singleton in ALL environments to prevent connection pool exhaustion on Cloud Run
globalForPrisma.prisma = prisma;

// Foundation/Speed Audit Z.3 — register slow query handler.
//
// Threshold env-configurable: PRISMA_SLOW_QUERY_MS_DEV (default 200) /
// PRISMA_SLOW_QUERY_MS_PROD (default 500). Below threshold, the event
// is dropped — no log spam.
//
// PII safety: Prisma's query event has both `e.query` (the parameterized
// SQL template, e.g. `SELECT ... WHERE email = ?`) and `e.params` (the
// actual values JSON-serialized: emails, addresses, names, etc.).
// We log e.query ONLY. Never e.params. Don't add it back without a
// security review.
//
// Registration is guarded by globalForPrisma.prismaSlowQueryHandlerRegistered
// so HMR reloads in dev don't stack handlers on the cached singleton.
if (!globalForPrisma.prismaSlowQueryHandlerRegistered) {
  const devThreshold = Number(process.env.PRISMA_SLOW_QUERY_MS_DEV ?? 200);
  const prodThreshold = Number(process.env.PRISMA_SLOW_QUERY_MS_PROD ?? 500);

  // Prisma 5.x type ergonomic: $on('query') needs the log array shape
  // to be inferred. The Prisma.PrismaClientOptions["log"] annotation
  // above keeps inference happy; cast the client to the typed-events
  // shape locally so $on accepts the "query" channel.
  type QueryEvent = {
    timestamp: Date;
    query: string;
    params: string;
    duration: number;
    target: string;
  };
  type EventEmittingClient = {
    $on: (event: "query", cb: (e: QueryEvent) => void) => void;
  };

  (prisma as unknown as EventEmittingClient).$on("query", (e) => {
    const threshold = isDev ? devThreshold : prodThreshold;
    if (e.duration < threshold) return;

    const payload = {
      duration_ms: e.duration,
      query: e.query, // parameterized template; NEVER e.params
      target: e.target,
    };

    if (isDev) {
      console.warn("[prisma slow query]", payload);
    } else {
      // Sentry breadcrumb is safe to call even if init failed — the SDK
      // turns into a no-op rather than throwing. console.warn fallback
      // ensures Cloud Run logs still capture slow queries regardless of
      // Sentry's state.
      if (typeof Sentry?.addBreadcrumb === "function") {
        Sentry.addBreadcrumb({
          category: "prisma",
          level: "warning",
          message: "slow-query",
          data: payload,
        });
      }
      console.warn("[prisma slow query]", payload);
    }
  });

  globalForPrisma.prismaSlowQueryHandlerRegistered = true;
}

export default prisma;
