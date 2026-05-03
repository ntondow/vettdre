// Slice Z.0b smoke — verify the playwright harness scaffold shape:
// the config file exists with env-overridable baseURL defaulting to
// localhost:3000, the tests/e2e/ directory has at least 4 spec files
// (gap at 03 is intentional — flow 3 deferred to
// z0b-followup-flow-3-deal-submission-seed), and the npm `e2e`
// script is wired.
//
// Static-source assertions over the config + directory + package.json.
// The contract here is structural — pin the harness shape so a future
// agent who renames the config, removes a spec, or breaks the npm
// script trips this immediately.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Slice Z.0b — playwright.config.ts is env-overridable, defaults to local dev", () => {
  const config = read("playwright.config.ts");

  it("references PLAYWRIGHT_BASE_URL env var (env-overridable target)", () => {
    expect(config).toMatch(/process\.env\.PLAYWRIGHT_BASE_URL/);
  });

  it("defaults to localhost:3000 (local dev target per Nathan 2026-05-03 decision)", () => {
    expect(config).toMatch(/localhost:3000/);
  });
});

describe("Slice Z.0b — tests/e2e/ contains at least 4 specs", () => {
  // Was ≥5 in kickoff; adjusted for option (a) defer of flow 3.
  // Gap at 03 is the visual signal of the deferred flow per Q3.
  const e2eDir = path.join(ROOT, "tests/e2e");

  it("directory exists", () => {
    expect(fs.existsSync(e2eDir)).toBe(true);
  });

  it("contains ≥4 .spec.ts files (flow 3 gap is intentional)", () => {
    const specs = fs
      .readdirSync(e2eDir)
      .filter((name) => name.endsWith(".spec.ts"));
    expect(specs.length).toBeGreaterThanOrEqual(4);
  });
});

describe("Slice Z.0b — package.json wires the e2e script", () => {
  const pkg = read("package.json");

  it("scripts block contains the e2e key", () => {
    // Match `"e2e":` inside the scripts block. Loose pin — allows
    // future agents to swap the command (e.g. add cross-env, dotenv-cli)
    // without breaking the test.
    expect(pkg).toMatch(/"e2e":\s*"[^"]+"/);
  });
});
