# Terminal Handoff Prompt 4: AI Brief Generation

## Goal
Build the AI synthesis engine that takes enriched TerminalEvent records (with populated enrichmentPackage from Prompt 3) and generates structured intelligence briefs using Claude Sonnet. Each brief is a Bloomberg-style, bullet-point summary designed for 10-second scanning. This prompt creates the system prompt, the API call pattern, and the processing endpoint.

## Project
Repo: VettdRE (this repo)
Target files: `src/lib/terminal-ai.ts` (new), `src/lib/terminal-prompts.ts` (new), `src/app/api/terminal/generate-briefs/route.ts` (new)

## Discovery Instructions
Before writing any code, read the following files to understand existing AI patterns:

1. `src/lib/leasing-engine.ts` — Study the Anthropic API call pattern:
   - How the Anthropic client is instantiated (singleton)
   - Model string used: `claude-sonnet-4-5-20250514`
   - How system prompts are passed
   - How max_tokens is set
   - Error handling on API failures

2. `src/lib/email-parser.ts` — Study the simpler AI call pattern:
   - Inline system prompt (not dynamic)
   - JSON-only output instruction
   - How the response is parsed
   - max_tokens: 500 (lean)

3. `src/lib/leasing-prompt.ts` — Study the dynamic prompt builder pattern. While Terminal uses inline prompts, the tone/voice directives here are instructive.

4. `src/lib/ai-assumptions.ts` — Another AI integration that takes structured data and generates structured output. Similar to what Terminal does.

5. `prisma/schema.prisma` — Find TerminalEvent. The `aiBrief` field (String? @db.Text) is where the generated brief is stored.

6. `src/lib/terminal-enrichment.ts` (created in Prompt 3) — Understand the EnrichmentPackage schema so you know what data the AI receives.

**Propose your plan before writing any code.**

## Implementation Intent

### 1. System Prompt (`src/lib/terminal-prompts.ts`)

Create a system prompt constant that enforces the Bloomberg Terminal voice. This is a fixed prompt — not dynamically generated per event.

Key directives to encode in the system prompt:

**Voice:**
- Institutional, data-dense, zero editorial commentary
- Never use: "notably," "interestingly," "it's worth noting," "in a significant move," "significant," "exciting"
- State facts. No throat-clearing. No hedging. No filler.
- Professional real estate terminology without explanation: cap rate, GBA, FAR, NTA, basis per unit, debt yield, Class C violation, lis pendens, UCC-1

**Format — Tier 1 Brief:**
```
■ {EVENT_TYPE}  |  {address}, {borough_name}  |  {BBL}
  {core_metrics_line}
  {parties_line}
  _______________________________________________
  · {context_bullet_1}
  · {context_bullet_2}
  · {context_bullet_3}
  ...up to 8 context bullets
```

**Format — Tier 2 Brief:**
```
▸ {EVENT_TYPE}  |  {address}, {borough_name}  |  {BBL}
  {summary_line}
  · {context_bullet_1}
  · {context_bullet_2}
  · {context_bullet_3}
```

**Data integrity rules:**
- ONLY reference data present in the enrichment package. Never speculate, infer motivation, or predict outcomes.
- If a data point is missing, omit it silently — never say "data not available" or "unknown"
- Perform calculations: price per unit, price per square foot, hold period (years between acquisition and sale), implied gain/loss (% change from acquisition price), comp differential (% above/below NTA average), unused FAR in square feet

**Color metadata:**
Return a JSON object alongside the brief text:
```json
{
  "brief": "the formatted brief text",
  "colorTags": [
    { "text": "3 open Class C HPD violations", "color": "red" },
    { "text": "421-a exemption expires 2028", "color": "amber" },
    { "text": "SALE RECORDED", "color": "green" }
  ],
  "headline": "short 1-line summary for notifications"
}
```

Also create event-type-specific prompt fragments. For example:
- **Sale events**: Include price/unit, price/sqft, hold period, implied gain/loss, buyer portfolio intel, NTA comp differential
- **Permit events**: Include estimated job cost, job type description, current FAR vs max FAR, existing violations
- **Violation events**: Include violation class, open violation count, whether SWO is active, recent permit activity (are they fixing it?)

### 2. AI Call Function (`src/lib/terminal-ai.ts`)

Create `generateBrief(event: TerminalEvent): Promise<BriefResult>`:

1. Parse the event's enrichmentPackage
2. Select the appropriate prompt fragment based on event type
3. Construct the user message: inject the enrichment package as formatted JSON
4. Call Anthropic API:
   - Model: `claude-sonnet-4-5-20250514`
   - max_tokens: 2000 (Tier 1) or 800 (Tier 2)
   - System prompt: the Bloomberg voice prompt + event-type-specific fragment
   - Temperature: 0 (we want deterministic, factual output)
5. Parse the response as JSON (brief + colorTags + headline)
6. Return the structured result

**Error handling:**
- If API call fails, return null and set metadata.briefError on the event
- If response isn't valid JSON, try to extract the brief text and return with empty colorTags
- Add retry logic: 1 retry with 2-second delay on 500/529 errors

### 3. Processing Endpoint (`src/app/api/terminal/generate-briefs/route.ts`)

Create a GET endpoint that:
1. Validates CRON_SECRET bearer token
2. Queries TerminalEvent where `enrichmentPackage IS NOT NULL` AND `aiBrief IS NULL` AND `tier IN (1, 2)`, ordered by detectedAt DESC, limit 30
3. For each event, calls `generateBrief()`
4. Updates the TerminalEvent: set `aiBrief` to the brief text, store colorTags and headline in `metadata`
5. Returns summary: briefs generated, errors, total tokens used, duration

**Rate management:**
- Process sequentially (not parallel) to avoid Anthropic API rate limits
- Add 200ms delay between calls
- If Anthropic returns 429, stop processing and return partial results
- Log estimated token usage per brief for cost monitoring

### 4. Brief Result Type

```typescript
interface BriefResult {
  brief: string;           // The formatted brief text
  colorTags: Array<{
    text: string;          // Text substring to highlight
    color: 'green' | 'red' | 'amber' | 'blue' | 'neutral';
  }>;
  headline: string;        // 1-line summary for notifications/cards
  tokensUsed: {
    input: number;
    output: number;
  };
}
```

## Constraints
- Use the same Anthropic SDK and model string as leasing-engine.ts: `claude-sonnet-4-5-20250514`
- Use `@anthropic-ai/sdk` — already installed, do NOT add a new dependency
- Temperature: 0 (deterministic output for data synthesis)
- System prompt must explicitly instruct: return ONLY valid JSON, no markdown, no explanation
- The brief text itself uses plain text with Unicode symbols (■, ▸, ·, ─) — NOT markdown
- Process max 30 events per cron invocation (each takes ~3 seconds = ~90 seconds total)
- Do NOT stream responses — use standard messages.create()
- Store colorTags in the event's metadata Json field, not in aiBrief (which is plain text for display)
- The system prompt should be < 1500 tokens to leave room for the enrichment package
- All files use `"use server"` where needed for Next.js server-side execution
