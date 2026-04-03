// ── Offline Request Queue ────────────────────────────────────
// Queues POST/PATCH/PUT/DELETE requests when the device is offline.
// Automatically retries when connectivity is restored.
// Uses SQLite for persistence across app restarts.

import * as SQLite from "expo-sqlite";
import NetInfo from "@react-native-community/netinfo";
import { API_URL, getAuthHeaders } from "./api";

type HttpMethod = "POST" | "PATCH" | "PUT" | "DELETE";

interface QueuedRequest {
  id: number;
  path: string;
  method: HttpMethod;
  body: string;
  created_at: string;
  attempts: number;
}

let db: SQLite.SQLiteDatabase | null = null;
let processing = false;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("vettdre-offline-queue");
    // Create table with method column (v2 schema)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS request_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        method TEXT NOT NULL DEFAULT 'POST',
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        attempts INTEGER NOT NULL DEFAULT 0
      );
    `);
    // Migrate v1 table: add method column if missing
    try {
      await db.execAsync(
        `ALTER TABLE request_queue ADD COLUMN method TEXT NOT NULL DEFAULT 'POST';`
      );
    } catch {
      // Column already exists — expected on v2+ installs
    }
  }
  return db;
}

/**
 * Enqueue a mutating request to be retried when online.
 * Returns true if queued (offline), false if sent immediately (online).
 */
export async function enqueueOrSend(
  path: string,
  body: Record<string, unknown>,
  method: HttpMethod = "POST"
): Promise<{ queued: boolean; result?: unknown }> {
  const state = await NetInfo.fetch();

  if (state.isConnected) {
    // Online — send immediately
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`API ${response.status}`);
    }

    return { queued: false, result: await response.json() };
  }

  // Offline — queue for later
  const database = await getDb();
  await database.runAsync(
    "INSERT INTO request_queue (path, method, body) VALUES (?, ?, ?)",
    [path, method, JSON.stringify(body)]
  );

  return { queued: true };
}

/**
 * Process all queued requests. Called when connectivity is restored.
 */
export async function processQueue(): Promise<number> {
  if (processing) return 0;
  processing = true;

  try {
    const database = await getDb();
    const items = await database.getAllAsync<QueuedRequest>(
      "SELECT * FROM request_queue ORDER BY id ASC LIMIT 20"
    );

    if (items.length === 0) return 0;

    const headers = await getAuthHeaders();
    if (!headers["Authorization"]) return 0; // No auth token — skip

    let processed = 0;

    for (const item of items) {
      try {
        const response = await fetch(`${API_URL}${item.path}`, {
          method: item.method || "POST",
          headers,
          body: item.body,
        });

        if (response.ok || response.status === 409) {
          // Success or duplicate — remove from queue
          await database.runAsync(
            "DELETE FROM request_queue WHERE id = ?",
            [item.id]
          );
          processed++;
        } else if (item.attempts >= 3) {
          // Too many failures — discard
          await database.runAsync(
            "DELETE FROM request_queue WHERE id = ?",
            [item.id]
          );
          console.warn(
            `[offline-queue] Discarding after ${item.attempts} attempts: ${item.method} ${item.path}`
          );
        } else {
          // Increment attempt count
          await database.runAsync(
            "UPDATE request_queue SET attempts = attempts + 1 WHERE id = ?",
            [item.id]
          );
        }
      } catch {
        // Network error — stop processing, we're probably still offline
        break;
      }
    }

    return processed;
  } finally {
    processing = false;
  }
}

/**
 * Get the number of queued requests.
 */
export async function getQueueSize(): Promise<number> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM request_queue"
  );
  return row?.count ?? 0;
}

/**
 * Start listening for connectivity changes and process queue on reconnect.
 */
export function startQueueProcessor(): () => void {
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      processQueue().catch(() => {});
    }
  });
  return unsubscribe;
}
