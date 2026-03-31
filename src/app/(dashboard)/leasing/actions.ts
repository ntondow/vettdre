"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getTwilio } from "@/lib/twilio";
import { geocodeAddress } from "@/lib/geocodio";
import type {
  OnboardingInput,
  LeasingConfigSummary,
  DailyUsageStats,
  OnboardingEnrichment,
  ConversationSummary,
  ConversationDetail,
  ConversationMessage,
  ConversationStats,
} from "@/lib/leasing-types";
import { getDailyLimit, NYC_AREA_CODES, normalizePhone } from "@/lib/leasing-types";
import { checkPropertyLimit, checkListingLimit, getDetailedUsage, getQueuedMessageCount } from "@/lib/leasing-limits";
import type { DetailedUsageStats } from "@/lib/leasing-limits";

// ============================================================
// Auth Helper
// ============================================================

async function getCurrentOrg() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return { userId: user.id, orgId: user.orgId };
}

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

// ============================================================
// PLUTO address lookup (direct NYC Open Data query)
// ============================================================

const NYC_OPEN_DATA = "https://data.cityofnewyork.us/resource";
const PLUTO_DATASET = "64uk-42ks";

interface PlutoRecord {
  address: string;
  ownername: string;
  unitsres: string;
  unitstotal: string;
  yearbuilt: string;
  numfloors: string;
  assesstot: string;
  zonedist1: string;
  bldgclass: string;
  borocode: string;
  block: string;
  lot: string;
  bbl: string;
  latitude: string;
  longitude: string;
  zipcode: string;
}

async function fetchPlutoByAddress(address: string): Promise<PlutoRecord | null> {
  try {
    // Normalize: "532 Neptune Ave Brooklyn" → house number + street
    const parts = address.trim().toUpperCase().split(/\s+/);
    const houseNum = parts[0];
    if (!/^\d+$/.test(houseNum)) return null;

    // Remove borough/city/state/zip from end for cleaner street match
    const BOROUGHS = new Set(["MANHATTAN", "BROOKLYN", "BRONX", "QUEENS", "STATEN", "NEW", "NY", "NYC"]);
    const streetParts: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      if (BOROUGHS.has(parts[i])) break;
      // Also stop at zip codes
      if (/^\d{5}$/.test(parts[i])) break;
      streetParts.push(parts[i]);
    }
    if (streetParts.length === 0) return null;

    // Drop trailing street type for broader PLUTO matching
    const STREET_TYPES = new Set(["STREET", "AVENUE", "BOULEVARD", "DRIVE", "PLACE", "COURT", "ROAD", "LANE", "TERRACE", "WAY"]);
    const lastWord = streetParts[streetParts.length - 1];
    const coreStreet = STREET_TYPES.has(lastWord) && streetParts.length > 1
      ? streetParts.slice(0, -1).join(" ")
      : streetParts.join(" ");

    const escaped = coreStreet.replace(/'/g, "''");
    const where = `upper(address) like '${houseNum} ${escaped}%'`;
    const select = "address,ownername,unitsres,unitstotal,yearbuilt,numfloors,assesstot,zonedist1,bldgclass,borocode,block,lot,bbl,latitude,longitude,zipcode";

    const url = `${NYC_OPEN_DATA}/${PLUTO_DATASET}.json?$where=${encodeURIComponent(where)}&$select=${select}&$limit=1`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0] as PlutoRecord;
  } catch (error) {
    console.error("fetchPlutoByAddress error:", error);
    return null;
  }
}

// ============================================================
// NYC GeoSearch — address → BBL
// ============================================================

async function geocodeNYCAddress(query: string): Promise<{ bbl: string; borough: string } | null> {
  try {
    const url = `https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(query)}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();
    const feature = (data.features || []).find((f: any) => f.properties?.pad_bbl);
    if (!feature) return null;
    return {
      bbl: feature.properties.pad_bbl,
      borough: feature.properties.borough || "",
    };
  } catch {
    return null;
  }
}

// ============================================================
// Twilio Number Provisioning (leasing-specific)
// ============================================================

async function provisionLeasingNumber(
  orgId: string,
  userId: string,
  zipCode?: string,
): Promise<{ phoneRecord: any; error?: string } | { error: string }> {
  try {
    const twilio = getTwilio();

    // Determine preferred area code from ZIP or default to NYC codes
    const areaCodesToTry: string[] = [];
    if (zipCode) {
      // Try to get area code associated with the ZIP (simple heuristic for NYC)
      const nycZipPrefixes: Record<string, string> = {
        "100": "212", "101": "212", "102": "212",    // Manhattan
        "103": "718", "104": "718",                    // Staten Island
        "112": "718", "113": "718", "114": "718",      // Brooklyn
        "115": "718", "116": "718",                    // Brooklyn
        "110": "718", "111": "718",                    // Queens
      };
      const prefix = zipCode.slice(0, 3);
      if (nycZipPrefixes[prefix]) {
        areaCodesToTry.push(nycZipPrefixes[prefix]);
      }
    }
    // Add NYC fallback codes
    for (const code of NYC_AREA_CODES) {
      if (!areaCodesToTry.includes(code)) areaCodesToTry.push(code);
    }
    // Final fallback: any US local number
    areaCodesToTry.push("");

    let purchasedNumber: any = null;

    for (const areaCode of areaCodesToTry) {
      try {
        const searchParams: Record<string, any> = {
          limit: 1,
          smsEnabled: true,
          voiceEnabled: true,
        };
        if (areaCode) searchParams.areaCode = parseInt(areaCode, 10);

        const available = await twilio.availablePhoneNumbers("US").local.list(searchParams);
        if (available.length === 0) continue;

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vettdre.com";
        purchasedNumber = await twilio.incomingPhoneNumbers.create({
          phoneNumber: available[0].phoneNumber,
          smsUrl: `${appUrl}/api/leasing/sms`,
          smsMethod: "POST",
          voiceUrl: `${appUrl}/api/leasing/voice`,
          voiceMethod: "POST",
          statusCallback: `${appUrl}/api/leasing/sms/status`,
          statusCallbackMethod: "POST",
          friendlyName: `Leasing AI - ${areaCode || "US"}`,
        });
        break;
      } catch {
        continue;
      }
    }

    if (!purchasedNumber) {
      return { error: "No phone numbers available. Please try again later." };
    }

    const areaCode = purchasedNumber.phoneNumber.length >= 5
      ? purchasedNumber.phoneNumber.slice(2, 5)
      : null;

    const phoneRecord = await prisma.phoneNumber.create({
      data: {
        number: purchasedNumber.phoneNumber,
        twilioSid: purchasedNumber.sid,
        friendlyName: purchasedNumber.friendlyName || `Leasing AI`,
        areaCode,
        userId,
        organizationId: orgId,
        status: "active",
      },
    });

    return { phoneRecord };
  } catch (error: any) {
    console.error("provisionLeasingNumber error:", error);
    return { error: error.message || "Failed to provision phone number" };
  }
}

// ============================================================
// createLeasingConfig
// ============================================================

export async function createLeasingConfig(propertyId: string): Promise<{
  success?: boolean;
  config?: any;
  error?: string;
}> {
  try {
    const { userId, orgId } = await getCurrentOrg();

    // Verify property belongs to org
    const property = await prisma.bmsProperty.findFirst({
      where: { id: propertyId, orgId },
    });
    if (!property) return { error: "Property not found" };

    // Check if config already exists
    const existing = await prisma.leasingConfig.findUnique({
      where: { propertyId },
    });
    if (existing) return { error: "Leasing config already exists for this property" };

    // Provision Twilio number
    const numberResult = await provisionLeasingNumber(orgId, userId, property.zipCode || undefined);
    if ("error" in numberResult && !("phoneRecord" in numberResult)) {
      return { error: numberResult.error };
    }
    const phoneRecord = "phoneRecord" in numberResult ? numberResult.phoneRecord : null;

    // Create config
    const config = await prisma.leasingConfig.create({
      data: {
        orgId,
        propertyId,
        tier: "free",
        isActive: true,
        twilioNumberId: phoneRecord?.id || null,
        greeting: `Hi! I'm the leasing assistant for ${property.name || property.address || "this property"}. How can I help you today?`,
        personality: "friendly",
        languages: ["en"],
        qualCriteria: {},
      },
      include: {
        property: { include: { listings: true } },
        twilioNumber: true,
      },
    });

    // Trigger auto-enrichment for NYC addresses (fire and forget)
    if (property.address && (property.state === "NY" || property.city?.includes("New York"))) {
      getOnboardingEnrichment(`${property.address} ${property.city || ""} ${property.state || ""}`).catch(() => {});
    }

    return { success: true, config: serialize(config) };
  } catch (error: any) {
    console.error("createLeasingConfig error:", error);
    return { error: error.message || "Failed to create leasing config" };
  }
}

