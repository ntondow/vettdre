-- 2026-04-27_backfill_bms_and_seed_goals.sql
--
-- Three-phase pre-launch cleanup, all scoped to Nathan Tondow's org
-- (b770bb07-af8a-4001-818f-046844fdef15):
--
--   PHASE 1: Backfill the 2 legacy bms_properties rows that still carry the
--            column-default city='New York' (vs. proper borough names on
--            the 132 rows from 2026-04-26_bulk_load_gulino_buildings.sql).
--   PHASE 2: Seed agent_goals for the current month for the 2 person agents
--            in Nathan's org (Test Agent, Nathan Tondow). Skip the NTREC LLC
--            broker_agent (brokerage entity, no person).
--   PHASE 3: Post-state assertions, RAISE EXCEPTION + rollback on mismatch.
--
-- Pre-flight verified 2026-04-26:
--   * bms_properties.city/state/zip_code are text NULL. (Note: the city column
--     has a column DEFAULT of 'New York' which is what produced the legacy
--     state on these 2 rows; consider dropping that default post-launch.)
--   * agent_goals has UNIQUE (org_id, agent_id, year, month). We use
--     ON CONFLICT DO NOTHING (race-safe; RETURNING still emits only the
--     actually-inserted rows so the CTE-chained audit pattern works).
--   * agent_goals required cols: id, org_id, agent_id, year, month, updated_at.
--     The *_actual cols all have NOT NULL DEFAULT 0; created_at defaults to
--     CURRENT_TIMESTAMP. We omit those from the column list so defaults apply.
--   * Both target broker_agents (a03da7ad Test Agent, b1d4fe0c Nathan Tondow)
--     verified status='active' in b770bb07-... .
--
-- Idempotency:
--   Phase 1 — UPDATEs gated by WHERE city='New York' on each target id.
--             Re-runs match 0 rows after first apply.
--   Phase 2 — INSERT ... ON CONFLICT DO NOTHING. Re-runs hit conflicts and
--             return 0 rows from RETURNING, so 0 audit rows on second pass.
--
-- Audit attribution (same convention as 2026-04-26 migrations):
--   user_id     = b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db (nathan@ntrec.co)
--   actor_name  = 'Nathan Tondow'
--   actor_role  = 'super_admin'
--   metadata.source         = '2026-04-27_backfill_bms_and_seed_goals.sql'
--   metadata.classification = 'manual-fix' (Phase 1) / 'seed' (Phase 2)

BEGIN;

------------------------------------------------------------------------------
-- PHASE 1: Backfill 2 legacy bms_properties (city/state/zip)
--   Source CTE drives both targets with their new (city, zip) tuples.
--   Snapshot old values BEFORE update so the audit changes JSON has correct
--   from-state. Gate on city='New York' for idempotency.
------------------------------------------------------------------------------
WITH source(id, new_city, new_zip) AS (
  VALUES
    ('7d367dc0-3dc4-44b3-b40f-14c1bc651ea2', 'Astoria',  '11105'),
    ('94b092bd-206a-4ba5-8b52-807b85639301', 'Brooklyn', '11224')
),
targets AS (
  SELECT
    s.id,
    s.new_city,
    s.new_zip,
    p.name             AS prop_name,
    p.city             AS old_city,
    p.state            AS old_state,
    p.zip_code         AS old_zip
  FROM source s
  JOIN bms_properties p
    ON p.id = s.id
   AND p.org_id = 'b770bb07-af8a-4001-818f-046844fdef15'
   AND p.city   = 'New York'
),
updated AS (
  UPDATE bms_properties p
     SET city       = t.new_city,
         state      = 'NY',
         zip_code   = t.new_zip,
         updated_at = NOW()
    FROM targets t
   WHERE p.id = t.id
  RETURNING p.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  'b770bb07-af8a-4001-818f-046844fdef15',
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',
  'backfilled',
  'bms_property',
  t.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'name',     t.prop_name,
    'city',     jsonb_build_object('from', t.old_city, 'to', t.new_city),
    'state',    jsonb_build_object('from', t.old_state, 'to', 'NY'),
    'zip_code', jsonb_build_object('from', t.old_zip,  'to', t.new_zip),
    'reason',   'pre-launch: align legacy New York-default rows with proper borough city/zip from gulino bulk-load'
  ),
  jsonb_build_object(
    'source',         '2026-04-27_backfill_bms_and_seed_goals.sql',
    'classification', 'manual-fix',
    'phase',          'phase_1_bms_backfill'
  ),
  NOW()
