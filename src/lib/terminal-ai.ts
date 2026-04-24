/**
 * Terminal AI Brief Generator
 *
 * Template-first: generates briefs from structured data for 99%+ of events.
 * Falls back to Claude Haiku 4.5 for edge cases where templates return null.
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./terminal-prompts";
import { generateTemplateBrief } from "./terminal-brief-templates";
import type { EnrichmentPackage } from "./terminal-enrichment";

const AI_MODEL = "claude-haiku-4-5-20251001";
const TIER1_MAX_TOKENS = 2000;
const TIER2_MAX_TOKENS = 800;
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 1;

// ── Types ─────────────────────────────────────────────────────

export interface BriefResult {
  brief: string;
  colorTags: Array<{
    text: string;
    color: "green" | "red" | "amber" | "blue" | "neutral";
  }>;
  headline: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  source: "template" | "llm";
}

// ── Anthropic Client (singleton) ──────────────────────────────

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

// ── Color Tag Extraction ──────────────────────────────────────

function extractColorTags(brief: string, eventType: string): BriefResult["colorTags"] {
  const tags: BriefResult["colorTags"] = [];

  // Dollar amounts
  const dollarMatch = brief.match(/\$[\d.,]+[KMB]?/g);
  if (dollarMatch) {
    const color = eventType === "SALE_RECORDED" || eventType === "CERTIFICATE_OF_OCCUPANCY"
      ? "green" as const
      : eventType === "FORECLOSURE_FILED" || eventType === "TAX_LIEN_SOLD"
        ? "red" as const
        : "blue" as const;
    for (const m of dollarMatch) {
      tags.push({ text: m, color });
    }
  }

  // Violation classes
  const classMatch = brief.match(/Class [A-I]/g);
  if (classMatch) {
    for (const m of classMatch) {
      const cls = m.charAt(6);
      const color = cls === "C" || cls === "I" ? "red" as const : cls === "B" ? "amber" as const : "neutral" as const;
      tags.push({ text: m, color });
    }
  }

  return tags;
}

// ── Main Function ─────────────────────────────────────────────

interface GenerateBriefInput {
  id: string;
  eventType: string;
  bbl: string;
  tier: number;
  enrichmentPackage: EnrichmentPackage;
  metadata?: Record<string, any> | null;
  borough?: number;
  detectedAt?: string | Date;
}

/**
 * Generate a brief for a terminal event.
 * Tries deterministic templates first; falls back to Haiku for edge cases.
 */
export async function generateBrief(
  event: GenerateBriefInput,
): Promise<BriefResult | null> {
  const { eventType, bbl, tier, enrichmentPackage } = event;

  // ── Template path (free, instant) ───────────────────────────
  const templateBrief = generateTemplateBrief({
    eventType,
    bbl,
    borough: event.borough || 0,
    detectedAt: event.detectedAt || new Date(),
    metadata: event.metadata || null,
    enrichmentPackage,
  });

  if (templateBrief) {
    console.log(`[Terminal AI] Template hit for ${event.id} (${eventType})`);
    const colorTags = extractColorTags(templateBrief, eventType);
    return {
      brief: templateBrief,
      colorTags,
      headline: templateBrief.split(".")[0] || "",
      tokensUsed: { input: 0, output: 0 },
      source: "template",
    };
  }

  // ── LLM fallback (Haiku) ────────────────────────────────────
  console.log(`[Terminal AI] LLM fallback for ${event.id} (${eventType})`);
  const anthropic = getAnthropic();

  const systemPrompt = buildSystemPrompt(eventType, tier);
  const maxTokens = tier === 1 ? TIER1_MAX_TOKENS : TIER2_MAX_TOKENS;

  const userMessage = `Generate an intelligence brief for this NYC property event.

Event Type: ${eventType}
BBL: ${bbl}
Tier: ${tier}

Enrichment Data:
${JSON.stringify(enrichmentPackage, null, 2)}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: maxTokens,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text content in AI response");
      }

      const rawText = textBlock.text.trim()
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

      try {
        const parsed = JSON.parse(rawText);
        return {
          brief: parsed.brief || rawText,
          colorTags: Array.isArray(parsed.colorTags) ? parsed.colorTags : [],
          headline: parsed.headline || "",
          tokensUsed: { input: inputTokens, output: outputTokens },
          source: "llm",
        };
      } catch {
        console.warn(`[Terminal AI] Non-JSON response for event ${event.id}, using raw text`);
        return {
          brief: rawText,
          colorTags: [],
          headline: rawText.split("\n")[0]?.slice(0, 120) || "",
          tokensUsed: { input: inputTokens, output: outputTokens },
          source: "llm",
        };
      }
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));

      const status = err?.status || err?.statusCode;
      if ((status === 500 || status === 529) && attempt < MAX_RETRIES) {
        console.warn(`[Terminal AI] Retrying event ${event.id} after ${status} error (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      if (status === 429) {
        const rateLimitErr = new Error("RATE_LIMITED");
        (rateLimitErr as any).rateLimited = true;
        throw rateLimitErr;
      }

      break;
    }
  }

  console.error(`[Terminal AI] Brief generation failed for event ${event.id}:`, lastError);
  return null;
}