// ============================================================
// createPropertyWithLeasing
// ============================================================

export type OnboardingErrorCode =
  | "property_limit"
  | "listing_limit"
  | "twilio_failed"
  | "database_failed"
  | "auth_failed"
  | "unknown";

export interface OnboardingResult {
  success?: boolean;
  property?: any;
  config?: any;
  listings?: any[];
  twilioNumber?: string | null;
  orgSlug?: string | null;
  error?: string;
  errorCode?: OnboardingErrorCode;
}

export async function createPropertyWithLeasing(input: OnboardingInput): Promise<OnboardingResult> {
  let provisionedTwilioSid: string | null = null;
  let provisionedPhoneRecordId: string | null = null;

  try {
    const { userId, orgId } = await getCurrentOrg();

    // Check property limit
    const propertyLimit = await checkPropertyLimit(orgId);
    if (!propertyLimit.allowed) {
      return {
        error: `Property limit reached (${propertyLimit.current}/${propertyLimit.limit}). Upgrade to add more properties.`,
        errorCode: "property_limit",
      };
    }

    // Check listing limit
    const listingLimit = await checkListingLimit(orgId);
    if (listingLimit.current + input.units.length > listingLimit.limit) {
      return {
        error: `Listing limit would be exceeded (${listingLimit.current + input.units.length}/${listingLimit.limit}). Upgrade to add more listings.`,
        errorCode: "listing_limit",
      };
    }

    // Provision Twilio number first (outside transaction — external API)
    const numberResult = await provisionLeasingNumber(orgId, userId, input.zip);
    if ("error" in numberResult && !("phoneRecord" in numberResult)) {
      return { error: numberResult.error, errorCode: "twilio_failed" };
    }
    const phoneRecord = "phoneRecord" in numberResult ? numberResult.phoneRecord : null;

    // Track for rollback
    if (phoneRecord) {
      provisionedTwilioSid = phoneRecord.twilioSid;
      provisionedPhoneRecordId = phoneRecord.id;
    }

    const normalizedEscalationPhone = normalizePhone(input.escalationPhone);

    // Create property + listings + config in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create BmsProperty
      const property = await tx.bmsProperty.create({
        data: {
          orgId,
          name: input.address,
          address: input.address,
          city: input.city || "New York",
          state: input.state || "NY",
          zipCode: input.zip,
          landlordPhone: normalizedEscalationPhone,
          totalUnits: input.units.length,
          notes: input.additionalNotes || null,
        },
      });

      // 2. Create BmsListings for each unit
      const listings = await Promise.all(
        input.units.map((unit) =>
          tx.bmsListing.create({
            data: {
              orgId,
              propertyId: property.id,
              address: input.address,
              unit: unit.unit,
              city: input.city || "New York",
              state: input.state || "NY",
              zipCode: input.zip,
              type: "rental",
              status: "available",
              rentPrice: unit.rentPrice,
              bedrooms: unit.bedrooms,
              bathrooms: unit.bathrooms,
              sqft: unit.sqft || null,
              floor: unit.floor || null,
              description: unit.description || null,
              amenities: input.amenities,
              availableDate: unit.availableDate ? new Date(unit.availableDate) : null,
            },
          }),
        ),
      );

      // 3. Generate unique slug for web chat
      const baseSlug = input.address.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
      let slug = baseSlug;
      let slugAttempt = 1;
      while (true) {
        const existing = await tx.leasingConfig.findUnique({ where: { slug } });
        if (!existing) break;
        slugAttempt++;
        slug = `${baseSlug}-${slugAttempt}`;
      }

      // 4. Create LeasingConfig
      const config = await tx.leasingConfig.create({
        data: {
          orgId,
          propertyId: property.id,
          tier: "free",
          isActive: true,
          slug,
          twilioNumberId: phoneRecord?.id || null,
          greeting: `Hi! I'm the leasing assistant for ${input.address}. How can I help you today?`,
          personality: "friendly",
          languages: ["en"],
          qualCriteria: JSON.parse(JSON.stringify({
            escalationPhone: normalizedEscalationPhone,
            showingAvailability: input.showingAvailability || null,
            amenities: input.amenities,
          })),
        },
      });

      return { property, listings, config };
    });

    // Trigger auto-enrichment for NYC addresses (fire and forget)
    const fullAddress = `${input.address} ${input.city} ${input.state}`;
    if (input.state === "NY" || input.city?.toLowerCase().includes("new york") || input.city?.toLowerCase().includes("brooklyn") || input.city?.toLowerCase().includes("bronx") || input.city?.toLowerCase().includes("queens")) {
      getOnboardingEnrichment(fullAddress).catch(() => {});
    }

    // Fetch org slug for email address generation
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { slug: true },
    });

    return {
      success: true,
      property: serialize(result.property),
      config: serialize(result.config),
      listings: serialize(result.listings),
      twilioNumber: phoneRecord?.number || null,
      orgSlug: org?.slug || null,
    };
  } catch (error: any) {
    console.error("createPropertyWithLeasing error:", error);

    // Rollback: release Twilio number if database transaction failed
    if (provisionedTwilioSid) {
      try {
        const twilio = getTwilio();
        await twilio.incomingPhoneNumbers(provisionedTwilioSid).remove();
        console.log(`[rollback] Released Twilio number ${provisionedTwilioSid}`);
      } catch (releaseErr) {
        console.error("[rollback] Failed to release Twilio number:", releaseErr);
      }
    }
    if (provisionedPhoneRecordId) {
      try {
        await prisma.phoneNumber.delete({ where: { id: provisionedPhoneRecordId } });
        console.log(`[rollback] Deleted PhoneNumber record ${provisionedPhoneRecordId}`);
      } catch (deleteErr) {
        console.error("[rollback] Failed to delete PhoneNumber record:", deleteErr);
      }
    }

    return {
      error: error.message || "Failed to create property with leasing",
      errorCode: "database_failed",
    };
  }
}

// ============================================================
// getLeasingConfig
// ============================================================

