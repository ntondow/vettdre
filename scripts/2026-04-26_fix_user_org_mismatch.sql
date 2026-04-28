-- 2026-04-26_fix_user_org_mismatch.sql
--
-- Surgical data fix in two parts:
--
-- PART A — 3 users have public.users.team_id pointing to a team that lives in a
-- different org than the user's own org_id. Move users.org_id to match the team's
-- org_id (b770bb07-af8a-4001-818f-046844fdef15, "Nathan Tondow's Organization").
--
--   Affected users (currently org_id = e9c967c7 VettdRE; target = b770bb07):
--     41666eeb-c015-490d-aabb-c93abe37c538  chris@ntrec.co            -> team NTREC
--     e91fe3a4-023d-499a-9a5b-8fcd87e815a0  kristin@gulinogroupny.com -> team Gulino Group
--     dd1df89f-b57d-4388-84e6-5909799c2aa3  ezra.mahpour@gmail.com    -> team NTREC
--
-- PART B — kristin@gulinogroupny.com owns 5 rows stamped to org_id = VettdRE that
-- would be cross-org orphans after Part A. Move them to b770bb07 alongside her.
-- Inbound-reference audit (2026-04-26) confirmed all 5 rows are standalone:
-- zero FK references and zero JSONB soft references anywhere in the public schema.
--
--   Owned rows being moved (assigned_to / user_id / created_by = kristin):
--     contacts        5260d146-effa-48bc-9b00-a9aa4f964437  PART 50 PROPERTIES LTD.
--     deal_analyses   4bb768bc-0e2b-41b1-a41c-73f1cf0d4d2d  50 WESTMINSTER ROAD
--     email_templates 45aea6b5-6ee3-4651-b6b8-a0c6bd54db50  Property Outreach
--     email_templates 874266bc-459f-45fa-bbf3-9f8032e73a9e  Follow Up
--     email_templates 7ee91828-8453-4e49-8931-242c4b3a7709  Property Interest
--
-- Idempotent: each WHERE clause filters to "still in old org", so a re-run touches
-- 0 rows and writes 0 audit_log entries. Wrapped in a single transaction; any
-- assertion failure rolls back everything (Part A users included).
--
-- Pre-flight verified 2026-04-26:
--   * No triggers / rules / RLS policies on users, contacts, deal_analyses, email_templates.
--   * No (org_id, email) collision in the target org for the 3 emails.
--   * No broker_agents rows for any of the 3 users (no BMS-side orphans).
--   * No composite unique indexes that involve org_id on contacts/deal_analyses/email_templates.
--   * Codebase derives orgId from public.users on every request — no JWT/session cache,
--     no relogin required.

BEGIN;

-- =====================================================================
-- PART A: move 3 users to the org that owns their team
-- =====================================================================
WITH targets_user AS (
  SELECT
    u.id     AS user_id,
    u.email,
    u.org_id AS old_org_id,
    t.org_id AS new_org_id,
    t.name   AS team_name
  FROM users u
  JOIN teams t ON t.id = u.team_id
  WHERE u.id IN (
    '41666eeb-c015-490d-aabb-c93abe37c538',
    'e91fe3a4-023d-499a-9a5b-8fcd87e815a0',
    'dd1df89f-b57d-4388-84e6-5909799c2aa3'
  )
    AND u.org_id <> t.org_id
),
updated_users AS (
  UPDATE users u
     SET org_id     = tg.new_org_id,
         updated_at = NOW()
    FROM targets_user tg
   WHERE u.id = tg.user_id
  RETURNING u.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  tg.new_org_id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',  -- nathan@ntrec.co
  'org_reassigned',
  'user',
  tg.user_id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'org_id',           jsonb_build_object('from', tg.old_org_id, 'to', tg.new_org_id),
    'reason',           'team_id pointed to team in different org; reassigned user org to match team owner',
    'team_id_unchanged', true,
    'team_name',         tg.team_name,
    'email',             tg.email
  ),
  jsonb_build_object(
    'source',         '2026-04-26_fix_user_org_mismatch.sql',
    'part',           'A',
    'classification', 'manual-fix'
  ),
  NOW()
FROM targets_user tg
JOIN updated_users upd ON upd.id = tg.user_id;

-- =====================================================================
-- PART B: move kristin's 5 owned rows to the same target org
-- =====================================================================

