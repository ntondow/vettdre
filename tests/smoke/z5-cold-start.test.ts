// Slice Z.5 smoke — pin the /api/health endpoint scaffold shape.
//
// Three structural contracts (static-source assertions, no HTTP hit):
//   1. POSITIVE: src/app/api/health/route.ts exists and exports a GET
//      handler. Without this, the cold-start measurement endpoint
//      doesn't exist.
//   2. POSITIVE: handler returns JSON with `uptime_seconds` and
//      `status` keys. These are the load-bearing fields for cold-start
//      detection (uptime_seconds near-zero = cold start) and basic
//      monitoring (status: "ok" = container healthy).
//   3. POSITIVE: src/lib/supabase/middleware.ts includes /api/health in
//      the public-routes OR-chain. Without this, the endpoint would
//      redirect to /login for unauthenticated probes — defeats the
//      purpose for external monitoring + Cloud Scheduler keepalive.
//
// Loose by design: payload extras (timestamp, node_env, git_sha),
// Sentry span wrap presence, and dynamic-rendering directive can all
// change without breaking these tests. What MUST stay stable: the
// route exists, the cold-start fields are returned, and the public-
// routes exemption is wired.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice Z.5 — /api/health route exists with GET handler", () => {
  const routePath = path.join(ROOT, "src/app/api/health/route.ts");

  it("file exists at src/app/api/health/route.ts", () => {
    expect(fs.existsSync(routePath)).toBe(true);
  });

  it("exports a GET handler (named export, optionally async)", () => {
    const body = fs.readFileSync(routePath, "utf8");
    expect(body).toMatch(/export\s+(async\s+)?function\s+GET/);
  });
});

describe("Slice Z.5 — health payload contains cold-start detection fields", () => {
  const body = read("src/app/api/health/route.ts");

  it("payload includes `uptime_seconds` (cold-start signal)", () => {
    // The load-bearing field. Near-zero on cold; larger on warm.
    expect(body).toMatch(/uptime_seconds/);
  });

  it("payload includes `status` (basic health signal)", () => {
    expect(body).toMatch(/status/);
  });
});

describe("Slice Z.5 — middleware exempts /api/health from auth", () => {
  const mw = read("src/lib/supabase/middleware.ts");

  it("public-routes OR-chain includes pathname.startsWith(\"/api/health\")", () => {
    // Loose: matches single OR double quotes, allows trailing path
    // (e.g. `/api/health/` or `/api/health`). The contract is "the
    // exemption exists in the chain" — not a specific position or
    // formatting.
    expect(mw).toMatch(/pathname\.startsWith\(["']\/api\/health/);
  });
});