export async function getLeasingConfig(propertyId: string): Promise<{
  config?: any;
  usage?: DailyUsageStats;
  error?: string;
}> {
  try {
    const { orgId } = await getCurrentOrg();

    const config = await prisma.leasingConfig.findFirst({
      where: { propertyId, orgId },
      include: {
        property: {
          include: {
            listings: {
              where: { status: "available" },
              orderBy: { createdAt: "desc" },
            },
          },
        },
        twilioNumber: true,
        conversations: {
          orderBy: { updatedAt: "desc" },
          take: 10,
          include: {
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    });

    if (!config) return { error: "Leasing config not found" };

    // Get today's usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayUsage = await prisma.leasingDailyUsage.findUnique({
      where: {
        configId_date: { configId: config.id, date: today },
      },
    });

    const dailyLimit = getDailyLimit(config.tier);
    const usage: DailyUsageStats = {
      messagesAi: todayUsage?.messagesAi || 0,
      messagesInbound: todayUsage?.messagesInbound || 0,
      tokensUsed: todayUsage?.tokensUsed || 0,
      dailyLimit,
      remaining: Math.max(0, dailyLimit - (todayUsage?.messagesAi || 0)),
    };

    return { config: serialize(config), usage };
  } catch (error: any) {
    console.error("getLeasingConfig error:", error);
    return { error: error.message || "Failed to get leasing config" };
  }
}

// ============================================================
// getLeasingConfigs (list all for org)
// ============================================================

export async function getLeasingConfigs(): Promise<{
  configs?: LeasingConfigSummary[];
  error?: string;
}> {
  try {
    const { orgId } = await getCurrentOrg();

    const configs = await prisma.leasingConfig.findMany({
      where: { orgId },
      include: {
        property: {
          include: {
            listings: { select: { id: true, status: true } },
          },
        },
        twilioNumber: { select: { number: true } },
        _count: { select: { conversations: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Get org slug for email address generation
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { slug: true },
    });
    const orgSlug = org?.slug || null;

    // Get today's usage for all configs
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const configIds = configs.map((c) => c.id);
    const todayUsages = await prisma.leasingDailyUsage.findMany({
      where: { configId: { in: configIds }, date: today },
    });
    const usageByConfig = new Map(todayUsages.map((u) => [u.configId, u]));

    // Get today's new conversation counts
    const todayConvCounts = await prisma.leasingConversation.groupBy({
      by: ["configId"],
      where: { configId: { in: configIds }, createdAt: { gte: today } },
      _count: true,
    });
    const convCountByConfig = new Map(todayConvCounts.map((c) => [c.configId, c._count]));

    const summaries: LeasingConfigSummary[] = configs.map((c) => {
      const usage = usageByConfig.get(c.id);
      return {
        id: c.id,
        propertyId: c.propertyId,
        propertyName: c.property.name,
        propertyAddress: c.property.address,
        tier: c.tier,
        isActive: c.isActive,
        emailEnabled: c.emailEnabled,
        twilioNumber: c.twilioNumber?.number || null,
        leasingEmail: orgSlug ? `leasing-${orgSlug}@mail.vettdre.com` : null,
        totalListings: c.property.listings.length,
        availableListings: c.property.listings.filter((l) => l.status === "available").length,
        conversationCount: c._count.conversations,
        todayMessages: (usage?.messagesAi || 0) + (usage?.messagesInbound || 0),
        todayConversations: convCountByConfig.get(c.id) || 0,
        createdAt: c.createdAt.toISOString(),
        webChatEnabled: c.webChatEnabled,
        voiceEnabled: c.voiceEnabled,
        slug: c.slug || null,
      };
    });

    return { configs: summaries };
  } catch (error: any) {
    console.error("getLeasingConfigs error:", error);
    return { error: error.message || "Failed to get leasing configs" };
  }
}

// ============================================================
// updateLeasingConfig
// ============================================================

export async function updateLeasingConfig(
  configId: string,
  data: {
    aiName?: string;
    aiTone?: string;
    greeting?: string;
    personality?: string;
    languages?: string[];
    customInstructions?: string | null;
    qualCriteria?: Record<string, unknown>;
    officeHoursStart?: string;
    officeHoursEnd?: string;
    timezone?: string;
    buildingKnowledge?: Record<string, unknown>;
    autoEnrichmentData?: Record<string, unknown>;
    emailEnabled?: boolean;
    webChatEnabled?: boolean;
    voiceEnabled?: boolean;
  },
): Promise<{ success?: boolean; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    const config = await prisma.leasingConfig.findFirst({
      where: { id: configId, orgId },
    });
    if (!config) return { error: "Leasing config not found" };

    const updateData: Record<string, unknown> = {};
    if (data.aiName !== undefined) updateData.aiName = data.aiName;
    if (data.aiTone !== undefined) updateData.aiTone = data.aiTone;
    if (data.greeting !== undefined) updateData.greeting = data.greeting;
    if (data.personality !== undefined) updateData.personality = data.personality;
    if (data.languages !== undefined) updateData.languages = data.languages;
    if (data.customInstructions !== undefined) updateData.customInstructions = data.customInstructions;
    if (data.officeHoursStart !== undefined) updateData.officeHoursStart = data.officeHoursStart;
    if (data.officeHoursEnd !== undefined) updateData.officeHoursEnd = data.officeHoursEnd;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.emailEnabled !== undefined) updateData.emailEnabled = data.emailEnabled;
    if (data.webChatEnabled !== undefined) updateData.webChatEnabled = data.webChatEnabled;
    if (data.voiceEnabled !== undefined) updateData.voiceEnabled = data.voiceEnabled;

    // JSON fields: overwrite entirely
    if (data.buildingKnowledge !== undefined) {
      updateData.buildingKnowledge = JSON.parse(JSON.stringify(data.buildingKnowledge));
    }
    if (data.autoEnrichmentData !== undefined) {
      updateData.autoEnrichmentData = JSON.parse(JSON.stringify(data.autoEnrichmentData));
    }

    // Merge qualCriteria (don't overwrite, merge)
    if (data.qualCriteria !== undefined) {
      const existing = (config.qualCriteria && typeof config.qualCriteria === "object")
        ? config.qualCriteria as Record<string, unknown>
        : {};
      updateData.qualCriteria = { ...existing, ...data.qualCriteria };
    }

    await prisma.leasingConfig.update({
      where: { id: configId },
      data: updateData,
    });

    return { success: true };
  } catch (error: any) {
    console.error("updateLeasingConfig error:", error);
    return { error: error.message || "Failed to update leasing config" };
  }
}

// ============================================================
// getWebChatConfig
// ============================================================

export async function getWebChatConfig(configId: string): Promise<{
  webChatEnabled: boolean;
  slug: string | null;
  tier: string;
  propertyName: string;
  error?: string;
}> {
  try {
    const { orgId } = await getCurrentOrg();

    const config = await prisma.leasingConfig.findFirst({
      where: { id: configId, orgId },
      select: {
        webChatEnabled: true,
        slug: true,
        tier: true,
        property: { select: { name: true } },
      },
    });

    if (!config) return { webChatEnabled: false, slug: null, tier: "free", propertyName: "", error: "Config not found" };

    return {
      webChatEnabled: config.webChatEnabled,
      slug: config.slug,
      tier: config.tier,
      propertyName: config.property.name,
    };
  } catch (error: any) {
    return { webChatEnabled: false, slug: null, tier: "free", propertyName: "", error: error.message };
  }
}

// ============================================================
// toggleLeasingActive
// ============================================================

export async function toggleLeasingActive(configId: string): Promise<{
  success?: boolean;
  isActive?: boolean;
  error?: string;
}> {
  try {
    const { orgId } = await getCurrentOrg();

    const config = await prisma.leasingConfig.findFirst({
      where: { id: configId, orgId },
    });
    if (!config) return { error: "Leasing config not found" };

    const updated = await prisma.leasingConfig.update({
      where: { id: configId },
      data: { isActive: !config.isActive },
    });

    return { success: true, isActive: updated.isActive };
  } catch (error: any) {
    console.error("toggleLeasingActive error:", error);
    return { error: error.message || "Failed to toggle leasing active" };
  }
}

// ============================================================
// getOnboardingEnrichment
// ============================================================

const BORO_NAMES: Record<string, string> = {
  "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island",
};

export async function getOnboardingEnrichment(address: string): Promise<OnboardingEnrichment | null> {
  if (!address || address.trim().length < 5) return null;

  try {
    // Parallel: PLUTO lookup + Geocodio for census/neighborhood data
    const [pluto, geo] = await Promise.all([
      fetchPlutoByAddress(address),
      geocodeAddress(address).catch(() => null),
    ]);

    if (!pluto && !geo) return null;

    return {
      yearBuilt: pluto ? parseInt(pluto.yearbuilt || "0") || null : null,
      buildingClass: pluto?.bldgclass || null,
      floors: pluto ? parseInt(pluto.numfloors || "0") || null : null,
      totalUnits: pluto ? parseInt(pluto.unitstotal || pluto.unitsres || "0") || null : null,
      zoning: pluto?.zonedist1 || null,
      assessedValue: pluto ? parseInt(pluto.assesstot || "0") || null : null,
      ownerName: pluto?.ownername || null,
      borough: pluto ? BORO_NAMES[pluto.borocode] || null : null,
      bbl: pluto?.bbl || null,
      lat: pluto?.latitude ? parseFloat(pluto.latitude) : geo?.lat || null,
      lng: pluto?.longitude ? parseFloat(pluto.longitude) : geo?.lng || null,
      neighborhood: geo?.county || null,
      medianRent: geo?.medianRentAsked || null,
      medianIncome: geo?.medianHouseholdIncome || null,
    };
  } catch (error) {
    console.error("getOnboardingEnrichment error:", error);
    return null;
  }
}

// ============================================================
// sendTestText
// ============================================================

export async function sendTestText(
  configId: string,
  phoneNumber: string,
): Promise<{ success?: boolean; messageSid?: string; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    const config = await prisma.leasingConfig.findFirst({
      where: { id: configId, orgId },
      include: {
        twilioNumber: true,
        property: {
          include: {
            listings: {
              where: { status: "available" },
              take: 1,
              orderBy: { rentPrice: "asc" },
            },
          },
        },
      },
    });

    if (!config) return { error: "Leasing config not found" };
    if (!config.twilioNumber) return { error: "No Twilio number provisioned for this config" };

    // Build a realistic test message using listing data
    const listing = config.property.listings[0];
    let testMessage: string;

    if (listing) {
      const rent = listing.rentPrice ? `$${Number(listing.rentPrice).toLocaleString()}` : "";
      const beds = listing.bedrooms || "studio";
      const unitStr = listing.unit ? ` ${listing.unit}` : "";
      testMessage = `Hi! I saw your listing for the ${beds}BR at ${config.property.address || config.property.name}${unitStr}${rent ? ` for ${rent}` : ""}. Is it still available? I'm looking to move in next month.`;
    } else {
      testMessage = `Hi! I'm interested in renting at ${config.property.address || config.property.name}. Do you have any units available? I'd love to schedule a viewing.`;
    }

    const twilio = getTwilio();
    const formattedTo = normalizePhone(phoneNumber);

    const message = await twilio.messages.create({
      body: testMessage,
      from: config.twilioNumber.number,
      to: formattedTo,
      statusCallback: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.vettdre.com"}/api/leasing/sms/status`,
    });

    // Log as a test message (don't count toward daily limits)
    await prisma.leasingMessage.create({
      data: {
        conversationId: await getOrCreateTestConversation(config.id, orgId, formattedTo),
        sender: "prospect",
        body: testMessage,
        twilioSid: message.sid,
        intentDetected: "__test__",
      },
    });

    return { success: true, messageSid: message.sid };
  } catch (error: any) {
    console.error("sendTestText error:", error);
    return { error: error.message || "Failed to send test text" };
  }
}

/** Get or create a test conversation so we can log the test message */
async function getOrCreateTestConversation(configId: string, orgId: string, phone: string): Promise<string> {
  const existing = await prisma.leasingConversation.findUnique({
    where: { configId_prospectPhone: { configId, prospectPhone: phone } },
  });
  if (existing) return existing.id;

  const conv = await prisma.leasingConversation.create({
    data: {
      orgId,
      configId,
      prospectPhone: phone,
      prospectName: "Test",
      status: "closed_lost",
      temperature: "cold",
      qualData: { isTest: true },
      aiSummary: "Test conversation",
    },
  });
  return conv.id;
}

// ============================================================
// provisionTwilioNumber
// ============================================================

export async function provisionTwilioNumber(configId: string): Promise<{
  success?: boolean;
  number?: string;
  error?: string;
}> {
  try {
    const { userId, orgId } = await getCurrentOrg();

    const config = await prisma.leasingConfig.findFirst({
      where: { id: configId, orgId },
      include: { property: true, twilioNumber: true },
    });

    if (!config) return { error: "Leasing config not found" };
    if (config.twilioNumber) return { error: "Config already has a Twilio number" };

    const result = await provisionLeasingNumber(orgId, userId, config.property.zipCode || undefined);
    if ("error" in result && !("phoneRecord" in result)) {
      return { error: result.error };
    }
    const phoneRecord = "phoneRecord" in result ? result.phoneRecord : null;
    if (!phoneRecord) return { error: "Failed to provision number" };

    // Link number to config
    await prisma.leasingConfig.update({
      where: { id: configId },
      data: { twilioNumberId: phoneRecord.id },
    });

    return { success: true, number: phoneRecord.number };
  } catch (error: any) {
    console.error("provisionTwilioNumber error:", error);
    return { error: error.message || "Failed to provision number" };
  }
}

// ============================================================
// Dashboard Server Actions
// ============================================================

export async function getConversations(filters?: {
  configId?: string;
  status?: string;
  search?: string;
}): Promise<{ conversations?: ConversationSummary[]; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    const where: Record<string, any> = { orgId };
    if (filters?.configId) where.configId = filters.configId;
    if (filters?.status === "waitlisted") {
      where.onWaitlist = true;
      where.status = { notIn: ["closed_won", "closed_lost"] };
    } else if (filters?.status && filters.status !== "all") {
      where.status = filters.status;
    }
    if (filters?.search) {
      where.OR = [
        { prospectName: { contains: filters.search, mode: "insensitive" } },
        { prospectPhone: { contains: filters.search } },
        { prospectEmail: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const conversations = await prisma.leasingConversation.findMany({
      where,
      include: {
        listing: { select: { unit: true, bedrooms: true, rentPrice: true } },
        showingAgent: { select: { firstName: true, lastName: true } },
        _count: { select: { messages: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, sender: true, createdAt: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    const result: ConversationSummary[] = conversations.map((c) => ({
      id: c.id,
      prospectPhone: c.prospectPhone,
      prospectName: c.prospectName,
      prospectEmail: c.prospectEmail,
      channel: c.channel,
      emailSubject: c.emailSubject || null,
      status: c.status,
      temperature: c.temperature,
      listingUnit: c.listing?.unit || null,
      listingRent: c.listing?.rentPrice ? Number(c.listing.rentPrice) : null,
      messageCount: c._count.messages,
      lastMessageAt: c.messages[0]?.createdAt ? new Date(c.messages[0].createdAt).toISOString() : null,
      lastMessagePreview: c.messages[0]?.body?.slice(0, 100) || null,
      lastMessageSender: c.messages[0]?.sender || null,
      aiSummary: c.aiSummary,
      escalationReason: c.escalationReason,
      showingAt: c.showingAt?.toISOString() || null,
      showingAgentName: c.showingAgent ? `${c.showingAgent.firstName} ${c.showingAgent.lastName}`.trim() : null,
      leadScore: (c.qualData as any)?.leadScore || null,
      onWaitlist: c.onWaitlist,
      detectedLanguage: (c.qualData as any)?.detectedLanguage || null,
      listingBedrooms: c.listing?.bedrooms || null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    return { conversations: result };
  } catch (error: any) {
    console.error("getConversations error:", error);
    return { error: error.message || "Failed to load conversations" };
  }
}

export async function getConversation(
  conversationId: string,
): Promise<{ conversation?: ConversationDetail; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    const conv = await prisma.leasingConversation.findFirst({
      where: { id: conversationId, orgId },
      include: {
        listing: { select: { unit: true, bedrooms: true, rentPrice: true } },
        showingAgent: { select: { firstName: true, lastName: true } },
        config: {
          select: {
            id: true,
            property: { select: { name: true, address: true } },
            twilioNumber: { select: { number: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            sender: true,
            body: true,
            intentDetected: true,
            tokensUsed: true,
            deliveryStatus: true,
            createdAt: true,
          },
        },
      },
    });

    if (!conv) return { error: "Conversation not found" };

    const messages: ConversationMessage[] = conv.messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      intentDetected: m.intentDetected,
      tokensUsed: m.tokensUsed,
      deliveryStatus: m.deliveryStatus,
      createdAt: m.createdAt.toISOString(),
    }));

    const detail: ConversationDetail = {
      id: conv.id,
      prospectPhone: conv.prospectPhone,
      prospectName: conv.prospectName,
      prospectEmail: conv.prospectEmail,
      channel: conv.channel,
      emailSubject: conv.emailSubject || null,
      status: conv.status,
      temperature: conv.temperature,
      qualData: (conv.qualData && typeof conv.qualData === "object") ? conv.qualData as Record<string, any> : {},
      aiSummary: conv.aiSummary,
      escalationReason: conv.escalationReason,
      escalatedAt: conv.escalatedAt?.toISOString() || null,
      showingAt: conv.showingAt?.toISOString() || null,
      showingAgentName: conv.showingAgent ? `${conv.showingAgent.firstName} ${conv.showingAgent.lastName}`.trim() : null,
      contactId: conv.contactId,
      listingUnit: conv.listing?.unit || null,
      listingBedrooms: conv.listing?.bedrooms || null,
      listingRent: conv.listing?.rentPrice ? Number(conv.listing.rentPrice) : null,
      propertyName: conv.config.property.name,
      propertyAddress: conv.config.property.address,
      twilioNumber: conv.config.twilioNumber?.number || null,
      configId: conv.config.id,
      onWaitlist: conv.onWaitlist,
      waitlistUnits: conv.waitlistUnits,
      messages,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    };

    return { conversation: detail };
  } catch (error: any) {
    console.error("getConversation error:", error);
    return { error: error.message || "Failed to load conversation" };
  }
}

export async function resolveEscalation(
  conversationId: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();
    const conv = await prisma.leasingConversation.findFirst({
      where: { id: conversationId, orgId, status: "escalated" },
    });
    if (!conv) return { error: "Conversation not found or not escalated" };

    await prisma.leasingConversation.update({
      where: { id: conversationId },
      data: { status: "active", escalatedAt: null, escalationReason: null },
    });
    return { success: true };
  } catch (error: any) {
    console.error("resolveEscalation error:", error);
    return { error: error.message || "Failed to resolve escalation" };
  }
}

export async function confirmShowing(
  conversationId: string,
  datetime?: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const { orgId, userId } = await getCurrentOrg();

    const conv = await prisma.leasingConversation.findFirst({
      where: { id: conversationId, orgId },
      include: {
        config: {
          include: { twilioNumber: true, property: true },
        },
        listing: { select: { unit: true } },
      },
    });
    if (!conv) return { error: "Conversation not found" };

    const showingTime = datetime
      ? new Date(datetime)
      : conv.showingAt
        ? new Date(conv.showingAt)
        : null;

    const timeStr = showingTime
      ? showingTime.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "the requested time";

    // Send confirmation SMS to prospect
    const aiNumber = conv.config.twilioNumber?.number;
    if (aiNumber) {
      const body = `Great news! Your showing is confirmed for ${timeStr}. The address is ${conv.config.property.address || conv.config.property.name}${conv.listing?.unit ? ` (Unit ${conv.listing.unit})` : ""}. See you there!`;
      try {
        const twilio = getTwilio();
        await twilio.messages.create({
          body,
          from: aiNumber,
          to: conv.prospectPhone,
        });
      } catch (err) {
        console.error("[leasing] Failed to send showing confirmation:", err);
      }

      // Save as agent message
      await prisma.leasingMessage.create({
        data: {
          conversationId: conv.id,
          sender: "agent",
          body,
          intentDetected: "showing_confirmed",
        },
      });
    }

    // Update conversation status
    await prisma.leasingConversation.update({
      where: { id: conversationId },
      data: {
        status: "showing_scheduled",
        showingAt: showingTime,
        escalatedAt: null,
        escalationReason: null,
      },
    });

    // Create CalendarEvent if showing time is set
    if (showingTime) {
      const prospectLabel = conv.prospectName || conv.prospectPhone;
      const unitLabel = conv.listing?.unit ? ` Unit ${conv.listing.unit}` : "";
      try {
        await prisma.calendarEvent.create({
          data: {
            orgId,
            userId,
            title: `Showing: ${prospectLabel} — ${conv.config.property.name}${unitLabel}`,
            startAt: showingTime,
            endAt: new Date(showingTime.getTime() + 30 * 60 * 1000),
            eventType: "showing",
            propertyAddress: conv.config.property.address || conv.config.property.name,
            source: "leasing_ai",
          },
        });
      } catch (err) {
        console.error("[leasing] Failed to create calendar event:", err);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error("confirmShowing error:", error);
    return { error: error.message || "Failed to confirm showing" };
  }
}

export async function declineShowing(
  conversationId: string,
  reason?: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    const conv = await prisma.leasingConversation.findFirst({
      where: { id: conversationId, orgId },
      include: {
        config: { include: { twilioNumber: true } },
      },
    });
    if (!conv) return { error: "Conversation not found" };

    const aiNumber = conv.config.twilioNumber?.number;
    if (aiNumber) {
      const body = reason
        ? `Unfortunately, that time doesn't work — ${reason}. Would you like to suggest another time?`
        : "Unfortunately, that time doesn't work. Would you like to suggest another time that might be better?";
      try {
        const twilio = getTwilio();
        await twilio.messages.create({ body, from: aiNumber, to: conv.prospectPhone });
      } catch (err) {
        console.error("[leasing] Failed to send decline:", err);
      }

      await prisma.leasingMessage.create({
        data: {
          conversationId: conv.id,
          sender: "agent",
          body,
          intentDetected: "showing_declined",
        },
      });
    }

    await prisma.leasingConversation.update({
      where: { id: conversationId },
      data: { showingAt: null, escalatedAt: null, escalationReason: null, status: "active" },
    });

    return { success: true };
  } catch (error: any) {
    console.error("declineShowing error:", error);
    return { error: error.message || "Failed to decline showing" };
  }
}

export async function sendManualReply(
  conversationId: string,
  message: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    const conv = await prisma.leasingConversation.findFirst({
      where: { id: conversationId, orgId },
      include: { config: { include: { twilioNumber: true, property: { select: { name: true, address: true } } } } },
    });
    if (!conv) return { error: "Conversation not found" };

    const isEmailConv = conv.channel === "email";
    let twilioSid: string | null = null;

    if (isEmailConv) {
      // Send via email
      if (!conv.prospectEmail) return { error: "No prospect email address" };
      const { sendLeasingReply } = await import("@/lib/leasing-email");
      try {
        await sendLeasingReply(
          { orgId: conv.config.orgId, property: { name: conv.config.property.name, address: conv.config.property.address } },
          conv.prospectEmail,
          conv.prospectName,
          conv.emailSubject || `Re: ${conv.config.property.name || conv.config.property.address || "Inquiry"}`,
          message.trim(),
        );
      } catch (err) {
        console.error("[leasing] Failed to send manual email reply:", err);
        return { error: "Failed to send email" };
      }
    } else {
      // Send via Twilio from AI's number
      const aiNumber = conv.config.twilioNumber?.number;
      if (!aiNumber) return { error: "No phone number assigned" };

      try {
        const twilio = getTwilio();
        const sent = await twilio.messages.create({
          body: message.trim(),
          from: aiNumber,
          to: conv.prospectPhone,
        });
        twilioSid = sent.sid;
      } catch (err) {
        console.error("[leasing] Failed to send manual reply:", err);
        return { error: "Failed to send SMS" };
      }
    }

    // Save as agent message
    await prisma.leasingMessage.create({
      data: {
        conversationId: conv.id,
        sender: "agent",
        channel: isEmailConv ? "email" : "sms",
        body: message.trim(),
        twilioSid,
        intentDetected: "manual_reply",
      },
    });

    // Update conversation timestamp
    await prisma.leasingConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return { success: true };
  } catch (error: any) {
    console.error("sendManualReply error:", error);
    return { error: error.message || "Failed to send reply" };
  }
}

export async function markConversationDead(
  conversationId: string,
  reason?: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    const conv = await prisma.leasingConversation.findFirst({
      where: { id: conversationId, orgId },
    });
    if (!conv) return { error: "Conversation not found" };

    // Update status
    await prisma.leasingConversation.update({
      where: { id: conversationId },
      data: {
        status: "closed_lost",
        escalatedAt: null,
        escalationReason: null,
        aiSummary: reason ? `${conv.aiSummary || ""}\n[Closed: ${reason}]`.trim() : conv.aiSummary,
      },
    });

    // Cancel pending follow-ups
    await prisma.leasingFollowUp.updateMany({
      where: { conversationId, status: "pending" },
      data: { status: "canceled" },
    });

    return { success: true };
  } catch (error: any) {
    console.error("markConversationDead error:", error);
    return { error: error.message || "Failed to update conversation" };
  }
}

export async function getConversationStats(
  configId?: string,
): Promise<{ stats?: ConversationStats; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    const baseWhere: Record<string, any> = { orgId };
    if (configId) baseWhere.configId = configId;

    const [total, active, escalated, hotLeads, showingsThisWeek, waitlistCount] = await Promise.all([
      prisma.leasingConversation.count({ where: baseWhere }),
      prisma.leasingConversation.count({ where: { ...baseWhere, status: { in: ["active", "qualified", "showing_scheduled"] } } }),
      prisma.leasingConversation.count({ where: { ...baseWhere, status: "escalated" } }),
      prisma.leasingConversation.count({ where: { ...baseWhere, temperature: "hot" } }),
      prisma.leasingConversation.count({
        where: {
          ...baseWhere,
          status: "showing_scheduled",
          showingAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.leasingConversation.count({
        where: { ...baseWhere, onWaitlist: true, status: { notIn: ["closed_won", "closed_lost"] } },
      }),
    ]);

    // Today's messages across all configs
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const usageWhere: Record<string, any> = { date: today };
    if (configId) {
      usageWhere.configId = configId;
    } else {
      // Get all config IDs for this org
      const configs = await prisma.leasingConfig.findMany({ where: { orgId }, select: { id: true, tier: true } });
      usageWhere.configId = { in: configs.map((c) => c.id) };
    }

    const usageRows = await prisma.leasingDailyUsage.findMany({
      where: usageWhere,
      select: { messagesAi: true, messagesInbound: true },
    });
    const messagesToday = usageRows.reduce((sum, u) => sum + u.messagesAi + u.messagesInbound, 0);

    // Get daily limit (use first config or default)
    let dailyLimit = 25;
    const tierCfg = await prisma.leasingConfig.findFirst({
      where: configId ? { id: configId } : { orgId },
      select: { tier: true },
    });
    if (tierCfg) dailyLimit = getDailyLimit(tierCfg.tier);

    return {
      stats: {
        totalConversations: total,
        activeConversations: active,
        escalatedCount: escalated,
        showingsThisWeek,
        hotLeads,
        waitlistCount,
        messagesToday,
        dailyLimit,
      },
    };
  } catch (error: any) {
    console.error("getConversationStats error:", error);
    return { error: error.message || "Failed to load stats" };
  }
}

export async function getEscalatedCount(): Promise<number> {
  try {
    const { orgId } = await getCurrentOrg();
    return prisma.leasingConversation.count({ where: { orgId, status: "escalated" } });
  } catch {
    return 0;
  }
}

// ============================================================
// Waitlist Match Detection
// ============================================================

export interface WaitlistAlert {
  configId: string;
  propertyName: string;
  availableListingCount: number;
  waitlistedCount: number;
}

/**
 * Check if any properties have BOTH available listings AND waitlisted prospects.
 * Returns alerts for the dashboard banner.
 */
export async function getWaitlistAlerts(
  configId?: string,
): Promise<WaitlistAlert[]> {
  try {
    const { orgId } = await getCurrentOrg();

    const where: Record<string, any> = { orgId, isActive: true };
    if (configId) where.id = configId;

    const configs = await prisma.leasingConfig.findMany({
      where,
      select: {
        id: true,
        property: {
          select: {
            name: true,
            listings: {
              where: { status: "available" },
              select: { id: true },
            },
          },
        },
        conversations: {
          where: {
            onWaitlist: true,
            status: { notIn: ["closed_won", "closed_lost"] },
          },
          select: { id: true },
        },
      },
    });

    return configs
      .filter((c) => c.property.listings.length > 0 && c.conversations.length > 0)
      .map((c) => ({
        configId: c.id,
        propertyName: c.property.name,
        availableListingCount: c.property.listings.length,
        waitlistedCount: c.conversations.length,
      }));
  } catch (error: any) {
    console.error("getWaitlistAlerts error:", error);
    return [];
  }
}

// ============================================================
// Retry Failed Message
// ============================================================

export async function retryFailedMessage(
  messageId: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    const message = await prisma.leasingMessage.findFirst({
      where: { id: messageId },
      include: {
        conversation: {
          select: {
            id: true,
            orgId: true,
            prospectPhone: true,
            config: {
              select: {
                twilioNumber: { select: { number: true } },
              },
            },
          },
        },
      },
    });

    if (!message) return { error: "Message not found" };
    if (message.conversation.orgId !== orgId) return { error: "Unauthorized" };
    if (message.sender !== "ai") return { error: "Can only retry AI messages" };

    const twilioNumber = message.conversation.config.twilioNumber?.number;
    if (!twilioNumber) return { error: "No Twilio number configured" };

    // Send via Twilio
    const twilio = getTwilio();
    const sent = await twilio.messages.create({
      body: message.body,
      from: twilioNumber,
      to: message.conversation.prospectPhone,
    });

    // Create new message record for the retry
    await prisma.leasingMessage.create({
      data: {
        conversationId: message.conversation.id,
        sender: "ai",
        body: message.body,
        twilioSid: sent.sid,
        intentDetected: "retry",
      },
    });

    // Mark original as retry_sent
    await prisma.leasingMessage.update({
      where: { id: messageId },
      data: { deliveryStatus: "retry_sent" },
    });

    return { success: true };
  } catch (error: any) {
    console.error("retryFailedMessage error:", error);
    return { error: error.message || "Failed to retry message" };
  }
}

// ============================================================
// Usage / Metering Actions
// ============================================================

export async function getUsageStats(
  configId?: string,
): Promise<{ usage?: DetailedUsageStats; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();
    const usage = await getDetailedUsage(orgId, configId);
    return { usage };
  } catch (error: any) {
    console.error("getUsageStats error:", error);
    return { error: error.message || "Failed to load usage" };
  }
}

export async function getQueuedCount(): Promise<number> {
  try {
    const { orgId } = await getCurrentOrg();
    return getQueuedMessageCount(orgId);
  } catch {
    return 0;
  }
}

// ============================================================
// Check Google Calendar Connection (for Pro tier dashboard)
// ============================================================

export async function checkGoogleCalendarConnected(): Promise<{
  connected: boolean;
  hasProConfig: boolean;
}> {
  try {
    const { orgId } = await getCurrentOrg();

    // Check if any leasing config is Pro/Team
    const proConfig = await prisma.leasingConfig.findFirst({
      where: { orgId, tier: { in: ["pro", "team"] }, isActive: true },
    });

    if (!proConfig) return { connected: false, hasProConfig: false };

    // Check if org owner/admin has Gmail connected (which includes Calendar scope)
    const orgUsers = await prisma.user.findMany({
      where: { orgId, role: { in: ["owner", "admin"] } },
      select: { id: true },
    });

    for (const user of orgUsers) {
      const account = await prisma.gmailAccount.findFirst({
        where: { userId: user.id, isActive: true },
      });
      if (account) return { connected: true, hasProConfig: true };
    }

    return { connected: false, hasProConfig: true };
  } catch {
    return { connected: false, hasProConfig: false };
  }
}

// ============================================================
// Follow-Up Cadence Actions
// ============================================================

export interface PendingFollowUp {
  id: string;
  type: string;
  cadencePosition: number;
  scheduledFor: string;
  status: string;
}

export async function getConversationFollowUps(
  conversationId: string,
): Promise<{ followUps?: PendingFollowUp[]; tier?: string; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    const conv = await prisma.leasingConversation.findFirst({
      where: { id: conversationId, orgId },
      select: { config: { select: { tier: true } } },
    });
    if (!conv) return { error: "Conversation not found" };

    const followUps = await prisma.leasingFollowUp.findMany({
      where: { conversationId, status: "pending" },
      orderBy: [{ cadencePosition: "asc" }, { scheduledFor: "asc" }],
      select: { id: true, type: true, cadencePosition: true, scheduledFor: true, status: true },
    });

    return {
      followUps: followUps.map((f) => ({
        id: f.id,
        type: f.type,
        cadencePosition: f.cadencePosition,
        scheduledFor: f.scheduledFor.toISOString(),
        status: f.status,
      })),
      tier: conv.config.tier,
    };
  } catch (error: any) {
    console.error("getConversationFollowUps error:", error);
    return { error: error.message || "Failed to get follow-ups" };
  }
}

export async function skipFollowUp(
  followUpId: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    // Verify the follow-up belongs to a conversation owned by this org
    const followUp = await prisma.leasingFollowUp.findUnique({
      where: { id: followUpId },
      include: { conversation: { select: { orgId: true } } },
    });
    if (!followUp || followUp.conversation.orgId !== orgId) {
      return { error: "Follow-up not found" };
    }
    if (followUp.status !== "pending") {
      return { error: "Follow-up is not pending" };
    }

    await prisma.leasingFollowUp.update({
      where: { id: followUpId },
      data: { status: "canceled" },
    });

    return { success: true };
  } catch (error: any) {
    console.error("skipFollowUp error:", error);
    return { error: error.message || "Failed to skip follow-up" };
  }
}

export async function sendFollowUpNow(
  followUpId: string,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    const followUp = await prisma.leasingFollowUp.findUnique({
      where: { id: followUpId },
      include: { conversation: { select: { orgId: true } } },
    });
    if (!followUp || followUp.conversation.orgId !== orgId) {
      return { error: "Follow-up not found" };
    }
    if (followUp.status !== "pending") {
      return { error: "Follow-up is not pending" };
    }

    // Set scheduledFor to now — cron will pick it up on next run
    await prisma.leasingFollowUp.update({
      where: { id: followUpId },
      data: { scheduledFor: new Date() },
    });

    return { success: true };
  } catch (error: any) {
    console.error("sendFollowUpNow error:", error);
    return { error: error.message || "Failed to send follow-up" };
  }
}

// ============================================================
// getKnowledgeConfig — fetch config for knowledge base editor
// ============================================================

export async function getKnowledgeConfig(configId: string): Promise<{
  config?: {
    id: string;
    tier: string;
    propertyName: string;
    aiName: string;
    aiTone: string;
    greeting: string;
    languages: string[];
    customInstructions: string | null;
    buildingKnowledge: Record<string, any> | null;
  };
  error?: string;
}> {
  try {
    const { orgId } = await getCurrentOrg();

    const config = await prisma.leasingConfig.findFirst({
      where: { id: configId, orgId },
      include: {
        property: { select: { name: true, address: true } },
      },
    });

    if (!config) return { error: "Leasing config not found" };

    return {
      config: {
        id: config.id,
        tier: config.tier,
        propertyName: config.property.name || config.property.address || "Property",
        aiName: config.aiName,
        aiTone: config.aiTone,
        greeting: config.greeting,
        languages: config.languages,
        customInstructions: config.customInstructions,
        buildingKnowledge: config.buildingKnowledge as Record<string, any> | null,
      },
    };
  } catch (error: any) {
    console.error("getKnowledgeConfig error:", error);
    return { error: error.message || "Failed to get knowledge config" };
  }
}

// ============================================================
// saveKnowledgeBase — save personality + knowledge fields
// ============================================================

export async function saveKnowledgeBase(
  configId: string,
  data: {
    aiName: string;
    aiTone: string;
    greeting: string;
    languages: string[];
    customInstructions: string | null;
    knowledgeFields: Record<string, unknown>;
  },
): Promise<{ success?: boolean; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    const config = await prisma.leasingConfig.findFirst({
      where: { id: configId, orgId },
    });
    if (!config) return { error: "Leasing config not found" };

    // Merge knowledge fields into existing buildingKnowledge (preserve auto-enrichment data)
    const existingKb = (config.buildingKnowledge && typeof config.buildingKnowledge === "object")
      ? config.buildingKnowledge as Record<string, unknown>
      : {};

    const mergedKb = {
      ...existingKb,
      ...data.knowledgeFields,
    };

    // Remove undefined values
    for (const key of Object.keys(mergedKb)) {
      if (mergedKb[key] === undefined) delete mergedKb[key];
    }

    await prisma.leasingConfig.update({
      where: { id: configId },
      data: {
        aiName: data.aiName,
        aiTone: data.aiTone,
        greeting: data.greeting,
        languages: data.languages,
        customInstructions: data.customInstructions,
        buildingKnowledge: JSON.parse(JSON.stringify(mergedKb)),
      },
    });

    return { success: true };
  } catch (error: any) {
    console.error("saveKnowledgeBase error:", error);
    return { error: error.message || "Failed to save knowledge base" };
  }
}

// ============================================================
// getAnalyticsData — fetch analytics for a config
// ============================================================

export async function getAnalyticsData(
  configId: string,
  range: "7d" | "30d" | "90d",
): Promise<{ data?: Awaited<ReturnType<typeof import("@/lib/leasing-analytics").getAnalytics>>; tier?: string; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    // Verify config belongs to org
    const config = await prisma.leasingConfig.findFirst({
      where: { id: configId, orgId },
      select: { id: true, tier: true },
    });
    if (!config) return { error: "Leasing config not found" };

    const end = new Date();
    const start = new Date();
    if (range === "7d") start.setDate(start.getDate() - 7);
    else if (range === "30d") start.setDate(start.getDate() - 30);
    else start.setDate(start.getDate() - 90);
    start.setHours(0, 0, 0, 0);

    const { getAnalytics } = await import("@/lib/leasing-analytics");
    const data = await getAnalytics(configId, { start, end });

    return { data: serialize(data), tier: config.tier };
  } catch (error: any) {
    console.error("getAnalyticsData error:", error);
    return { error: error.message || "Failed to get analytics" };
  }
}

// Re-export type for client consumption
export type { AnalyticsData } from "@/lib/leasing-analytics";
export type { FunnelStage, ResponseMetrics, DayVolume, HourBucket, TemperatureDist } from "@/lib/leasing-analytics";

// ============================================================
// createBillingPortalSession — Stripe Customer Portal
// ============================================================

export async function createBillingPortalSession(configId: string): Promise<{
  url?: string;
  error?: string;
}> {
  try {
    const { orgId } = await getCurrentOrg();

    const config = await prisma.leasingConfig.findFirst({
      where: { id: configId, orgId },
      select: { stripeCustomerId: true },
    });
    if (!config) return { error: "Leasing config not found" };
    if (!config.stripeCustomerId) return { error: "No active subscription" };

    const { getStripe } = await import("@/lib/stripe");
    const stripe = getStripe();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const session = await stripe.billingPortal.sessions.create({
      customer: config.stripeCustomerId,
      return_url: `${appUrl}/leasing/analytics?configId=${configId}`,
    });

    return { url: session.url };
  } catch (error: any) {
    console.error("createBillingPortalSession error:", error);
    return { error: error.message || "Failed to create portal session" };
  }
}

// ── A/B Test Results ─────────────────────────────────────────

export async function getAbTestResults(configId: string): Promise<{
  results?: Awaited<ReturnType<typeof import("@/lib/leasing-ab").getAllAbResults>>;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return { error: "Unauthorized" };

    const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
    if (!user) return { error: "User not found" };

    const config = await prisma.leasingConfig.findFirst({
      where: { id: configId, orgId: user.orgId },
    });
    if (!config) return { error: "Config not found" };

    const { getAllAbResults } = await import("@/lib/leasing-ab");
    const results = await getAllAbResults(configId);
    return { results };
  } catch (error: any) {
    console.error("getAbTestResults error:", error);
    return { error: error.message || "Failed to load A/B results" };
  }
}

