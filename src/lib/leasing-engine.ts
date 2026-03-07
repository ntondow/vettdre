// ============================================================
// AI Leasing Agent — Conversation Engine (Core Orchestrator)
//
// Full pipeline: Inbound SMS → Route → AI → Respond → Update
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { getTwilio } from "@/lib/twilio";
import { generateSystemPrompt, generateConversationContext } from "@/lib/leasing-prompt";
import type { PromptConfig } from "@/lib/leasing-prompt";
import { getDailyLimit, normalizePhone } from "@/lib/leasing-types";
import { checkMessageLimit, checkLeasingFeature } from "@/lib/leasing-limits";
import { scheduleFollowUps, cancelPendingFollowUps, cancelCadence, scheduleFollowUpCadence } from "@/lib/leasing-followups";
import type { CadenceType } from "@/lib/leasing-followups";
import { addToWaitlist } from "@/lib/leasing-waitlist";
import { getLeasingAvailability, bookShowingSlot, getTopSlots } from "@/lib/leasing-calendar";
import type { TimeSlot } from "@/lib/leasing-calendar";
import { sendLeasingReply } from "@/lib/leasing-email";

// ── Email channel options ────────────────────────────────────

export interface EmailChannelOptions {
  channel: "email";
  prospectEmail: string;
  prospectName: string | null;
  emailSubject: string | null;
  ilsLead?: {
    source: "streeteasy" | "apartments_com" | "zillow";
    phone: string | null;
    moveInDate: string | null;
    bedrooms: number | null;
    listingRef: string | null;
    message: string | null;
  };
}

// ── Constants ─────────────────────────────────────────────────

const AI_MODEL = "claude-sonnet-4-5-20250514";
const MAX_HISTORY = 20;
const MAX_CLAUDE_CALLS = 2;
const CLAUDE_TIMEOUT_MS = 25_000;
const FALLBACK_MESSAGE = "Thanks for your message! Let me look into that and get back to you shortly.";
const BRIDGE_MESSAGE = "Let me check on that for you — one moment!";
const ERROR_RETRY_DELAY_MS = 30 * 60 * 1000; // 30 minutes
const ERROR_ESCALATION_THRESHOLD = 3;

// ── Spanish Language Detection (Heuristic) ──────────────────

const SPANISH_INDICATORS = /[¿¡ñáéíóúü]/i;
const SPANISH_WORDS = new Set([
  "hola", "buenas", "buenos", "apartamento", "habitación", "habitacion",
  "cuarto", "renta", "disponible", "cuánto", "cuanto", "cuesta",
  "quiero", "busco", "tengo", "necesito", "puedo", "ver",
]);

export type DetectedLanguage = "en" | "es" | "zh" | "ru" | "he" | "unknown";

export function detectLanguage(text: string): DetectedLanguage {
  // 1. Mandarin — CJK Unified Ideographs (\u4e00-\u9fff)
  const cjkMatches = text.match(/[\u4e00-\u9fff]/g);
  if (cjkMatches && cjkMatches.length >= 2) return "zh";

  // 2. Hebrew — Unicode range \u0590-\u05ff
  const hebrewMatches = text.match(/[\u0590-\u05ff]/g);
  if (hebrewMatches && hebrewMatches.length >= 2) return "he";

  // 3. Russian — Cyrillic characters \u0400-\u04ff
  const cyrillicMatches = text.match(/[\u0400-\u04ff]/g);
  if (cyrillicMatches && cyrillicMatches.length >= 3) return "ru";

  // 4. Spanish — existing heuristics
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, "")).filter(Boolean);

  let indicatorCount = 0;
  for (const char of text) {
    if (SPANISH_INDICATORS.test(char)) indicatorCount++;
  }

  let spanishWordCount = 0;
  for (const word of words) {
    if (SPANISH_WORDS.has(word)) spanishWordCount++;
  }

  if (indicatorCount >= 2 || spanishWordCount >= 1) return "es";

  // 5. Default
  if (words.length < 4 && indicatorCount === 0 && spanishWordCount === 0) return "unknown";
  return "en";
}

// ── Lead Source Detection ────────────────────────────────────

export type LeadSource =
  | "streeteasy"
  | "apartments_com"
  | "zillow"
  | "craigslist"
  | "direct_sms"
  | "direct_email"
  | "web_chat"
  | "unknown";

export const SOURCE_SCORE_WEIGHTS: Record<LeadSource, number> = {
  streeteasy: 15,
  apartments_com: 12,
  zillow: 10,
  direct_sms: 10,
  direct_email: 8,
  web_chat: 5,
  craigslist: 5,
  unknown: 0,
};

const SOURCE_LABEL_MAP: Record<LeadSource, string> = {
  streeteasy: "StreetEasy",
  apartments_com: "Apartments.com",
  zillow: "Zillow",
  craigslist: "Craigslist",
  direct_sms: "Direct SMS",
  direct_email: "Direct Email",
  web_chat: "Web Chat",
  unknown: "Unknown",
};

const VALID_SOURCES = new Set<string>(Object.keys(SOURCE_SCORE_WEIGHTS));

export function detectLeadSource(
  message: string,
  channel: string,
  metadata?: Record<string, string>,
  defaultSource?: string,
): LeadSource {
  // 1. Explicit metadata source (from web chat widget URL param, etc.)
  if (metadata?.source && VALID_SOURCES.has(metadata.source)) {
    return metadata.source as LeadSource;
  }

  // 2. Text heuristics (case-insensitive)
  const lower = message.toLowerCase();
  if (lower.includes("streeteasy") || lower.includes("street easy")) return "streeteasy";
  if (lower.includes("apartments.com") || lower.includes("apartmentscom")) return "apartments_com";
  if (lower.includes("zillow")) return "zillow";
  if (lower.includes("craigslist") || lower.includes("craigs list") || /\bCL\b/.test(message)) return "craigslist";

  // 3. Config default source
  if (defaultSource && VALID_SOURCES.has(defaultSource)) {
    return defaultSource as LeadSource;
  }

  // 4. Channel fallback
  if (channel === "sms") return "direct_sms";
  if (channel === "email") return "direct_email";
  if (channel === "web_chat") return "web_chat";

  return "unknown";
}

export { SOURCE_LABEL_MAP };

// ── Budget Concern Detection ──────────────────────────────────

const PRICE_OBJECTION_PHRASES = [
  "too expensive", "too much", "over my budget", "out of my budget",
  "can't afford", "cannot afford", "cant afford", "bit pricey",
  "a little high", "a bit high", "more than i wanted", "more than i was hoping",
  "that's a lot", "thats a lot", "pretty steep", "kind of steep",
];

const NEGOTIATION_PHRASES = [
  "can you do better", "any flexibility", "negotiate", "lower the rent",
  "come down on", "discount", "deal on", "concession",
  "free month", "first month free",
];

const BUDGET_MENTION_PATTERNS = [
  /my budget is/i,
  /budget of/i,
  /looking to spend/i,
  /can only spend/i,
  /max(?:imum)? is/i,
];

