// ============================================================
// AI Leasing Agent — Types, Constants & Helpers
// ============================================================

import type {
  LeasingConfig,
  LeasingConversation,
  LeasingMessage,
  LeasingFollowUp,
  LeasingDailyUsage,
  BmsProperty,
  BmsListing,
  BrokerAgent,
  PhoneNumber,
} from "@prisma/client";

// ── Onboarding Input ──────────────────────────────────────────

export interface UnitInput {
  unit: string;
  bedrooms: string;
  bathrooms: string;
  rentPrice: number;
  sqft?: number;
  floor?: string;
  availableDate?: string;
  description?: string;
}

export interface OnboardingInput {
  address: string;
  city: string;
  state: string;
  zip: string;
  units: UnitInput[];
  amenities: string[];
  additionalNotes?: string;
  escalationPhone: string;
  showingAvailability?: Record<string, unknown>;
}

// ── Config with Relations ─────────────────────────────────────

export interface LeasingConfigWithRelations extends LeasingConfig {
  property: BmsProperty & { listings: BmsListing[] };
  twilioNumber: PhoneNumber | null;
  conversations: LeasingConversation[];
  dailyUsage: LeasingDailyUsage[];
}

export interface LeasingConfigSummary {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string | null;
  tier: string;
  isActive: boolean;
  emailEnabled: boolean;
  twilioNumber: string | null;
  leasingEmail: string | null;
  totalListings: number;
  availableListings: number;
  conversationCount: number;
  todayMessages: number;
  todayConversations: number;
  createdAt: string;
  webChatEnabled: boolean;
  voiceEnabled: boolean;
  slug: string | null;
}

// ── Conversation Summary ──────────────────────────────────────

export interface ConversationSummary {
  id: string;
  prospectPhone: string;
  prospectName: string | null;
  prospectEmail: string | null;
  channel: string;
  emailSubject: string | null;
  status: string;
  temperature: string;
  listingUnit: string | null;
  listingBedrooms: string | null;
  listingRent: number | null;
  messageCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSender: string | null;
  aiSummary: string | null;
  escalationReason: string | null;
  showingAt: string | null;
  showingAgentName: string | null;
  leadScore: number | null;
  onWaitlist: boolean;
  detectedLanguage: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Daily Usage Stats ─────────────────────────────────────────

export interface DailyUsageStats {
  messagesAi: number;
  messagesInbound: number;
  tokensUsed: number;
  dailyLimit: number;
  remaining: number;
}

// ── Enrichment Result ─────────────────────────────────────────

export interface OnboardingEnrichment {
  yearBuilt: number | null;
  buildingClass: string | null;
  floors: number | null;
  totalUnits: number | null;
  zoning: string | null;
  assessedValue: number | null;
  ownerName: string | null;
  borough: string | null;
  bbl: string | null;
  lat: number | null;
  lng: number | null;
  neighborhood: string | null;
  medianRent: number | null;
  medianIncome: number | null;
}

// ── Conversation Detail (Dashboard) ─────────────────────────

export interface ConversationMessage {
  id: string;
  sender: string; // "prospect" | "ai" | "agent"
  body: string;
  intentDetected: string | null;
  tokensUsed: number | null;
  deliveryStatus: string | null;
  createdAt: string;
}

export interface ConversationDetail {
  id: string;
  prospectPhone: string;
  prospectName: string | null;
  prospectEmail: string | null;
  channel: string;
  emailSubject: string | null;
  status: string;
  temperature: string;
  qualData: Record<string, any>;
  aiSummary: string | null;
  escalationReason: string | null;
  escalatedAt: string | null;
  showingAt: string | null;
  showingAgentName: string | null;
  contactId: string | null;
  listingUnit: string | null;
  listingBedrooms: string | null;
  listingRent: number | null;
  propertyName: string;
  propertyAddress: string | null;
  twilioNumber: string | null;
  configId: string;
  onWaitlist: boolean;
  waitlistUnits: string[];
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationStats {
  totalConversations: number;
  activeConversations: number;
  escalatedCount: number;
  showingsThisWeek: number;
  hotLeads: number;
  waitlistCount: number;
  messagesToday: number;
  dailyLimit: number;
}

// ── Amenity Checklist ─────────────────────────────────────────

export interface AmenityOption {
  id: string;
  label: string;
  icon: string;
}

export const AMENITY_OPTIONS: AmenityOption[] = [
  { id: "laundry_building", label: "Laundry in Building", icon: "🧺" },
  { id: "laundry_unit", label: "Laundry in Unit", icon: "👕" },
  { id: "pets_allowed", label: "Pets Allowed", icon: "🐾" },
  { id: "doorman", label: "Doorman", icon: "🚪" },
  { id: "gym", label: "Gym", icon: "💪" },
  { id: "parking", label: "Parking", icon: "🅿️" },
  { id: "elevator", label: "Elevator", icon: "🛗" },
  { id: "roof_deck", label: "Roof Deck", icon: "🌇" },
  { id: "dishwasher", label: "Dishwasher", icon: "🍽️" },
  { id: "in_unit_wd", label: "In-Unit W/D", icon: "🫧" },
  { id: "central_ac", label: "Central A/C", icon: "❄️" },
  { id: "balcony", label: "Balcony", icon: "🌿" },
  { id: "storage", label: "Storage", icon: "📦" },
  { id: "bike_room", label: "Bike Room", icon: "🚲" },
  { id: "live_in_super", label: "Live-In Super", icon: "🔧" },
  { id: "outdoor_space", label: "Outdoor Space", icon: "🌳" },
];

// ── Lead Source Options ───────────────────────────────────────

export const LEAD_SOURCE_OPTIONS = [
  { value: "sms_ai", label: "AI Leasing Agent (SMS)" },
  { value: "walk_in", label: "Walk-In" },
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "streeteasy", label: "StreetEasy" },
  { value: "zillow", label: "Zillow" },
  { value: "craigslist", label: "Craigslist" },
  { value: "social_media", label: "Social Media" },
  { value: "other", label: "Other" },
] as const;

// ── Status Labels & Colors ────────────────────────────────────

export const CONVERSATION_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  qualified: "Qualified",
  showing_scheduled: "Showing Scheduled",
  applied: "Applied",
  escalated: "Escalated",
  closed_won: "Leased",
  closed_lost: "Lost",
  stale: "Stale",
};

