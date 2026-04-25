"use server";

import prisma from "@/lib/prisma";
import { requireAdmin } from "../admin-actions";
import { ALL_DATASETS } from "@/lib/terminal-datasets";
import { runIngestion } from "@/lib/terminal-ingestion";
import { enrichTerminalEvent } from "@/lib/terminal-enrichment";
import { generateBrief } from "@/lib/terminal-ai";
import type { EnrichmentPackage } from "@/lib/terminal-enrichment";

// ── Types ─────────────────────────────────────────────────────

export interface DatasetHealth {
  datasetId: string;
  displayName: string;
  pollTier: string;
  lastCheckedAt: string | null;
  recordCount: number;
  status: string;
  lastError: string | null;
  eventsLast24h: number;
  pendingEnrichment: number;
  pendingBriefs: number;
  healthStatus: "healthy" | "warning" | "failed" | "stale";
}

export interface IngestionHealthSummary {
  totalEvents: number;
  eventsLast24h: number;
  pendingEnrichment: number;
  pendingBriefs: number;
  healthyDatasets: number;
  totalDatasets: number;
  datasets: DatasetHealth[];
}

export interface TriggerResult {
  success: boolean;
  message: string;
  details?: any;
}

// ── Health Data ──────────────────────────────��────────────────

export async function getIngestionHealth(): Promise<IngestionHealthSummary> {
  await requireAdmin();

  const now = Date.now();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

  // Fetch all data in parallel
  const [
    ingestionStates,
    totalEvents,
    eventsLast24h,
    pendingEnrichment,
    pendingBriefs,
    perDatasetEvents24h,
    perDatasetPendingEnrich,
    perDatasetPendingBriefs,
  ] = await Promise.all([
    prisma.ingestionState.findMany(),
    prisma.terminalEvent.count(),
    prisma.terminalEvent.count({
      where: { detectedAt: { gte: twentyFourHoursAgo } },
    }),
    prisma.terminalEvent.count({
      where: { enrichmentPackage: { equals: null }, tier: { in: [1, 2] } },
    }),
    prisma.terminalEvent.count({
      where: {
        enrichmentPackage: { not: { equals: null } },
        aiBrief: null,
        tier: { in: [1, 2] },
      },
    }),
    // Per-dataset events in last 24h
    prisma.terminalEvent.groupBy({
      by: ["sourceDataset"],
      where: { detectedAt: { gte: twentyFourHoursAgo } },
      _count: true,
    }),
    // Per-dataset pending enrichment
    prisma.terminalEvent.groupBy({
      by: ["sourceDataset"],
      where: { enrichmentPackage: { equals: null }, tier: { in: [1, 2] } },
      _count: true,
    }),
    // Per-dataset pending briefs
    prisma.terminalEvent.groupBy({
      by: ["sourceDataset"],
      where: {
        enrichmentPackage: { not: { equals: null } },
        aiBrief: null,
        tier: { in: [1, 2] },
      },
      _count: true,
    }),
  ]);

  const stateMap = new Map(ingestionStates.map((s) => [s.datasetId, s]));
  const events24hMap = new Map(perDatasetEvents24h.map((g) => [g.sourceDataset, g._count]));
  const enrichMap = new Map(perDatasetPendingEnrich.map((g) => [g.sourceDataset, g._count]));
  const briefsMap = new Map(perDatasetPendingBriefs.map((g) => [g.sourceDataset, g._count]));

  let healthyCount = 0;

  const datasets: DatasetHealth[] = ALL_DATASETS.map((ds) => {
    const state = stateMap.get(ds.datasetId);
    const lastCheckedAt = state?.lastCheckedAt?.toISOString() ?? null;

    // Determine health status
    let healthStatus: DatasetHealth["healthStatus"] = "healthy";
    if (state?.status === "error" && state.lastError) {
      const staleMs = state.lastCheckedAt ? now - state.lastCheckedAt.getTime() : Infinity;
      healthStatus = staleMs > 60 * 60 * 1000 ? "failed" : "warning";
    } else if (state?.lastCheckedAt) {
      const staleMs = now - state.lastCheckedAt.getTime();
      if (staleMs > 60 * 60 * 1000) {
        healthStatus = "stale";
      }
    } else {
      healthStatus = "stale"; // Never polled
    }

    if (healthStatus === "healthy") healthyCount++;

    return {
      datasetId: ds.datasetId,
      displayName: ds.displayName,
      pollTier: ds.pollTier,
      lastCheckedAt,
      recordCount: state?.recordCount ?? 0,
      status: state?.status ?? "unknown",
      lastError: state?.lastError ?? null,
      eventsLast24h: events24hMap.get(ds.datasetId) ?? 0,
      pendingEnrichment: enrichMap.get(ds.datasetId) ?? 0,
      pendingBriefs: briefsMap.get(ds.datasetId) ?? 0,
      healthStatus,
    };
  });

  return {
    totalEvents,
    eventsLast24h,
    pendingEnrichment,
    pendingBriefs,
    healthyDatasets: healthyCount,
    totalDatasets: datasets.length,
    datasets,
  };
}

