// Slice Z.3 smoke — pin the Prisma slow-query handler shape.
//
// Three structural contracts (static-source assertions, no DB hit):
//   1. POSITIVE: src/lib/prisma.ts registers a $on("query", ...) handler.
//      Without this, the slow-query log doesn't fire — load-bearing.
//   2. POSITIVE: handler reads threshold from env vars
//      PRISMA_SLOW_QUERY_MS_DEV / PRISMA_SLOW_QUERY_MS_PROD. Without
//      this, threshold is hard-coded and ops can't tune without a deploy.
//   3. NEGATIVE: src/lib/prisma.ts does NOT use the literal-string log
//      form `log: ["query"]` (which would print every query to stdout
//      unconditionally — log spam). The object/event form we use does
//      NOT match this regex; future agents who "simplify" back to the
//      literal form trip this contract.
//
// Loose by design: the handler body, threshold defaults, log payload
// shape, and Sentry/console branching can all change without breaking
// these tests. What MUST stay stable: $on("query") registration is
// present, threshold env var is read, and unconditional query-stdout
// spam is NOT introduced.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice Z.3 — prisma.ts registers a slow-query handler", () => {
  const src = read("src/lib/prisma.ts");

  it("calls $on(\"query\", ...) on the prisma client", () => {
    // Match `$on("query"` or `$on('query'` with optional whitespace.
    expect(src).toMatch(/\$on\(\s*["']query["']/);
  });

  it("threshold is read from PRISMA_SLOW_QUERY_MS_DEV or _PROD env vars", () => {
    expect(src).toMatch(/process\.env\.PRISMA_SLOW_QUERY_MS_(DEV|PROD)/);
  });
});

describe("Slice Z.3 — prisma.ts does NOT introduce unconditional query-stdout spam", () => {
  const src = read("src/lib/prisma.ts");

  it("no `log: [\"query\"]` literal-string single-element form", () => {
    // The literal-string form `log: ["query"]` prints every query to
    // stdout — high-volume noise that would defeat the threshold-gated
    // approach. Our config uses the object/event form
    // `log: [{ emit: "event", level: "query" }, ...]` which does not
    // match this regex. Future agents who "simplify" back to literal
    // strings trip this contract.
    expect(src).not.toMatch(/log:\s*\[\s*["']query["']\s*\]/);
  });

  it("query event is emitted via the object/event form, not literal strings", () => {
    // Inverse positive of the above: ensure the GOOD form is present.
    // Loose match — allows whitespace, key-order swap (`level` before
    // `emit`), trailing commas, etc.
    const eventForm = /\{\s*(emit:\s*["']event["']|level:\s*["']query["'])[^}]*\}/;
    expect(src).toMatch(eventForm);
  });
});