export type AbResultsData = Awaited<ReturnType<typeof import("@/lib/leasing-ab").getAllAbResults>>;

// ============================================================
// getBenchmarksData — fetch benchmark comparison for config
// ============================================================

export async function getBenchmarksData(configId: string): Promise<{
  benchmarks?: import("@/lib/leasing-benchmarks").BenchmarkResult;
  error?: string;
}> {
  try {
    const { orgId } = await getCurrentOrg();

    const config = await prisma.leasingConfig.findFirst({
      where: { id: configId, orgId },
      select: { id: true },
    });
    if (!config) return { error: "Leasing config not found" };

    const { getBenchmarks } = await import("@/lib/leasing-benchmarks");
    const benchmarks = await getBenchmarks(configId);

    return { benchmarks: benchmarks ? serialize(benchmarks) : undefined };
  } catch (error: any) {
    console.error("getBenchmarksData error:", error);
    return { error: error.message || "Failed to get benchmarks" };
  }
}

export type { BenchmarkResult } from "@/lib/leasing-benchmarks";

// ============================================================
// getTeamConfig — fetch team members, cadences, org agents
// ============================================================

export async function getTeamConfig(configId: string): Promise<{
  config?: {
    id: string;
    tier: string;
    propertyName: string;
    teamMembers: import("@/lib/leasing-followups").CustomCadence extends never ? never : any[];
    cadences: import("@/lib/leasing-followups").CustomCadence[];
    orgAgents: { id: string; name: string; email: string; phone: string | null }[];
  };
  error?: string;
}> {
  try {
    const { orgId } = await getCurrentOrg();

    const config = await prisma.leasingConfig.findFirst({
      where: { id: configId, orgId },
      select: {
        id: true,
        tier: true,
        buildingKnowledge: true,
        property: { select: { name: true, address: true } },
      },
    });
    if (!config) return { error: "Leasing config not found" };

    // Fetch org's broker agents for dropdown
    const agents = await prisma.brokerAgent.findMany({
      where: { orgId, status: "active" },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      orderBy: { firstName: "asc" },
    });

    const bk = (config.buildingKnowledge && typeof config.buildingKnowledge === "object")
      ? config.buildingKnowledge as Record<string, any>
      : {};

    return {
      config: serialize({
        id: config.id,
        tier: config.tier,
        propertyName: config.property.name || config.property.address || "Property",
        teamMembers: Array.isArray(bk.teamMembers) ? bk.teamMembers : [],
        cadences: Array.isArray(bk.cadences) ? bk.cadences : [],
        orgAgents: agents.map((a) => ({
          id: a.id,
          name: `${a.firstName} ${a.lastName}`,
          email: a.email,
          phone: a.phone,
        })),
      }),
    };
  } catch (error: any) {
    console.error("getTeamConfig error:", error);
    return { error: error.message || "Failed to get team config" };
  }
}

