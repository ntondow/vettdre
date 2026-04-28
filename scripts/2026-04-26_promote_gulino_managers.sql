-- 2026-04-26_promote_gulino_managers.sql
--
-- Pre-launch surgical fix: bump John & Kristin Gulino from users.role='manager'
-- to users.role='admin' so the bms-auth.ts ROLE_MAP fallback resolves them as
-- brokerageRole='brokerage_admin' (instead of 'manager') across all BMS server
-- actions and page guards.
--
-- Why: they have NO broker_agents row. With role='manager', getCurrentBrokerageRole()
-- returns 'manager', which blocks them from approve_deal, reject_deal, create_invoice,
-- record_payment, manage_agents, goals_manage, manage_brokerage_settings,
-- export_reports, view_1099, manage_plans/assign_plan, and inviteTeamMember at
-- /settings/team. They cannot run their own brokerage tomorrow without this bump.
-- With role='admin', bms-auth.ts:31 resolves them as 'brokerage_admin' before
-- the ROLE_MAP even fires, granting the full BMS surface.
--
-- Affected users:
--   21555510-e944-4b74-b06e-f6a8eb53fdee  john@gulinogroupny.com    (John Gulino)
--   e91fe3a4-023d-499a-9a5b-8fcd87e815a0  kristin@gulinogroupny.com (Kristin Gulino)
--
-- Pre-flight verified 2026-04-26:
--   * Code audit: zero permission paths grant role='manager' but exclude role='admin'.
--     The only manager-string references in src/ are UI badge colors, validation lists
--     (manager is a valid role value), TS type casts, and the bms-auth.ts ROLE_MAP
--     itself. No regression risk from the bump.
--   * No triggers, rules, or check constraints on public.users.
--   * UserRole enum confirmed: {super_admin, owner, admin, manager, agent, viewer}.
--     'admin' is a valid value.
--   * No (org_id, email) collision risk — UPDATE only changes role, not org/email.
--
-- Idempotent: WHERE id IN (...) AND role='manager' matches 0 rows on re-run, so no
-- duplicate audit rows are written. The final assertion (count of role='admin' = 2)
-- still passes on re-run.

BEGIN;

WITH targets AS (
  SELECT
    u.id            AS user_id,
    u.email,
    u.org_id,
    u.role::text    AS old_role,
    u.full_name
  FROM users u
  WHERE u.id IN (
    '21555510-e944-4b74-b06e-f6a8eb53fdee',  -- john@gulinogroupny.com
    'e91fe3a4-023d-499a-9a5b-8fcd87e815a0'   -- kristin@gulinogroupny.com
  )
    AND u.role::text = 'manager'
),
updated AS (
  UPDATE users u
     SET role       = 'admin'::"UserRole",
         updated_at = NOW()
    FROM targets tg
   WHERE u.id = tg.user_id
  RETURNING u.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  tg.org_id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',  -- nathan@ntrec.co
  'role_updated',
  'user',
  tg.user_id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'role',                       jsonb_build_object('from', tg.old_role, 'to', 'admin'),
    'reason',                     'pre-launch: enable brokerage_admin BMS surface for Gulino manager',
    'email',                      tg.email,
    'brokerage_role_resolution',  'manager -> brokerage_admin via bms-auth.ts ROLE_MAP'
  ),
  jsonb_build_object(
    'source',         '2026-04-26_promote_gulino_managers.sql',
    'classification', 'manual-fix'
  ),
  NOW()
FROM targets tg
JOIN updated upd ON upd.id = tg.user_id;

-- Post-state assertion: both target users must be at role='admin'. Idempotent —
-- on a re-run after success, both rows already satisfy the predicate, so count=2.
DO $$
DECLARE
  promoted int;
BEGIN
  SELECT COUNT(*)
    INTO promoted
    FROM users
   WHERE id IN (
     '21555510-e944-4b74-b06e-f6a8eb53fdee',
     'e91fe3a4-023d-499a-9a5b-8fcd87e815a0'
   )
     AND role::text = 'admin';

  IF promoted <> 2 THEN
    RAISE EXCEPTION
      'role bump failed: expected 2 admins, got % -- rolling back',
      promoted;
  END IF;
END$$;

COMMIT;