export const CONVERSATION_STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  qualified: "bg-emerald-100 text-emerald-700",
  showing_scheduled: "bg-violet-100 text-violet-700",
  applied: "bg-amber-100 text-amber-700",
  escalated: "bg-red-100 text-red-700",
  closed_won: "bg-green-100 text-green-700",
  closed_lost: "bg-slate-100 text-slate-500",
  stale: "bg-gray-100 text-gray-500",
};

export const TEMPERATURE_LABELS: Record<string, string> = {
  hot: "Hot",
  warm: "Warm",
  cool: "Cool",
  cold: "Cold",
};

export const TEMPERATURE_COLORS: Record<string, string> = {
  hot: "bg-red-100 text-red-700",
  warm: "bg-orange-100 text-orange-700",
  cool: "bg-cyan-100 text-cyan-700",
  cold: "bg-blue-100 text-blue-700",
};

export const ESCALATION_LABELS: Record<string, string> = {
  budget_mismatch: "Budget Mismatch",
  pet_policy: "Pet Policy",
  complex_question: "Complex Question",
  showing_request: "Showing Request",
  application_ready: "Application Ready",
  complaint: "Complaint",
  manual: "Manual",
};

export const FOLLOW_UP_TYPE_LABELS: Record<string, string> = {
  no_response: "No Response",
  showing_reminder: "Showing Reminder",
  application_nudge: "Application Nudge",
  check_in: "Check In",
  custom: "Custom",
};

// ── Free Tier Limits ──────────────────────────────────────────

export const FREE_TIER_DAILY_LIMIT = 25;
export const PRO_TIER_DAILY_LIMIT = 200;
export const TEAM_TIER_DAILY_LIMIT = 1000;

export function getDailyLimit(tier: string): number {
  switch (tier) {
    case "pro": return PRO_TIER_DAILY_LIMIT;
    case "team": return TEAM_TIER_DAILY_LIMIT;
    default: return FREE_TIER_DAILY_LIMIT;
  }
}

// ── NYC Area Codes ────────────────────────────────────────────

export const NYC_AREA_CODES = ["212", "718", "347", "917", "929", "646"];

// ── Helpers ───────────────────────────────────────────────────

/**
 * Normalize any phone input to E.164 format (+1XXXXXXXXXX for US).
 * Strips all non-digit characters, prepends +1 if missing country code.
 * Returns original string if it can't be normalized (international numbers).
 */
export function normalizePhone(phone: string): string {
  const stripped = phone.replace(/[^\d+]/g, "");

  // Already E.164 with country code
  if (stripped.startsWith("+") && stripped.length >= 11) return stripped;

  // Has country code without +
  const digits = stripped.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;

  // 10-digit US number
  if (digits.length === 10) return `+1${digits}`;

  // Can't normalize — return as-is
  return phone;
}

/** @deprecated Use normalizePhone instead */
export const formatPhone = normalizePhone;
