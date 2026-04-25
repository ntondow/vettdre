"use client";

/**
 * Terminal Realtime Hook
 *
 * Subscribes to Supabase Realtime (Postgres Changes) on the terminal_events
 * table. Fires a callback with new event IDs when INSERTs are detected.
 *
 * Prerequisites:
 *   1. Run scripts/enable-terminal-realtime.sql on the database
 *   2. wss://*.supabase.co in CSP connect-src (already configured)
 *
 * Notes:
 *   - Realtime sends raw Postgres column names (snake_case via @map)
 *   - Client-side filtering required (Realtime filters limited to eq on one column)
 *   - RLS not enforced on Realtime payloads — orgId check done client-side
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────

export type RealtimeStatus = "connecting" | "connected" | "disconnected" | "error";

interface RealtimePayload {
  // Raw Postgres column names (snake_case from @map directives)
  id: string;
  org_id: string;
  event_type: string;
  bbl: string;
  borough: number;
  detected_at: string;
  tier: number;
}

interface UseTerminalRealtimeOptions {
  orgId: string;
  boroughs: number[];
  categories: string[];
  enabled?: boolean;
  onNewEvents: (eventIds: string[]) => void;
}

// ── Debounce Buffer ──────────────────────────────────────────

const DEBOUNCE_MS = 500;
const MAX_BUFFER = 50;

// ── Hook ─────────────────────────────────────────────────────

export function useTerminalRealtime({
  orgId,
  boroughs,
  categories,
  enabled = true,
  onNewEvents,
}: UseTerminalRealtimeOptions): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const bufferRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNewEventsRef = useRef(onNewEvents);

  // Keep callback ref current without re-subscribing
  useEffect(() => {
    onNewEventsRef.current = onNewEvents;
  }, [onNewEvents]);

  const flush = useCallback(() => {
    if (bufferRef.current.length > 0) {
      const ids = [...bufferRef.current];
      bufferRef.current = [];
      onNewEventsRef.current(ids);
    }
    timerRef.current = null;
  }, []);

  // Stable filter refs to control re-subscription
  // Spread before sort to avoid mutating prop arrays (React state)
  const filtersKey = `${orgId}:${[...boroughs].sort().join(",")}:${[...categories].sort().join(",")}`;

  useEffect(() => {
    if (!enabled || !orgId) {
      setStatus("disconnected");
      return;
    }

    const supabase = createClient();
    setStatus("connecting");

    const channel = supabase
      .channel("terminal-events")
      .on<RealtimePayload>(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "terminal_events",
        },
        (payload) => {
          const row = payload.new;

          // Client-side filters (Realtime can't filter multiple columns)
          if (row.org_id !== orgId) return;
          if (boroughs.length > 0 && boroughs.length < 5 && !boroughs.includes(row.borough)) return;
          if (categories.length > 0 && !categories.includes(row.event_type)) return;

          // Buffer the event ID
          if (bufferRef.current.length < MAX_BUFFER) {
            bufferRef.current.push(row.id);
          }

          // Debounce: flush after DEBOUNCE_MS of quiet
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(flush, DEBOUNCE_MS);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setStatus("connected");
        } else if (status === "CLOSED") {
          setStatus("disconnected");
        } else if (status === "CHANNEL_ERROR") {
          setStatus("error");
        }
      });

    channelRef.current = channel;

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Flush any remaining buffered events
      if (bufferRef.current.length > 0) {
        flush();
      }
      supabase.removeChannel(channel);
      channelRef.current = null;
      setStatus("disconnected");
    };
    // Re-subscribe when filters change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, enabled, flush]);

  return status;
}
