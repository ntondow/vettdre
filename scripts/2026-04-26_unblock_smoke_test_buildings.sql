-- 2026-04-26_unblock_smoke_test_buildings.sql
--
-- Pre-launch data fix: flip is_exclusive=true on the two existing bms_properties
-- in Nathan's org so they show up in the building-search dropdown on
-- /brokerage/my-deals/submit.
--
-- Why: getExclusiveProperties() at brokerage/deal-submissions/actions.ts:599-602
-- is hardcoded to filter `where: { orgId, isExclusive: true }`. The two rows in
-- Nathan's org both have is_exclusive=false, so the server returns an empty array
-- and the client-side substring search has nothing to filter against. The "+ Add
-- New Building" inline-create path always sets isExclusive=true (actions.ts:631-645),
-- so this is just legacy data that pre-dates the convention.
--
-- Affected rows (both in org b770bb07-af8a-4001-818f-046844fdef15):
--   94b092bd-206a-4ba5-8b52-807b85639301  '532 Neptune Ave'
--   7d367dc0-3dc4-44b3-b40f-14c1bc651ea2  'Central Astoria'
--
-- Idempotent: WHERE is_exclusive = false matches 0 rows on re-run.
-- Wrapped in a transaction; assertion on post-state.

BEGIN;

WITH targets AS (
  SELECT
    p.id,
    p.org_id,
    p.name,
    p.is_exclusive AS old_is_exclusive
  FROM bms_properties p
  WHERE p.org_id = 'b770bb07-af8a-4001-818f-046844fdef15'
    AND p.is_exclusive = false
),
updated AS (
  UPDATE bms_properties p
     SET is_exclusive = true,
         updated_at   = NOW()
    FROM targets tg
   WHERE p.id = tg.id
  RETURNING p.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  tg.org_id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',  -- nathan@ntrec.co
  'is_exclusive_set',
  'bms_property',
  tg.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'is_exclusive', jsonb_build_object('from', tg.old_is_exclusive, 'to', true),
    'reason',       'pre-launch: legacy property predates is_exclusive=true convention; flip so it appears in /brokerage/my-deals/submit building search',
    'name',         tg.name
  ),
  jsonb_build_object(
    'source',         '2026-04-26_unblock_smoke_test_buildings.sql',
    'classification', 'manual-fix'
  ),
  NOW()
FROM targets tg
JOIN updated upd ON upd.id = tg.id;

-- Post-state assertion: both targets must be is_exclusive=true. Idempotent —
-- on a re-run after success, both rows already satisfy the predicate.
DO $$
DECLARE flipped int;
BEGIN
  SELECT COUNT(*)
    INTO flipped
    FROM bms_properties
   WHERE id IN (
     '94b092bd-206a-4ba5-8b52-807b85639301',
     '7d367dc0-3dc4-44b3-b40f-14c1bc651ea2'
   )
     AND is_exclusive = true;

  IF flipped <> 2 THEN
    RAISE EXCEPTION
      'is_exclusive flip failed: expected 2 exclusives, got % -- rolling back',
      flipped;
  END IF;
END$$;

COMMIT;