export function detectBudgetConcern(message: string): boolean {
  const lower = message.toLowerCase();

  for (const phrase of PRICE_OBJECTION_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  for (const phrase of NEGOTIATION_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  for (const pattern of BUDGET_MENTION_PATTERNS) {
    if (pattern.test(message)) return true;
  }

  return false;
}

// ── Concession Condition Checking ─────────────────────────────

export interface ActiveConcession {
  type: "free_months" | "waived_fee" | "gift_card" | "custom";
  value: string;
  description: string;
  ruleIndex: number;
}

// Map trigger names to concession types for ActiveConcession.type
function inferConcessionType(name: string): ActiveConcession["type"] {
  const lower = name.toLowerCase();
  if (lower.includes("free") && lower.includes("month")) return "free_months";
  if (lower.includes("waive") || lower.includes("fee")) return "waived_fee";
  if (lower.includes("gift") || lower.includes("card")) return "gift_card";
  return "custom";
}

export async function checkConcessionConditions(
  conversationId: string,
  configId: string,
  qualData: Record<string, any>,
  buildingKnowledge: Record<string, any>,
): Promise<ActiveConcession | null> {
  // Master toggle
  if (!buildingKnowledge.concessionsEnabled) return null;

  const concessions = buildingKnowledge.concessions;
  if (!Array.isArray(concessions) || concessions.length === 0) return null;

  // Already offered in this conversation
  if (qualData.concessionOffered === true) return null;

  for (let i = 0; i < concessions.length; i++) {
    const rule = concessions[i];
    if (!rule?.name || !rule?.value) continue;

    const trigger = rule.trigger || "any";

    // Check trigger condition
    let triggerMet = false;
    switch (trigger) {
      case "price_objection":
        triggerMet = qualData.hasBudgetConcern === true;
        break;
      case "competitor_mention":
        triggerMet = qualData.hasCompetitorMention === true;
        break;
      case "move_in_30_days": {
        // If move-in date is known and within 30 days
        const moveIn = qualData.moveInDate;
        if (moveIn) {
          try {
            const moveDate = new Date(moveIn);
            const daysAway = (moveDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            triggerMet = daysAway >= 0 && daysAway <= 30;
          } catch {
            triggerMet = false;
          }
        }
        break;
      }
      case "first_visit":
      case "referred_prospect":
        // These triggers are assumed met if configured (can't verify from chat alone)
        triggerMet = true;
        break;
      case "multiple_tours":
        triggerMet = (qualData.tourCount || 0) >= 2;
        break;
      case "any":
        triggerMet = qualData.hasBudgetConcern === true;
        break;
      default:
        triggerMet = qualData.hasBudgetConcern === true;
    }

    if (!triggerMet) continue;

    // Check maxPerMonth usage
    const maxPerMonth = rule.maxPerMonth || 0;
    if (maxPerMonth > 0) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const usageCount = await prisma.leasingConversation.count({
        where: {
          configId,
          qualData: { path: ["concessionUsed"], equals: i },
          updatedAt: { gte: monthStart },
        },
      });

      if (usageCount >= maxPerMonth) continue;
    }

    return {
      type: inferConcessionType(rule.name),
      value: rule.value,
      description: `${rule.name}: ${rule.value}`,
      ruleIndex: i,
    };
  }

  return null;
}

// ── Anthropic Client (lazy) ───────────────────────────────────

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

// ── Tool Definitions ──────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "check_availability",
    description: "Check which units are currently available at this property. Call this when a prospect asks about availability, pricing, or specific unit types.",
    input_schema: {
      type: "object" as const,
      properties: {
        bedrooms: { type: "integer", description: "Filter by bedroom count" },
        maxPrice: { type: "number", description: "Filter by max monthly rent" },
        moveInBy: { type: "string", description: "Filter by available-by date (ISO)" },
      },
    },
  },
  {
    name: "suggest_showing",
    description: "Suggest a showing time to the prospect. Call this when the prospect expresses interest in seeing a unit. For Pro tier: if available_slots were returned by check_availability, and the prospect has chosen a slot, include confirmed_slot_index to auto-book. For free tier: suggest times and tell the prospect you'll confirm shortly.",
    input_schema: {
      type: "object" as const,
      properties: {
        listingId: { type: "string", description: "The listing they want to see" },
        suggestedTimes: { type: "array", items: { type: "string" }, description: "2-3 suggested datetime slots (ISO)" },
        prospectName: { type: "string" },
        prospectPhone: { type: "string" },
        confirmed_slot_index: { type: "integer", description: "0, 1, or 2 — which available_slot the prospect chose. Pro/Team only. Set this only when the prospect explicitly picks a slot." },
      },
    },
  },
  {
    name: "update_lead_info",
    description: "Update what we know about this prospect based on the conversation. Call this whenever the prospect reveals qualification information.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        budget: { type: "number" },
        moveInDate: { type: "string" },
        bedroomsNeeded: { type: "integer" },
        householdSize: { type: "integer" },
        hasPets: { type: "boolean" },
        petDetails: { type: "string" },
        employmentStatus: { type: "string" },
        currentSituation: { type: "string" },
        leadScore: { type: "integer", description: "Updated lead score 0-100" },
        leadTemperature: { type: "string", enum: ["hot", "warm", "cool", "cold"] },
        interestedListingIds: { type: "array", items: { type: "string" } },
        waitlist: { type: "boolean", description: "Set true when prospect agrees to join the waitlist" },
        preferredUnitTypes: { type: "array", items: { type: "string" }, description: "Preferred unit types e.g. ['1BR', '2BR', 'Studio']" },
      },
    },
  },
  {
    name: "escalate",
    description: "Escalate this conversation to the landlord/property manager. Call this for price negotiations, eviction disclosures, legal questions, angry prospects, or anything you're not confident handling.",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: {
          type: "string",
          enum: ["price_negotiation", "prior_eviction", "legal_question", "angry_prospect", "human_request", "application_question", "ai_uncertain"],
        },
        summary: { type: "string", description: "Brief summary for the landlord of what happened and what the prospect needs" },
      },
      required: ["reason", "summary"],
    },
  },
  {
    name: "update_conversation_summary",
    description: "Update the running summary of this conversation. Call this at the end of every exchange.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: { type: "string", description: "2-3 sentence summary of the conversation so far including prospect needs, interest level, and next steps" },
      },
      required: ["summary"],
    },
  },
];

// ── Escalation Reason Mapping ─────────────────────────────────

const ESCALATION_REASON_MAP: Record<string, string> = {
  price_negotiation: "budget_mismatch",
  prior_eviction: "complex_question",
  legal_question: "complex_question",
  angry_prospect: "complaint",
  human_request: "manual",
  application_question: "application_ready",
  ai_uncertain: "complex_question",
};

// ============================================================
// Inventory State Detection
// ============================================================

export interface InventoryState {
  hasAvailable: boolean;
  totalUnits: number;
  availableCount: number;
  soonAvailableCount: number; // available within 60 days
}

