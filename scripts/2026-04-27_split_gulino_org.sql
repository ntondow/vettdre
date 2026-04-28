-- 2026-04-27_split_gulino_org.sql
--
-- Architectural fix: split Gulino Group out of Nathan Tondow's sandbox into
-- its own organization. Gulino Group is a paying brokerage customer; until
-- tonight we'd been treating their team + users + 132 buildings as a
-- sub-team inside Nathan's personal org, which would have leaked Nathan's
-- NTREC test data into John & Kristin's UI on tomorrow's launch.
--
-- WHY: pre-launch correctness — tenant isolation between Nathan's sandbox
-- and Gulino's real workspace.
--
-- SCOPE: 7 sections, 149 audit rows on first run, 0 on re-run.
--   Phase 1: org_create        (1)  -- create the new "Gulino Group" org
--   Phase 2: team_move         (1)  -- Gulino Group team -> new org
--   Phase 3: user_move         (2)  -- John, Kristin -> new org
--   Phase 4: bms_property_move (132) -- the 132 from 2026-04-26 bulk-load
--   Phase 5: email_template_move (11) -- 8 by John + 3 by Kristin
--   Phase 6: contact_move      (1)  -- PART 50 PROPERTIES LTD (Kristin)
--   Phase 7: deal_analysis_move(1)  -- 50 WESTMINSTER ROAD (Kristin)
--
-- NATHAN'S CROSS-ORG ACCESS: not creating a second users row for Nathan in
-- Gulino's org -- the (org_id, email) unique constraint allows it but the
-- middleware's .eq("email",...).limit(1) lookup would non-deterministically
-- pick one of the two rows on every request, breaking Nathan's session.
-- Nathan inspects Gulino data via Supabase Studio / direct SQL until a
-- proper cross-org-admin pattern is built. Logged in audit metadata as
-- 'nathan_cross_org_access' = 'sql_only'.
--
-- STAYS IN NATHAN'S ORG (not touched here):
--   * NTREC team, Chris, Ezra, Test Agent, Nathan, NTREC LLC
--   * smoke-test deal 40c40edb + downstream invoice/transaction/payment
--   * 4 legacy bms_listings
--   * 2 legacy bms_properties (7d367dc0 Central Astoria, 94b092bd 532 Neptune)
--   * 9 client_onboardings (none agent-id Kristin/John per pre-flight)
--   * 2 agent_goals (Test Agent + Nathan -- both broker_agents stay in Nathan)
--
-- PRE-FLIGHT VERIFIED 2026-04-27:
--   * OrgTier enum: enterprise|pro|solo. 'enterprise' chosen for paying customer.
--   * SubscriptionStatus enum: active|canceled|past_due|paused|trialing. 'active' valid.
--   * 132 bms_properties to move (audit query confirms count).
--   * Legacy IDs (7d367dc0, 94b092bd) NOT in bulk-load audit set -> stay behind.
--   * No broker_agents reference John/Kristin (they have no broker_agents row).
--   * No agent_goals would orphan (both tied to Nathan-org broker_agents).
--   * Slug 'gulino-group' available on organizations (0 in use).
--   * Gulino team (ad3dffa3) has no parent and no children -- no cascade risk.
--   * 13 cross-org rows (11 email_templates, 1 contact, 1 deal_analysis)
--     identified -- all owned by John or Kristin, all currently in Nathan's
--     org from this morning's VettdRE move. INCLUDED in this migration to
--     avoid the same cross-org orphan bug we fixed this morning.
--   * The 1 contact (PART 50 PROPERTIES LTD) has 0 downstream FK rows
--     across all 17 contact-FK tables -- safe to move.
--   * The 1 deal_analysis (50 WESTMINSTER ROAD) has 0 promote_models -- safe.
--   * No triggers on email_templates/contacts/deal_analyses.
--   * email_templates.id has no incoming FKs (leaf table).
--
-- IDEMPOTENCY:
--   * Phase 1: gated on WHERE NOT EXISTS (slug='gulino-group').
--     Re-runs leave the existing org alone, no audit row.
--   * Phases 2-7: gated on WHERE row.org_id <> new_gulino_org_id.
--     Re-runs match 0 rows, no UPDATE, no audit row.
--   * Final assertions are state-based and pass on first run AND re-runs.
--
-- AUDIT ATTRIBUTION (consistent across all 149 rows):
--   user_id     = b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db (nathan@ntrec.co)
--   actor_name  = 'Nathan Tondow'
--   actor_role  = 'super_admin'
--   metadata.source         = '2026-04-27_split_gulino_org.sql'
--   metadata.classification = 'architectural-fix'
--   metadata.reason         = 'gulino_group is a paying brokerage customer; split out of nathan sandbox'
--   metadata.phase          = '<phase_label>'
--   metadata.nathan_cross_org_access = 'sql_only'

