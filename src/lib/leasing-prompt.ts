// ============================================================
// AI Leasing Agent — System Prompt Generator
//
// Builds building-specific AI personality + knowledge base
// from BMS data + PLUTO enrichment. No API calls — pure string assembly.
// ============================================================

import type {
  LeasingConfig,
  LeasingConversation,
  BmsProperty,
  BmsListing,
} from "@prisma/client";
import { AMENITY_OPTIONS } from "./leasing-types";

// ── Types for this module ─────────────────────────────────────

/** Inventory state for system prompt injection */
export interface InventoryStateForPrompt {
  hasAvailable: boolean;
  totalUnits: number;
  availableCount: number;
  soonAvailableCount: number;
}

/** Config shape expected by the prompt generator (subset of full relations) */
export interface PromptConfig {
  aiName: string;
  aiTone: string;
  greeting: string;
  personality: string;
  customInstructions: string | null;
  buildingKnowledge: any;
  autoEnrichmentData: any;
  qualCriteria: any;
  officeHoursStart: string | null;
  officeHoursEnd: string | null;
  timezone: string;
  property: BmsProperty & { listings: BmsListing[] };
  inventoryState?: InventoryStateForPrompt;
  channel?: "sms" | "email" | "voice";
  detectedLanguage?: string;
}

// ── Tone Descriptions ─────────────────────────────────────────

const TONE_MAP: Record<string, string> = {
  professional_friendly: "Professional but warm. Use clear, helpful language. Be approachable without being overly casual.",
  casual_warm: "Casual and conversational. Use natural, relaxed language like texting a friend who happens to know a lot about the building.",
  luxury_concierge: "Refined and polished. Speak like a luxury concierge — attentive, discreet, and anticipating needs. Use elevated vocabulary without being pretentious.",
  no_nonsense: "Direct and efficient. Give facts quickly without fluff. Respect the prospect's time. Skip pleasantries when answering direct questions.",
};

// ── Building Class Descriptions ───────────────────────────────

const BUILDING_CLASS_MAP: Record<string, string> = {
  A: "One-family dwelling", B: "Two-family dwelling", C: "Walk-up apartment",
  D: "Elevator apartment", E: "Warehouse", F: "Factory",
  G: "Garage", H: "Hotel", I: "Hospital",
  J: "Theatre", K: "Store building", L: "Loft",
  M: "Church", N: "Asylum", O: "Office",
  P: "Place of worship", Q: "Outdoor recreation", R: "Condo",
  S: "Mixed residential/commercial", V: "Vacant land", W: "Educational",
};

function describeBuildingClass(code: string | null): string {
  if (!code) return "";
  const prefix = code.charAt(0).toUpperCase();
  return BUILDING_CLASS_MAP[prefix] || "";
}

function describeEra(yearBuilt: number | null): string {
  if (!yearBuilt || yearBuilt === 0) return "";
  if (yearBuilt < 1947) return "pre-war";
  if (yearBuilt < 2000) return "post-war";
  if (yearBuilt < 2015) return "modern";
  return "new construction";
}

function isElevator(bldgClass: string | null, floors: number | null): string {
  if (!bldgClass && !floors) return "";
  const prefix = bldgClass?.charAt(0)?.toUpperCase() || "";
  if (prefix === "D" || prefix === "R") return "elevator";
  if (prefix === "C") return "walk-up";
  if (floors && floors > 6) return "elevator";
  return "";
}

// ── Amenity Formatter ─────────────────────────────────────────

function formatAmenities(amenityIds: string[]): { building: string[]; inUnit: string[] } {
  const building: string[] = [];
  const inUnit: string[] = [];
  const IN_UNIT_IDS = new Set(["dishwasher", "in_unit_wd", "central_ac", "balcony"]);

  for (const id of amenityIds) {
    const option = AMENITY_OPTIONS.find((a) => a.id === id);
    if (!option) continue;
    if (IN_UNIT_IDS.has(id)) {
      inUnit.push(option.label);
    } else {
      building.push(option.label);
    }
  }
  return { building, inUnit };
}

// ── Listing Formatter ─────────────────────────────────────────

