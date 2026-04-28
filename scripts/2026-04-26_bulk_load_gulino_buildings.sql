-- 2026-04-26_bulk_load_gulino_buildings.sql
--
-- Pre-launch bulk-load: insert 132 Gulino Group buildings (parent property
-- manager: Cammeby's) into bms_properties under Nathan Tondow's org so they
-- appear in /brokerage/my-deals/submit building search and become valid lease
-- targets for tomorrow's rollout.
--
-- Source: Cammeby's Unit Turnover Report 2026-04-26
--   parsed -> scripts/data/gulino-buildings-enriched.csv (132 rows, 26 LLCs,
--   3 boroughs, 7 cities). Census Geocoder enriched 130 of 132 addresses;
--   2 manual overrides baked into CSV (rows where matched begins "MANUAL:"):
--     line 45  BQCAM   3901-03 Nostrand Avenue Brooklyn 11235
--     line 49  BRI     86-25 Van Wyck Expressway Briarwood Queens 11435
--
-- Field mappings (per launch spec):
--   org_id                 = 'b770bb07-af8a-4001-818f-046844fdef15' (Nathan Tondow's Org)
--   name                   = address (e.g. "20-15 24th Street")
--   address                = address (same — required by schema)
--   city                   = city_raw, title-cased
--   state                  = 'NY'
--   zip_code               = zip
--   landlord_name          = legal_entity (LLC of record)
--   management_co          = 'Cammeby''s' (parent PM, doubled-quote escape)
--   billing_entity_name    = legal_entity (matches landlord_name)
--   billing_entity_address = NULL (not in source)
--   billing_entity_email   = NULL
--   billing_entity_phone   = NULL
--   landlord_email         = NULL
--   landlord_phone         = NULL
--   total_units            = NULL (units come later from listings)
--   is_exclusive           = TRUE (so they show in deal-submission search)
--   notes                  = NULL
--   id                     = gen_random_uuid()::text
--   created_at, updated_at = NOW()
--
-- Idempotency: insert is gated by NOT EXISTS on (org_id, name) — no unique
-- constraint exists on (org_id, name), only a non-unique btree index, so the
-- gate is the dedup mechanism. Re-runs match 0 rows in the source CTE that
-- aren't already present, so 0 inserts and 0 audit rows on second run.
--
-- The 2 pre-existing rows in Nathan's org (Central Astoria, 532 Neptune Ave)
-- were already flipped to is_exclusive=true by the morning's
-- 2026-04-26_unblock_smoke_test_buildings.sql migration. The defensive UPDATE
-- here is gated on is_exclusive=false, so it is a no-op (and writes no audit
-- row) on the current state. The state-based assertion below still holds.
--
-- Pre-flight verified 2026-04-26:
--   * bms_properties has zero triggers and zero non-PK constraints; only
--     non-unique btree indexes on (org_id) and (org_id, name).
--   * All target columns exist with the expected types and nullability.
--   * Nathan's user_id b58df4ad-...-98db verified as super_admin.
--   * 'Cammeby''s' uses doubled-up single-quote escaping (PostgreSQL standard).
--   * No apostrophes in any landlord_name or address from the CSV.
--   * No duplicate names within the CSV (132 unique).
--   * No collision between CSV names and existing bms_properties names in
--     Nathan's org ('Central Astoria', '532 Neptune Ave' do not match any
--     CSV address row).

BEGIN;

------------------------------------------------------------------------------
-- Section 1: Insert 132 buildings + write one audit_log row per insert
------------------------------------------------------------------------------
WITH source(name, city, zip_code, landlord_name, borough, property_code) AS (
  VALUES
    ('18-19 21st Avenue', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-01 21st Avenue', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-14 Crescent Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-15 24th Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-18 Crescent Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-24 24th Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-25 Crescent Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-31 20th Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-32 21st Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-32 24th Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-43 20th Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-52 Crescent Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-53 20th Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-58 20th Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-58 Crescent Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-64 21st Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-68 26th Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('20-68 27th Street', 'Astoria', '11105', 'Central Astoria LLC', 'Queens', '595'),
    ('21-09 19th Street', 'Astoria', '11105', 'Astoria Terrace Gardens LLC', 'Queens', '597'),
    ('400 Argyle Road', 'Brooklyn', '11218', 'Argyle Apartments LLC', 'Brooklyn', 'ARG'),
    ('2611 West 2nd Street', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('2612 West 2nd Street', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('2631 West 2nd Street', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('2632 West 2nd Street', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('2634 West Street', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('2661 West 2nd Street', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('2662 West 2nd Street', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('2662 West Street', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('2681 West 2nd Street', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('2682 West 2nd Street', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('2684 West Street', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('2775 Shore Parkway', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('2795 Shore Parkway', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('29 Murdock Court', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('49 Murdock Court', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('49 Nixon Court', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('621 Avenue Z', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('675 Avenue Z', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('9 Murdock Court', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('9 Nixon Court', 'Brooklyn', '11223', 'Beach Haven Apt Associates LLC', 'Brooklyn', 'BH1'),
    ('164-20 Highland Avenue', 'Jamaica', '11432', 'BQ CAM COOPS LLC', 'Queens', 'BQCAM'),
    ('2580 Ocean Parkway', 'Brooklyn', '11235', 'BQ CAM COOPS LLC', 'Brooklyn', 'BQCAM'),
    ('2650 Ocean Parkway', 'Brooklyn', '11235', 'BQ CAM COOPS LLC', 'Brooklyn', 'BQCAM'),
    ('3901-03 Nostrand Avenue', 'Brooklyn', '11235', 'BQ CAM COOPS LLC', 'Brooklyn', 'BQCAM'),
    ('46-01 39 Avenue', 'Sunnyside', '11104', 'BQ CAM COOPS LLC', 'Queens', 'BQCAM'),
    ('87-05 166 Street', 'Jamaica', '11432', 'BQ CAM COOPS LLC', 'Queens', 'BQCAM'),
    ('87-15 165 Street', 'Jamaica', '11432', 'BQ CAM COOPS LLC', 'Queens', 'BQCAM'),
    ('86-25 Van Wyck Expressway', 'Briarwood', '11435', 'Briar Wyck Apartments LLC', 'Queens', 'BRI'),
    ('178-10 Wexford Terrace', 'Jamaica', '11432', 'Edgerton Apartments DEL LLC', 'Queens', 'EDG'),
    ('8800 20th Avenue', 'Brooklyn', '11214', 'Falcon Apartments DEL LLC', 'Brooklyn', 'FAL'),
    ('8855 Bay Parkway', 'Brooklyn', '11214', 'Fontainebleau Towers DEL LLC', 'Brooklyn', 'FON'),
    ('143-06 Barclay Avenue', 'Flushing', '11355', 'Green Park Sussex Apts DEL LLC', 'Queens', 'GP06'),
    ('143-16 Barclay Avenue', 'Flushing', '11355', 'Green Park Sussex Apts DEL LLC', 'Queens', 'GP06'),
    ('143-09 Barclay Avenue', 'Flushing', '11355', 'Green Park Essex Apts DEL LLC', 'Queens', 'GP09'),
    ('143-11 Barclay Avenue', 'Flushing', '11355', 'Green Park Essex Apts DEL LLC', 'Queens', 'GP09'),
    ('143-23 Barclay Avenue', 'Flushing', '11355', 'Green Park Essex Apts DEL LLC', 'Queens', 'GP09'),
    ('143-29 Barclay Avenue', 'Flushing', '11355', 'Green Park Essex Apts DEL LLC', 'Queens', 'GP09'),
    ('101 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('111 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('130 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('131 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('14 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('21 Stratford Avenue', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('23 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('29 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('31 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('33 Stratford Avenue', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('37 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('460 Howard Avenue', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('472 Howard Avenue', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('488 Howard Avenue', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('490 Howard Avenue', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('500 Howard Avenue', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('504 Howard Avenue', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('528 Howard Avenue', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('53 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('54 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('55 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('62 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('69 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('7 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('7 Stratford Avenue', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('74 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('85 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('88 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('94 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('95 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('97 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('99 Arlo Road', 'Staten Island', '10301', 'Grymes Hill Apartments DEL LLC', 'Staten Island', 'GRY'),
    ('41-10 Bowne Street', 'Flushing', '11355', 'Kendall Apartments DEL LLC', 'Queens', 'KEN'),
    ('3323 Nostrand Avenue', 'Brooklyn', '11229', 'Lawrence Gardens DEL Apt LLC', 'Brooklyn', 'LG01'),
    ('3280 Nostrand Avenue', 'Brooklyn', '11229', 'Lawrence Towers DEL LLC', 'Brooklyn', 'LT10'),
    ('3310 Nostrand Avenue', 'Brooklyn', '11229', 'Lawrence Towers DEL LLC', 'Brooklyn', 'LT10'),
    ('1230 Avenue Y', 'Brooklyn', '11235', 'Nautilus Apartments DEL LLC', 'Brooklyn', 'NAU'),
    ('1483 Shore Parkway', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('1487 Shore Parkway', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('1491 Shore Parkway', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('1493 Shore Parkway', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('2034 Cropsey Avenue', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('2038 Cropsey Avenue', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('2044 21st Drive', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('2044 Cropsey Avenue', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('2049 20th Lane', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('2056 Cropsey Avenue', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('2070 20th Lane', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('2074 20th Lane', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('2076 20th Lane', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('2076 Cropsey Avenue', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('2078 Cropsey Avenue', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('8831 20th Avenue', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('8841 20th Avenue', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('8861 20th Avenue', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('8869 20th Avenue', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('8871 20th Avenue', 'Brooklyn', '11214', 'Shore Haven Apartments DEL LLC', 'Brooklyn', 'SH1'),
    ('1429 Shore Parkway', 'Brooklyn', '11214', 'Southhampton Apartments DEL LL', 'Brooklyn', 'SOU'),
    ('1445 Shore Parkway', 'Brooklyn', '11214', 'Southhampton Apartments DEL LL', 'Brooklyn', 'SOU'),
    ('1461 Shore Parkway', 'Brooklyn', '11214', 'Southhampton Apartments DEL LL', 'Brooklyn', 'SOU'),
    ('166-05 Highland Avenue', 'Jamaica', '11432', 'Sussex Apt Associates DEL LLC', 'Queens', 'SUS'),
    ('2940 Ocean Parkway', 'Brooklyn', '11235', 'Trump Village Apt 1 Owner LLC', 'Brooklyn', 'TV1'),
    ('3000 Ocean Parkway', 'Brooklyn', '11235', 'Trump Village Apt2 Owners LLC', 'Brooklyn', 'TV2'),
    ('245 Mill Road', 'Staten Island', '10306', 'Tysens Apartments LLC', 'Staten Island', 'TY1'),
    ('255 Mill Road', 'Staten Island', '10306', 'Tysens Apartments LLC', 'Staten Island', 'TY1'),
    ('26 Ebbitts Street', 'Staten Island', '10306', 'Tysens Apartments LLC', 'Staten Island', 'TY1'),
    ('265 Mill Road', 'Staten Island', '10306', 'Tysens Apartments LLC', 'Staten Island', 'TY1'),
    ('285 Mill Road', 'Staten Island', '10306', 'Tysens Apartments LLC', 'Staten Island', 'TY1'),
    ('30 Ebbitts Street', 'Staten Island', '10306', 'Tysens Apartments LLC', 'Staten Island', 'TY1'),
    ('655 Tysens Lane', 'Staten Island', '10306', 'Tysens Apartments LLC', 'Staten Island', 'TY1'),
    ('675 Tysens Lane', 'Staten Island', '10306', 'Tysens Apartments LLC', 'Staten Island', 'TY1'),
    ('405 Westminster Road', 'Brooklyn', '11218', 'Westminster Apartments LLC', 'Brooklyn', 'WES'),
    ('86-75 Midland Parkway', 'Jamaica', '11432', 'Wexford Apartments DEL LLC', 'Queens', 'WEX'),
    ('182-30 Wexford Terrace', 'Jamaica', '11432', 'Wilshire Apartments DEL LLC', 'Queens', 'WIL'),
    ('178-60 Wexford Terrace', 'Jamaica', '11432', 'Winston Apartments DEL LLC', 'Queens', 'WIN')
),
inserted AS (
  INSERT INTO bms_properties (
    id, org_id, name, address, city, state, zip_code,
    landlord_name, management_co,
    billing_entity_name, billing_entity_address,
    billing_entity_email, billing_entity_phone,
    landlord_email, landlord_phone,
    total_units, is_exclusive, notes,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid()::text,
    'b770bb07-af8a-4001-818f-046844fdef15',
    s.name,
    s.name,
    s.city,
    'NY',
    s.zip_code,
    s.landlord_name,
    'Cammeby''s',
    s.landlord_name,
    NULL,
    NULL, NULL,
    NULL, NULL,
    NULL,
    TRUE,
    NULL,
    NOW(), NOW()
  FROM source s
  WHERE NOT EXISTS (
    SELECT 1 FROM bms_properties p
     WHERE p.org_id = 'b770bb07-af8a-4001-818f-046844fdef15'
       AND p.name   = s.name
  )
  RETURNING id, name AS inserted_name, landlord_name, city, zip_code
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
  'bms_property',
  ins.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'name',                 ins.inserted_name,
    'landlord_name',        ins.landlord_name,
    'city',                 ins.city,
    'zip_code',             ins.zip_code,
    'borough_label',        src.borough,
    'property_code_source', src.property_code,
    'is_exclusive',         true
  ),
  jsonb_build_object(
    'source',         '2026-04-26_bulk_load_gulino_buildings.sql',
    'classification', 'bulk-load',
    'source_pdf',     'Cammebys Unit Turnover Report 2026-04-26'
  ),
  NOW()
FROM inserted ins
JOIN source src ON src.name = ins.inserted_name;

------------------------------------------------------------------------------
-- Section 2: Defensive flip of is_exclusive on 2 pre-existing rows
--   Gated on is_exclusive=false. Morning's migration already flipped these,
--   so on first run of THIS migration the gate matches 0 rows -> no UPDATE,
--   no audit row. Pattern is here as a safety net in case rollback ever
--   reverts the morning's change.
------------------------------------------------------------------------------
WITH targets AS (
  SELECT id,
         name,
         is_exclusive AS old_is_exclusive
    FROM bms_properties
   WHERE org_id = 'b770bb07-af8a-4001-818f-046844fdef15'
     AND id IN (
       '7d367dc0-3dc4-44b3-b40f-14c1bc651ea2',  -- Central Astoria
       '94b092bd-206a-4ba5-8b52-807b85639301'   -- 532 Neptune Ave
     )
     AND is_exclusive = false
),
updated AS (
  UPDATE bms_properties p
     SET is_exclusive = true,
         updated_at   = NOW()
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
  'updated',
  'bms_property',
  t.id,
  'Nathan Tondow',
  'super_admin',
  jsonb_build_object(
    'is_exclusive', jsonb_build_object('from', t.old_is_exclusive, 'to', true),
    'name',         t.name,
    'reason',       'defensive flip during gulino bulk-load (no-op if morning migration already applied)'
  ),
  jsonb_build_object(
    'source',         '2026-04-26_bulk_load_gulino_buildings.sql',
    'classification', 'bulk-load',
    'source_pdf',     'Cammebys Unit Turnover Report 2026-04-26'
  ),
  NOW()
FROM targets t
JOIN updated u ON u.id = t.id;

------------------------------------------------------------------------------
-- Section 3: Post-state assertions (rolls back on mismatch)
------------------------------------------------------------------------------
DO $$
DECLARE
  exclusive_cnt    int;
  insert_audit_cnt int;
BEGIN
  -- (a) State assertion: at least 134 exclusive bms_properties in Nathan's
  --     org (132 newly inserted + 2 pre-existing rows already flipped this
  --     morning). Idempotent: same on re-run.
  SELECT COUNT(*)
    INTO exclusive_cnt
    FROM bms_properties
   WHERE org_id = 'b770bb07-af8a-4001-818f-046844fdef15'
     AND is_exclusive = true;

  IF exclusive_cnt < 134 THEN
    RAISE EXCEPTION
      'expected >= 134 exclusive bms_properties in target org, got % -- rolling back',
      exclusive_cnt;
  END IF;

  -- (b) Audit assertion: at least 132 'created' audit rows from this source
  --     on first run. Counts only action='created' so the (possibly 0)
  --     defensive update audit rows from Section 2 do not skew the bound.
  --     On re-run after success, this is exactly 132 and still passes.
  SELECT COUNT(*)
    INTO insert_audit_cnt
    FROM audit_log
   WHERE metadata->>'source' = '2026-04-26_bulk_load_gulino_buildings.sql'
     AND action              = 'created';

  IF insert_audit_cnt < 132 THEN
    RAISE EXCEPTION
      'expected >= 132 created audit rows for bulk-load source, got % -- rolling back',
      insert_audit_cnt;
  END IF;
END$$;

COMMIT;
