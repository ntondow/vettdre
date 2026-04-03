// ── React Query Persistence (SQLite-backed) ─────────────────
// Persists the React Query cache to SQLite so the app loads
// instantly from local data on reopen, then refreshes in background.
//
// Only persists whitelisted query keys to avoid caching sensitive
// data or transient UI state.

import * as SQLite from "expo-sqlite";
import type { QueryClient } from "@tanstack/react-query";
import { PERSISTABLE_PREFIXES } from "./query-keys";

const CACHE_TABLE = "query_cache";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Only persist these query keys — skip one-off or mutation-heavy queries
const PERSISTABLE_KEYS = new Set<string>(PERSISTABLE_PREFIXES);

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("vettdre-query-cache");
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS ${CACHE_TABLE} (
        query_key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }
  return db;
}

/**
 * Restore cached queries into the QueryClient on app startup.
 * Call this once after creating the QueryClient.
 */
export async function restoreQueryCache(
  queryClient: QueryClient
): Promise<void> {
  try {
    const database = await getDb();
    const cutoff = Date.now() - MAX_AGE_MS;

    // Delete expired entries
    await database.runAsync(
      `DELETE FROM ${CACHE_TABLE} WHERE updated_at < ?`,
      [cutoff]
    );

    // Load remaining entries
    const rows = await database.getAllAsync<{
      query_key: string;
      data: string;
      updated_at: number;
    }>(`SELECT * FROM ${CACHE_TABLE}`);

    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data);
        queryClient.setQueryData([row.query_key], parsed);
      } catch {
        // Corrupted cache entry — skip it
      }
    }

    if (__DEV__) console.log(`[query-cache] Restored ${rows.length} cached queries`);
  } catch (err) {
    console.warn("[query-cache] Failed to restore:", err);
  }
}

/**
 * Persist the current query cache to SQLite.
 * Call this periodically (e.g., on app background) or after key fetches.
 */
export async function persistQueryCache(
  queryClient: QueryClient
): Promise<void> {
  try {
    const database = await getDb();
    const cache = queryClient.getQueryCache().getAll();
    const now = Date.now();

    await database.withTransactionAsync(async () => {
      for (const query of cache) {
        const key =
          query.queryKey.length === 1
            ? String(query.queryKey[0])
            : JSON.stringify(query.queryKey);

        // Only persist whitelisted keys with fresh data
        if (!PERSISTABLE_KEYS.has(String(query.queryKey[0]))) continue;
        if (!query.state.data) continue;

        const data = JSON.stringify(query.state.data);

        await database.runAsync(
          `INSERT OR REPLACE INTO ${CACHE_TABLE} (query_key, data, updated_at) VALUES (?, ?, ?)`,
          [String(query.queryKey[0]), data, now]
        );
      }
    });
  } catch (err) {
    console.warn("[query-cache] Failed to persist:", err);
  }
}

/**
 * Clear all cached query data.
 */
export async function clearQueryCache(): Promise<void> {
  try {
    const database = await getDb();
    await database.runAsync(`DELETE FROM ${CACHE_TABLE}`);
  } catch (err) {
    console.warn("[query-cache] Failed to clear:", err);
  }
}