// ── Manual Pipeline Triggers ─────────────────────────────────

export async function triggerPipelineStage(
  stage: "ingest" | "enrich" | "briefs",
): Promise<TriggerResult> {
  await requireAdmin();

  const start = Date.now();

  try {
    if (stage === "ingest") {
      // Resolve orgId same as ingest cron endpoint
      const org = await prisma.organization.findFirst({
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      if (!org) return { success: false, message: "No organization found" };

      const summary = await runIngestion(org.id);
      return {
        success: true,
        message: `Ingestion complete: ${summary.totalEventsCreated} events created, ${summary.datasetsPolled} polled in ${Date.now() - start}ms`,
        details: {
          datasetsPolled: summary.datasetsPolled,
          eventsCreated: summary.totalEventsCreated,
          durationMs: Date.now() - start,
        },
      };
    }

    if (stage === "enrich") {
      const events = await prisma.terminalEvent.findMany({
        where: { enrichmentPackage: { equals: null }, tier: { in: [1, 2] } },
        orderBy: { detectedAt: "desc" },
        take: 50,
      });

      let enriched = 0;
      let errored = 0;
      for (const event of events) {
        try {
          const result = await enrichTerminalEvent({
            id: event.id,
            eventType: event.eventType,
            bbl: event.bbl,
            borough: event.borough,
            tier: event.tier,
            detectedAt: event.detectedAt,
            metadata: event.metadata as Record<string, any>,
          });
          await prisma.terminalEvent.update({
            where: { id: event.id },
            data: {
              enrichmentPackage: result.enrichmentPackage as any,
              ntaCode: result.ntaCode,
            },
          });
          enriched++;
        } catch {
          errored++;
        }
      }

      return {
        success: true,
        message: `Enrichment complete: ${enriched} enriched, ${errored} errors in ${Date.now() - start}ms`,
        details: { enriched, errored, durationMs: Date.now() - start },
      };
    }

    if (stage === "briefs") {
      const events = await prisma.terminalEvent.findMany({
        where: {
          enrichmentPackage: { not: { equals: null } },
          aiBrief: null,
          tier: { in: [1, 2] },
        },
        orderBy: { detectedAt: "desc" },
        take: 30,
      });

      let generated = 0;
      let errored = 0;
      for (const event of events) {
        try {
          const result = await generateBrief({
            id: event.id,
            eventType: event.eventType,
            bbl: event.bbl,
            tier: event.tier,
            enrichmentPackage: event.enrichmentPackage as unknown as EnrichmentPackage,
          });
          if (result) {
            await prisma.terminalEvent.update({
              where: { id: event.id },
              data: {
                aiBrief: result.brief,
                metadata: {
                  ...(typeof event.metadata === "object" && event.metadata !== null ? event.metadata : {}),
                  _colorTags: result.colorTags,
                  _headline: result.headline,
                  _briefGeneratedAt: new Date().toISOString(),
                } as any,
              },
            });
            generated++;
          }
        } catch {
          errored++;
        }
        // Rate limit pause
        await new Promise((r) => setTimeout(r, 200));
      }

      return {
        success: true,
        message: `Brief generation complete: ${generated} generated, ${errored} errors in ${Date.now() - start}ms`,
        details: { generated, errored, durationMs: Date.now() - start },
      };
    }

    return { success: false, message: `Unknown stage: ${stage}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Pipeline error: ${message}` };
  }
}

// ── Error Management ─────────────────────────────────────────

export async function resetDatasetErrors(datasetId: string): Promise<TriggerResult> {
  await requireAdmin();

  // Verify the dataset exists in our registry
  const valid = ALL_DATASETS.some((ds) => ds.datasetId === datasetId);
  if (!valid) return { success: false, message: "Unknown dataset ID" };

  await prisma.ingestionState.upsert({
    where: { datasetId },
    update: { status: "idle", lastError: null },
    create: { datasetId, status: "idle" },
  });

  return { success: true, message: `Errors cleared for ${datasetId}` };
}