-- B.1: contact (PART 50 PROPERTIES LTD.)
WITH targets_contact AS (
  SELECT
    c.id,
    c.org_id                                              AS old_org_id,
    'b770bb07-af8a-4001-818f-046844fdef15'::text          AS new_org_id,
    COALESCE(NULLIF(TRIM(c.first_name || ' ' || c.last_name), ''), '(unnamed)') AS label
  FROM contacts c
  WHERE c.id     = '5260d146-effa-48bc-9b00-a9aa4f964437'
    AND c.org_id = 'e9c967c7-45eb-46b8-a8b8-979a8ee39d45'
),
updated_contact AS (
  UPDATE contacts c
     SET org_id     = tg.new_org_id,
         updated_at = NOW()
    FROM targets_contact tg
   WHERE c.id = tg.id
  RETURNING c.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  tg.new_org_id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',  -- nathan@ntrec.co
  'org_reassigned',
  'contact',
  tg.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'org_id',           jsonb_build_object('from', tg.old_org_id, 'to', tg.new_org_id),
    'reason',           'owner kristin@gulinogroupny.com moved to b770bb07 in same migration; row followed owner',
    'owner_user_id',    'e91fe3a4-023d-499a-9a5b-8fcd87e815a0',
    'label',            tg.label
  ),
  jsonb_build_object(
    'source',         '2026-04-26_fix_user_org_mismatch.sql',
    'part',           'B.1',
    'classification', 'manual-fix'
  ),
  NOW()
FROM targets_contact tg
JOIN updated_contact upd ON upd.id = tg.id;

-- B.2: deal_analysis (50 WESTMINSTER ROAD)
WITH targets_da AS (
  SELECT
    d.id,
    d.org_id                                       AS old_org_id,
    'b770bb07-af8a-4001-818f-046844fdef15'::text   AS new_org_id,
    COALESCE(d.name, d.address, '(unnamed)')       AS label
  FROM deal_analyses d
  WHERE d.id     = '4bb768bc-0e2b-41b1-a41c-73f1cf0d4d2d'
    AND d.org_id = 'e9c967c7-45eb-46b8-a8b8-979a8ee39d45'
),
updated_da AS (
  UPDATE deal_analyses d
     SET org_id     = tg.new_org_id,
         updated_at = NOW()
    FROM targets_da tg
   WHERE d.id = tg.id
  RETURNING d.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  tg.new_org_id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',  -- nathan@ntrec.co
  'org_reassigned',
  'deal_analysis',
  tg.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'org_id',           jsonb_build_object('from', tg.old_org_id, 'to', tg.new_org_id),
    'reason',           'owner kristin@gulinogroupny.com moved to b770bb07 in same migration; row followed owner',
    'owner_user_id',    'e91fe3a4-023d-499a-9a5b-8fcd87e815a0',
    'label',            tg.label
  ),
  jsonb_build_object(
    'source',         '2026-04-26_fix_user_org_mismatch.sql',
    'part',           'B.2',
    'classification', 'manual-fix'
  ),
  NOW()
FROM targets_da tg
JOIN updated_da upd ON upd.id = tg.id;

-- B.3a: email_template "Property Outreach"
WITH targets_tpl_a AS (
  SELECT
    et.id,
    et.org_id                                      AS old_org_id,
    'b770bb07-af8a-4001-818f-046844fdef15'::text   AS new_org_id,
    et.name                                        AS label
  FROM email_templates et
  WHERE et.id     = '45aea6b5-6ee3-4651-b6b8-a0c6bd54db50'
    AND et.org_id = 'e9c967c7-45eb-46b8-a8b8-979a8ee39d45'
),
updated_tpl_a AS (
  UPDATE email_templates et
     SET org_id     = tg.new_org_id,
         updated_at = NOW()
    FROM targets_tpl_a tg
   WHERE et.id = tg.id
  RETURNING et.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  tg.new_org_id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',  -- nathan@ntrec.co
  'org_reassigned',
  'email_template',
  tg.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'org_id',           jsonb_build_object('from', tg.old_org_id, 'to', tg.new_org_id),
    'reason',           'owner kristin@gulinogroupny.com moved to b770bb07 in same migration; row followed owner',
    'owner_user_id',    'e91fe3a4-023d-499a-9a5b-8fcd87e815a0',
    'label',            tg.label
  ),
  jsonb_build_object(
    'source',         '2026-04-26_fix_user_org_mismatch.sql',
    'part',           'B.3a',
    'classification', 'manual-fix'
  ),
  NOW()
FROM targets_tpl_a tg
JOIN updated_tpl_a upd ON upd.id = tg.id;

