// ── Offline Cache (expo-sqlite) ──────────────────────────────
// Persists saved building profiles and client list for offline access.
// Uses SQLite for structured local storage on-device.

import * as SQLite from "expo-sqlite";
import type { BuildingProfile, ClientOnboarding } from "@/types";

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("vettdre-cache");
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS saved_buildings (
        bbl TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        data TEXT NOT NULL,
        saved_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS clients_cache (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
  return db;
}

// ── Saved Buildings ──────────────────────────────────────────

export async function saveBuilding(profile: BuildingProfile): Promise<void> {
  const database = await getDb();
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT OR REPLACE INTO saved_buildings (bbl, address, data, saved_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [profile.bbl, profile.address, JSON.stringify(profile), now, now]
  );
}

export async function getSavedBuilding(
  bbl: string
): Promise<BuildingProfile | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ data: string }>(
    "SELECT data FROM saved_buildings WHERE bbl = ?",
    [bbl]
  );
  return row ? JSON.parse(row.data) : null;
}

export async function getAllSavedBuildings(): Promise<
  Array<{ bbl: string; address: string; savedAt: string; profile: BuildingProfile }>
> {
  const database = await getDb();
  const rows = await database.getAllAsync<{
    bbl: string;
    address: string;
    data: string;
    saved_at: string;
  }>("SELECT bbl, address, data, saved_at FROM saved_buildings ORDER BY saved_at DESC");

  return rows.map((r) => ({
    bbl: r.bbl,
    address: r.address,
    savedAt: r.saved_at,
    profile: JSON.parse(r.data),
  }));
}

export async function removeSavedBuilding(bbl: string): Promise<void> {
  const database = await getDb();
  await database.runAsync("DELETE FROM saved_buildings WHERE bbl = ?", [bbl]);
}

export async function isBuildingSaved(bbl: string): Promise<boolean> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) as c FROM saved_buildings WHERE bbl = ?",
    [bbl]
  );
  return (row?.c ?? 0) > 0;
}

// ── Client Cache ─────────────────────────────────────────────

export async function cacheClients(
  clients: ClientOnboarding[]
): Promise<void> {
  const database = await getDb();
  const now = new Date().toISOString();
  // Transaction for batch efficiency
  await database.withTransactionAsync(async () => {
    await database.runAsync("DELETE FROM clients_cache");
    for (const c of clients) {
      await database.runAsync(
        "INSERT INTO clients_cache (id, data, updated_at) VALUES (?, ?, ?)",
        [c.id, JSON.stringify(c), now]
      );
    }
  });
}

export async function getCachedClients(): Promise<ClientOnboarding[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ data: string }>(
    "SELECT data FROM clients_cache ORDER BY updated_at DESC"
  );
  return rows.map((r) => JSON.parse(r.data));
}

// ── Generic KV Store ─────────────────────────────────────────

export async function setKV(key: string, value: string): Promise<void> {
  const database = await getDb();
  const now = new Date().toISOString();
  await database.runAsync(
    "INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)",
    [key, value, now]
  );
}

export async function getKV(key: string): Promise<string | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM kv_store WHERE key = ?",
    [key]
  );
  return row?.value ?? null;
}

export async function clearAllCache(): Promise<void> {
  const database = await getDb();
  await database.execAsync(`
    DELETE FROM saved_buildings;
    DELETE FROM clients_cache;
    DELETE FROM kv_store;
  `);
}
