# Migration Script Skeleton

Use this skeleton for any slice that modifies production data. The pattern is **dry-run default ON**, **JSON backup before writes**, **exact-match guards**, **idempotent**, **per-row logging**, **registry append on apply**.

After running with `--apply`, append an entry to `migrations/registry.json` per the schema in the methodology doc.

---

```typescript
/**
 * Migration — [what it does and why]
 *
 * Background: [bug context, slice ID, audit doc reference]
 *
 * Match guard: [exact-match signature that identifies bad rows]
 * Skip rule:   [what we preserve and why]
 *
 * Usage:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/[name].ts                          # dry-run
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/[name].ts --apply                  # write
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/[name].ts --apply --org-id <id>    # single-tenant
 *
 * After --apply succeeds, append to migrations/registry.json:
 *   {
 *     "date": "<YYYY-MM-DD>",
 *     "sliceId": "<slice-id>",
 *     "model": "<PrismaModel>",
 *     "rowsTouched": <N>,
 *     "backupPath": "<absolute path printed in script output>",
 *     "rollbackVerified": false,
 *     "notes": "<one-line summary>"
 *   }
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import prisma from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const orgIdIdx = process.argv.indexOf("--org-id");
const ONLY_ORG_ID = orgIdIdx >= 0 ? process.argv[orgIdIdx + 1] : undefined;

// Known-bad signature constants (exact match — preserves manual customizations)
const KNOWN_BAD_X = ...;

function fieldsMatchKnownBad(row: any): boolean {
  // Return true ONLY if the row matches the exact-bad signature.
  // Any drift = preserve the row, log skip-with-reason.
  return row.x === KNOWN_BAD_X && row.y === ...;
}

function toBackupShape(row: any) {
  // Capture EVERYTHING that will be modified, plus identity fields.
  // The backup file is the rollback path — be generous, not stingy.
  return {
    id: row.id,
    orgId: row.orgId,
    organizationName: row.organization?.name,
    [...rest of fields being touched]
  };
}

async function main() {
  console.log(`Mode: ${APPLY ? "LIVE (will write)" : "DRY RUN (no writes — pass --apply to write)"}`);
  if (ONLY_ORG_ID) console.log(`Filter: orgId = ${ONLY_ORG_ID}`);

  // 1. Fetch candidates (broad query — partition in memory for clear logging)
  const rows = await prisma.[model].findMany({
    where: { ...ONLY_ORG_ID ? { orgId: ONLY_ORG_ID } : {} },
    include: { organization: { select: { name: true } } },
  });

  // 2. Partition matched vs skipped
  const matched = rows.filter(r => fieldsMatchKnownBad(r));
  const skipped = rows
    .filter(r => !fieldsMatchKnownBad(r))
    .map(r => ({
      ...r,
      reason: "fields don't match known-bad signature — already migrated or customized",
    }));

  // 3. Log what will happen
  console.log(`Found ${rows.length} row(s) to evaluate`);
  console.log(`  Matched (will migrate): ${matched.length}`);
  console.log(`  Skipped (preserved):    ${skipped.length}`);
  for (const s of skipped) {
    console.log(`  - id=${s.id} orgId=${s.orgId} (org="${s.organization?.name}") :: ${s.reason}`);
  }

  if (matched.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  // 4. Backup snapshot BEFORE any writes (dry-run AND apply both produce backup)
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = resolve(process.cwd(), `migration-backup-[name]-${ts}.json`);
  writeFileSync(backupPath, JSON.stringify(matched.map(toBackupShape), null, 2));
  console.log(`Backup written: ${backupPath}`);

  if (!APPLY) {
    console.log("Dry run — no DB or Storage writes performed. Re-run with --apply to write.");
    return;
  }

  // 5. Apply with per-row logging
  let succeeded = 0;
  let failed = 0;
  for (const row of matched) {
    try {
      await prisma.[model].update({
        where: { id: row.id },
        data: { /* the corrective values */ },
      });
      console.log(
        `  [OK]   id=${row.id} orgId=${row.orgId} (org="${row.organization?.name}") :: [what changed]`
      );
      succeeded++;
    } catch (err) {
      console.error(`  [FAIL] id=${row.id} orgId=${row.orgId}`, err);
      failed++;
    }
  }

  // 6. Final summary + rollback hint + registry reminder
  console.log(`Done. Succeeded: ${succeeded}, Failed: ${failed}, Skipped: ${skipped.length}`);
  console.log(`Rollback: see ${backupPath}`);
  console.log(`NEXT: append entry to migrations/registry.json with:`);
  console.log(`  - sliceId, model, rowsTouched=${succeeded}, backupPath`);
  console.log(`  - rollbackVerified: false (set true after rollback drill — see methodology)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

---

## Required guarantees

A migration script that doesn't ship all six of these is rejected at PR review:

1. **Dry-run default ON.** `--apply` is explicit. No exceptions.
2. **Backup file written before any write.** Both dry-run and apply produce a backup so rollback is always possible.
3. **Exact-match guard.** Only modify rows matching the known-bad signature. Preserves customizations.
4. **Idempotent.** Re-running with same flags produces no changes (because matched rows no longer match).
5. **Per-row logging with org name.** `[OK] id=X orgId=Y (org="Z") :: [change]`.
6. **Registry append step in the script's output.** The script reminds the operator to update `migrations/registry.json`. CI check (TBD) enforces it.

## Rollback drill cadence

Once per audit, a real rollback against the most recent backup-to-rollback pair in `migrations/registry.json` runs against a non-prod tenant. On success, mark `rollbackVerified: true` for that entry. Without rollback drills, the rollback story is theoretical and unreliable when actually needed.
