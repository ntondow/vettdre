/**
 * Migration — Shrink TRA signature field heights from 7 to 3
 *
 * Background: slice 19-fix-tra-seed-coords (PR #41) corrected TRA Page 2
 * field y-positions and added the missing agent block, but left signature
 * heights at 7%. Page 2's underline cascade is only ~2.78% apart per row,
 * so 7%-tall signature boxes overlapped (and on /sign/[token], engulfed)
 * the printed-name field above each signature. Slice 19-fix-tra-sig-height
 * (this slice) drops `TRA_SIG_HEIGHT` from 7 to 3 in the generator.
 *
 * This script back-fills already-seeded prod rows. Match guard: rows whose
 * `fields[]` contain at least one entry with `type: "signature" && height === 7`
 * — that's the unique fingerprint of post-fix-1 rows. Rows where every
 * signature field has been customized away from 7 are skipped (preserves
 * manager edits via the slice 19-B2b drag/resize UI).
 *
 * Safety:
 *  - Dry-run is the DEFAULT. Pass `--apply` to write.
 *  - JSON backup snapshot of every matched row BEFORE any writes
 *    (`migration-backup-tra-sig-heights-${ts}.json`).
 *  - Per-row PDF regen + re-upload to Supabase Storage on matched rows
 *    only. Skipped rows are not touched in storage either.
 *
 * Expected match in prod: exactly 1 row (Gulino Group's TRA template,
 * `cmoiwqbtp0001e8cl9cqrfb3c`). If dry-run reports >1 matches, stop and
 * investigate before applying.
 *
 * Usage:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-tra-sig-heights.ts            # dry-run
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-tra-sig-heights.ts --apply    # live
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-tra-sig-heights.ts --org-id <id>           # filter
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-tra-sig-heights.ts --apply --org-id <id>   # filtered live
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import prisma from "../src/lib/prisma";
import { generateTenantRepAgreementPdf } from "../src/lib/onboarding-pdf";
import { buildTraFieldsFromCoords } from "../src/lib/onboarding-seed-templates";
import { createClient } from "@supabase/supabase-js";
import type { TemplateFieldDefinition } from "../src/lib/onboarding-types";

// ── Args ─────────────────────────────────────────────────────

const APPLY = process.argv.includes("--apply");
const orgIdIdx = process.argv.indexOf("--org-id");
const ONLY_ORG_ID = orgIdIdx >= 0 ? process.argv[orgIdIdx + 1] : undefined;

// ── Match guard ──────────────────────────────────────────────

const KNOWN_BAD_SIG_HEIGHT = 7;

function fieldsHaveLegacySignatureHeight(fields: unknown): boolean {
  if (!Array.isArray(fields)) return false;
  return fields.some((f): f is TemplateFieldDefinition => {
    if (typeof f !== "object" || f === null) return false;
    const tf = f as TemplateFieldDefinition;
    return tf.type === "signature" && tf.height === KNOWN_BAD_SIG_HEIGHT;
  });
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${APPLY ? "LIVE (will write)" : "DRY RUN (no writes — pass --apply to write)"}`);
  if (ONLY_ORG_ID) console.log(`Filter: orgId = ${ONLY_ORG_ID}`);
  console.log("");

  const where: { isDefault: boolean; category: string; name: string; orgId?: string } = {
    isDefault: true,
    category: "standard",
    name: "Tenant Representation Agreement",
  };
  if (ONLY_ORG_ID) where.orgId = ONLY_ORG_ID;

  const templates = await prisma.documentTemplate.findMany({
    where,
    select: {
      id: true,
      orgId: true,
      name: true,
      templatePdfUrl: true,
      fields: true,
      organization: { select: { name: true } },
    },
  });

  console.log(`Found ${templates.length} TRA template row(s) to evaluate`);

  const matched: typeof templates = [];
  const skipped: { id: string; orgId: string; reason: string }[] = [];

  for (const t of templates) {
    if (fieldsHaveLegacySignatureHeight(t.fields)) {
      matched.push(t);
    } else {
      skipped.push({
        id: t.id,
        orgId: t.orgId,
        reason: "no signature field with height === 7 — already migrated or customized",
      });
    }
  }

  console.log(`  Matched (will migrate): ${matched.length}`);
  console.log(`  Skipped (preserved):    ${skipped.length}`);
  if (skipped.length) {
    console.log("");
    console.log("Skipped rows:");
    for (const s of skipped) console.log(`  - templateId=${s.id} orgId=${s.orgId} :: ${s.reason}`);
  }

  if (matched.length === 0) {
    console.log("");
    console.log("Nothing to migrate. Exiting.");
    return;
  }

  // ── Write backup snapshot BEFORE any writes ────────────────

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = resolve(process.cwd(), `migration-backup-tra-sig-heights-${ts}.json`);
  const backup = matched.map((t) => ({
    id: t.id,
    orgId: t.orgId,
    orgName: t.organization?.name ?? null,
    name: t.name,
    templatePdfUrl: t.templatePdfUrl,
    fields: t.fields,
  }));
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log("");
  console.log(`Backup written: ${backupPath}`);

  if (!APPLY) {
    console.log("");
    console.log("Dry run — no DB or Storage writes performed. Re-run with --apply to write.");
    return;
  }

  // ── Live writes ────────────────────────────────────────────

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for --apply");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  let succeeded = 0;
  let failed = 0;

  for (const t of matched) {
    try {
      const brokerageName = t.organization?.name || "Your Brokerage";

      // Regenerate the TRA PDF — same dummy values used at seed time.
      // The new generator emits the height-3 signature coords via
      // buildTraFieldsFromCoords. Re-uploading keeps storage in sync
      // with the corrected coords.
      const { pdfBytes, fieldCoords } = await generateTenantRepAgreementPdf({
        brokerageName,
        agentFullName: "[Agent Name]",
        agentLicense: "[License #]",
        clientFirstName: "[Client",
        clientLastName: "Name]",
        commissionAmount: 0,
        commissionType: "percentage",
        termDays: 30,
      });

      const newFields = buildTraFieldsFromCoords(fieldCoords);

      const storagePath = `document-templates/${t.orgId}/default-tenant_rep_agreement.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("bms-files")
        .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

      if (uploadErr) {
        console.error(`  [FAIL] templateId=${t.id} orgId=${t.orgId} :: storage upload error: ${uploadErr.message}`);
        failed++;
        continue;
      }

      const { data: urlData } = supabase.storage.from("bms-files").getPublicUrl(storagePath);
      const newUrl = urlData?.publicUrl ?? storagePath;

      await prisma.documentTemplate.update({
        where: { id: t.id },
        data: {
          fields: JSON.parse(JSON.stringify(newFields)),
          templatePdfUrl: newUrl,
        },
      });

      console.log(`  [OK]   templateId=${t.id} orgId=${t.orgId} (org="${brokerageName}") :: signature heights 7 → 3`);
      succeeded++;
    } catch (err) {
      console.error(`  [FAIL] templateId=${t.id} orgId=${t.orgId}`, err);
      failed++;
    }
  }

  console.log("");
  console.log(`Done. Succeeded: ${succeeded}, Failed: ${failed}, Skipped: ${skipped.length}`);
  console.log(`Rollback: see ${backupPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
