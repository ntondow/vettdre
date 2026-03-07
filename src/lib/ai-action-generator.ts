// ============================================================
// AI Action Generator — Claude-powered email drafting
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import type { TriggerData } from "./automation-types";

let _anthropic: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

export interface AiEmailGenerationOptions {
  prompt: string;
  tone: string;
  triggerData: TriggerData;
  contactName: string;
  contactEmail: string;
}

export interface AiEmailResult {
  subject: string;
  bodyHtml: string;
  reasoning: string;
}

/**
 * Generate a personalized email using Claude AI.
 * Returns subject, HTML body, and reasoning for the content choice.
 */
export async function generateEmailWithAI(
  options: AiEmailGenerationOptions,
): Promise<AiEmailResult> {
  const client = getAnthropicClient();

  const systemPrompt = `You are a real estate CRM email composer for a NYC brokerage. Generate professional, personalized emails.

Tone: ${options.tone}
Recipient: ${options.contactName} <${options.contactEmail}>
Trigger context: ${JSON.stringify(options.triggerData, null, 2)}

Rules:
- Keep emails concise (3-5 paragraphs max)
- Use the recipient's first name if available
- Include a clear call to action
- Match the specified tone
- Do NOT include placeholder signatures — the system will add those

Return ONLY valid JSON with no markdown wrapping:
{
  "subject": "email subject line",
  "bodyHtml": "<p>HTML email body with paragraph tags</p>",
  "reasoning": "brief explanation of why this message is appropriate"
}`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: "user", content: options.prompt }],
  });

  const text =
    message.content[0]?.type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error("AI email generation: could not parse response JSON");
  }

  const result = JSON.parse(jsonMatch[0]);

  if (!result.subject || !result.bodyHtml) {
    throw new Error("AI email generation: missing subject or bodyHtml in response");
  }

  return {
    subject: result.subject,
    bodyHtml: result.bodyHtml,
    reasoning: result.reasoning || "No reasoning provided",
  };
}
