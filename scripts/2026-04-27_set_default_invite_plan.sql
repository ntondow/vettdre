-- 2026-04-27_set_default_invite_plan.sql
--
-- Pre-launch: set Nathan Tondow's org settings.default_invite_plan='enterprise'
-- so Gulino agents accepting invite links tomorrow auto-land on enterprise via
-- the resolve-user.ts plan-inheritance path (PATCH 1, commit shipped together).
--
-- Pre-flight verified 2026-04-27:
--   * organizations.settings is jsonb NOT NULL DEFAULT '{}'::jsonb. Currently
--     {} for Nathan's org -- jsonb_set with create_missing := true is safe.
--   * Idempotency gate: WHERE settings->>'default_invite_plan' IS NULL.
--     Re-runs match 0 rows.
--   * Scope: only org_id='b770bb07-...'. VettdRE org untouched.
--   * UserPlan enum values: free | explorer | pro | team | enterprise.
--     'enterprise' is valid.

BEGIN;

WITH targets AS (
  SELECT id, settings AS old_settings
    FROM organizations
   WHERE id = 'b770bb07-af8a-4001-818f-046844fdef15'
     AND (settings->>'default_invite_plan') IS NULL
),
updated AS (
  UPDATE organizations o
     SET settings   = jsonb_set(o.settings, '{default_invite_plan}', '"enterprise"'::jsonb, true),
         updated_at = NOW()
    FROM targets t
   WHERE o.id = t.id
  RETURNING o.id
)
INSERT INTO audit_log (
  id, org_id, user_id, action, entity_type, entity_id,
  actor_name, actor_role, changes, metadata, created_at
)
SELECT
  gen_random_uuid()::text,
  t.id,
  'b58df4ad-1b2e-4fbd-aac7-a8abd9fe98db',
  'settings_updated',
  'organization',
  t.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'default_invite_plan',
      jsonb_build_object('from', t.old_settings->'default_invite_plan', 'to', 'enterprise'),
    'reason', 'pre-launch: Gulino agents auto-land on enterprise via invite-accept plan inheritance'
  ),
  jsonb_build_object(
    'source',         '2026-04-27_set_default_invite_plan.sql',
    'classification', 'manual-fix'
  ),
  NOW()
FROM targets t
JOIN updated u ON u.id = t.id;

DO $$
DECLARE
  current_value text;
BEGIN
  SELECT settings->>'default_invite_plan'
    INTO current_value
    FROM organizations
   WHERE id = 'b770bb07-af8a-4001-818f-046844fdef15';

  IF current_value <> 'enterprise' THEN
    RAISE EXCEPTION
      'expected default_invite_plan=enterprise on Nathan org, got % -- rolling back',
      COALESCE(current_value, '<null>');
  END IF;
END$$;

COMMIT;