// ============================================================
// saveTeamConfig — save team members and cadences
// ============================================================

export async function saveTeamConfig(
  configId: string,
  data: {
    teamMembers: any[];
    cadences: any[];
  },
): Promise<{ success?: boolean; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    const config = await prisma.leasingConfig.findFirst({
      where: { id: configId, orgId },
    });
    if (!config) return { error: "Leasing config not found" };

    const existingKb = (config.buildingKnowledge && typeof config.buildingKnowledge === "object")
      ? config.buildingKnowledge as Record<string, unknown>
      : {};

    await prisma.leasingConfig.update({
      where: { id: configId },
      data: {
        buildingKnowledge: JSON.parse(JSON.stringify({
          ...existingKb,
          teamMembers: data.teamMembers,
          cadences: data.cadences,
        })),
      },
    });

    return { success: true };
  } catch (error: any) {
    console.error("saveTeamConfig error:", error);
    return { error: error.message || "Failed to save team config" };
  }
}

// ============================================================
// Referral Data
// ============================================================

export async function getReferralData(): Promise<{
  referralCode: string;
  friendsReferred: number;
  friendsUpgraded: number;
  error?: string;
}> {
  try {
    const { orgId } = await getCurrentOrg();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { referralCode: true },
    });

    // Generate referral code if missing (legacy orgs)
    let code = org?.referralCode;
    if (!code) {
      code = Math.random().toString(36).slice(2, 10);
      await prisma.organization.update({
        where: { id: orgId },
        data: { referralCode: code },
      });
    }

    const referred = await prisma.organization.count({
      where: { referredByOrgId: orgId },
    });

    // Count referred orgs that have a non-free leasing config
    const upgraded = await prisma.leasingConfig.count({
      where: {
        organization: { referredByOrgId: orgId },
        tier: { not: "free" },
      },
    });

    return { referralCode: code, friendsReferred: referred, friendsUpgraded: upgraded };
  } catch (error: any) {
    return { referralCode: "", friendsReferred: 0, friendsUpgraded: 0, error: error.message };
  }
}