function formatListing(l: BmsListing): string {
  const parts: string[] = [];

  const unit = l.unit ? `Unit ${l.unit}` : "Unit";
  const beds = l.bedrooms === "0" || l.bedrooms === "studio" ? "Studio" : `${l.bedrooms}BR`;
  const baths = l.bathrooms ? `/${l.bathrooms}BA` : "";
  const price = l.rentPrice ? `$${Number(l.rentPrice).toLocaleString()}/mo` : "";
  parts.push(`- ${unit}: ${beds}${baths}${price ? `, ${price}` : ""}`);

  const extras: string[] = [];
  if (l.availableDate) {
    const d = new Date(l.availableDate);
    const now = new Date();
    extras.push(d <= now ? "available immediately" : `available ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  }
  if (l.floor) extras.push(`Floor ${l.floor}`);
  if (l.sqft) extras.push(`${l.sqft} sqft`);
  if (extras.length > 0) parts[0] += `. ${extras.join(", ")}.`;

  return parts.join("");
}

// ============================================================
// generateSystemPrompt
// ============================================================

export function generateSystemPrompt(config: PromptConfig): string {
  const sections: string[] = [];
  const prop = config.property;
  const enrichment = (config.autoEnrichmentData && typeof config.autoEnrichmentData === "object")
    ? config.autoEnrichmentData as Record<string, any>
    : {};
  const knowledge = (config.buildingKnowledge && typeof config.buildingKnowledge === "object")
    ? config.buildingKnowledge as Record<string, any>
    : {};
  const qualCriteria = (config.qualCriteria && typeof config.qualCriteria === "object")
    ? config.qualCriteria as Record<string, any>
    : {};

  // ── 0. Language Instruction ─────────────────────────────────

  if (config.detectedLanguage === "es") {
    sections.push(`LANGUAGE: This conversation is in Spanish. You MUST respond entirely in Spanish for every message. Maintain the same professional, warm tone. All unit details, availability, and showing times must be communicated in Spanish. Do not switch to English under any circumstances.`);
  } else if (config.detectedLanguage === "zh") {
    sections.push(`LANGUAGE: This conversation is in Mandarin Chinese (Simplified). You MUST respond entirely in Simplified Chinese (简体中文) for every message. Maintain the same professional, warm tone. Do not use Traditional Chinese characters. Do not switch to English under any circumstances.`);
  } else if (config.detectedLanguage === "ru") {
    sections.push(`LANGUAGE: This conversation is in Russian. You MUST respond entirely in Russian for every message. Maintain the same professional, warm tone. Do not switch to English under any circumstances.`);
  } else if (config.detectedLanguage === "he") {
    sections.push(`LANGUAGE: This conversation is in Hebrew. You MUST respond entirely in Hebrew for every message. Note that Hebrew is written right-to-left. Maintain the same professional, warm tone. Do not switch to English under any circumstances.`);
  }

  // ── 1. Identity & Personality ───────────────────────────────

  const propertyName = prop.address || prop.name;
  const toneDesc = TONE_MAP[config.aiTone] || TONE_MAP.professional_friendly;

  const isEmail = config.channel === "email";
  const isVoice = config.channel === "voice";

  let channelInstructions: string;
  if (isEmail) {
    channelInstructions = `You communicate via email. Responses can be longer and more structured than SMS. Use proper greetings ("Hi [name],") and a professional sign-off ("Best,\\n${prop.name || prop.address || "Leasing Team"}"). Bullet points are acceptable for listing details.`;
  } else if (isVoice) {
    channelInstructions = `You communicate via phone call. Keep responses spoken-word friendly — 2-3 sentences maximum.`;
  } else {
    channelInstructions = `You communicate via SMS. Keep responses concise (2-4 sentences typical, never more than 320 characters unless answering a complex question where up to 480 characters is acceptable).`;
  }

  sections.push(`IDENTITY:
You are ${config.aiName}, the leasing assistant for ${propertyName}.
${channelInstructions}
Tone: ${toneDesc}
${config.greeting ? `Your opening greeting for new conversations: "${config.greeting}"` : ""}`);

  // Voice-specific rules
  if (isVoice) {
    sections.push(`VOICE CHANNEL: This is a phone call. Critical rules:
- Keep every response under 3 sentences maximum
- Never use bullet points, markdown, URLs, or special characters
- Ask only one question at a time
- Spell out numbers: "twenty-two hundred" not "$2,200"
- Spell out addresses naturally: "Eight forty-seven Ocean Parkway"
- End naturally — when the conversation reaches a conclusion, say goodbye warmly`);
  }

  // ── 2. Available Inventory ──────────────────────────────────

  const availableListings = prop.listings.filter(
    (l) => l.status === "available" || l.status === "showing",
  );

  if (availableListings.length > 0) {
    const listingLines = availableListings.map(formatListing).join("\n");
    sections.push(`AVAILABLE UNITS (${availableListings.length} total):
${listingLines}
${availableListings.length === 1 ? "This is the only available unit." : ""}`);
  } else {
    sections.push(`AVAILABLE UNITS:
No units currently available.`);
  }

  // ── 2b. Inventory State / Zero-Inventory Mode ──────────────

  const inv = config.inventoryState;
  if (inv && !inv.hasAvailable) {
    let zeroBlock = `ZERO_INVENTORY_MODE:
This property currently has NO available units (${inv.totalUnits} total, all leased).

CRITICAL RULES in zero-inventory mode:
- NEVER invent, fabricate, or describe units that don't exist
- NEVER say "we have a 1BR available" or similar — there are NO available units
- Be transparent: "All units are currently leased"
- Stay warm and helpful — the prospect is still valuable`;

    if (inv.soonAvailableCount > 0) {
      zeroBlock += `\n- ${inv.soonAvailableCount} unit(s) expected to become available within 60 days — mention this as upcoming availability`;
    }

    zeroBlock += `
- Offer waitlist sign-up: "Would you like me to notify you the moment something opens up?"
- If they say yes: use update_lead_info with waitlist=true and collect their preferred unit type (beds, budget)
- If they decline: thank them warmly, suggest checking back, end on a positive note
- Continue collecting qualification data (budget, timeline, beds) even for waitlisted prospects`;

    sections.push(zeroBlock);
  }

  // ── 3. Building Facts ───────────────────────────────────────

  const yearBuilt = enrichment.yearBuilt || knowledge.yearBuilt || null;
  const floors = enrichment.floors || knowledge.floors || prop.totalUnits ? null : null;
  const actualFloors = enrichment.floors || knowledge.floors || null;
  const totalUnits = enrichment.totalUnits || knowledge.totalUnits || prop.totalUnits || null;
  const bldgClass = enrichment.buildingClass || knowledge.buildingClass || null;
  const zoning = enrichment.zoning || knowledge.zoning || null;
  const borough = enrichment.borough || knowledge.borough || null;
  const neighborhood = enrichment.neighborhood || knowledge.neighborhood || null;

  const buildingLines: string[] = [];
  buildingLines.push(`- Address: ${prop.address || prop.name}${prop.city ? `, ${prop.city}` : ""}${prop.state ? `, ${prop.state}` : ""} ${prop.zipCode || ""}`);
  if (yearBuilt) {
    const era = describeEra(yearBuilt);
    buildingLines.push(`- Year Built: ${yearBuilt}${era ? ` (${era})` : ""}`);
  }
  if (actualFloors || totalUnits) {
    const parts: string[] = [];
    if (actualFloors) parts.push(`${actualFloors} floors`);
    if (totalUnits) parts.push(`${totalUnits} units`);
    buildingLines.push(`- ${parts.join(", ")}`);
  }
  if (bldgClass) {
    const classDesc = describeBuildingClass(bldgClass);
    const elevType = isElevator(bldgClass, actualFloors);
    const typeParts = [elevType, classDesc].filter(Boolean).join(", ");
    if (typeParts) buildingLines.push(`- Building Type: ${typeParts}`);
  }
  if (borough || neighborhood) {
    buildingLines.push(`- Location: ${[neighborhood, borough].filter(Boolean).join(", ")}`);
  }
  if (zoning) buildingLines.push(`- Zoning: ${zoning}`);

  sections.push(`BUILDING INFORMATION:\n${buildingLines.join("\n")}`);

  // ── 4. Amenities ────────────────────────────────────────────

  const amenityIds: string[] = qualCriteria.amenities || knowledge.amenities || [];
  if (amenityIds.length > 0) {
    const { building, inUnit } = formatAmenities(amenityIds);
    const amenityLines: string[] = [];
    if (building.length > 0) amenityLines.push(`Building: ${building.join(", ")}`);
    if (inUnit.length > 0) amenityLines.push(`In-Unit: ${inUnit.join(", ")}`);
    if (amenityLines.length > 0) {
      sections.push(`AMENITIES:\n${amenityLines.join("\n")}`);
    }
  }

  // ── 5. Transit (from enrichment if NYC) ─────────────────────

  const transit = knowledge.transit || enrichment.transit;
  if (transit && Array.isArray(transit) && transit.length > 0) {
    const transitLines = transit.slice(0, 4).map((t: any) =>
      `- ${t.lines || t.line || ""} at ${t.station || ""} — ${t.walkMinutes || t.walk || ""}${typeof t.walkMinutes === "number" ? " min" : ""} walk`,
    ).join("\n");
    sections.push(`TRANSIT:\n${transitLines}`);
  }

  // ── 6. Neighborhood ─────────────────────────────────────────

  const neighborhoodDesc = knowledge.neighborhoodDescription || enrichment.neighborhoodDescription;
  if (neighborhoodDesc) {
    sections.push(`NEIGHBORHOOD:\n${neighborhood || borough || ""} — ${neighborhoodDesc}`);
  } else if (neighborhood || borough) {
    // Provide factual location only (no characterization per fair housing)
    sections.push(`NEIGHBORHOOD:\nLocated in ${[neighborhood, borough].filter(Boolean).join(", ")}.`);
  }

  // ── 7. Office Hours ─────────────────────────────────────────

  if (config.officeHoursStart && config.officeHoursEnd) {
    sections.push(`OFFICE HOURS:
Active response hours: ${config.officeHoursStart} - ${config.officeHoursEnd} (${config.timezone}).
Outside hours: Acknowledge receipt and let them know you'll respond first thing next business day.`);
  }

  // ── 8. Leasing Best Practices (hardcoded core intelligence) ─

  sections.push(LEASING_RULES);

  // ── 8b. Override format rules for email channel ────────────

  if (isEmail) {
    sections.push(`EMAIL FORMAT RULES (override SMS rules above):
- No strict character limit, but keep responses focused and scannable
- Use bullet points or short paragraphs for readability
- Use line breaks for readability
- No emojis unless the prospect uses them first
- No ALL CAPS except unit numbers (e.g., "Unit 4A")
- Include the specific unit number when discussing availability
- Do NOT use SMS-style abbreviations
- Do NOT include emoji in subject lines`);
  }

  // ── 9. FAQ (from knowledge base) ────────────────────────────

  const faq = knowledge.faq;
  if (Array.isArray(faq) && faq.length > 0) {
    const faqLines = faq
      .filter((f: any) => f.question && f.answer)
      .map((f: any) => `Q: ${f.question}\nA: ${f.answer}`)
      .join("\n\n");
    if (faqLines) {
      sections.push(`PROPERTY FAQ (use these answers when asked):\n${faqLines}`);
    }
  }

  // ── 10. Competitor Positioning (Pro) ──────────────────────

  const competitors = knowledge.competitors;
  if (Array.isArray(competitors) && competitors.length > 0) {
    const compLines = competitors
      .filter((c: any) => c.name)
      .map((c: any) => {
        const parts = [`- ${c.name}`];
        if (c.weakness) parts.push(`  Weakness: ${c.weakness}`);
        if (c.ourAdvantage) parts.push(`  Our advantage: ${c.ourAdvantage}`);
        return parts.join("\n");
      })
      .join("\n");
    if (compLines) {
      sections.push(`COMPETITIVE POSITIONING (use ONLY when prospect mentions a competitor — never bring up competitors unprompted):
${compLines}
RULES: Never badmouth competitors. Focus on our strengths. Be factual and positive.`);
    }
  }

  // ── 11. Concessions (Pro) ─────────────────────────────────

  if (knowledge.concessionsEnabled && Array.isArray(knowledge.concessions) && knowledge.concessions.length > 0) {
    const conLines = knowledge.concessions
      .filter((c: any) => c.name && c.value)
      .map((c: any) => `- ${c.name}: "${c.value}" (trigger: ${c.trigger || "any"}, max ${c.maxPerMonth || "unlimited"}/month)`)
      .join("\n");
    if (conLines) {
      sections.push(`CONCESSIONS (incentives you may offer):
${conLines}
RULES: Only offer when the trigger condition is met. Never stack multiple concessions. Present as a special offer, not desperation.`);
    }
  }

  // ── 12. Custom Instructions ──────────────────────────────────

  if (config.customInstructions) {
    sections.push(`ADDITIONAL INSTRUCTIONS FROM PROPERTY MANAGER:\n${config.customInstructions}`);
  }

  return sections.join("\n\n");
}

// ============================================================
// generateConversationContext
// ============================================================

export function generateConversationContext(
  conversation: LeasingConversation & { listing?: BmsListing | null; messages?: { createdAt: Date }[] },
): string {
  const qualData = (conversation.qualData && typeof conversation.qualData === "object")
    ? conversation.qualData as Record<string, any>
    : {};

  const lines: string[] = ["CONVERSATION CONTEXT:"];

  // Prospect info
  const name = conversation.prospectName || "Unknown";
  lines.push(`Prospect: ${name} | Phone: ${conversation.prospectPhone} | Temperature: ${conversation.temperature}`);
  lines.push(`Status: ${conversation.status}`);

  // Interested listing
  if (conversation.listing) {
    const l = conversation.listing;
    const beds = l.bedrooms === "0" || l.bedrooms === "studio" ? "Studio" : `${l.bedrooms}BR`;
    const price = l.rentPrice ? `$${Number(l.rentPrice).toLocaleString()}/mo` : "";
    lines.push(`Interested in: Unit ${l.unit || "?"} (${beds}${price ? `, ${price}` : ""})`);
  }

  // Known qualification info
  const knownParts: string[] = [];
  if (qualData.budget) knownParts.push(`Budget: ${qualData.budget}`);
  if (qualData.moveInDate) knownParts.push(`Moving: ${qualData.moveInDate}`);
  if (qualData.bedrooms) knownParts.push(`${qualData.bedrooms}BR needed`);
  if (qualData.pets !== undefined) knownParts.push(`Pets: ${qualData.pets ? "yes" : "no"}`);
  if (qualData.householdSize) knownParts.push(`Household: ${qualData.householdSize}`);
  if (qualData.employment) knownParts.push(`Employment: ${qualData.employment}`);
  if (knownParts.length > 0) lines.push(`Known info: ${knownParts.join(", ")}`);

  // ILS lead context — personalize first response
  if (qualData.ilsPopulated && qualData.ilsSource) {
    const sourceLabels: Record<string, string> = {
      streeteasy: "StreetEasy",
      apartments_com: "Apartments.com",
      zillow: "Zillow",
    };
    const src = sourceLabels[qualData.ilsSource] || qualData.ilsSource;
    const parts: string[] = [];
    if (qualData.bedrooms !== undefined && qualData.bedrooms !== null) parts.push(`${qualData.bedrooms === 0 ? "studio" : `${qualData.bedrooms}BR`}`);
    if (qualData.moveInDate) parts.push(`move-in: ${qualData.moveInDate}`);
    if (qualData.listingRef) parts.push(`listing: ${qualData.listingRef}`);
    const details = parts.length > 0 ? ` Known info: ${parts.join(", ")}.` : "";
    const inquiry = qualData.ilsMessage ? ` Their inquiry: "${qualData.ilsMessage}".` : "";
    lines.push(`LEAD CONTEXT: This prospect came from ${src}.${inquiry}${details} Greet them by name and reference their specific inquiry — don't ask for info you already have.`);
  }

  // Summary
  if (conversation.aiSummary) lines.push(`Summary: ${conversation.aiSummary}`);

  // Escalation
  if (conversation.escalationReason) {
    lines.push(`Escalated: ${conversation.escalationReason}${conversation.escalatedAt ? ` at ${new Date(conversation.escalatedAt).toLocaleString()}` : ""}`);
  }

  // Showing
  if (conversation.showingAt) {
    lines.push(`Showing: ${new Date(conversation.showingAt).toLocaleString()}`);
  }

  // Last message timestamp
  if (conversation.messages && conversation.messages.length > 0) {
    lines.push(`Last message: ${new Date(conversation.messages[0].createdAt).toLocaleString()}`);
  }

  return lines.join("\n");
}

// ============================================================
// buildKnowledgeBase
// ============================================================

export function buildKnowledgeBase(
  config: LeasingConfig,
  listings: BmsListing[],
  enrichment: Record<string, any> | null,
): Record<string, any> {
  const qualCriteria = (config.qualCriteria && typeof config.qualCriteria === "object")
    ? config.qualCriteria as Record<string, any>
    : {};

  const kb: Record<string, any> = {
    lastUpdated: new Date().toISOString(),
    listingCount: listings.length,
    availableCount: listings.filter((l) => l.status === "available" || l.status === "showing").length,
  };

  // Enrichment data (PLUTO + geocodio)
  if (enrichment) {
    if (enrichment.yearBuilt) kb.yearBuilt = enrichment.yearBuilt;
    if (enrichment.buildingClass) kb.buildingClass = enrichment.buildingClass;
    if (enrichment.floors) kb.floors = enrichment.floors;
    if (enrichment.totalUnits) kb.totalUnits = enrichment.totalUnits;
    if (enrichment.zoning) kb.zoning = enrichment.zoning;
    if (enrichment.ownerName) kb.ownerName = enrichment.ownerName;
    if (enrichment.borough) kb.borough = enrichment.borough;
    if (enrichment.bbl) kb.bbl = enrichment.bbl;
    if (enrichment.lat) kb.lat = enrichment.lat;
    if (enrichment.lng) kb.lng = enrichment.lng;
    if (enrichment.neighborhood) kb.neighborhood = enrichment.neighborhood;
    if (enrichment.medianRent) kb.medianRent = enrichment.medianRent;
    if (enrichment.medianIncome) kb.medianIncome = enrichment.medianIncome;
  }

  // Amenities
  if (qualCriteria.amenities) kb.amenities = qualCriteria.amenities;

  // Price range from listings
  const prices = listings
    .filter((l) => l.rentPrice && (l.status === "available" || l.status === "showing"))
    .map((l) => Number(l.rentPrice));
  if (prices.length > 0) {
    kb.priceRange = { min: Math.min(...prices), max: Math.max(...prices) };
  }

  // Unit mix summary
  const bedCounts: Record<string, number> = {};
  for (const l of listings.filter((l) => l.status === "available" || l.status === "showing")) {
    const beds = l.bedrooms || "unknown";
    bedCounts[beds] = (bedCounts[beds] || 0) + 1;
  }
  kb.unitMix = bedCounts;

  return kb;
}

// ============================================================
// HARDCODED LEASING RULES (non-removable)
// ============================================================

const LEASING_RULES = `CONVERSATION RULES:
1. SPEED: Respond with substance immediately. You are the first point of contact. Speed is your competitive advantage.
2. EVERY RESPONSE must: (a) Answer the question directly, (b) Add one relevant detail they didn't ask about, (c) Include a soft call-to-action toward the next step.
3. QUALIFICATION — gather through conversation (never interrogate):
   - Tier 1 (first 2 exchanges): Budget range, Move-in timeline
   - Tier 2 (before showing): Household size, Pet situation, Bedroom/amenity requirements, Employment
   - Tier 3 (during/after showing): Current living situation, Decision timeline, Other decision makers
4. LEAD SCORING — update after each exchange:
   - Budget + timeline < 60 days + household info = HOT
   - Budget + timeline confirmed = WARM
   - General inquiry = COOL
   - Just browsing / no timeline = COLD
5. URGENCY — use ONLY when factually true based on inventory data:
   - Scarcity: "We only have [X] one-bedrooms left" (only if true)
   - Timing: "Spring is our busiest season" (only if March-June)
6. OBJECTION HANDLING:
   - "Too expensive" → Acknowledge + reframe value (transit, amenities, neighborhood) + offer alternatives if available
   - "Still looking" → Validate + differentiate this property + suggest low-commitment showing
   - "Not ready yet" → Respect timeline + stay helpful + offer to follow up later
   - "Can you do better on price?" → ESCALATE (never negotiate)
7. SHOWING SCHEDULING:
   - Suggest specific times when possible
   - Never confirm a showing — say "Let me check with the landlord and confirm. I'll text you back shortly."
8. UNKNOWNS:
   - If common knowledge, give a reasonable assumption (e.g., "Leases are typically 12 months") and add "I'll confirm the details for you"
   - Never fabricate specific facts about the building
   - Pivot to qualification: "When would you be looking to move in?"

ESCALATION — IMMEDIATELY ESCALATE (do not attempt to handle):
- Price negotiation or concession requests
- Prior eviction disclosure
- Legal questions (fair housing, lease terms beyond basics)
- Angry, threatening, or abusive messages
- Explicit request for human contact
- Application process questions
- Anything you're not confident about
When escalating: "Great question — let me connect you with the property manager directly. They'll get back to you shortly."

FAIR HOUSING — ABSOLUTE RULES:
- NEVER ask about or reference: race, color, religion, national origin, sex, familial status, disability, sexual orientation, gender identity, marital status, age, citizenship, military status, source of income
- NEVER steer prospects toward or away from units based on protected characteristics
- NEVER say "family-friendly," "quiet building," "young professionals area," "good schools nearby," "safe neighborhood"
- When asked about demographics: "We have a diverse community of residents. I'd love to show you the building and let you experience it firsthand."
- When asked about schools/safety: Provide factual transit/distance info only, never characterize
- Treat every prospect identically in information provided and pricing offered

SMS FORMAT RULES:
- Max 320 characters per response (2 SMS segments) for simple exchanges
- Max 480 characters (3 segments) for detailed unit descriptions or directions
- Use line breaks for readability
- No emojis unless the prospect uses them first
- No ALL CAPS except unit numbers (e.g., "Unit 4A")
- Include the specific unit number when discussing availability`;
