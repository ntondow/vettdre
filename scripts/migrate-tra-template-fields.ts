/**
 * Migration — Fix TRA (Tenant Representation Agreement) template field positions
 *
 * The bug: hardcoded field y-coords in `onboarding-seed-templates.ts`
 * (Tenant Printed Name 18/69, Tenant Signature 18/75, Tenant Date 18/83)
 * drifted ~15% below where the pdf-lib generator actually draws the
 * underlines on Page 2. Result: overlay boxes hover well below the lines
 * users are supposed to fill, breaking the signing affordance. Plus the
 * agent block was missing entirely from the seed.
 *
 * Slice 19-fix-tra-seed-coords moved geometry into the generator
 * (`generateTenantRepAgreementPdf` now returns `fieldCoords` derived from
 * the actual `drawBlankLine` y-positions). This script back-fills the
 * already-seeded templates in production to use the corrected coords AND
 * adds the missing agent block (3 fields).
 *
 * Safety:
 *  - Dry-run is the DEFAULT. Pass `--apply` to write.
 *  - Exact-match guard on the known-bad triplet (18/69, 18/75, 18/83).
 *    If a row's fields don't match exactly, it's skipped (preserves
 *    manager customizations made via the slice 19-B2b drag/resize UI).
 *  - Writes a `migration-backup-tra-fields-${ts}.json` snapshot of every
 *    matched row BEFORE any DB or Storage writes.
 *  - Re-uploads the regenerated PDF to the org's Supabase Storage path
 *    (matched rows only — skipped rows are not touched in storage either).
 *
 * Usage:
 *   npx tsx scripts/migrate-tra-template-fields.ts                  # dry run (default)
 *   npx tsx scripts/migrate-tra-template-fields.ts --apply           # live run
 *   npx tsx scripts/migrate-tra-template-fields.ts --org-id <id>     # filter to one org (dry run)
 *   npx tsx scripts/migrate-tra-template-fields.ts --apply --org-id <id>  # live run for one org
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

// ── Known-bad signature: exact match on the 3 hand-tuned values ──

const KNOWN_BAD_X = 18;
const KNOWN_BAD_TENANT_NAME_Y = 69;
const KNOWN_BAD_TENANT_SIG_Y = 75;
const KNOWN_BAD_TENANT_DATE_Y = 83;

function fieldsMatchKnownBad(fields: unknown): boolean {
  if (!Array.isArray(fields)) return false;
  const findField = (id: string) =>
    fields.find((f): f is TemplateFieldDefinition =>
      typeof f === "object" && f !== null && (f as TemplateFieldDefinition).id === id,
    );
  const name = findField("tr_tenant_name");
  const sig = findField("tr_tenant_sig");
  const date = findField("tr_tenant_date");
  if (!name || !sig || !date) return false;
  return (
    name.x === KNOWN_BAD_X && name.y === KNOWN_BAD_TENANT_NAME_Y &&
    sig.x === KNOWN_BAD_X && sig.y === KNOWN_BAD_TENANT_SIG_Y &&
    date.x === KNOWN_BAD_X && date.y === KNOWN_BAD_TENANT_DATE_Y
  );
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
    if (fieldsMatchKnownBad(t.fields)) {
      matched.push(t);
    } else {
      skipped.push({
        id: t.id,
        orgId: t.orgId,
        reason: "fields do not match known-bad signature (18/69, 18/75, 18/83) — preserving customizations",
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
  const backupPath = resolve(process.cwd(), `migration-backup-tra-fields-${ts}.json`);
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

      // Regenerate the TRA PDF with the same dummy values used at seed time.
      // The PDF body content doesn't change — but layout drift in the
      // generator (margins, line spacing) since the original seed could mean
      // the existing storage PDF no longer matches the new fieldCoords.
      // Re-uploading keeps everything in sync.
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

      // Upload to the same per-org storage path used by seedDefaultTemplates
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

      console.log(`  [OK]   templateId=${t.id} orgId=${t.orgId} (org="${brokerageName}") :: 3 → ${newFields.length} fields`);
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