export async function checkInventoryState(configId: string): Promise<InventoryState> {
  const config = await prisma.leasingConfig.findUnique({
    where: { id: configId },
    select: { propertyId: true, orgId: true },
  });
  if (!config) return { hasAvailable: false, totalUnits: 0, availableCount: 0, soonAvailableCount: 0 };

  const [total, available, soonAvailable] = await Promise.all([
    prisma.bmsListing.count({
      where: { orgId: config.orgId, propertyId: config.propertyId },
    }),
    prisma.bmsListing.count({
      where: { orgId: config.orgId, propertyId: config.propertyId, status: { in: ["available", "showing"] } },
    }),
    prisma.bmsListing.count({
      where: {
        orgId: config.orgId,
        propertyId: config.propertyId,
        status: { notIn: ["available", "showing"] },
        availableDate: { lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  return {
    hasAvailable: available > 0,
    totalUnits: total,
    availableCount: available,
    soonAvailableCount: soonAvailable,
  };
}

// ============================================================
// processInboundMessage — Main pipeline
// ============================================================

export async function processInboundMessage(
  rawFrom: string,
  rawTo: string,
  body: string,
  messageSid: string,
  emailOptions?: EmailChannelOptions,
): Promise<void> {
  const isEmail = emailOptions?.channel === "email";
  const from = isEmail ? emailOptions.prospectEmail : normalizePhone(rawFrom);
  const to = isEmail ? rawTo : normalizePhone(rawTo);

  // 1. Route to property — by Twilio number (SMS) or by config ID (email)
  let config: any;

  if (isEmail) {
    // Email: "to" is the configId passed from the webhook
    config = await prisma.leasingConfig.findFirst({
      where: { id: to, isActive: true },
      include: {
        property: {
          include: {
            listings: { orderBy: { createdAt: "desc" } },
          },
        },
        twilioNumber: true,
      },
    });
  } else {
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: { number: to, status: "active" },
    });
    if (!phoneNumber) {
      console.log(`[LEASING] No phone number found for ${to}`);
      return;
    }

    config = await prisma.leasingConfig.findFirst({
      where: { twilioNumberId: phoneNumber.id, isActive: true },
      include: {
        property: {
          include: {
            listings: { orderBy: { createdAt: "desc" } },
          },
        },
        twilioNumber: true,
      },
    });
  }

  if (!config) {
    console.log(`[LEASING] No active config for ${isEmail ? "email" : "number"} ${to}`);
    return;
  }

  console.log("[LEASING] Inbound", { from, to, configId: config.id, channel: isEmail ? "email" : "sms" });

  const qualCriteria = (config.qualCriteria && typeof config.qualCriteria === "object")
    ? config.qualCriteria as Record<string, any>
    : {};

  // Check if this is a landlord replying to an escalation (SMS only)
  const rawEscalationPhone = qualCriteria.escalationPhone || config.property.landlordPhone;
  const escalationPhone = rawEscalationPhone ? normalizePhone(rawEscalationPhone) : null;
  if (!isEmail && escalationPhone && from === escalationPhone) {
    await processLandlordReply(from, to, body, config.id, config.orgId);
    return;
  }

  // 2. Check daily limits via limits module
  const limitCheck = await checkMessageLimit(config.id);

  if (!limitCheck.allowed) {
    // Over limit — save the message as queued but don't respond
    const conv = isEmail
      ? await getOrCreateEmailConversation(config.id, config.orgId, from, emailOptions?.prospectName || null, emailOptions?.emailSubject || null)
      : await getOrCreateConversation(config.id, config.orgId, from);
    await prisma.leasingMessage.create({
      data: {
        conversationId: conv.id,
        sender: "prospect",
        channel: isEmail ? "email" : "sms",
        body,
        twilioSid: messageSid,
        intentDetected: "__rate_limited__",
      },
    });
    console.log(`[LEASING] Daily limit reached for config ${config.id} (${limitCheck.used}/${limitCheck.limit})`);
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 3. Load/create conversation
  const conversation = isEmail
    ? await getOrCreateEmailConversation(config.id, config.orgId, from, emailOptions?.prospectName || null, emailOptions?.emailSubject || null)
    : await getOrCreateConversation(config.id, config.orgId, from);

  // 4. Save inbound message
  await prisma.leasingMessage.create({
    data: {
      conversationId: conversation.id,
      sender: "prospect",
      channel: isEmail ? "email" : "sms",
      body,
      twilioSid: messageSid,
    },
  });

  // 5. If escalated and not resolved, forward to landlord
  if (conversation.status === "escalated" && conversation.escalatedAt && escalationPhone) {
    const prospectLabel = conversation.prospectName || from;
    const fwdBody = `📱 ${prospectLabel}: "${body}"`;
    try {
      const twilio = getTwilio();
      await twilio.messages.create({
        body: fwdBody,
        from: to, // AI's number
        to: escalationPhone,
      });
    } catch (err) {
      console.error("[LEASING] Failed to forward escalated message:", err);
    }
    // Update usage
    await incrementUsage(config.id, today, { inbound: 1 });
    return;
  }

  // 5b. Language detection + locking
  const qualData = (conversation.qualData as Record<string, any>) || {};
  let detectedLanguage: string = qualData.detectedLanguage || "en";

  if (!qualData.languageLockedAt) {
    // Language not yet locked — run detection
    const langResult = detectLanguage(body);
    const languagesArr = Array.isArray(config.languages) ? config.languages : [];
    const langConfigured = (lang: string) => languagesArr.includes(lang) || languagesArr.length === 0;

    if (langResult === "es") {
      const spanishEnabled = langConfigured("es") && await checkLeasingFeature(config.id, "spanish_language");
      detectedLanguage = spanishEnabled ? "es" : "en";
      await prisma.leasingConversation.update({
        where: { id: conversation.id },
        data: { qualData: { ...qualData, detectedLanguage, languageLockedAt: (qualData.messageCount || 0) + 1 } },
      });
    } else if (langResult === "zh" || langResult === "ru" || langResult === "he") {
      const multiLangEnabled = langConfigured(langResult) && await checkLeasingFeature(config.id, "multi_language");
      detectedLanguage = multiLangEnabled ? langResult : "en";
      await prisma.leasingConversation.update({
        where: { id: conversation.id },
        data: { qualData: { ...qualData, detectedLanguage, languageLockedAt: (qualData.messageCount || 0) + 1 } },
      });
    } else if (langResult === "en") {
      detectedLanguage = "en";
      await prisma.leasingConversation.update({
        where: { id: conversation.id },
        data: { qualData: { ...qualData, detectedLanguage: "en", languageLockedAt: (qualData.messageCount || 0) + 1 } },
      });
    }
    // If "unknown" — don't lock yet, try again on next message
  }

  // 5c. Lead source detection (first message only)
  if (!qualData.source) {
    try {
      const channel = isEmail ? "email" : "sms";
      const bk = (config.buildingKnowledge && typeof config.buildingKnowledge === "object")
        ? config.buildingKnowledge as Record<string, any>
        : {};
      const source = detectLeadSource(body, channel, undefined, bk.defaultSource);
      const scoreBoost = SOURCE_SCORE_WEIGHTS[source] || 0;
      const currentScore = (qualData.leadScore as number) || 0;

      // Re-read qualData in case language detection updated it
      const freshConv = await prisma.leasingConversation.findUnique({ where: { id: conversation.id } });
      const freshQualData = (freshConv?.qualData as Record<string, any>) || qualData;

      await prisma.leasingConversation.update({
        where: { id: conversation.id },
        data: {
          qualData: {
            ...freshQualData,
            source,
            leadScore: currentScore + scoreBoost,
          },
        },
      });
    } catch (err) {
      console.error("[LEASING] Source detection failed (silent):", err);
    }
  }

  // 5d. ILS lead pre-population (first message from ILS email)
  if (emailOptions?.ilsLead && !qualData.ilsPopulated) {
    try {
      const ils = emailOptions.ilsLead;
      const freshConv = await prisma.leasingConversation.findUnique({ where: { id: conversation.id } });
      const freshQD = (freshConv?.qualData as Record<string, any>) || {};

      const ilsQualUpdate: Record<string, any> = {
        ...freshQD,
        ilsPopulated: true,
        ilsSource: ils.source,
        source: ils.source, // override generic source with specific ILS
        leadScore: (freshQD.leadScore || 0) + (SOURCE_SCORE_WEIGHTS[ils.source] || 0) - (freshQD.source ? (SOURCE_SCORE_WEIGHTS as Record<string, number>)[freshQD.source] || 0 : 0),
      };
      if (ils.moveInDate) ilsQualUpdate.moveInDate = ils.moveInDate;
      if (ils.bedrooms !== null) ilsQualUpdate.bedrooms = ils.bedrooms;
      if (ils.listingRef) ilsQualUpdate.listingRef = ils.listingRef;
      if (ils.message) ilsQualUpdate.ilsMessage = ils.message;

      const convUpdate: Record<string, any> = { qualData: ilsQualUpdate };
      // Update phone if ILS provided one and we only have a placeholder
      if (ils.phone && conversation.prospectPhone?.startsWith("email_")) {
        convUpdate.prospectPhone = ils.phone;
      }

      await prisma.leasingConversation.update({
        where: { id: conversation.id },
        data: convUpdate,
      });
    } catch (err) {
      console.error("[LEASING] ILS pre-population failed (silent):", err);
    }
  }

  // 5e. Budget concern detection + concession check
  let activeConcession: ActiveConcession | null = null;
  if (detectBudgetConcern(body)) {
    try {
      const freshConv2 = await prisma.leasingConversation.findUnique({ where: { id: conversation.id } });
      const freshQD2 = (freshConv2?.qualData as Record<string, any>) || {};
      if (!freshQD2.hasBudgetConcern) {
        await prisma.leasingConversation.update({
          where: { id: conversation.id },
          data: { qualData: { ...freshQD2, hasBudgetConcern: true } },
        });
      }
    } catch (err) {
      console.error("[LEASING] Budget concern flag failed (silent):", err);
    }
  }

  // Re-read qualData after all step-5 updates
  const freshConvForConcession = await prisma.leasingConversation.findUnique({ where: { id: conversation.id } });
  const latestQualData = (freshConvForConcession?.qualData as Record<string, any>) || {};

  if (latestQualData.hasBudgetConcern) {
    try {
      const bk = (config.buildingKnowledge && typeof config.buildingKnowledge === "object")
        ? config.buildingKnowledge as Record<string, any>
        : {};
      activeConcession = await checkConcessionConditions(conversation.id, config.id, latestQualData, bk);
    } catch (err) {
      console.error("[LEASING] Concession check failed (silent):", err);
    }
  }

  // 6. Build AI context
  const invState = await checkInventoryState(config.id);

  const promptConfig: PromptConfig = {
    aiName: config.aiName,
    aiTone: config.aiTone,
    greeting: config.greeting,
    personality: config.personality,
    customInstructions: config.customInstructions,
    buildingKnowledge: config.buildingKnowledge,
    autoEnrichmentData: config.autoEnrichmentData,
    qualCriteria: config.qualCriteria,
    officeHoursStart: config.officeHoursStart,
    officeHoursEnd: config.officeHoursEnd,
    timezone: config.timezone,
    property: config.property,
    channel: isEmail ? "email" : "sms",
    detectedLanguage: detectedLanguage !== "en" ? detectedLanguage : undefined,
    ...(!invState.hasAvailable
      ? {
          inventoryState: {
            hasAvailable: false,
            totalUnits: invState.totalUnits,
            availableCount: invState.availableCount,
            soonAvailableCount: invState.soonAvailableCount,
          },
        }
      : {}),
  };

  const systemPrompt = generateSystemPrompt(promptConfig);

  // Reload conversation with listing for context
  const convWithRelations = await prisma.leasingConversation.findUnique({
    where: { id: conversation.id },
    include: {
      listing: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  let conversationContext = convWithRelations
    ? generateConversationContext(convWithRelations)
    : "";

  // Inject concession context if available
  if (activeConcession) {
    conversationContext += `\nCONCESSION AVAILABLE: You may offer the following concession if the prospect expresses price concern in this message: ${activeConcession.description}. Frame it as: "Good news — we're currently offering ${activeConcession.value} for qualified residents." Only offer it once. Do not mention it if the prospect hasn't expressed price concern.`;
  }

  // 7. Build message history
  const history = await buildMessageHistory(conversation.id, MAX_HISTORY);

  // Prepend conversation context as a system-level user message if we have context
  const messages: Anthropic.MessageParam[] = [];
  if (conversationContext) {
    messages.push({ role: "user", content: `[SYSTEM CONTEXT]\n${conversationContext}\n\n[END SYSTEM CONTEXT]\n\nProspect's message:\n${history.length > 0 ? "" : body}` });
    if (history.length === 0) {
      // First message — no history, context + message in one
    } else {
      messages[0] = { role: "user", content: `[SYSTEM CONTEXT]\n${conversationContext}\n[END SYSTEM CONTEXT]` };
      messages.push({ role: "assistant", content: "Understood. I have the conversation context." });
      messages.push(...history);
    }
  } else {
    messages.push(...history);
  }

  // Ensure messages alternate correctly and end with user role
  const cleanedMessages = ensureAlternating(messages);

  // 8. Call Claude API with timeout and error fallback
  let aiResponseText = "";
  let toolsUsed: string[] = [];
  let tokensUsed = 0;
  let confidenceScore: number | null = null;
  let isErrorFallback = false;

  console.log("[LEASING] Claude call", { conversationId: conversation.id, historyLength: cleanedMessages.length, toolCount: TOOLS.length });
  const claudeStartMs = Date.now();

  try {
    const anthropic = getAnthropic();
    let callCount = 0;
    let currentMessages = [...cleanedMessages];

    while (callCount < MAX_CLAUDE_CALLS) {
      callCount++;

      const response = await anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: 512,
        system: systemPrompt,
        messages: currentMessages,
        tools: TOOLS,
      }, { timeout: CLAUDE_TIMEOUT_MS });

      tokensUsed += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

      // Process response content blocks
      let hasToolUse = false;
      const toolResults: Anthropic.MessageParam[] = [];

      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) {
          aiResponseText = block.text.trim();
        } else if (block.type === "tool_use") {
          hasToolUse = true;
          toolsUsed.push(block.name);

          const toolResult = await executeToolCall(
            block.name,
            block.input as Record<string, any>,
            config,
            conversation,
            from,
            to,
            escalationPhone,
          );

          // Accumulate tool results
          if (toolResults.length === 0) {
            // Add the assistant's full response first
            toolResults.push({ role: "assistant" as const, content: response.content as Anthropic.ContentBlock[] });
          }

          // Add tool result
          const existingUserMsg = toolResults.find(
            (m) => m.role === "user" && Array.isArray(m.content),
          );
          const toolResultBlock: Anthropic.ToolResultBlockParam = {
            type: "tool_result",
            tool_use_id: block.id,
            content: toolResult,
          };

          if (existingUserMsg && Array.isArray(existingUserMsg.content)) {
            (existingUserMsg.content as Anthropic.ToolResultBlockParam[]).push(toolResultBlock);
          } else {
            toolResults.push({
              role: "user" as const,
              content: [toolResultBlock],
            });
          }
        }
      }

      // If tools ran but no text yet, use bridge message so prospect isn't waiting
      if (hasToolUse && !aiResponseText && callCount < MAX_CLAUDE_CALLS) {
        // Don't send bridge yet — the follow-up call should produce the real response
      }

      if (response.stop_reason === "end_turn" || !hasToolUse) {
        break;
      }

      // Tool calls need follow-up — add tool results and loop
      if (hasToolUse && toolResults.length > 0) {
        currentMessages = [...currentMessages, ...toolResults];
      } else {
        break;
      }
    }

    const durationMs = Date.now() - claudeStartMs;
    console.log("[LEASING] Claude responded", { durationMs, toolsUsed, responseLength: aiResponseText.length, conversationId: conversation.id });
  } catch (err: any) {
    const durationMs = Date.now() - claudeStartMs;
    console.error("[LEASING] Claude API error:", err?.message || err, { configId: config.id, conversationId: conversation.id, prospectPhone: from, durationMs });
    aiResponseText = FALLBACK_MESSAGE;
    isErrorFallback = true;
  }

  // If Claude returned tools but no text (empty response after tool processing)
  if (!aiResponseText && toolsUsed.length > 0) {
    aiResponseText = BRIDGE_MESSAGE;
  }

  // Final fallback — should not happen, but silence is worse than generic
  if (!aiResponseText) {
    aiResponseText = FALLBACK_MESSAGE;
    isErrorFallback = true;
  }

  // 9. Send response via appropriate channel
  let outboundSid: string | null = null;

  if (isEmail) {
    // Email channel: send via Gmail
    try {
      const emailSubject = conversation.emailSubject
        || `About your inquiry at ${config.property.name || config.property.address || "our property"}`;
      await sendLeasingReply(
        config,
        emailOptions!.prospectEmail,
        conversation.prospectName || emailOptions!.prospectName,
        emailSubject,
        aiResponseText,
      );
      outboundSid = `email_${Date.now()}`;
      console.log("[LEASING] Email sent", { to: from, conversationId: conversation.id });
    } catch (err) {
      console.error("[LEASING] Failed to send email:", err);
    }
  } else {
    // SMS channel: send via Twilio
    try {
      const twilio = getTwilio();
      const sent = await twilio.messages.create({
        body: aiResponseText,
        from: to, // AI's number
        to: from, // prospect
      });
      outboundSid = sent.sid;
      console.log("[LEASING] SMS sent", { twilioSid: sent.sid, to: from, conversationId: conversation.id });
    } catch (err) {
      console.error("[LEASING] Failed to send SMS:", err);
    }
  }

  // 10. Save outbound message
  await prisma.leasingMessage.create({
    data: {
      conversationId: conversation.id,
      sender: "ai",
      channel: isEmail ? "email" : "sms",
      body: aiResponseText,
      twilioSid: outboundSid,
      intentDetected: isErrorFallback ? "__error_fallback__" : (toolsUsed.length > 0 ? toolsUsed.join(",") : null),
      confidenceScore: isErrorFallback ? 0 : confidenceScore,
      tokensUsed,
    },
  });

  // 10b. Track concession offer if AI mentioned it
  if (activeConcession && !isErrorFallback) {
    const responseLower = aiResponseText.toLowerCase();
    const concessionMentioned =
      responseLower.includes("currently offering") ||
      responseLower.includes("good news") ||
      responseLower.includes(activeConcession.value.toLowerCase().slice(0, 20));
    if (concessionMentioned) {
      try {
        const freshConv3 = await prisma.leasingConversation.findUnique({ where: { id: conversation.id } });
        const freshQD3 = (freshConv3?.qualData as Record<string, any>) || {};
        await prisma.leasingConversation.update({
          where: { id: conversation.id },
          data: {
            qualData: {
              ...freshQD3,
              concessionOffered: true,
              concessionUsed: activeConcession.ruleIndex,
              concessionDescription: activeConcession.description,
            },
          },
        });
      } catch (err) {
        console.error("[LEASING] Concession tracking failed (silent):", err);
      }
    }
  }

  // 11. Update usage
  await incrementUsage(config.id, today, { inbound: 1, ai: 1, tokens: tokensUsed });

  // 12. Handle error fallback: schedule retry + check repeated failures
  if (isErrorFallback) {
    try {
      // Schedule a retry follow-up for 30 minutes from now
      await prisma.leasingFollowUp.create({
        data: {
          conversationId: conversation.id,
          type: "custom",
          scheduledFor: new Date(Date.now() + ERROR_RETRY_DELAY_MS),
          messageBody: null, // Will be generated by the follow-up engine
        },
      });

      // Check for repeated failures — escalate if 3+ in the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentFailures = await prisma.leasingMessage.count({
        where: {
          conversationId: conversation.id,
          intentDetected: "__error_fallback__",
          createdAt: { gte: oneHourAgo },
        },
      });

      if (recentFailures >= ERROR_ESCALATION_THRESHOLD && escalationPhone) {
        const prospectLabel = conversation.prospectName || from;
        const escalationBody = `⚠️ System issue: AI is having trouble responding to ${prospectLabel}. Their last message: "${body}". You may want to reply directly.`;
        try {
          const twilio = getTwilio();
          await twilio.messages.create({
            body: escalationBody,
            from: to,
            to: escalationPhone,
          });
          console.log("[LEASING] Escalated repeated failures to landlord", { conversationId: conversation.id, failureCount: recentFailures });
        } catch (escalateErr) {
          console.error("[LEASING] Failed to send failure escalation:", escalateErr);
        }
      }
    } catch (followUpErr) {
      console.error("[LEASING] Failed to schedule error retry:", followUpErr);
    }
  }

  // 13. Cancel stale follow-ups (prospect replied) and schedule new cadence
  if (!isErrorFallback) {
    try {
      await cancelCadence(conversation.id);
      // Determine cadence type based on tier and conversation state
      const cadenceType: CadenceType =
        conversation.status === "showing_scheduled" ? "showing"
        : (config.tier === "pro" || config.tier === "team") ? "pro"
        : "free";
      await scheduleFollowUpCadence(conversation.id, cadenceType);
    } catch (err) {
      console.error("[LEASING] Follow-up scheduling error:", err);
    }
  }
}

// ============================================================
// processWebChatMessage — Web chat channel (returns response)
// ============================================================

export interface WebChatResult {
  conversationId: string;
  response: string;
  requiresEscalation: boolean;
}

export async function processWebChatMessage(
  configId: string,
  body: string,
  prospectName: string,
  prospectEmail?: string,
  prospectPhone?: string,
  existingConversationId?: string,
): Promise<WebChatResult> {
  // 1. Load config
  const config = await prisma.leasingConfig.findUnique({
    where: { id: configId },
    include: {
      property: { include: { listings: { orderBy: { createdAt: "desc" } } } },
    },
  });
  if (!config || !config.isActive) throw new Error("Config not found or inactive");

  // 2. Check daily limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limitCheck = await checkMessageLimit(configId);
  if (!limitCheck.allowed) {
    return {
      conversationId: existingConversationId || "",
      response: "We're experiencing high volume right now. Please try again later or call our office directly.",
      requiresEscalation: false,
    };
  }

  // 3. Find or create conversation
  let conversation;
  if (existingConversationId) {
    conversation = await prisma.leasingConversation.findFirst({
      where: { id: existingConversationId, configId },
    });
  }

  if (!conversation) {
    const identifier = prospectEmail || prospectPhone || `webchat_${Date.now()}`;
    conversation = await prisma.leasingConversation.create({
      data: {
        orgId: config.orgId,
        configId,
        channel: "web_chat",
        prospectPhone: prospectPhone || `webchat_${identifier}`,
        prospectName,
        prospectEmail: prospectEmail || null,
        status: "active",
        temperature: "warm",
        qualData: { source: "web_chat", leadScore: SOURCE_SCORE_WEIGHTS.web_chat },
      },
    });
  }

  // 4. Save inbound message
  await prisma.leasingMessage.create({
    data: {
      conversationId: conversation.id,
      sender: "prospect",
      channel: "web_chat",
      body,
    },
  });

  // 5. If escalated, don't run AI
  if (conversation.status === "escalated") {
    return {
      conversationId: conversation.id,
      response: "Your message has been forwarded to our team. Someone will get back to you shortly.",
      requiresEscalation: true,
    };
  }

  // 6. Language detection
  const qualData = (conversation.qualData as Record<string, any>) || {};
  let detectedLanguage: string = qualData.detectedLanguage || "en";
  if (!qualData.languageLockedAt) {
    const langResult = detectLanguage(body);
    const languagesArr = Array.isArray(config.languages) ? config.languages : [];
    const langConfigured = (lang: string) => languagesArr.includes(lang) || languagesArr.length === 0;

    if (langResult === "es") {
      const spanishEnabled = langConfigured("es") && await checkLeasingFeature(config.id, "spanish_language");
      detectedLanguage = spanishEnabled ? "es" : "en";
    } else if (langResult === "zh" || langResult === "ru" || langResult === "he") {
      const multiLangEnabled = langConfigured(langResult) && await checkLeasingFeature(config.id, "multi_language");
      detectedLanguage = multiLangEnabled ? langResult : "en";
    } else if (langResult === "en") {
      detectedLanguage = "en";
    }
    if (langResult !== "unknown") {
      await prisma.leasingConversation.update({
        where: { id: conversation.id },
        data: { qualData: { ...qualData, detectedLanguage, languageLockedAt: 1 } },
      });
    }
  }

  // 7. Build AI context
  const invState = await checkInventoryState(config.id);
  const promptConfig: PromptConfig = {
    aiName: config.aiName,
    aiTone: config.aiTone,
    greeting: config.greeting,
    personality: config.personality,
    customInstructions: config.customInstructions,
    buildingKnowledge: config.buildingKnowledge,
    autoEnrichmentData: config.autoEnrichmentData,
    qualCriteria: config.qualCriteria,
    officeHoursStart: config.officeHoursStart,
    officeHoursEnd: config.officeHoursEnd,
    timezone: config.timezone,
    property: config.property,
    channel: "sms", // Web chat uses SMS-like conciseness
    detectedLanguage: detectedLanguage !== "en" ? detectedLanguage : undefined,
    ...(!invState.hasAvailable
      ? { inventoryState: { hasAvailable: false, totalUnits: invState.totalUnits, availableCount: invState.availableCount, soonAvailableCount: invState.soonAvailableCount } }
      : {}),
  };

  const systemPrompt = generateSystemPrompt(promptConfig);

  // 8. Build message history
  const history = await buildMessageHistory(conversation.id, MAX_HISTORY);
  const messages: Anthropic.MessageParam[] = history.length > 0 ? history : [{ role: "user" as const, content: body }];
  const cleanedMessages = ensureAlternating(messages);

  // 9. Call Claude
  let aiResponseText = "";
  let toolsUsed: string[] = [];
  let tokensUsed = 0;
  let isErrorFallback = false;

  try {
    const anthropic = getAnthropic();
    let callCount = 0;
    let currentMessages = [...cleanedMessages];

    while (callCount < MAX_CLAUDE_CALLS) {
      callCount++;
      const response = await anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: 512,
        system: systemPrompt,
        messages: currentMessages,
        tools: TOOLS,
      }, { timeout: CLAUDE_TIMEOUT_MS });

      tokensUsed += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

      let hasToolUse = false;
      const toolResults: Anthropic.MessageParam[] = [];

      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) {
          aiResponseText = block.text.trim();
        } else if (block.type === "tool_use") {
          hasToolUse = true;
          toolsUsed.push(block.name);
          const escalationPhone = (config.qualCriteria as any)?.escalationPhone || null;
          const toolResult = await executeToolCall(
            block.name,
            block.input as Record<string, any>,
            config,
            conversation,
            prospectPhone || "web_chat",
            config.id,
            escalationPhone,
          );
          if (toolResults.length === 0) {
            toolResults.push({ role: "assistant" as const, content: response.content as Anthropic.ContentBlock[] });
          }
          const existingUserMsg = toolResults.find((m) => m.role === "user" && Array.isArray(m.content));
          const toolResultBlock: Anthropic.ToolResultBlockParam = { type: "tool_result", tool_use_id: block.id, content: toolResult };
          if (existingUserMsg && Array.isArray(existingUserMsg.content)) {
            (existingUserMsg.content as Anthropic.ToolResultBlockParam[]).push(toolResultBlock);
          } else {
            toolResults.push({ role: "user" as const, content: [toolResultBlock] });
          }
        }
      }

      if (response.stop_reason === "end_turn" || !hasToolUse) break;
      if (hasToolUse && toolResults.length > 0) {
        currentMessages = [...currentMessages, ...toolResults];
      } else {
        break;
      }
    }
  } catch (err: any) {
    console.error("[LEASING WEB CHAT] Claude error:", err?.message || err);
    aiResponseText = FALLBACK_MESSAGE;
    isErrorFallback = true;
  }

  if (!aiResponseText && toolsUsed.length > 0) aiResponseText = BRIDGE_MESSAGE;
  if (!aiResponseText) { aiResponseText = FALLBACK_MESSAGE; isErrorFallback = true; }

  // 10. Save AI response
  await prisma.leasingMessage.create({
    data: {
      conversationId: conversation.id,
      sender: "ai",
      channel: "web_chat",
      body: aiResponseText,
      intentDetected: isErrorFallback ? "__error_fallback__" : (toolsUsed.length > 0 ? toolsUsed.join(",") : null),
      tokensUsed,
    },
  });

  // 11. Update usage
  await incrementUsage(config.id, today, { inbound: 1, ai: 1, tokens: tokensUsed });

  return {
    conversationId: conversation.id,
    response: aiResponseText,
    requiresEscalation: !!conversation.escalationReason,
  };
}