BEGIN;

-- Cache the new (or existing) Gulino org id for use across phases.
CREATE TEMP TABLE _gulino_migration(new_org_id text) ON COMMIT DROP;

------------------------------------------------------------------------------
-- Phase 1a: Create the new Gulino Group org (idempotent on slug uniqueness).
--   Audit row chained in same statement so audit fires iff insert fires.
--   1 audit row on first run, 0 on re-run.
------------------------------------------------------------------------------
WITH inserted_org AS (
  INSERT INTO organizations (
    id, name, slug, tier, subscription_status,
    max_users, ai_lookups_limit, ai_lookups_used, processing_fee_pct,
    default_house_exclusive_split_pct, default_personal_exclusive_split_pct,
    settings, bms_settings, pending_referral_credit,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid()::text, 'Gulino Group', 'gulino-group',
    'enterprise'::"OrgTier", 'active'::"SubscriptionStatus",
    100, 50, 0, 2.00, 35.00, 70.00,
    jsonb_build_object('default_invite_plan', 'enterprise'),
    '{}'::jsonb, 0,
    NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug='gulino-group')
  RETURNING id, name, slug, tier::text AS tier_text,
            subscription_status::text AS status_text,
            max_users, ai_lookups_limit, processing_fee_pct,
            default_house_exclusive_split_pct, default_personal_exclusive_split_pct
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  ins.id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',
  'org_created',
  'organization',
  ins.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'name',                                 ins.name,
    'slug',                                 ins.slug,
    'tier',                                 ins.tier_text,
    'subscription_status',                  ins.status_text,
    'max_users',                            ins.max_users,
    'ai_lookups_limit',                     ins.ai_lookups_limit,
    'processing_fee_pct',                   ins.processing_fee_pct,
    'default_house_exclusive_split_pct',    ins.default_house_exclusive_split_pct,
    'default_personal_exclusive_split_pct', ins.default_personal_exclusive_split_pct,
    'default_invite_plan',                  'enterprise'
  ),
  jsonb_build_object(
    'source',                  '2026-04-27_split_gulino_org.sql',
    'classification',          'architectural-fix',
    'reason',                  'gulino_group is a paying brokerage customer; split out of nathan sandbox',
    'phase',                   'phase_1_org_create',
    'nathan_cross_org_access', 'sql_only'
  ),
  NOW()
FROM inserted_org ins;

------------------------------------------------------------------------------
-- Phase 1b: Cache new org id into temp table.
--   Separate statement so it sees Phase 1a's INSERT (CTE-chained snapshots
--   would prevent the SELECT from seeing the just-inserted row -- see the
--   2026-04-27 first-attempt rollback for the proof of why this matters).
------------------------------------------------------------------------------
INSERT INTO _gulino_migration(new_org_id)
SELECT id FROM organizations WHERE slug='gulino-group';

------------------------------------------------------------------------------
-- Phase 2: Move the Gulino Group team into the new org.
--   1 audit row on first run, 0 on re-run.
------------------------------------------------------------------------------
WITH source AS (
  SELECT t.id, t.name, t.org_id AS old_org_id, m.new_org_id
    FROM teams t, _gulino_migration m
   WHERE t.id = 'ad3dffa3-0c22-425c-9b75-7988c8b7924a'
     AND t.org_id <> m.new_org_id
),
updated AS (
  UPDATE teams t
     SET org_id = s.new_org_id,
         updated_at = NOW()
    FROM source s
   WHERE t.id = s.id
  RETURNING t.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  s.new_org_id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',
  'org_reassigned',
  'team',
  s.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'name',   s.name,
    'org_id', jsonb_build_object('from', s.old_org_id, 'to', s.new_org_id)
  ),
  jsonb_build_object(
    'source',                  '2026-04-27_split_gulino_org.sql',
    'classification',          'architectural-fix',
    'reason',                  'gulino_group is a paying brokerage customer; split out of nathan sandbox',
    'phase',                   'phase_2_team_move',
    'nathan_cross_org_access', 'sql_only'
  ),
  NOW()