FROM targets t
JOIN updated u ON u.id = t.id;

------------------------------------------------------------------------------
-- PHASE 2: Seed agent_goals (current month) for 2 person broker_agents
--   Skip NTREC LLC (43848714, brokerage entity, no person).
--   ON CONFLICT (org_id, agent_id, year, month) DO NOTHING -> race-safe and
--   re-run produces 0 RETURNING rows -> 0 audit rows on second pass.
--   Omit created_at, updated_at-defaulted columns, and *_actual columns so
--   their NOT NULL DEFAULTs apply. updated_at has no default so we set NOW().
------------------------------------------------------------------------------
WITH source(agent_id) AS (
  VALUES
    ('a03da7ad-a1aa-421a-9305-c382238e374a'),  -- Test Agent
    ('b1d4fe0c-f691-4be3-b94f-a7abe29da83d')   -- Nathan Tondow
),
inserted AS (
  INSERT INTO agent_goals (
    id,
    org_id,
    agent_id,
    year,
    month,
    deals_closed_target,
    revenue_target,
    listings_leased_target,
    listings_added_target,
    custom_targets,
    last_calculated_at,
    updated_at
  )
  SELECT
    gen_random_uuid()::text,
    'b770bb07-af8a-4001-818f-046844fdef15',
    s.agent_id,
    EXTRACT(YEAR  FROM NOW())::int,
    EXTRACT(MONTH FROM NOW())::int,
    2,         -- deals_closed_target
    10000,     -- revenue_target
    3,         -- listings_leased_target
    2,         -- listings_added_target
    NULL,      -- custom_targets
    NULL,      -- last_calculated_at
    NOW()      -- updated_at (NOT NULL, no default)
  FROM source s
  ON CONFLICT (org_id, agent_id, year, month) DO NOTHING
  RETURNING id, agent_id, year, month, deals_closed_target, revenue_target,
            listings_leased_target, listings_added_target
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  'b770bb07-af8a-4001-818f-046844fdef15',
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',
  'created',
  'agent_goal',
  ins.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'agent_id',                ins.agent_id,
    'year',                    ins.year,
    'month',                   ins.month,
    'deals_closed_target',     ins.deals_closed_target,
    'revenue_target',          ins.revenue_target,
    'listings_leased_target',  ins.listings_leased_target,
    'listings_added_target',   ins.listings_added_target
  ),
  jsonb_build_object(
    'source',         '2026-04-27_backfill_bms_and_seed_goals.sql',
    'classification', 'seed',
    'phase',          'phase_2_agent_goals_seed'
  ),
  NOW()
FROM inserted ins;

------------------------------------------------------------------------------
-- PHASE 3: Post-state assertions
------------------------------------------------------------------------------
DO $$
DECLARE
  goals_cnt    int;
  bms_fixed    int;
BEGIN
  -- (a) agent_goals seeded for current month in Nathan's org. Expect >= 2.
  --     Idempotent: same on re-run because we never delete, only insert-or-skip.
  SELECT COUNT(*)
    INTO goals_cnt
    FROM agent_goals
   WHERE org_id = 'b770bb07-af8a-4001-818f-046844fdef15'
     AND year   = EXTRACT(YEAR  FROM NOW())::int
     AND month  = EXTRACT(MONTH FROM NOW())::int;

  IF goals_cnt < 2 THEN
    RAISE EXCEPTION
      'expected >= 2 agent_goals for current month in Nathan org, got % -- rolling back',
      goals_cnt;
  END IF;

  -- (b) Both legacy bms_properties rows now in the proper borough city.
  --     Expect exactly 2 (Astoria + Brooklyn).
  SELECT COUNT(*)
    INTO bms_fixed
    FROM bms_properties
   WHERE id IN ('7d367dc0-3dc4-44b3-b40f-14c1bc651ea2',
                '94b092bd-206a-4ba5-8b52-807b85639301')
     AND city IN ('Astoria', 'Brooklyn');

  IF bms_fixed <> 2 THEN
    RAISE EXCEPTION
      'expected 2 backfilled bms_properties rows (Astoria/Brooklyn), got % -- rolling back',
      bms_fixed;
  END IF;
END$$;

COMMIT;
