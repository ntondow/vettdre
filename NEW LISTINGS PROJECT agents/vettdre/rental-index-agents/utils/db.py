"""
Database utilities — connection, upsert helpers, logging.
Used by all agents to read/write Supabase.
"""
import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Optional

import asyncpg

from config.settings import DATABASE_URL


class Database:
    """Async Postgres connection pool for all agents."""

    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        self.pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)

    async def close(self):
        if self.pool:
            await self.pool.close()

    # ── Building operations ──────────────────

    async def upsert_building(self, data: dict) -> int:
        """Insert or update a building. Returns building ID."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO buildings (
                    market_id, name, address, city, state, zip, county,
                    total_units, year_built, permit_number, permit_date,
                    status, data_source, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7,
                    $8, $9, $10, $11,
                    $12, $13, now(), now()
                )
                ON CONFLICT (address, city, state) DO UPDATE SET
                    name = COALESCE(EXCLUDED.name, buildings.name),
                    total_units = COALESCE(EXCLUDED.total_units, buildings.total_units),
                    year_built = COALESCE(EXCLUDED.year_built, buildings.year_built),
                    permit_number = COALESCE(EXCLUDED.permit_number, buildings.permit_number),
                    permit_date = COALESCE(EXCLUDED.permit_date, buildings.permit_date),
                    status = CASE
                        WHEN EXCLUDED.status > buildings.status THEN EXCLUDED.status
                        ELSE buildings.status
                    END,
                    updated_at = now()
                RETURNING id
                """,
                data.get("market_id"),
                data.get("name"),
                data["address"],
                data["city"],
                data["state"],
                data.get("zip"),
                data.get("county"),
                data.get("total_units"),
                data.get("year_built"),
                data.get("permit_number"),
                data.get("permit_date"),
                data.get("status", "permitted"),
                data.get("data_source", "open_data"),
            )
            return row["id"]

    async def update_building_status(self, building_id: int, status: str, **kwargs):
        """Update a building's lifecycle status + optional fields."""
        sets = ["status = $2", "updated_at = now()"]
        params = [building_id, status]
        i = 3
        for key, value in kwargs.items():
            sets.append(f"{key} = ${i}")
            params.append(value)
            i += 1

        async with self.pool.acquire() as conn:
            await conn.execute(
                f"UPDATE buildings SET {', '.join(sets)} WHERE id = $1",
                *params,
            )

    async def update_building_scrape_url(self, building_id: int, scrape_url: str, pms_platform: str):
        """Set the PMS scrape URL for a building."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """UPDATE buildings SET scrape_url = $2, pms_platform = $3, updated_at = now()
                   WHERE id = $1""",
                building_id, scrape_url, pms_platform,
            )

    async def get_buildings(self, market: str = None, status: str = None, needs_scrape_url: bool = False) -> list:
        """Fetch buildings with optional filters."""
        conditions = []
        params = []
        i = 1

        if market:
            conditions.append(f"m.name = ${i}")
            params.append(market)
            i += 1
        if status:
            conditions.append(f"b.status = ${i}")
            params.append(status)
            i += 1
        if needs_scrape_url:
            conditions.append("b.scrape_url IS NULL")
            conditions.append("b.status IN ('tco_issued', 'co_issued', 'leasing')")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                f"""SELECT b.*, m.name as market_name
                    FROM buildings b
                    JOIN markets m ON m.id = b.market_id
                    {where}
                    ORDER BY b.updated_at DESC""",
                *params,
            )
            return [dict(r) for r in rows]

    # ── Unit operations ──────────────────────

    async def upsert_unit(self, data: dict) -> int:
        """Insert or update a unit. Returns unit ID."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO units (
                    building_id, unit_type_id, unit_number, floor,
                    status, available_date, gross_rent, sqft,
                    concession_active, concession_type, concession_description,
                    concession_months_free, concession_value,
                    source_url, first_seen_at, last_seen_available_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8,
                    $9, $10, $11, $12, $13, $14, now(), now()
                )
                ON CONFLICT (building_id, unit_number) DO UPDATE SET
                    status = EXCLUDED.status,
                    available_date = EXCLUDED.available_date,
                    gross_rent = EXCLUDED.gross_rent,
                    sqft = COALESCE(EXCLUDED.sqft, units.sqft),
                    concession_active = EXCLUDED.concession_active,
                    concession_type = EXCLUDED.concession_type,
                    concession_description = EXCLUDED.concession_description,
                    concession_months_free = EXCLUDED.concession_months_free,
                    concession_value = EXCLUDED.concession_value,
                    last_seen_available_at = CASE
                        WHEN EXCLUDED.status IN ('available', 'available_soon') THEN now()
                        ELSE units.last_seen_available_at
                    END,
                    updated_at = now()
                RETURNING id
                """,
                data["building_id"],
                data.get("unit_type_id"),
                data["unit_number"],
                data.get("floor"),
                data.get("status", "available"),
                data.get("available_date"),
                data.get("gross_rent"),
                data.get("sqft"),
                data.get("concession_active", False),
                data.get("concession_type"),
                data.get("concession_description"),
                data.get("concession_months_free"),
                data.get("concession_value"),
                data.get("source_url"),
            )
            return row["id"]

    # ── Price history (append-only) ──────────

    async def append_price_history(self, data: dict):
        """Append a price snapshot. NEVER updates or deletes."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO price_history (
                    unit_id, building_id, gross_rent, net_effective_rent,
                    net_concession_monthly, concession_active, concession_type,
                    concession_description, concession_months_free, concession_value,
                    lease_term_months, unit_status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                """,
                data["unit_id"],
                data["building_id"],
                data.get("gross_rent"),
                data.get("net_effective_rent"),
                data.get("net_concession_monthly"),
                data.get("concession_active"),
                data.get("concession_type"),
                data.get("concession_description"),
                data.get("concession_months_free"),
                data.get("concession_value"),
                data.get("lease_term_months"),
                data.get("unit_status"),
            )

    # ── Scrape logging ───────────────────────

    async def log_scrape(self, agent_name: str, stage: str, status: str, **kwargs):
        """Log a pipeline run for monitoring."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO scrape_logs (
                    building_id, agent_name, stage, status,
                    records_processed, records_created, records_updated,
                    error_message, duration_ms, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)""",
                kwargs.get("building_id"),
                agent_name,
                stage,
                status,
                kwargs.get("records_processed", 0),
                kwargs.get("records_created", 0),
                kwargs.get("records_updated", 0),
                kwargs.get("error_message"),
                kwargs.get("duration_ms"),
                json.dumps(kwargs.get("metadata", {})),
            )


# Singleton
db = Database()
