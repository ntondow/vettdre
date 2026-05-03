// Slice Z.4 smoke — pin the Sentry Performance refinement scaffold.
//
// Four structural contracts (static-source assertions, no Sentry runtime):
//   1. POSITIVE: src/instrumentation-client.ts exists and calls Sentry.init.
//      This is the modern Next.js 15+ file convention for client-side
//      Sentry init (NOT the legacy `sentry.client.config.ts` at root —
//      see Z.4 plan-of-record retro for why future agents should grep
//      for BOTH conventions).
//   2. POSITIVE: next.config.ts includes NEXT_PUBLIC_SENTRY_DSN in its
//      `env` block. Mirrors the Supabase keys workaround per CLAUDE.md
//      "Edge env var workaround" — load-bearing for prod DSN inlining.
//   3. POSITIVE: ≥6 source files under src/lib/ contain Sentry.startSpan
//      calls. The 6 wrapped surfaces are: data-fusion-engine,
//      nyc-opendata, firecrawl, apollo, email-parser, leasing-engine.
//   4. NEGATIVE: no Sentry.startSpan call captures `params:`, `body:`,
//      or `request:` in its data field — PII safety. The Z.4 spans
//      use `name` + `op` only; future spans must follow the pattern.
//
// Loose by design: future agents can rename spans, change ops, swap
// which 6 files are wrapped, or restructure the DSN env block — as
// long as the structural contracts hold. PII safety (C4) is the only
// hard line that must not regress.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice Z.4 — client-side Sentry init exists at the modern path", () => {
  const clientPath = path.join(ROOT, "src/instrumentation-client.ts");

  it("file exists at src/instrumentation-client.ts (NOT sentry.client.config.ts)", () => {
    // Z.4 retro: future agents should grep for BOTH conventions.
    // Adding `sentry.client.config.ts` would COLLIDE with the file
    // pinned here.
    expect(fs.existsSync(clientPath)).toBe(true);
  });

  it("calls Sentry.init", () => {
    const body = fs.readFileSync(clientPath, "utf8");
    expect(body).toMatch(/Sentry\.init\(/);
  });
});

describe("Slice Z.4 — next.config.ts hardcodes NEXT_PUBLIC_SENTRY_DSN in env block", () => {
  const cfg = read("next.config.ts");

  it("env block contains NEXT_PUBLIC_SENTRY_DSN key", () => {
    expect(cfg).toMatch(/NEXT_PUBLIC_SENTRY_DSN:/);
  });

  it("DSN value is a literal Sentry ingest URL (not process.env reference)", () => {
    // Per CLAUDE.md "Edge env var workaround": only literal hardcoded
    // values reliably inline through Turbopack edge bundling. The
    // Supabase keys above are also literals; this enforces parity.
    // Loose: matches any sentry.io ingest URL.
    expect(cfg).toMatch(/NEXT_PUBLIC_SENTRY_DSN:\s*"https:\/\/[^"]+@[^"]+\.ingest\.[a-z]{2,}\.sentry\.io\/[0-9]+"/);
  });
});

describe("Slice Z.4 — ≥6 source files contain Sentry.startSpan calls", () => {
  // 6 surfaces wrapped this slice. Listed by file, not by span count
  // (data-fusion-engine has the canonical doc-comment + one wrap).
  const targets = [
    "src/lib/data-fusion-engine.ts",
    "src/lib/nyc-opendata.ts",
    "src/lib/firecrawl.ts",
    "src/lib/apollo.ts",
    "src/lib/email-parser.ts",
    "src/lib/leasing-engine.ts",
  ];

  it("all 6 named files contain at least one Sentry.startSpan call", () => {
    const wrapped = targets.filter((rel) => /Sentry\.startSpan\(/.test(read(rel)));
    expect(wrapped.length).toBeGreaterThanOrEqual(6);
  });
});

describe("Slice Z.4 — PII safety: no Sentry.startSpan captures sensitive request data", () => {
  // Pin: no Sentry.startSpan options block contains `data:` with
  // `params`, `body`, or `request` keys. Span name + op are
  // public-safe; request payloads are not. This is the only hard
  // PII line in Z.4's contracts — future agents who add `data:` MUST
  // either avoid these keys or re-trip this contract intentionally.
  const targets = [
    "src/lib/data-fusion-engine.ts",
    "src/lib/nyc-opendata.ts",
    "src/lib/firecrawl.ts",
    "src/lib/apollo.ts",
    "src/lib/email-parser.ts",
    "src/lib/leasing-engine.ts",
  ];

  it("no startSpan options block has data: { params | body | request: ... }", () => {
    // Use [\s\S] not the `s` flag — tsconfig target predates ES2018
    // (lesson from Z.1's smoke).
    const piiPattern = /Sentry\.startSpan\(\s*\{[\s\S]{0,300}?data:\s*\{[^}]*?(params|body|request)\b/;
    for (const rel of targets) {
      const body = read(rel);
      expect(body, `PII regression in ${rel}`).not.toMatch(piiPattern);
    }
  });
});
