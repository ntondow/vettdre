-- ============================================================
-- Enable Supabase Realtime for Terminal Events
--
-- This script adds the terminal_events table to Supabase's
-- Realtime publication so that INSERT events are broadcast
-- to connected WebSocket clients.
--
-- When to run:
--   After deploying the Terminal feature and creating the
--   terminal_events table via Prisma migration.
--   Run once on each environment (dev, staging, production).
--
-- How to run:
--   Option 1: Supabase Dashboard → SQL Editor → paste and run
--   Option 2: psql -h <supabase-host> -U postgres -d postgres -f scripts/enable-terminal-realtime.sql
--
-- Verification:
--   SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
--   Should show terminal_events in the list.
--
-- Notes:
--   - Supabase Realtime only works with tables in the supabase_realtime publication
--   - Only INSERT events are needed (ingestion creates rows, never updates for Realtime purposes)
--   - Enrichment UPDATEs are NOT streamed — the client fetches full event data via server action
--   - RLS is NOT enforced on Realtime payloads — client-side org filtering is required
-- ============================================================

-- Add terminal_events to the Realtime publication
-- Safe to run multiple times — Postgres ignores if already added
ALTER PUBLICATION supabase_realtime ADD TABLE "terminal_events";

-- Verify the table was added
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'terminal_events';
