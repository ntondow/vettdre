-- Rental Index — Supabase/Postgres Schema
-- Run: npx supabase start && psql -h localhost -p 54322 -U postgres -d postgres -f db/schema.sql

-- Enable PostGIS for spatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- ═══════════════════════════════════════════
-- MARKETS
-- ═══════════════════════════════════════════
CREATE TABLE markets (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,        -- 'austin', 'dfw', 'phoenix', 'denver', 'nashville'
    display_name    TEXT NOT NULL,               -- 'Austin, TX'
    state           TEXT NOT NULL,
    timezone        TEXT NOT NULL DEFAULT 'America/Chicago',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO markets (name, display_name, state, timezone) VALUES
    ('austin', 'Austin, TX', 'TX', 'America/Chicago'),
    ('dfw', 'Dallas-Fort Worth, TX', 'TX', 'America/Chicago'),
    ('phoenix', 'Phoenix, AZ', 'AZ', 'America/Phoenix'),
    ('denver', 'Denver, CO', 'CO', 'America/Denver'),
    ('nashville', 'Nashville, TN', 'TN', 'America/Chicago');

-- ═══════════════════════════════════════════
-- BUILDINGS
-- ═══════════════════════════════════════════
CREATE TABLE buildings (
    id                          SERIAL PRIMARY KEY,
    market_id                   INTEGER NOT NULL REFERENCES markets(id),

    -- Identity
    name                        TEXT,
    address                     TEXT NOT NULL,
    city                        TEXT NOT NULL,
    state                       TEXT NOT NULL,
    zip                         TEXT,
    county                      TEXT,
    submarket                   TEXT,
    latitude                    DOUBLE PRECISION,
    longitude                   DOUBLE PRECISION,
    geom                        GEOMETRY(Point, 4326),

    -- Building Details
    year_built                  INTEGER,
    year_renovated              INTEGER,
    total_units                 INTEGER,
    floors                      INTEGER,
    building_class              TEXT CHECK (building_class IN ('A','B','C','D')),
    building_type               TEXT CHECK (building_type IN ('highrise','midrise','lowrise','garden','townhome','wrap','podium','mixed_use')),
    construction_type           TEXT,

    -- Ownership & Management
    owner_name                  TEXT,
    owner_type                  TEXT CHECK (owner_type IN ('REIT','PE','individual','institutional','other')),
    management_company          TEXT,
    pms_platform                TEXT CHECK (pms_platform IN ('yardi','realpage','entrata','resman','appfolio','mri','other')),

    -- Amenities (JSONB for flexibility)
    amenities                   JSONB DEFAULT '[]'::jsonb,
    parking_types               JSONB DEFAULT '[]'::jsonb,
    parking_cost_monthly        NUMERIC(8,2),

    -- Pet Policy
    pets_allowed                BOOLEAN,
    pet_types_allowed           JSONB DEFAULT '[]'::jsonb,
    pet_weight_limit_lbs        INTEGER,
    breed_restrictions          BOOLEAN,
    restricted_breeds           JSONB DEFAULT '[]'::jsonb,
    pet_deposit                 NUMERIC(8,2),
    pet_rent_monthly            NUMERIC(8,2),
    pet_fee                     NUMERIC(8,2),
    max_pets                    INTEGER,

    -- Leasing Policies
    lease_terms_months          JSONB DEFAULT '[]'::jsonb,
    application_fee             NUMERIC(8,2),
    admin_fee                   NUMERIC(8,2),
    security_deposit_min        NUMERIC(8,2),
    security_deposit_max        NUMERIC(8,2),
    income_requirement_mult     NUMERIC(4,2),
    credit_score_minimum        INTEGER,
    accepts_section_8           BOOLEAN,
    accepts_cosigners           BOOLEAN,
    furnished_available         BOOLEAN,
    short_term_available        BOOLEAN,

    -- Contact & Online
    website_url                 TEXT,
    phone                       TEXT,
    email                       TEXT,
    office_hours                TEXT,
    virtual_tour_url            TEXT,
    self_guided_tours           BOOLEAN,

    -- Utilities
    utilities_included          JSONB DEFAULT '[]'::jsonb,
    internet_provider           TEXT,
    smart_home                  BOOLEAN,

    -- Lifecycle Status
    status                      TEXT NOT NULL DEFAULT 'permitted'
                                CHECK (status IN ('permitted','under_construction','tco_issued','co_issued','leasing','stabilized')),
    permit_date                 DATE,
    tco_date                    DATE,
    co_date                     DATE,
    permit_number               TEXT,

    -- Data Provenance
    data_source                 TEXT,
    data_quality_score          NUMERIC(3,2) CHECK (data_quality_score >= 0 AND data_quality_score <= 1),
    last_scraped_at             TIMESTAMPTZ,
    last_verified_at            TIMESTAMPTZ,
    is_claimed                  BOOLEAN NOT NULL DEFAULT false,
    scrape_url                  TEXT,

    -- Meta
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Prevent duplicate buildings
    UNIQUE(address, city, state)
);

-- Spatial index for geo queries
CREATE INDEX idx_buildings_geom ON buildings USING GIST (geom);
CREATE INDEX idx_buildings_market ON buildings (market_id);
CREATE INDEX idx_buildings_status ON buildings (status);
CREATE INDEX idx_buildings_submarket ON buildings (submarket);

-- Auto-update geom column when lat/lng change
CREATE OR REPLACE FUNCTION update_building_geom()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_buildings_geom
    BEFORE INSERT OR UPDATE ON buildings
    FOR EACH ROW EXECUTE FUNCTION update_building_geom();

-- ═══════════════════════════════════════════
-- UNIT TYPES (floor plans)
-- ═══════════════════════════════════════════
CREATE TABLE unit_types (
    id                      SERIAL PRIMARY KEY,
    building_id             INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    name                    TEXT,                   -- "A1", "The Austin", etc.
    bedrooms                INTEGER NOT NULL,
    bathrooms               NUMERIC(3,1) NOT NULL,
    sqft_min                INTEGER,
    sqft_max                INTEGER,
    den                     BOOLEAN DEFAULT false,
    loft                    BOOLEAN DEFAULT false,

    -- Aggregated from units (updated by normalizer)
    rent_min                NUMERIC(10,2),
    rent_max                NUMERIC(10,2),

    -- Features
    features                JSONB DEFAULT '[]'::jsonb,

    -- Media
    floor_plan_image_url    TEXT,
    photo_urls              JSONB DEFAULT '[]'::jsonb,
    virtual_tour_url        TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(building_id, name)
);

CREATE INDEX idx_unit_types_building ON unit_types (building_id);
CREATE INDEX idx_unit_types_beds ON unit_types (bedrooms);

-- ═══════════════════════════════════════════
-- UNITS (individual apartments)
-- ═══════════════════════════════════════════
CREATE TABLE units (
    id                          SERIAL PRIMARY KEY,
    building_id                 INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    unit_type_id                INTEGER REFERENCES unit_types(id),
    unit_number                 TEXT,
    floor                       INTEGER,

    -- Availability
    status                      TEXT NOT NULL DEFAULT 'available'
                                CHECK (status IN ('available','available_soon','on_notice','occupied','down_for_renovation','model')),
    available_date              DATE,

    -- Gross Pricing
    gross_rent                  NUMERIC(10,2),
    sqft                        INTEGER,
    gross_rent_per_sqft         NUMERIC(8,4),

    -- Concessions
    concession_active           BOOLEAN DEFAULT false,
    concession_type             TEXT CHECK (concession_type IN ('months_free','flat_discount','reduced_deposit','waived_fees','gift_card','other')),
    concession_description      TEXT,
    concession_months_free      NUMERIC(4,2),
    concession_value            NUMERIC(10,2),
    concession_expiry           DATE,

    -- Net Pricing (calculated by normalizer agent)
    net_effective_rent          NUMERIC(10,2),
    net_concession_monthly      NUMERIC(10,2),
    net_rent_per_sqft           NUMERIC(8,4),
    lease_term_months           INTEGER,
    lease_term_pricing          JSONB,      -- {"6": {"gross": 2400, "net": 2400}, "12": {"gross": 2200, "net": 1886}}

    -- Move-in
    move_in_cost_total          NUMERIC(10,2),

    -- Unit Features
    view_type                   TEXT,
    exposure                    TEXT,       -- N/S/E/W/NE/etc.
    ada_accessible              BOOLEAN DEFAULT false,
    recently_renovated          BOOLEAN DEFAULT false,

    -- Tracking
    first_seen_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_available_at      TIMESTAMPTZ,
    days_on_market              INTEGER,
    source_url                  TEXT,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(building_id, unit_number)
);

CREATE INDEX idx_units_building ON units (building_id);
CREATE INDEX idx_units_status ON units (status);
CREATE INDEX idx_units_beds ON units USING btree ((
    (SELECT bedrooms FROM unit_types WHERE unit_types.id = units.unit_type_id)
));
CREATE INDEX idx_units_net_rent ON units (net_effective_rent);

-- ═══════════════════════════════════════════
-- PRICE HISTORY (append-only — most valuable asset)
-- ═══════════════════════════════════════════
CREATE TABLE price_history (
    id                          BIGSERIAL PRIMARY KEY,
    unit_id                     INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    building_id                 INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,

    scraped_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    gross_rent                  NUMERIC(10,2),
    net_effective_rent          NUMERIC(10,2),
    net_concession_monthly      NUMERIC(10,2),

    concession_active           BOOLEAN,
    concession_type             TEXT,
    concession_description      TEXT,
    concession_months_free      NUMERIC(4,2),
    concession_value            NUMERIC(10,2),

    lease_term_months           INTEGER,
    unit_status                 TEXT,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
    -- NO updated_at. This table is APPEND-ONLY. Never update, never delete.
);

CREATE INDEX idx_price_history_unit ON price_history (unit_id, scraped_at DESC);
CREATE INDEX idx_price_history_building ON price_history (building_id, scraped_at DESC);
CREATE INDEX idx_price_history_date ON price_history (scraped_at DESC);

-- ═══════════════════════════════════════════
-- SCRAPE LOGS (monitoring & debugging)
-- ═══════════════════════════════════════════
CREATE TABLE scrape_logs (
    id                  BIGSERIAL PRIMARY KEY,
    building_id         INTEGER REFERENCES buildings(id),
    agent_name          TEXT NOT NULL,       -- 'discovery', 'classifier', 'pms_discovery', 'scraper', 'normalizer'
    stage               TEXT NOT NULL,       -- pipeline stage
    status              TEXT NOT NULL CHECK (status IN ('started','success','partial','failed','skipped')),
    records_processed   INTEGER DEFAULT 0,
    records_created     INTEGER DEFAULT 0,
    records_updated     INTEGER DEFAULT 0,
    error_message       TEXT,
    duration_ms         INTEGER,
    metadata            JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scrape_logs_building ON scrape_logs (building_id, created_at DESC);
CREATE INDEX idx_scrape_logs_agent ON scrape_logs (agent_name, created_at DESC);