FROM source s
JOIN updated u ON u.id = s.id;

------------------------------------------------------------------------------
-- Phase 3: Move John & Kristin into the new org.
--   2 audit rows on first run, 0 on re-run.
------------------------------------------------------------------------------
WITH source AS (
  SELECT u.id, u.email, u.full_name, u.org_id AS old_org_id, m.new_org_id
    FROM users u, _gulino_migration m
   WHERE u.id IN ('21555510-e944-4b74-b06e-f6a8eb53fdee',
                  'e91fe3a4-023d-499a-9a5b-8fcd87e815a0')
     AND u.org_id <> m.new_org_id
),
updated AS (
  UPDATE users u
     SET org_id = s.new_org_id,
         updated_at = NOW()
    FROM source s
   WHERE u.id = s.id
  RETURNING u.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  s.new_org_id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',
  'org_reassigned',
  'user',
  s.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'email',     s.email,
    'full_name', s.full_name,
    'org_id',    jsonb_build_object('from', s.old_org_id, 'to', s.new_org_id)
  ),
  jsonb_build_object(
    'source',                  '2026-04-27_split_gulino_org.sql',
    'classification',          'architectural-fix',
    'reason',                  'gulino_group is a paying brokerage customer; split out of nathan sandbox',
    'phase',                   'phase_3_user_move',
    'nathan_cross_org_access', 'sql_only'
  ),
  NOW()
FROM source s
JOIN updated u ON u.id = s.id;

------------------------------------------------------------------------------
-- Phase 4: Move the 132 bulk-load bms_properties into the new org.
--   Source-of-truth: audit_log entries from 2026-04-26 bulk-load.
--   132 audit rows on first run, 0 on re-run.
------------------------------------------------------------------------------
WITH bulk_property_ids AS (
  SELECT entity_id::text AS id
    FROM audit_log
   WHERE metadata->>'source' = '2026-04-26_bulk_load_gulino_buildings.sql'
     AND action = 'created'
     AND entity_type = 'bms_property'
),
source AS (
  SELECT p.id, p.name, p.landlord_name, p.org_id AS old_org_id, m.new_org_id
    FROM bms_properties p
    JOIN bulk_property_ids b ON b.id = p.id
    CROSS JOIN _gulino_migration m
   WHERE p.org_id <> m.new_org_id
),
updated AS (
  UPDATE bms_properties p
     SET org_id = s.new_org_id,
         updated_at = NOW()
    FROM source s
   WHERE p.id = s.id
  RETURNING p.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  s.new_org_id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',
  'org_reassigned',
  'bms_property',
  s.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'name',          s.name,
    'landlord_name', s.landlord_name,
    'org_id',        jsonb_build_object('from', s.old_org_id, 'to', s.new_org_id)
  ),
  jsonb_build_object(
    'source',                  '2026-04-27_split_gulino_org.sql',
    'classification',          'architectural-fix',
    'reason',                  'gulino_group is a paying brokerage customer; split out of nathan sandbox',
    'phase',                   'phase_4_bms_property_move',
    'nathan_cross_org_access', 'sql_only'
  ),
  NOW()
FROM source s
JOIN updated u ON u.id = s.id;

------------------------------------------------------------------------------
-- Phase 5: Move 11 email_templates owned by John or Kristin.
--   Avoids cross-org orphan: row.org_id would otherwise be Nathan while
--   row.created_by is Kristin/John in Gulino.
--   11 audit rows on first run, 0 on re-run.
------------------------------------------------------------------------------
WITH source AS (
  SELECT et.id, et.name, et.created_by, et.org_id AS old_org_id, m.new_org_id
    FROM email_templates et, _gulino_migration m
   WHERE et.created_by IN ('21555510-e944-4b74-b06e-f6a8eb53fdee',
                           'e91fe3a4-023d-499a-9a5b-8fcd87e815a0')
     AND et.org_id <> m.new_org_id
),
updated AS (
  UPDATE email_templates et
     SET org_id = s.new_org_id,
         updated_at = NOW()
    FROM source s
   WHERE et.id = s.id
  RETURNING et.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  s.new_org_id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',
  'org_reassigned',
  'email_template',
  s.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'name',       s.name,
    'created_by', s.created_by,
    'org_id',     jsonb_build_object('from', s.old_org_id, 'to', s.new_org_id)
  ),
  jsonb_build_object(
    'source',                  '2026-04-27_split_gulino_org.sql',
    'classification',          'architectural-fix',
    'reason',                  'gulino_group is a paying brokerage customer; split out of nathan sandbox',
    'phase',                   'phase_5_email_template_move',
    'nathan_cross_org_access', 'sql_only'
  ),
  NOW()
