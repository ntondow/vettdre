/**
 * Google Workspace AI tool definitions for the leasing engine.
 * Provides calendar, email, and thread search tools via @googleworkspace/cli.
 *
 * TODO: Wire up the full gws CLI integration (gws.ts, gws-ai-agent.ts)
 */

import type Anthropic from "@anthropic-ai/sdk";

export const LEASING_GWS_TOOLS: Anthropic.Tool[] = [
  {
    name: "check_agent_calendar",
    description: "Check agent calendar availability for a given date range",
    input_schema: {
      type: "object" as const,
      properties: {
        startDate: { type: "string", description: "ISO start date" },
        endDate: { type: "string", description: "ISO end date" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "send_confirmation_email",
    description: "Send a tour confirmation email to a prospect",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "create_calendar_showing",
    description: "Create a calendar event for a property showing",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        startTime: { type: "string", description: "ISO datetime" },
        endTime: { type: "string", description: "ISO datetime" },
        location: { type: "string" },
        attendeeEmail: { type: "string" },
      },
      required: ["title", "startTime", "endTime"],
    },
  },
  {
    name: "search_email_thread",
    description: "Search for prior email conversations with a prospect",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
];

const GWS_TOOL_NAMES = new Set(LEASING_GWS_TOOLS.map((t) => t.name));

export function isGwsTool(name: string): boolean {
  return GWS_TOOL_NAMES.has(name);
}

export async function executeGwsTool(
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>,
  context: { orgId: string; userId?: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  // Stub implementation — returns informative message
  // TODO: Wire up actual gws CLI execution via gws.ts
  return {
    success: false,
    message: `Google Workspace tool "${toolName}" is not yet configured. Please set up Gmail OAuth in Settings → Gmail.`,
  };
}