-- B.3b: email_template "Follow Up"
WITH targets_tpl_b AS (
  SELECT
    et.id,
    et.org_id                                      AS old_org_id,
    'b770bb07-af8a-4001-818f-046844fdef15'::text   AS new_org_id,
    et.name                                        AS label
  FROM email_templates et
  WHERE et.id     = '874266bc-459f-45fa-bbf3-9f8032e73a9e'
    AND et.org_id = 'e9c967c7-45eb-46b8-a8b8-979a8ee39d45'
),
updated_tpl_b AS (
  UPDATE email_templates et
     SET org_id     = tg.new_org_id,
         updated_at = NOW()
    FROM targets_tpl_b tg
   WHERE et.id = tg.id
  RETURNING et.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  tg.new_org_id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',  -- nathan@ntrec.co
  'org_reassigned',
  'email_template',
  tg.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'org_id',           jsonb_build_object('from', tg.old_org_id, 'to', tg.new_org_id),
    'reason',           'owner kristin@gulinogroupny.com moved to b770bb07 in same migration; row followed owner',
    'owner_user_id',    'e91fe3a4-023d-499a-9a5b-8fcd87e815a0',
    'label',            tg.label
  ),
  jsonb_build_object(
    'source',         '2026-04-26_fix_user_org_mismatch.sql',
    'part',           'B.3b',
    'classification', 'manual-fix'
  ),
  NOW()
FROM targets_tpl_b tg
JOIN updated_tpl_b upd ON upd.id = tg.id;

-- B.3c: email_template "Property Interest"
WITH targets_tpl_c AS (
  SELECT
    et.id,
    et.org_id                                      AS old_org_id,
    'b770bb07-af8a-4001-818f-046844fdef15'::text   AS new_org_id,
    et.name                                        AS label
  FROM email_templates et
  WHERE et.id     = '7ee91828-8453-4e49-8931-242c4b3a7709'
    AND et.org_id = 'e9c967c7-45eb-46b8-a8b8-979a8ee39d45'
),
updated_tpl_c AS (
  UPDATE email_templates et
     SET org_id     = tg.new_org_id,
         updated_at = NOW()
    FROM targets_tpl_c tg
   WHERE et.id = tg.id
  RETURNING et.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  tg.new_org_id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',  -- nathan@ntrec.co
  'org_reassigned',
  'email_template',
  tg.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'org_id',           jsonb_build_object('from', tg.old_org_id, 'to', tg.new_org_id),
    'reason',           'owner kristin@gulinogroupny.com moved to b770bb07 in same migration; row followed owner',
    'owner_user_id',    'e91fe3a4-023d-499a-9a5b-8fcd87e815a0',
    'label',            tg.label
  ),
  jsonb_build_object(
    'source',         '2026-04-26_fix_user_org_mismatch.sql',
    'part',           'B.3c',
    'classification', 'manual-fix'
  ),
  NOW()
FROM targets_tpl_c tg
JOIN updated_tpl_c upd ON upd.id = tg.id;

-- =====================================================================
-- Verification — assert clean post-state, else roll back
-- =====================================================================

-- (1) Original symptom: zero users with users.org_id <> teams.org_id.
DO $$
DECLARE remaining int;
BEGIN
  SELECT COUNT(*)
    INTO remaining
    FROM users u
    JOIN teams t ON t.id = u.team_id
   WHERE u.org_id <> t.org_id;

  IF remaining > 0 THEN
    RAISE EXCEPTION
      'PART A failed: % user(s) still have org_id <> team.org_id — rolling back',
      remaining;
  END IF;
END$$;

-- (2) All 5 owned rows must now sit in the target org (b770bb07), not VettdRE.
DO $$
DECLARE bad int;
BEGIN
  SELECT COUNT(*) INTO bad FROM (
    SELECT 1 FROM contacts
      WHERE id = '5260d146-effa-48bc-9b00-a9aa4f964437'
        AND org_id <> 'b770bb07-af8a-4001-818f-046844fdef15'
    UNION ALL
    SELECT 1 FROM deal_analyses
      WHERE id = '4bb768bc-0e2b-41b1-a41c-73f1cf0d4d2d'
        AND org_id <> 'b770bb07-af8a-4001-818f-046844fdef15'
    UNION ALL
    SELECT 1 FROM email_templates
      WHERE id IN (
        '45aea6b5-6ee3-4651-b6b8-a0c6bd54db50',
        '874266bc-459f-45fa-bbf3-9f8032e73a9e',
        '7ee91828-8453-4e49-8931-242c4b3a7709'
      )
        AND org_id <> 'b770bb07-af8a-4001-818f-046844fdef15'
  ) x;

  IF bad > 0 THEN
    RAISE EXCEPTION
      'PART B failed: % owned row(s) not in target org — rolling back',
      bad;
  END IF;
END$$;

COMMIT;