// ============================================================
// processVoiceMessage — Inbound voice call transcription
// ============================================================

export interface VoiceResult {
  conversationId: string;
  response: string;
  isGoodbye: boolean;
}

export async function processVoiceMessage(
  toNumber: string,
  fromNumber: string,
  transcription: string,
  callSid: string,
): Promise<VoiceResult> {
  // 1. Look up config by phone number
  const phoneNumber = await prisma.phoneNumber.findFirst({
    where: { number: toNumber, status: "active" },
  });
  if (!phoneNumber) throw new Error("Phone number not found");

  const config = await prisma.leasingConfig.findFirst({
    where: { twilioNumberId: phoneNumber.id, isActive: true },
    include: {
      property: { include: { listings: { orderBy: { createdAt: "desc" } } } },
    },
  });
  if (!config) throw new Error("Config not found or inactive");

  // 2. Check daily limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limitCheck = await checkMessageLimit(config.id);
  if (!limitCheck.allowed) {
    return {
      conversationId: "",
      response: "We're experiencing high call volume right now. Please try calling back later.",
      isGoodbye: true,
    };
  }

  // 3. Find or create voice conversation (keyed on configId + phone)
  let conversation = await prisma.leasingConversation.findFirst({
    where: { configId: config.id, prospectPhone: fromNumber, channel: "voice" },
    orderBy: { createdAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.leasingConversation.create({
      data: {
        orgId: config.orgId,
        configId: config.id,
        channel: "voice",
        prospectPhone: fromNumber,
        status: "active",
        temperature: "warm",
        qualData: { source: "direct_sms", callSid },
      },
    });
  }

  // 4. Save inbound message (transcription)
  await prisma.leasingMessage.create({
    data: {
      conversationId: conversation.id,
      sender: "prospect",
      channel: "voice",
      body: transcription,
      twilioSid: callSid,
    },
  });

  // 5. Build AI context
  const invState = await checkInventoryState(config.id);

  const promptConfig: PromptConfig = {
    aiName: config.aiName,
    aiTone: config.aiTone,
    greeting: config.greeting,
    personality: config.personality,
    customInstructions: config.customInstructions,
    buildingKnowledge: config.buildingKnowledge,
    autoEnrichmentData: config.autoEnrichmentData,
    qualCriteria: config.qualCriteria,
    officeHoursStart: config.officeHoursStart,
    officeHoursEnd: config.officeHoursEnd,
    timezone: config.timezone,
    property: config.property,
    channel: "voice",
    ...(!invState.hasAvailable
      ? { inventoryState: { hasAvailable: false, totalUnits: invState.totalUnits, availableCount: invState.availableCount, soonAvailableCount: invState.soonAvailableCount } }
      : {}),
  };

  const systemPrompt = generateSystemPrompt(promptConfig);

  // 6. Build conversation context
  const convWithRelations = await prisma.leasingConversation.findUnique({
    where: { id: conversation.id },
    include: { listing: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const conversationContext = convWithRelations ? generateConversationContext(convWithRelations) : "";

  // 7. Build message history
  const history = await buildMessageHistory(conversation.id, MAX_HISTORY);
  const messages: Anthropic.MessageParam[] = history.length > 0 ? history : [{ role: "user" as const, content: transcription }];

  if (conversationContext && history.length > 0) {
    messages.unshift(
      { role: "user", content: `[SYSTEM CONTEXT]\n${conversationContext}\n[END SYSTEM CONTEXT]` },
      { role: "assistant", content: "Understood." },
    );
  }

  const cleanedMessages = ensureAlternating(messages);

  // 8. Call Claude
  let aiResponseText = "";
  let tokensUsed = 0;
  let isErrorFallback = false;

  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 256, // Shorter for voice
      system: systemPrompt,
      messages: cleanedMessages,
    }, { timeout: CLAUDE_TIMEOUT_MS });

    tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        aiResponseText = block.text.trim();
      }
    }
  } catch (err: any) {
    console.error("[LEASING VOICE] Claude error:", err?.message || err);
    aiResponseText = "I'm sorry, I'm having trouble right now. Could you repeat that?";
    isErrorFallback = true;
  }

  if (!aiResponseText) {
    aiResponseText = "Let me check on that for you. Could you hold on one moment?";
  }

  // 9. Save AI response
  await prisma.leasingMessage.create({
    data: {
      conversationId: conversation.id,
      sender: "ai",
      channel: "voice",
      body: aiResponseText,
      intentDetected: isErrorFallback ? "__error_fallback__" : null,
      tokensUsed,
    },
  });

  // 10. Update usage
  await incrementUsage(config.id, today, { inbound: 1, ai: 1, tokens: tokensUsed });

  // 11. Check if this is a goodbye response
  const responseLower = aiResponseText.toLowerCase();
  const isGoodbye =
    responseLower.includes("see you then") ||
    responseLower.includes("we'll see you") ||
    responseLower.includes("have a great day") ||
    responseLower.includes("goodbye") ||
    responseLower.includes("take care");

  return {
    conversationId: conversation.id,
    response: aiResponseText,
    isGoodbye,
  };
}

