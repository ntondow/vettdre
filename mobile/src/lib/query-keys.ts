// ── React Query Key Factory ───────────────────────────────────
// Centralizes all query keys so invalidation and cache ops are predictable.
// Pattern: queryKeys.domain.action(params)
//
// Usage:
//   useQuery({ queryKey: qk.earnings.byPeriod("month"), ... })
//   queryClient.invalidateQueries({ queryKey: qk.earnings.all })

import type { EarningsPeriod } from "@/types";

export const qk = {
  earnings: {
    all: ["earnings"] as const,
    byPeriod: (period: EarningsPeriod = "month") =>
      ["earnings", period] as const,
  },

  schedule: {
    all: ["schedule"] as const,
    today: ["schedule", "today"] as const,
  },

  clients: {
    all: ["clients"] as const,
    detail: (id: string) => ["clients", id] as const,
  },

  activity: {
    recent: ["activity", "recent"] as const,
  },

  contacts: {
    all: ["contacts"] as const,
    list: (params?: { q?: string; status?: string; type?: string }) =>
      ["contacts", "list", params] as const,
    detail: (id: string) => ["contacts", id] as const,
  },

  pipeline: {
    all: ["pipeline"] as const,
    stage: (type: string, status: string) =>
      ["pipeline", "stage", type, status] as const,
  },

  notifications: {
    all: ["notifications"] as const,
  },

  agent: {
    profile: ["agent", "profile"] as const,
  },

  buildings: {
    saved: ["buildings", "saved"] as const,
  },
} as const;

/**
 * Flat list of top-level key prefixes that are safe to persist to SQLite.
 * Keep in sync with PERSISTABLE_KEYS in query-persistence.ts.
 */
export const PERSISTABLE_PREFIXES = [
  "earnings",
  "clients",
  "pipeline",
  "notifications",
  "schedule",
  "agent",
] as const;
