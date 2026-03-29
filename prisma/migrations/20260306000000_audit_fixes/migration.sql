-- Codebase Audit Fixes Migration
-- Adds missing indexes, Portfolio tenant isolation, and table mappings

-- ============================================================
-- Portfolio Tenant Isolation: Add orgId to Portfolio
-- ============================================================

-- Add orgId column to portfolios (nullable first for existing rows)
ALTER TABLE "Portfolio" ADD COLUMN IF NOT EXISTS "org_id" TEXT;

-- Add orgId column to PortfolioBuilding (for table mapping rename)
-- Note: PortfolioBuilding doesn't need orgId directly since it references Portfolio

-- Rename tables to follow snake_case convention (if not already renamed)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Portfolio') THEN
    ALTER TABLE "Portfolio" RENAME TO "portfolios";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PortfolioBuilding') THEN
    ALTER TABLE "PortfolioBuilding" RENAME TO "portfolio_buildings";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Rename columns to snake_case in portfolios
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolios' AND column_name = 'totalBuildings') THEN
    ALTER TABLE "portfolios" RENAME COLUMN "totalBuildings" TO "total_buildings";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolios' AND column_name = 'totalUnits') THEN
    ALTER TABLE "portfolios" RENAME COLUMN "totalUnits" TO "total_units";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolios' AND column_name = 'totalValue') THEN
    ALTER TABLE "portfolios" RENAME COLUMN "totalValue" TO "total_value";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolios' AND column_name = 'avgDistress') THEN
    ALTER TABLE "portfolios" RENAME COLUMN "avgDistress" TO "avg_distress";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolios' AND column_name = 'entityNames') THEN
    ALTER TABLE "portfolios" RENAME COLUMN "entityNames" TO "entity_names";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolios' AND column_name = 'headOfficers') THEN
    ALTER TABLE "portfolios" RENAME COLUMN "headOfficers" TO "head_officers";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolios' AND column_name = 'createdAt') THEN
    ALTER TABLE "portfolios" RENAME COLUMN "createdAt" TO "created_at";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolios' AND column_name = 'updatedAt') THEN
    ALTER TABLE "portfolios" RENAME COLUMN "updatedAt" TO "updated_at";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Rename columns in portfolio_buildings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolio_buildings' AND column_name = 'portfolioId') THEN
    ALTER TABLE "portfolio_buildings" RENAME COLUMN "portfolioId" TO "portfolio_id";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolio_buildings' AND column_name = 'boroCode') THEN
    ALTER TABLE "portfolio_buildings" RENAME COLUMN "boroCode" TO "boro_code";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolio_buildings' AND column_name = 'yearBuilt') THEN
    ALTER TABLE "portfolio_buildings" RENAME COLUMN "yearBuilt" TO "year_built";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolio_buildings' AND column_name = 'assessedValue') THEN
    ALTER TABLE "portfolio_buildings" RENAME COLUMN "assessedValue" TO "assessed_value";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolio_buildings' AND column_name = 'ownerName') THEN
    ALTER TABLE "portfolio_buildings" RENAME COLUMN "ownerName" TO "owner_name";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolio_buildings' AND column_name = 'buildingClass') THEN
    ALTER TABLE "portfolio_buildings" RENAME COLUMN "buildingClass" TO "building_class";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolio_buildings' AND column_name = 'createdAt') THEN
    ALTER TABLE "portfolio_buildings" RENAME COLUMN "createdAt" TO "created_at";
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;


-- ============================================================
-- Missing Indexes
-- ============================================================

-- Users
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_org_id_idx" ON "users" ("org_id");

-- Deals
CREATE INDEX CONCURRENTLY IF NOT EXISTS "deals_org_id_status_created_at_idx" ON "deals" ("org_id", "status", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "deals_property_id_idx" ON "deals" ("property_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "deals_assigned_to_idx" ON "deals" ("assigned_to");

-- Activities
CREATE INDEX CONCURRENTLY IF NOT EXISTS "activities_deal_id_idx" ON "activities" ("deal_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "activities_user_id_idx" ON "activities" ("user_id");

-- Prospecting Items
CREATE INDEX CONCURRENTLY IF NOT EXISTS "prospecting_items_list_id_idx" ON "prospecting_items" ("list_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "prospecting_items_org_id_idx" ON "prospecting_items" ("org_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "prospecting_items_contact_id_idx" ON "prospecting_items" ("contact_id");

-- Gmail Accounts
CREATE INDEX CONCURRENTLY IF NOT EXISTS "gmail_accounts_user_id_idx" ON "gmail_accounts" ("user_id");

-- Portfolios
CREATE INDEX CONCURRENTLY IF NOT EXISTS "portfolios_org_id_idx" ON "portfolios" ("org_id");

-- Portfolio Buildings
CREATE INDEX CONCURRENTLY IF NOT EXISTS "portfolio_buildings_bbl_idx" ON "portfolio_buildings" ("bbl");