// ============================================================
// processLandlordReply — Landlord replies to AI number
// ============================================================

async function processLandlordReply(
  from: string,
  to: string,
  body: string,
  configId: string,
  orgId: string,
): Promise<void> {
  const upperBody = body.trim().toUpperCase();

  // Find the most recently escalated conversation for this config
  const escalatedConv = await prisma.leasingConversation.findFirst({
    where: { configId, status: "escalated" },
    orderBy: { escalatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!escalatedConv) {
    console.log("[leasing] Landlord reply but no escalated conversation found");
    return;
  }

  // Handle DONE/RESOLVED command
  if (upperBody === "DONE" || upperBody === "RESOLVED") {
    await prisma.leasingConversation.update({
      where: { id: escalatedConv.id },
      data: { status: "active", escalatedAt: null, escalationReason: null },
    });
    // Notify landlord
    try {
      const twilio = getTwilio();
      await twilio.messages.create({
        body: `Escalation resolved. AI will resume handling this conversation.`,
        from: to,
        to: from,
      });
    } catch (err) {
      console.error("[leasing] Failed to send resolution confirmation:", err);
    }
    return;
  }

  // Handle showing confirmation (YES/NO/time)
  if (upperBody === "YES" || upperBody === "NO" || /^\d{1,2}[:/]\d{2}/.test(upperBody)) {
    // Forward response handling for showings
    const showingResponse = upperBody === "YES"
      ? `Great news! Your showing is confirmed${escalatedConv.showingAt ? ` for ${new Date(escalatedConv.showingAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}. See you there!`
      : upperBody === "NO"
        ? "Unfortunately, that time doesn't work. Would you like to suggest another time that might be better?"
        : `How about ${body.trim()} instead? Let me know if that works for you.`;

    try {
      const twilio = getTwilio();
      await twilio.messages.create({
        body: showingResponse,
        from: to,
        to: escalatedConv.prospectPhone,
      });
    } catch (err) {
      console.error("[leasing] Failed to forward showing response:", err);
    }

    // Save as agent message
    await prisma.leasingMessage.create({
      data: {
        conversationId: escalatedConv.id,
        sender: "agent",
        body: showingResponse,
        intentDetected: "showing_response",
      },
    });

    if (upperBody === "YES" && escalatedConv.showingAt) {
      await prisma.leasingConversation.update({
        where: { id: escalatedConv.id },
        data: { status: "showing_scheduled" },
      });
    }
    return;
  }

  // Forward landlord's reply to prospect
  try {
    const twilio = getTwilio();
    await twilio.messages.create({
      body: body.trim(),
      from: to, // AI's number
      to: escalatedConv.prospectPhone,
    });
  } catch (err) {
    console.error("[leasing] Failed to forward landlord reply:", err);
    return;
  }

  // Save as agent message
  await prisma.leasingMessage.create({
    data: {
      conversationId: escalatedConv.id,
      sender: "agent",
      body: body.trim(),
      intentDetected: "landlord_reply",
    },
  });
}

// ============================================================
// buildMessageHistory
// ============================================================

export async function buildMessageHistory(
  conversationId: string,
  limit: number,
): Promise<Anthropic.MessageParam[]> {
  const messages = await prisma.leasingMessage.findMany({
    where: {
      conversationId,
      intentDetected: { not: "__test__" }, // Exclude test messages
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { sender: true, body: true },
  });

  return messages.map((m) => ({
    role: (m.sender === "prospect" ? "user" : "assistant") as "user" | "assistant",
    content: m.body,
  }));
}

// ============================================================
// Tool Implementations
// ============================================================

async function executeToolCall(
  toolName: string,
  input: Record<string, any>,
  config: any,
  conversation: any,
  prospectPhone: string,
  aiNumber: string,
  escalationPhone: string | null,
): Promise<string> {
  switch (toolName) {
    case "check_availability":
      return toolCheckAvailability(config, input, conversation.id);
    case "suggest_showing":
      return toolSuggestShowing(config, conversation, input as any, aiNumber, escalationPhone);
    case "update_lead_info":
      return toolUpdateLeadInfo(conversation, input);
    case "escalate":
      return toolEscalate(config, conversation, input as { reason: string; summary: string }, prospectPhone, aiNumber, escalationPhone);
    case "update_conversation_summary":
      return toolUpdateSummary(conversation, input as { summary: string });
    default:
      return `Unknown tool: ${toolName}`;
  }
}

// ── Slot cache (per conversation, for slot index references) ──

const _slotCache = new Map<string, TimeSlot[]>();

// ── check_availability ────────────────────────────────────────

async function toolCheckAvailability(
  config: any,
  input: { bedrooms?: number; maxPrice?: number; moveInBy?: string },
  conversationId?: string,
): Promise<string> {
  const where: Record<string, any> = {
    orgId: config.orgId,
    propertyId: config.propertyId,
    status: { in: ["available", "showing"] },
  };

  if (input.bedrooms !== undefined) {
    where.bedrooms = String(input.bedrooms);
  }

  const listings = await prisma.bmsListing.findMany({
    where,
    orderBy: { rentPrice: "asc" },
  });

  let filtered = listings;

  if (input.maxPrice) {
    filtered = filtered.filter((l) => l.rentPrice && Number(l.rentPrice) <= input.maxPrice!);
  }

  if (input.moveInBy) {
    const moveDate = new Date(input.moveInBy);
    filtered = filtered.filter(
      (l) => !l.availableDate || new Date(l.availableDate) <= moveDate,
    );
  }

  // Zero inventory — offer waitlist
  if (listings.length === 0) {
    // Check for upcoming availability
    const soonAvailable = await prisma.bmsListing.findMany({
      where: {
        orgId: config.orgId,
        propertyId: config.propertyId,
        status: { notIn: ["available", "showing"] },
        availableDate: { lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) },
      },
      select: { bedrooms: true, availableDate: true },
      orderBy: { availableDate: "asc" },
      take: 3,
    });

    let result = "ZERO INVENTORY: No units are currently available at this property. canJoinWaitlist: true.";
    if (soonAvailable.length > 0) {
      const upcoming = soonAvailable.map((l) => {
        const beds = l.bedrooms === "0" || l.bedrooms === "studio" ? "Studio" : `${l.bedrooms}BR`;
        const date = l.availableDate ? new Date(l.availableDate).toLocaleDateString() : "soon";
        return `${beds} expected ${date}`;
      }).join(", ");
      result += ` estimatedAvailability: ${upcoming}.`;
    }
    result += " Offer to add the prospect to the waitlist so they'll be notified when something opens up.";
    return result;
  }

  if (filtered.length === 0) {
    return "No units currently match those criteria. Available units at this property:\n" +
      listings.map((l) => {
        const beds = l.bedrooms === "0" || l.bedrooms === "studio" ? "Studio" : `${l.bedrooms}BR`;
        const price = l.rentPrice ? `$${Number(l.rentPrice).toLocaleString()}/mo` : "";
        return `- Unit ${l.unit || "?"}: ${beds}, ${price}`;
      }).join("\n");
  }

  let result = `${filtered.length} unit${filtered.length > 1 ? "s" : ""} available:\n` +
    filtered.map((l) => {
      const beds = l.bedrooms === "0" || l.bedrooms === "studio" ? "Studio" : `${l.bedrooms}BR`;
      const baths = l.bathrooms || "";
      const price = l.rentPrice ? `$${Number(l.rentPrice).toLocaleString()}/mo` : "";
      const avail = l.availableDate
        ? (new Date(l.availableDate) <= new Date() ? "available now" : `available ${new Date(l.availableDate).toLocaleDateString()}`)
        : "available now";
      const sqft = l.sqft ? `${l.sqft}sqft` : "";
      return `- Unit ${l.unit || "?"} (ID: ${l.id}): ${beds}${baths ? `/${baths}BA` : ""}, ${price}, ${avail}${sqft ? `, ${sqft}` : ""}`;
    }).join("\n");

  // Pro/Team: append available showing slots
  const canAutoBook = await checkLeasingFeature(config.id, "auto_book_calendar");
  if (canAutoBook) {
    try {
      const allSlots = await getLeasingAvailability(config.id);
      const topSlots = getTopSlots(allSlots, 3);
      if (topSlots.length > 0 && conversationId) {
        _slotCache.set(conversationId, topSlots);
        result += "\n\navailable_slots (offer these to the prospect — they can pick one for instant booking):\n" +
          topSlots.map((s, i) => `  [${i}] ${s.label}`).join("\n");
        result += "\n\nIMPORTANT: You CAN confirm showings directly. When the prospect picks a slot, call suggest_showing with confirmed_slot_index set to the slot number (0, 1, or 2). The showing will be auto-booked on the calendar.";
      }
    } catch (err) {
      console.warn("[leasing] Failed to fetch available slots:", err);
    }
  }

  return result;
}

// ── suggest_showing ───────────────────────────────────────────

async function toolSuggestShowing(
  config: any,
  conversation: any,
  input: { listingId?: string; suggestedTimes?: string[]; prospectName?: string; confirmed_slot_index?: number },
  aiNumber: string,
  escalationPhone: string | null,
): Promise<string> {
  // Find the listing
  const listing = input.listingId
    ? await prisma.bmsListing.findFirst({ where: { id: input.listingId, orgId: config.orgId } })
    : null;

  const unitLabel = listing?.unit ? `Unit ${listing.unit}` : "the unit";
  const prospectLabel = input.prospectName || conversation.prospectName || conversation.prospectPhone;
  const address = config.property.address || config.property.name;

  // ── Pro/Team: Auto-book via Google Calendar ──
  const canAutoBookCal = await checkLeasingFeature(config.id, "auto_book_calendar");
  if (canAutoBookCal && input.confirmed_slot_index !== undefined) {
    const cachedSlots = _slotCache.get(conversation.id);
    const slot = cachedSlots?.[input.confirmed_slot_index];

    if (!slot) {
      // Slot index invalid — re-fetch and offer new slots
      try {
        const allSlots = await getLeasingAvailability(config.id);
        const topSlots = getTopSlots(allSlots, 3);
        if (topSlots.length > 0) {
          _slotCache.set(conversation.id, topSlots);
          return "That slot is no longer valid. Here are the updated available times:\n" +
            topSlots.map((s, i) => `  [${i}] ${s.label}`).join("\n") +
            "\nAsk the prospect to pick from these options.";
        }
      } catch { /* fall through */ }
      return "No slots currently available. Suggest the prospect try again tomorrow or contact the property directly.";
    }

    try {
      const bookResult = await bookShowingSlot(
        config.id,
        slot,
        { name: prospectLabel, phone: conversation.prospectPhone },
        unitLabel,
      );

      // Update conversation
      await prisma.leasingConversation.update({
        where: { id: conversation.id },
        data: {
          status: "showing_scheduled",
          showingAt: slot.start,
          ...(listing ? { listingId: listing.id } : {}),
          ...(input.prospectName ? { prospectName: input.prospectName } : {}),
        },
      });

      // Schedule showing follow-up cadence (reminder, post_showing, app_nudge)
      try {
        await cancelCadence(conversation.id);
        await scheduleFollowUpCadence(conversation.id, "showing");
      } catch (cadenceErr) {
        console.error("[LEASING] Failed to schedule showing cadence:", cadenceErr);
      }

      // Send confirmation SMS to prospect
      const dayStr = slot.start.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "America/New_York",
      });
      const timeStr = slot.start.toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      });
      const confirmSms = `You're confirmed for ${dayStr} at ${timeStr} at ${address}.\nPlease bring: photo ID + proof of income.\nQuestions? Text this number anytime.`;

      try {
        const twilio = getTwilio();
        await twilio.messages.create({
          body: confirmSms,
          from: aiNumber,
          to: conversation.prospectPhone,
        });

        // Save confirmation as AI message
        await prisma.leasingMessage.create({
          data: {
            conversationId: conversation.id,
            sender: "ai",
            body: confirmSms,
            intentDetected: "showing_confirmed",
          },
        });
      } catch (err) {
        console.error("[leasing] Failed to send showing confirmation SMS:", err);
      }

      // Notify landlord (informational — no confirmation needed)
      if (escalationPhone) {
        try {
          const twilio = getTwilio();
          await twilio.messages.create({
            body: `📅 Showing auto-booked:\n${prospectLabel} — ${unitLabel} at ${address}\n${dayStr} at ${timeStr}\n\nAdded to your Google Calendar.`,
            from: aiNumber,
            to: escalationPhone,
          });
        } catch (err) {
          console.error("[leasing] Failed to send auto-book notification:", err);
        }
      }

      // Clean up slot cache
      _slotCache.delete(conversation.id);

      return `Showing CONFIRMED and auto-booked on Google Calendar. Confirmation SMS sent to the prospect. Do NOT send another confirmation message — just acknowledge the booking naturally in conversation. Calendar event ID: ${bookResult.calendarEventId}`;

    } catch (bookErr: any) {
      // Race condition: slot taken
      console.warn("[leasing] Booking failed (race condition?):", bookErr);
      try {
        const allSlots = await getLeasingAvailability(config.id);
        const topSlots = getTopSlots(allSlots, 3);
        if (topSlots.length > 0) {
          _slotCache.set(conversation.id, topSlots);
          return "That time just became unavailable. Here are the next available options:\n" +
            topSlots.map((s, i) => `  [${i}] ${s.label}`).join("\n") +
            "\nOffer these to the prospect naturally — e.g. 'That time just got taken, but I have these open...'";
        }
      } catch { /* fall through */ }
      return "The selected slot is no longer available and no alternatives found right now. Ask the prospect to check back or suggest contacting the property.";
    }
  }

  // ── Free tier: existing flow (suggest times, notify landlord) ──

  const timeOptions = (input.suggestedTimes || [])
    .map((t) => {
      try { return new Date(t).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
      catch { return t; }
    })
    .join("\n    ");

  // Update conversation with listing interest + showing suggestion
  const updateData: Record<string, any> = {};
  if (listing) updateData.listingId = listing.id;
  if (input.prospectName) updateData.prospectName = input.prospectName;
  if (input.suggestedTimes?.[0]) {
    try { updateData.showingAt = new Date(input.suggestedTimes[0]); } catch { /* skip */ }
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.leasingConversation.update({
      where: { id: conversation.id },
      data: updateData,
    });
  }

  // Notify landlord
  if (escalationPhone) {
    const notifBody = `📅 Showing request:\n${prospectLabel} wants to see ${unitLabel} at ${address}\nSuggested:\n    ${timeOptions || "Flexible"}\n\nReply YES to confirm first option\nReply with a different time to suggest\nReply NO to decline`;
    try {
      const twilio = getTwilio();
      await twilio.messages.create({
        body: notifBody,
        from: aiNumber,
        to: escalationPhone,
      });
    } catch (err) {
      console.error("[leasing] Failed to send showing notification:", err);
    }
  }

  return "Showing times suggested. The prospect has been told you'll check with the landlord and confirm. The landlord has been notified.";
}

// ── update_lead_info ──────────────────────────────────────────

async function toolUpdateLeadInfo(
  conversation: any,
  input: Record<string, any>,
): Promise<string> {
  const existingQual = (conversation.qualData && typeof conversation.qualData === "object")
    ? conversation.qualData as Record<string, any>
    : {};

  const qualUpdate: Record<string, any> = { ...existingQual };
  const convUpdate: Record<string, any> = {};

  if (input.name) { convUpdate.prospectName = input.name; qualUpdate.name = input.name; }
  if (input.email) { convUpdate.prospectEmail = input.email; qualUpdate.email = input.email; }
  if (input.budget) qualUpdate.budget = input.budget;
  if (input.moveInDate) qualUpdate.moveInDate = input.moveInDate;
  if (input.bedroomsNeeded) qualUpdate.bedrooms = input.bedroomsNeeded;
  if (input.householdSize) qualUpdate.householdSize = input.householdSize;
  if (input.hasPets !== undefined) qualUpdate.pets = input.hasPets;
  if (input.petDetails) qualUpdate.petDetails = input.petDetails;
  if (input.employmentStatus) qualUpdate.employment = input.employmentStatus;
  if (input.currentSituation) qualUpdate.currentSituation = input.currentSituation;
  if (input.preferredUnitTypes?.length) qualUpdate.preferredUnitTypes = input.preferredUnitTypes;

  convUpdate.qualData = JSON.parse(JSON.stringify(qualUpdate));

  // Waitlist sign-up
  if (input.waitlist === true && !conversation.onWaitlist) {
    await addToWaitlist(conversation.id, input.preferredUnitTypes || []);
  }

  if (input.leadTemperature && ["hot", "warm", "cool", "cold"].includes(input.leadTemperature)) {
    convUpdate.temperature = input.leadTemperature;

    // Schedule cold re-engage cadence when temperature drops to "cold"
    if (input.leadTemperature === "cold" && conversation.temperature !== "cold") {
      try {
        await cancelCadence(conversation.id);
        await scheduleFollowUpCadence(conversation.id, "cold");
      } catch (err) {
        console.error("[LEASING] Failed to schedule cold cadence:", err);
      }
    }
  }

  // Update status based on qualification level
  if (input.leadTemperature === "hot" && conversation.status === "active") {
    convUpdate.status = "qualified";
  }

  // Update interested listing
  if (input.interestedListingIds?.length > 0) {
    convUpdate.listingId = input.interestedListingIds[0];
  }

  await prisma.leasingConversation.update({
    where: { id: conversation.id },
    data: convUpdate,
  });

  // If email provided, try to link or create CRM contact
  if (input.email && !conversation.contactId) {
    try {
      const existing = await prisma.contact.findFirst({
        where: { orgId: conversation.orgId, email: input.email },
      });
      if (existing) {
        await prisma.leasingConversation.update({
          where: { id: conversation.id },
          data: { contactId: existing.id },
        });
      } else {
        const nameParts = (input.name || "").split(" ");
        const contact = await prisma.contact.create({
          data: {
            orgId: conversation.orgId,
            firstName: nameParts[0] || "Unknown",
            lastName: nameParts.slice(1).join(" ") || "",
            email: input.email,
            phone: conversation.prospectPhone,
            source: "sms_ai",
            sourceDetail: "AI Leasing Agent",
            contactType: "renter",
            status: "lead",
          },
        });
        await prisma.leasingConversation.update({
          where: { id: conversation.id },
          data: { contactId: contact.id },
        });
      }
    } catch (err) {
      console.error("[leasing] CRM contact link error:", err);
    }
  }

  return "Lead information updated.";
}

// ── Round-robin agent assignment (Team tier) ──────────────────

export interface LeasingTeamMember {
  agentId: string;
  name: string;
  escalationPhone: string;
  escalationEmail: string;
  availableHours?: string;
  active: boolean;
}

function getNextEscalationAgent(config: any): LeasingTeamMember | null {
  if (config.tier !== "team") return null;

  const bk = (config.buildingKnowledge && typeof config.buildingKnowledge === "object")
    ? config.buildingKnowledge as Record<string, any>
    : {};

  const members: LeasingTeamMember[] = bk.teamMembers;
  if (!Array.isArray(members) || members.length === 0) return null;

  const activeMembers = members.filter((m) => m.active);
  if (activeMembers.length === 0) return null;

  const lastIndex: number = typeof bk.lastAssignedAgentIndex === "number" ? bk.lastAssignedAgentIndex : -1;
  const nextIndex = (lastIndex + 1) % activeMembers.length;
  const selected = activeMembers[nextIndex];

  // Fire-and-forget: update the round-robin index
  prisma.leasingConfig.update({
    where: { id: config.id },
    data: {
      buildingKnowledge: { ...bk, lastAssignedAgentIndex: nextIndex },
    },
  }).catch((err: any) => {
    console.error("[LEASING] Round-robin index update failed:", err);
  });

  return selected;
}

// ── escalate ──────────────────────────────────────────────────

async function toolEscalate(
  config: any,
  conversation: any,
  input: { reason: string; summary: string },
  prospectPhone: string,
  aiNumber: string,
  escalationPhone: string | null,
): Promise<string> {
  const dbReason = ESCALATION_REASON_MAP[input.reason] || "manual";

  await prisma.leasingConversation.update({
    where: { id: conversation.id },
    data: {
      status: "escalated",
      escalatedAt: new Date(),
      escalationReason: dbReason as any,
    },
  });

  // Get last prospect message
  const lastMsg = await prisma.leasingMessage.findFirst({
    where: { conversationId: conversation.id, sender: "prospect" },
    orderBy: { createdAt: "desc" },
  });

  const prospectLabel = conversation.prospectName || prospectPhone;

  // Fire-and-forget push notification to all org users
  import("./push-notifications").then(({ sendPushToOrg }) => {
    sendPushToOrg(config.orgId, {
      title: "New escalation",
      body: `${prospectLabel} needs your response — ${input.reason.slice(0, 60)}`,
      url: `/leasing?conversation=${conversation.id}`,
      tag: `escalation-${conversation.id}`,
    });
  }).catch(() => {});

  const unitInfo = conversation.listingId
    ? await prisma.bmsListing.findFirst({ where: { id: conversation.listingId }, select: { unit: true } })
    : null;

  const isEmailConv = conversation.channel === "email";
  const propertyLabel = config.property.address || config.property.name;
  const unitLine = unitInfo?.unit ? `Unit ${unitInfo.unit} at ${propertyLabel}` : propertyLabel;

  // Team tier: round-robin agent assignment
  const assignedAgent = getNextEscalationAgent(config);

  if (assignedAgent) {
    // Set assigned agent on conversation
    await prisma.leasingConversation.update({
      where: { id: conversation.id },
      data: { showingAgentId: assignedAgent.agentId },
    });

    const notifBody = [
      `🔴 New inquiry from ${prospectLabel}:`,
      `"${lastMsg?.body || "(no message)"}"`,
      ``,
      `Re: ${unitLine}`,
      `Lead: ${conversation.temperature}`,
      input.summary,
      ``,
      `Reply here to respond to them directly.`,
      `Text DONE when resolved.`,
    ].join("\n");

    // Notify via SMS
    if (assignedAgent.escalationPhone) {
      try {
        const twilio = getTwilio();
        await twilio.messages.create({
          body: notifBody,
          from: aiNumber,
          to: normalizePhone(assignedAgent.escalationPhone),
        });
      } catch (err) {
        console.error("[leasing] Failed to send agent SMS escalation:", err);
      }
    }

    // Notify via email
    if (assignedAgent.escalationEmail) {
      try {
        const emailBody = [
          `New inquiry escalated from ${prospectLabel} (${conversation.prospectEmail || conversation.prospectPhone}).`,
          ``,
          `Regarding: ${unitLine}`,
          `Lead Temperature: ${conversation.temperature}`,
          `Reason: ${input.reason}`,
          ``,
          `Summary: ${input.summary}`,
          ``,
          `Last message from prospect:`,
          `"${lastMsg?.body || "(no message)"}"`,
          ``,
          `Reply to this email to respond to the prospect directly.`,
        ].join("\n");

        await sendLeasingReply(
          { orgId: config.orgId, property: { name: config.property.name, address: config.property.address } },
          assignedAgent.escalationEmail,
          assignedAgent.name,
          `🔴 Escalation: ${prospectLabel} — ${propertyLabel}`,
          emailBody,
        );
      } catch (err) {
        console.error("[leasing] Failed to send agent email escalation:", err);
      }
    }

    return `Conversation escalated to ${assignedAgent.name}. They have been notified.`;
  }

  // Free/Pro tier: existing single-phone/email escalation
  if (isEmailConv) {
    const escalationEmail = config.qualCriteria?.escalationEmail || null;
    if (escalationEmail) {
      const emailBody = [
        `New inquiry escalated from ${prospectLabel} (${conversation.prospectEmail || "unknown email"}).`,
        ``,
        `Regarding: ${unitLine}`,
        `Lead Temperature: ${conversation.temperature}`,
        `Reason: ${input.reason}`,
        ``,
        `Summary: ${input.summary}`,
        ``,
        `Last message from prospect:`,
        `"${lastMsg?.body || "(no message)"}"`,
        ``,
        `Reply to this email to respond to the prospect directly.`,
      ].join("\n");

      try {
        await sendLeasingReply(
          { orgId: config.orgId, property: { name: config.property.name, address: config.property.address } },
          escalationEmail,
          null,
          `Escalation: ${unitLine}`,
          emailBody,
        );
      } catch (err) {
        console.error("[leasing] Failed to send email escalation notification:", err);
      }
    }
  } else if (escalationPhone) {
    const notifBody = [
      `🔴 New inquiry from ${prospectLabel}:`,
      `"${lastMsg?.body || "(no message)"}"`,
      ``,
      `Re: ${unitLine}`,
      `Lead: ${conversation.temperature}`,
      input.summary,
      ``,
      `Reply here to respond to them directly.`,
      `Text DONE when resolved.`,
    ].join("\n");

    try {
      const twilio = getTwilio();
      await twilio.messages.create({
        body: notifBody,
        from: aiNumber,
        to: escalationPhone,
      });
    } catch (err) {
      console.error("[leasing] Failed to send escalation notification:", err);
    }
  }

  return isEmailConv
    ? "Conversation escalated to the property manager. They have been notified via email."
    : "Conversation escalated to the property manager. They have been notified via SMS.";
}

// ── update_conversation_summary ───────────────────────────────

async function toolUpdateSummary(
  conversation: any,
  input: { summary: string },
): Promise<string> {
  await prisma.leasingConversation.update({
    where: { id: conversation.id },
    data: { aiSummary: input.summary },
  });
  return "Summary updated.";
}

// ============================================================
// Helpers
// ============================================================

async function getOrCreateConversation(
  configId: string,
  orgId: string,
  prospectPhone: string,
) {
  const existing = await prisma.leasingConversation.findUnique({
    where: { configId_prospectPhone: { configId, prospectPhone } },
  });
  if (existing) return existing;

  return prisma.leasingConversation.create({
    data: {
      orgId,
      configId,
      prospectPhone,
      status: "active",
      temperature: "warm",
      qualData: {},
    },
  });
}

async function getOrCreateEmailConversation(
  configId: string,
  orgId: string,
  prospectEmail: string,
  prospectName: string | null,
  emailSubject: string | null,
) {
  // Look up by configId + prospectEmail
  const existing = await prisma.leasingConversation.findFirst({
    where: { configId, prospectEmail, channel: "email" },
  });
  if (existing) {
    // Update subject if this is a new thread
    if (emailSubject && !existing.emailSubject) {
      await prisma.leasingConversation.update({
        where: { id: existing.id },
        data: { emailSubject },
      });
    }
    return existing;
  }

  return prisma.leasingConversation.create({
    data: {
      orgId,
      configId,
      channel: "email",
      emailSubject,
      prospectPhone: `email_${prospectEmail}`, // Placeholder for required field
      prospectEmail,
      prospectName,
      status: "active",
      temperature: "warm",
      qualData: {},
    },
  });
}

async function incrementUsage(
  configId: string,
  date: Date,
  counts: { inbound?: number; ai?: number; tokens?: number },
): Promise<void> {
  await prisma.leasingDailyUsage.upsert({
    where: { configId_date: { configId, date } },
    create: {
      configId,
      date,
      messagesInbound: counts.inbound || 0,
      messagesAi: counts.ai || 0,
      tokensUsed: counts.tokens || 0,
    },
    update: {
      messagesInbound: { increment: counts.inbound || 0 },
      messagesAi: { increment: counts.ai || 0 },
      tokensUsed: { increment: counts.tokens || 0 },
    },
  });
}

/**
 * Ensure messages alternate user/assistant correctly for Claude API.
 * Merge consecutive same-role messages and ensure it ends with user.
 */
function ensureAlternating(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length === 0) return [];

  const result: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (result.length === 0) {
      result.push(msg);
      continue;
    }
    const prev = result[result.length - 1];
    if (prev.role === msg.role) {
      // Merge consecutive same-role messages
      const prevText = typeof prev.content === "string" ? prev.content : "";
      const currText = typeof msg.content === "string" ? msg.content : "";
      result[result.length - 1] = { role: msg.role, content: `${prevText}\n${currText}` };
    } else {
      result.push(msg);
    }
  }

  // Ensure starts with user
  if (result.length > 0 && result[0].role !== "user") {
    result.unshift({ role: "user", content: "[Conversation start]" });
  }

  // Ensure ends with user
  if (result.length > 0 && result[result.length - 1].role !== "user") {
    result.push({ role: "user", content: "[Awaiting response]" });
  }

  return result;
}
