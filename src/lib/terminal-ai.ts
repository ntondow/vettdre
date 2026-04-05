/**
 * Terminal AI Brief Generator
 *
 * Takes enriched TerminalEvent records and generates Bloomberg-style
 * intelligence briefs via Claude Sonnet. Returns structured JSON with
 * brief text, color tags, and headline.
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./terminal-prompts";
import type { EnrichmentPackage } from "./terminal-enrichment";

const AI_MODEL = "claude-sonnet-4-5-20250514";
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
}

// ── Anthropic Client (singleton) ──────────────────────────────

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

// ── Main Function ─────────────────────────────────────────────

interface GenerateBriefInput {
  id: string;
  eventType: string;
  bbl: string;
  tier: number;
  enrichmentPackage: EnrichmentPackage;
}

/**
 * Generate a Bloomberg-style intelligence brief for a terminal event.
 * Returns null if generation fails (caller should record the error).
 */
export async function generateBrief(
  event: GenerateBriefInput,
): Promise<BriefResult | null> {
  const { eventType, bbl, tier, enrichmentPackage } = event;
  const anthropic = getAnthropic();

  const systemPrompt = buildSystemPrompt(eventType, tier);
  const maxTokens = tier === 1 ? TIER1_MAX_TOKENS : TIER2_MAX_TOKENS;

  // Build user message: the enrichment package as structured JSON
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

      // Extract text from response
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text content in AI response");
      }

      // Strip markdown code fences if Claude wraps the JSON
      const rawText = textBlock.text.trim()
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

      // Parse as JSON
      try {
        const parsed = JSON.parse(rawText);
        return {
          brief: parsed.brief || rawText,
          colorTags: Array.isArray(parsed.colorTags) ? parsed.colorTags : [],
          headline: parsed.headline || "",
          tokensUsed: { input: inputTokens, output: outputTokens },
        };
      } catch {
        // Response wasn't valid JSON — use raw text as brief
        console.warn(`[Terminal AI] Non-JSON response for event ${event.id}, using raw text`);
        return {
          brief: rawText,
          colorTags: [],
          headline: rawText.split("\n")[0]?.slice(0, 120) || "",
          tokensUsed: { input: inputTokens, output: outputTokens },
        };
      }
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Retry on 500/529 (overloaded) errors only
      const status = err?.status || err?.statusCode;
      if ((status === 500 || status === 529) && attempt < MAX_RETRIES) {
        console.warn(`[Terminal AI] Retrying event ${event.id} after ${status} error (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      // 429 = rate limited — signal caller to stop processing
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