FROM source s
JOIN updated u ON u.id = s.id;

------------------------------------------------------------------------------
-- Phase 6: Move 1 contact (PART 50 PROPERTIES LTD) assigned to Kristin.
--   Pre-flight verified: zero downstream rows across all 17 contact-FK
--   tables -- this is a clean leaf, no orphans created.
--   1 audit row on first run, 0 on re-run.
------------------------------------------------------------------------------
WITH source AS (
  SELECT c.id, c.first_name, c.last_name, c.assigned_to, c.org_id AS old_org_id, m.new_org_id
    FROM contacts c, _gulino_migration m
   WHERE c.assigned_to IN ('21555510-e944-4b74-b06e-f6a8eb53fdee',
                           'e91fe3a4-023d-499a-9a5b-8fcd87e815a0')
     AND c.org_id <> m.new_org_id
),
updated AS (
  UPDATE contacts c
     SET org_id = s.new_org_id,
         updated_at = NOW()
    FROM source s
   WHERE c.id = s.id
  RETURNING c.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  s.new_org_id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',
  'org_reassigned',
  'contact',
  s.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'name',        TRIM(BOTH ' ' FROM COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')),
    'assigned_to', s.assigned_to,
    'org_id',      jsonb_build_object('from', s.old_org_id, 'to', s.new_org_id)
  ),
  jsonb_build_object(
    'source',                  '2026-04-27_split_gulino_org.sql',
    'classification',          'architectural-fix',
    'reason',                  'gulino_group is a paying brokerage customer; split out of nathan sandbox',
    'phase',                   'phase_6_contact_move',
    'nathan_cross_org_access', 'sql_only'
  ),
  NOW()
FROM source s
JOIN updated u ON u.id = s.id;

------------------------------------------------------------------------------
-- Phase 7: Move 1 deal_analysis (50 WESTMINSTER ROAD) owned by Kristin.
--   Pre-flight verified: zero promote_models -- clean leaf.
--   1 audit row on first run, 0 on re-run.
------------------------------------------------------------------------------
WITH source AS (
  SELECT da.id, da.name, da.user_id, da.org_id AS old_org_id, m.new_org_id
    FROM deal_analyses da, _gulino_migration m
   WHERE da.user_id IN ('21555510-e944-4b74-b06e-f6a8eb53fdee',
                        'e91fe3a4-023d-499a-9a5b-8fcd87e815a0')
     AND da.org_id <> m.new_org_id
),
updated AS (
  UPDATE deal_analyses da
     SET org_id = s.new_org_id,
         updated_at = NOW()
    FROM source s
   WHERE da.id = s.id
  RETURNING da.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  s.new_org_id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',
  'org_reassigned',
  'deal_analysis',
  s.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'name',    s.name,
    'user_id', s.user_id,
    'org_id',  jsonb_build_object('from', s.old_org_id, 'to', s.new_org_id)
  ),
  jsonb_build_object(
    'source',                  '2026-04-27_split_gulino_org.sql',
    'classification',          'architectural-fix',
    'reason',                  'gulino_group is a paying brokerage customer; split out of nathan sandbox',
    'phase',                   'phase_7_deal_analysis_move',
    'nathan_cross_org_access', 'sql_only'
  ),
  NOW()
FROM source s
JOIN updated u ON u.id = s.id;

------------------------------------------------------------------------------
-- Final assertions (state-based; idempotent across runs).
------------------------------------------------------------------------------
DO $$
DECLARE
  gulino_org_id text;
  cnt int;
BEGIN
  SELECT id INTO gulino_org_id FROM organizations WHERE slug='gulino-group';
  IF gulino_org_id IS NULL THEN
    RAISE EXCEPTION 'assert: Gulino Group org not found after migration -- rolling back';
  END IF;

  -- (a) exactly 1 org named 'Gulino Group'
  SELECT COUNT(*) INTO cnt FROM organizations WHERE name='Gulino Group';
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'assert: expected 1 org named Gulino Group, got % -- rolling back', cnt;
  END IF;

  -- (b) John & Kristin both in Gulino org
  SELECT COUNT(*) INTO cnt FROM users
   WHERE id IN ('21555510-e944-4b74-b06e-f6a8eb53fdee',
                'e91fe3a4-023d-499a-9a5b-8fcd87e815a0')
     AND org_id = gulino_org_id;
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'assert: expected 2 JK users in Gulino, got % -- rolling back', cnt;
  END IF;

  -- (c) Gulino Group team in Gulino org
  SELECT COUNT(*) INTO cnt FROM teams
   WHERE id = 'ad3dffa3-0c22-425c-9b75-7988c8b7924a'
     AND org_id = gulino_org_id;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'assert: Gulino team not in Gulino org, got % -- rolling back', cnt;
  END IF;

  -- (d) exactly 132 bms_properties in Gulino org
  SELECT COUNT(*) INTO cnt FROM bms_properties WHERE org_id = gulino_org_id;
  IF cnt <> 132 THEN
    RAISE EXCEPTION 'assert: expected 132 bms_properties in Gulino, got % -- rolling back', cnt;
  END IF;

  -- (e) exactly 2 legacy bms_properties remain in Nathan's org
  SELECT COUNT(*) INTO cnt FROM bms_properties
   WHERE id IN ('7d367dc0-3dc4-44b3-b40f-14c1bc651ea2',
                '94b092bd-206a-4ba5-8b52-807b85639301')
     AND org_id = 'b770bb07-af8a-4001-818f-046844fdef15';
  IF cnt <> 2 THEN
    RAISE EXCEPTION 'assert: expected 2 legacy bms_properties in Nathan org, got % -- rolling back', cnt;
  END IF;

  -- (f) all 11 JK email_templates in Gulino
  SELECT COUNT(*) INTO cnt FROM email_templates
   WHERE created_by IN ('21555510-e944-4b74-b06e-f6a8eb53fdee',
                        'e91fe3a4-023d-499a-9a5b-8fcd87e815a0')
     AND org_id = gulino_org_id;
  IF cnt <> 11 THEN
    RAISE EXCEPTION 'assert: expected 11 JK email_templates in Gulino, got % -- rolling back', cnt;
  END IF;

  -- (g) the 1 JK contact in Gulino
  SELECT COUNT(*) INTO cnt FROM contacts
   WHERE assigned_to IN ('21555510-e944-4b74-b06e-f6a8eb53fdee',
                         'e91fe3a4-023d-499a-9a5b-8fcd87e815a0')
     AND org_id = gulino_org_id;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'assert: expected 1 JK contact in Gulino, got % -- rolling back', cnt;
  END IF;

  -- (h) the 1 JK deal_analysis in Gulino
  SELECT COUNT(*) INTO cnt FROM deal_analyses
   WHERE user_id IN ('21555510-e944-4b74-b06e-f6a8eb53fdee',
                     'e91fe3a4-023d-499a-9a5b-8fcd87e815a0')
     AND org_id = gulino_org_id;
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'assert: expected 1 JK deal_analysis in Gulino, got % -- rolling back', cnt;
  END IF;

  -- (i) zero cross-org team violations across the entire users <-> teams join
  SELECT COUNT(*) INTO cnt
    FROM users u
    JOIN teams t ON t.id = u.team_id
   WHERE u.org_id <> t.org_id;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'assert: cross-org team violations = % -- rolling back', cnt;
  END IF;

  -- (j) zero cross-org JK-owned-data violations
  SELECT COUNT(*) INTO cnt FROM (
    SELECT 1 FROM email_templates
     WHERE created_by IN ('21555510-e944-4b74-b06e-f6a8eb53fdee','e91fe3a4-023d-499a-9a5b-8fcd87e815a0')
       AND org_id <> gulino_org_id
    UNION ALL
    SELECT 1 FROM contacts
     WHERE assigned_to IN ('21555510-e944-4b74-b06e-f6a8eb53fdee','e91fe3a4-023d-499a-9a5b-8fcd87e815a0')
       AND org_id <> gulino_org_id
    UNION ALL
    SELECT 1 FROM deal_analyses
     WHERE user_id IN ('21555510-e944-4b74-b06e-f6a8eb53fdee','e91fe3a4-023d-499a-9a5b-8fcd87e815a0')
       AND org_id <> gulino_org_id
  ) leaks;
  IF cnt <> 0 THEN
    RAISE EXCEPTION 'assert: % JK-owned rows still in non-Gulino org -- rolling back', cnt;
  END IF;
END$$;

COMMIT;
