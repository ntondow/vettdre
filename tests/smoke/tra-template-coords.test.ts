// Slice 19-fix-tra-seed-coords smoke — TRA template field positions.
//
// The TRA PDF is generated programmatically by `generateTenantRepAgreementPdf`
// (pdf-lib drawing primitives — no AcroForm widgets). Before this slice the
// seed file hand-tuned overlay y-coords (18/69, 18/75, 18/83) that drifted
// ~15% below where `drawBlankLine` actually drew the underlines, AND the
// agent-block fields were missing entirely.
//
// Fix: generator now exports `TraFieldCoords` and returns
// `{ pdfBytes, fieldCoords }`; seed builds the field array from those coords
// via `buildTraFieldsFromCoords` (single source of truth — geometry can never
// drift from the actual PDF). Migration script back-fills already-seeded prod
// rows with an exact-match guard on the known-bad signature so manager
// customizations made via the slice 19-B2b drag/resize UI are preserved.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("slice 19-fix-tra-seed-coords — TRA template field positions", () => {
  // ── C1: generator exposes the new contract ─────────────────

  it("generator exports TraFieldCoords type and returns { pdfBytes, fieldCoords }", () => {
    // The generator's return type changes from `Promise<Uint8Array>` to
    // `Promise<{ pdfBytes: Uint8Array; fieldCoords: TraFieldCoords }>`. The
    // type itself is exported so the seed file (and the migration script)
    // can import it without re-declaring the shape.
    const src = readSource("src/lib/onboarding-pdf.ts");

    expect(
      src,
      "must export TraFieldCoords interface for consumers",
    ).toMatch(/export\s+interface\s+TraFieldCoords\b/);

    expect(
      src,
      "generator return type must be { pdfBytes; fieldCoords: TraFieldCoords }",
    ).toMatch(
      /generateTenantRepAgreementPdf[\s\S]*?Promise<\{\s*pdfBytes:\s*Uint8Array;\s*fieldCoords:\s*TraFieldCoords\s*\}>/,
    );

    // Negative pin: legacy single-Uint8Array return is gone (regression
    // guard against a future revert that re-introduces the drift bug).
    expect(
      src,
      "must NOT have legacy `Promise<Uint8Array>` return on TRA generator",
    ).not.toMatch(/generateTenantRepAgreementPdf[\s\S]*?Promise<Uint8Array>/);

    // The 6 underline keys are declared in TraFieldCoords (3 tenant + 3 agent).
    const keys = [
      "tenantPrintedName",
      "tenantSignature",
      "tenantDate",
      "agentPrintedName",
      "agentSignature",
      "agentDate",
    ];
    for (const key of keys) {
      expect(src, `TraFieldCoords must declare ${key}`).toMatch(
        new RegExp(`${key}:\\s*TraFieldCoord`),
      );
    }
  });

  // ── C2: seed has no hardcoded TRA y-values ─────────────────

  it("seed file has no hardcoded TRA y-coords (no drift-inducing magic numbers)", () => {
    // The whole point of routing through `fieldCoords` is that hand-tuned
    // values can never drift from the actual PDF. Pin a negative regex on
    // the three known-bad (x=18, y=N) PAIRS. (Bare `y: 83` would false-trip
    // on NYS's nys_client_sig at x=5/y=83, which is legitimate.) The
    // (x=18, y=69|75|83) combination is the unique fingerprint of the
    // pre-fix TRA tenant block — those exact pairs never appear elsewhere
    // in the file's other template arrays.
    const src = readSource("src/lib/onboarding-seed-templates.ts");

    expect(
      src,
      "must NOT contain hardcoded `x: 18, y: 69` (was the known-bad Tenant Printed Name)",
    ).not.toMatch(/x:\s*18,\s*y:\s*69\b/);
    expect(
      src,
      "must NOT contain hardcoded `x: 18, y: 75` (was the known-bad Tenant Signature)",
    ).not.toMatch(/x:\s*18,\s*y:\s*75\b/);
    expect(
      src,
      "must NOT contain hardcoded `x: 18, y: 83` (was the known-bad Tenant Date)",
    ).not.toMatch(/x:\s*18,\s*y:\s*83\b/);

    // Negative: the legacy hand-tuned `TENANT_REP_FIELDS` constant is gone
    // (replaced by `buildTraFieldsFromCoords`).
    expect(
      src,
      "must NOT define legacy `TENANT_REP_FIELDS` constant",
    ).not.toMatch(/const\s+TENANT_REP_FIELDS\s*[:=]/);
  });

  // ── C3: seed builds TRA fields from generator's fieldCoords ─

  it("seed file builds TRA fields from generator's fieldCoords (single source of truth)", () => {
    // Two halves: the seed must (a) IMPORT the type from the generator, and
    // (b) CALL `buildTraFieldsFromCoords` with the destructured `fieldCoords`
    // returned by `generateTenantRepAgreementPdf`. Both halves together form
    // the contract that geometry comes from the generator.
    const src = readSource("src/lib/onboarding-seed-templates.ts");

    expect(
      src,
      "seed must import TraFieldCoords from the generator",
    ).toMatch(/import[\s\S]*?TraFieldCoords[\s\S]*?from\s+["']@\/lib\/onboarding-pdf["']/);

    expect(
      src,
      "seed must export buildTraFieldsFromCoords helper",
    ).toMatch(/export\s+function\s+buildTraFieldsFromCoords\b/);

    expect(
      src,
      "seed must destructure { pdfBytes, fieldCoords } from generator and pass coords to builder",
    ).toMatch(
      /\{\s*pdfBytes,\s*fieldCoords\s*\}\s*=\s*await\s+generateTenantRepAgreementPdf[\s\S]*?buildTraFieldsFromCoords\(\s*fieldCoords\s*\)/,
    );
  });

  // ── C4 (added): agent block exists in builder output (count >= 6) ─

  it("buildTraFieldsFromCoords yields 6 fields (3 tenant + 3 agent)", () => {
    // Pre-fix: only 3 tenant fields. Agents had no signable affordance at
    // all. This contract locks in the agent-block fix structurally — adding
    // a tenant-only seed doesn't pass it.
    const src = readSource("src/lib/onboarding-seed-templates.ts");

    // Each of the 6 expected ids must appear in the helper.
    const builderBlock = src.match(
      /export\s+function\s+buildTraFieldsFromCoords\([\s\S]*?\n\}/,
    );
    expect(builderBlock, "must define buildTraFieldsFromCoords").not.toBeNull();

    for (const id of [
      "tr_tenant_name",
      "tr_tenant_sig",
      "tr_tenant_date",
      "tr_agent_name",
      "tr_agent_sig",
      "tr_agent_date",
    ]) {
      expect(
        builderBlock![0],
        `builder must yield field id "${id}"`,
      ).toMatch(new RegExp(`id:\\s*["']${id}["']`));
    }
  });

  // ── C5: migration script has known-bad-coords guard ────────

  it("migration script gates writes on exact known-bad coords (preserves customizations)", () => {
    // Without the exact-match guard, this migration would silently overwrite
    // any manager who used slice 19-B2b's drag/resize UI to fix alignment
    // by hand. The three y-values must each appear in the gate and the gate
    // must check x === 18 alongside them.
    const src = readSource("scripts/migrate-tra-template-fields.ts");

    expect(
      src,
      "must define fieldsMatchKnownBad guard",
    ).toMatch(/function\s+fieldsMatchKnownBad\b/);

    // The three exact y-pins.
    expect(src, "must pin Tenant Printed Name y=69").toMatch(/KNOWN_BAD_TENANT_NAME_Y\s*=\s*69\b/);
    expect(src, "must pin Tenant Signature y=75").toMatch(/KNOWN_BAD_TENANT_SIG_Y\s*=\s*75\b/);
    expect(src, "must pin Tenant Date y=83").toMatch(/KNOWN_BAD_TENANT_DATE_Y\s*=\s*83\b/);
    expect(src, "must pin x=18").toMatch(/KNOWN_BAD_X\s*=\s*18\b/);

    // Dry-run must be the DEFAULT (only `--apply` triggers writes).
    expect(
      src,
      "default must be dry-run; live writes require --apply",
    ).toMatch(/APPLY\s*=\s*process\.argv\.includes\(\s*["']--apply["']\s*\)/);

    // JSON backup before writes (cheap rollback insurance the user asked for).
    expect(
      src,
      "must write a migration-backup-tra-fields-*.json snapshot before any DB or Storage writes",
    ).toMatch(/migration-backup-tra-fields-/);
  });
});
