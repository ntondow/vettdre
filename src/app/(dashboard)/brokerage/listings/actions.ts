"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { logListingAction, logPropertyAction } from "@/lib/bms-audit";
import {
  getStagesForType,
  getDefaultStageForType,
  DEFAULT_RENTAL_TASKS,
  DEFAULT_SALE_TASKS,
} from "@/lib/transaction-templates";
import type { BmsListingStatus, BmsListingType, BmsCommissionType } from "@prisma/client";
import type {
  BmsListingInput,
  BmsListingRecord,
  BmsPropertyInput,
  BmsPropertyRecord,
  BmsListingStatusType,
  ListingStats,
  PropertySummary,
  ListingBulkRow,
} from "@/lib/bms-types";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentOrg() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: { brokerAgent: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!user) throw new Error("User not found");
  return {
    userId: user.id,
    orgId: user.orgId,
    userName: user.fullName,
    agentId: user.brokerAgent?.id,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(data: any): any {
  return JSON.parse(JSON.stringify(data));
}

function actor(ctx: { userId: string; userName: string }) {
  return { id: ctx.userId, name: ctx.userName };
}

function parseOptionalDate(val?: string): Date | undefined {
  if (!val) return undefined;
  const d = new Date(val);
  return isNaN(d.getTime()) ? undefined : d;
}

const LISTING_STATUS_ORDER: BmsListingStatusType[] = [
  "available", "showing", "application", "approved", "leased",
];

// ── Create Listing ──────────────────────────────────────────

export async function createListing(input: BmsListingInput): Promise<BmsListingRecord> {
  const ctx = await getCurrentOrg();

  // Calculate days on market from available date
  let daysOnMarket: number | undefined;
  if (input.availableDate) {
    const availDate = new Date(input.availableDate);
    if (!isNaN(availDate.getTime()) && availDate <= new Date()) {
      daysOnMarket = Math.max(0, Math.floor((Date.now() - availDate.getTime()) / 86400000));
    }
  }

  // Calculate commission amount if needed
  let commissionAmount = input.commissionAmount;
  if (input.commissionType === "one_month" && input.rentPrice) {
    commissionAmount = input.rentPrice;
  } else if (input.commissionType === "percentage" && input.rentPrice && input.commissionPct) {
    commissionAmount = input.rentPrice * input.commissionPct / 100;
  }

  const listing = await prisma.bmsListing.create({
    data: {
      orgId: ctx.orgId,
      propertyId: input.propertyId || undefined,
      address: input.address,
      unit: input.unit,
      city: input.city || "New York",
      state: input.state || "NY",
      zipCode: input.zipCode,
      type: (input.type || "rental") as BmsListingType,
      status: "available",
      rentPrice: input.rentPrice,
      askingPrice: input.askingPrice,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      sqft: input.sqft,
      floor: input.floor,
      description: input.description,
      amenities: input.amenities || [],
      availableDate: parseOptionalDate(input.availableDate),
      daysOnMarket,
      commissionType: input.commissionType as BmsCommissionType | undefined,
      commissionAmount,
      commissionPct: input.commissionPct,
      agentId: input.agentId || undefined,
      notes: input.notes,
    },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      property: { select: { id: true, name: true, landlordName: true } },
    },
  });

  logListingAction(ctx.orgId, actor(ctx), "created", listing.id, {
    address: input.address,
    propertyId: input.propertyId,
  });

  return serialize(listing) as BmsListingRecord;
}

// ── Update Listing ──────────────────────────────────────────

export async function updateListing(
  id: string,
  data: Partial<BmsListingInput>,
): Promise<BmsListingRecord> {
  const ctx = await getCurrentOrg();

  const existing = await prisma.bmsListing.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!existing) throw new Error("Listing not found");

  const updateData: Record<string, unknown> = {};

  const stringFields = [
    "address", "unit", "city", "state", "zipCode", "bedrooms", "bathrooms",
    "floor", "description", "notes", "tenantName", "tenantEmail", "tenantPhone",
  ] as const;

  for (const field of stringFields) {
    if (data[field] !== undefined) updateData[field] = data[field];
  }

  if (data.propertyId !== undefined) updateData.propertyId = data.propertyId || null;
  if (data.agentId !== undefined) updateData.agentId = data.agentId || null;
  if (data.sqft !== undefined) updateData.sqft = data.sqft;
  if (data.rentPrice !== undefined) updateData.rentPrice = data.rentPrice;
  if (data.askingPrice !== undefined) updateData.askingPrice = data.askingPrice;
  if (data.amenities !== undefined) updateData.amenities = data.amenities;
  if (data.commissionType !== undefined) updateData.commissionType = data.commissionType as BmsCommissionType;
  if (data.commissionAmount !== undefined) updateData.commissionAmount = data.commissionAmount;
  if (data.commissionPct !== undefined) updateData.commissionPct = data.commissionPct;
  if (data.availableDate !== undefined) updateData.availableDate = parseOptionalDate(data.availableDate);
  if (data.leaseStartDate !== undefined) updateData.leaseStartDate = parseOptionalDate(data.leaseStartDate);
  if (data.leaseEndDate !== undefined) updateData.leaseEndDate = parseOptionalDate(data.leaseEndDate);

  const updated = await prisma.bmsListing.update({
    where: { id },
    data: updateData as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      property: { select: { id: true, name: true, landlordName: true } },
    },
  });

  logListingAction(ctx.orgId, actor(ctx), "updated", id, {
    fields: Object.keys(updateData),
  });

  return serialize(updated) as BmsListingRecord;
}

// ── Delete Listing ──────────────────────────────────────────

export async function deleteListing(id: string): Promise<void> {
  const ctx = await getCurrentOrg();

  const listing = await prisma.bmsListing.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!listing) throw new Error("Listing not found");

  await prisma.bmsListing.delete({ where: { id } });

  logListingAction(ctx.orgId, actor(ctx), "deleted", id, {
    address: listing.address,
  });
}

// ── Get Single Listing ──────────────────────────────────────

export async function getListing(id: string): Promise<BmsListingRecord> {
  const ctx = await getCurrentOrg();

  const listing = await prisma.bmsListing.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      property: { select: { id: true, name: true, landlordName: true } },
      transaction: { select: { id: true, stage: true } },
    },
  });
  if (!listing) throw new Error("Listing not found");

  return serialize(listing) as BmsListingRecord;
}

// ── Get Listings (list with filters) ────────────────────────

export async function getListings(filters?: {
  propertyId?: string;
  status?: string | string[];
  agentId?: string;
  type?: string;
  minRent?: number;
  maxRent?: number;
  bedrooms?: string;
  search?: string;
  unassigned?: boolean;
}): Promise<BmsListingRecord[]> {
  const ctx = await getCurrentOrg();

  const where: Record<string, unknown> = { orgId: ctx.orgId };

  if (filters?.propertyId) where.propertyId = filters.propertyId;
  if (filters?.type) where.type = filters.type;

  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      where.status = { in: filters.status };
    } else {
      where.status = filters.status;
    }
  }

  if (filters?.agentId) where.agentId = filters.agentId;
  if (filters?.unassigned) where.agentId = null;

  if (filters?.bedrooms) where.bedrooms = filters.bedrooms;

  if (filters?.minRent || filters?.maxRent) {
    const rentFilter: Record<string, unknown> = {};
    if (filters.minRent) rentFilter.gte = filters.minRent;
    if (filters.maxRent) rentFilter.lte = filters.maxRent;
    where.rentPrice = rentFilter;
  }

  if (filters?.search) {
    const s = filters.search;
    where.OR = [
      { address: { contains: s, mode: "insensitive" } },
      { unit: { contains: s, mode: "insensitive" } },
      { tenantName: { contains: s, mode: "insensitive" } },
      { notes: { contains: s, mode: "insensitive" } },
      { property: { name: { contains: s, mode: "insensitive" } } },
    ];
  }

  const listings = await prisma.bmsListing.findMany({
    where: where as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    orderBy: { updatedAt: "desc" },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      property: { select: { id: true, name: true, landlordName: true } },
    },
  });

  return serialize(listings) as BmsListingRecord[];
}

// ── Advance Listing Status ──────────────────────────────────

export async function advanceListingStatus(
  id: string,
  tenantData?: { tenantName?: string; tenantEmail?: string; tenantPhone?: string; leaseStartDate?: string; commissionAmount?: number },
): Promise<BmsListingRecord> {
  const ctx = await getCurrentOrg();

  const listing = await prisma.bmsListing.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      property: { select: { id: true, name: true, landlordName: true } },
    },
  });
  if (!listing) throw new Error("Listing not found");

  if (listing.status === "leased" || listing.status === "off_market") {
    throw new Error("Listing is already in a terminal status");
  }

  const currentIndex = LISTING_STATUS_ORDER.indexOf(listing.status as BmsListingStatusType);
  if (currentIndex === -1 || currentIndex >= LISTING_STATUS_ORDER.length - 1) {
    throw new Error("Cannot advance beyond the final status");
  }

  const nextStatus = LISTING_STATUS_ORDER[currentIndex + 1];
  const updateData: Record<string, unknown> = {
    status: nextStatus as BmsListingStatus,
  };

  // Set status timestamps
  const now = new Date();
  if (nextStatus === "showing") updateData.showingStartedAt = now;
  if (nextStatus === "application") updateData.applicationAt = now;
  if (nextStatus === "approved") updateData.approvedAt = now;
  if (nextStatus === "leased") {
    updateData.leasedAt = now;
    if (tenantData?.tenantName) updateData.tenantName = tenantData.tenantName;
    if (tenantData?.tenantEmail) updateData.tenantEmail = tenantData.tenantEmail;
    if (tenantData?.tenantPhone) updateData.tenantPhone = tenantData.tenantPhone;
    if (tenantData?.leaseStartDate) updateData.leaseStartDate = parseOptionalDate(tenantData.leaseStartDate);
    if (tenantData?.commissionAmount !== undefined) updateData.commissionAmount = tenantData.commissionAmount;
  }

  const updated = await prisma.bmsListing.update({
    where: { id },
    data: updateData as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      property: { select: { id: true, name: true, landlordName: true } },
    },
  });

  logListingAction(ctx.orgId, actor(ctx), "status_advanced", id, {
    from: listing.status,
    to: nextStatus,
  });

  return serialize(updated) as BmsListingRecord;
}

// ── Revert Listing Status ───────────────────────────────────

export async function revertListingStatus(id: string): Promise<BmsListingRecord> {
  const ctx = await getCurrentOrg();

  const listing = await prisma.bmsListing.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!listing) throw new Error("Listing not found");

  if (listing.status === "off_market") {
    throw new Error("Cannot revert an off-market listing — set back to available instead");
  }

  const currentIndex = LISTING_STATUS_ORDER.indexOf(listing.status as BmsListingStatusType);
  if (currentIndex <= 0) {
    throw new Error("Cannot revert — already at the first status");
  }

  const prevStatus = LISTING_STATUS_ORDER[currentIndex - 1];

  const updated = await prisma.bmsListing.update({
    where: { id },
    data: { status: prevStatus as BmsListingStatus },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      property: { select: { id: true, name: true, landlordName: true } },
    },
  });

  logListingAction(ctx.orgId, actor(ctx), "status_reverted", id, {
    from: listing.status,
    to: prevStatus,
  });

  return serialize(updated) as BmsListingRecord;
}

// ── Take Off Market ─────────────────────────────────────────

export async function takeOffMarket(id: string): Promise<BmsListingRecord> {
  const ctx = await getCurrentOrg();

  const listing = await prisma.bmsListing.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!listing) throw new Error("Listing not found");

  const updated = await prisma.bmsListing.update({
    where: { id },
    data: {
      status: "off_market",
      offMarketAt: new Date(),
    },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      property: { select: { id: true, name: true, landlordName: true } },
    },
  });

  logListingAction(ctx.orgId, actor(ctx), "off_market", id, {
    previousStatus: listing.status,
  });

  return serialize(updated) as BmsListingRecord;
}

// ── Put Back on Market ──────────────────────────────────────

export async function putBackOnMarket(id: string): Promise<BmsListingRecord> {
  const ctx = await getCurrentOrg();

  const listing = await prisma.bmsListing.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!listing) throw new Error("Listing not found");

  const updated = await prisma.bmsListing.update({
    where: { id },
    data: {
      status: "available",
      offMarketAt: null,
    },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      property: { select: { id: true, name: true, landlordName: true } },
    },
  });

  logListingAction(ctx.orgId, actor(ctx), "status_advanced", id, {
    from: "off_market",
    to: "available",
  });

  return serialize(updated) as BmsListingRecord;
}

// ── Claim Listing ───────────────────────────────────────────

export async function claimListing(id: string): Promise<BmsListingRecord> {
  const ctx = await getCurrentOrg();
  if (!ctx.agentId) throw new Error("You must be a registered agent to claim a listing");

  const listing = await prisma.bmsListing.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!listing) throw new Error("Listing not found");
  if (listing.agentId) throw new Error("Listing is already assigned to an agent");

  const updated = await prisma.bmsListing.update({
    where: { id },
    data: { agentId: ctx.agentId },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      property: { select: { id: true, name: true, landlordName: true } },
    },
  });

  logListingAction(ctx.orgId, actor(ctx), "claimed", id, {
    agentId: ctx.agentId,
  });

  return serialize(updated) as BmsListingRecord;
}

// ── Assign Listing ──────────────────────────────────────────

export async function assignListing(id: string, agentId: string | null): Promise<BmsListingRecord> {
  const ctx = await getCurrentOrg();

  const listing = await prisma.bmsListing.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!listing) throw new Error("Listing not found");

  const updated = await prisma.bmsListing.update({
    where: { id },
    data: { agentId: agentId || null },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      property: { select: { id: true, name: true, landlordName: true } },
    },
  });

  logListingAction(ctx.orgId, actor(ctx), "assigned", id, {
    agentId: agentId || "unassigned",
  });

  return serialize(updated) as BmsListingRecord;
}

// ── Update Listing Status ───────────────────────────────────

export async function updateListingStatus(
  id: string,
  newStatus: BmsListingStatusType,
): Promise<BmsListingRecord> {
  const ctx = await getCurrentOrg();

  const listing = await prisma.bmsListing.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!listing) throw new Error("Listing not found");

  const updateData: Record<string, unknown> = {
    status: newStatus as BmsListingStatus,
  };

  // Set status timestamps
  const now = new Date();
  if (newStatus === "showing") updateData.showingStartedAt = now;
  else if (newStatus === "application") updateData.applicationAt = now;
  else if (newStatus === "approved") updateData.approvedAt = now;
  else if (newStatus === "leased") updateData.leasedAt = now;
  else if (newStatus === "off_market") updateData.offMarketAt = now;

  const updated = await prisma.bmsListing.update({
    where: { id },
    data: updateData as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      property: { select: { id: true, name: true, landlordName: true } },
    },
  });

  logListingAction(ctx.orgId, actor(ctx), "status_updated", id, {
    from: listing.status,
    to: newStatus,
  });

  return serialize(updated) as BmsListingRecord;
}

// ── Create Transaction from Listing (lease-up) ─────────────

export async function createTransactionFromListing(
  listingId: string,
  tenantData: {
    tenantName: string;
    tenantEmail?: string;
    tenantPhone?: string;
    leaseStartDate?: string;
    commissionAmount?: number;
  },
): Promise<{ transactionId: string }> {
  const ctx = await getCurrentOrg();

  const listing = await prisma.bmsListing.findFirst({
    where: { id: listingId, orgId: ctx.orgId },
    include: {
      property: { select: { id: true, name: true } },
    },
  });
  if (!listing) throw new Error("Listing not found");

  // Mark listing as leased
  await prisma.bmsListing.update({
    where: { id: listingId },
    data: {
      status: "leased",
      leasedAt: new Date(),
      tenantName: tenantData.tenantName,
      tenantEmail: tenantData.tenantEmail || null,
      tenantPhone: tenantData.tenantPhone || null,
      leaseStartDate: parseOptionalDate(tenantData.leaseStartDate),
      commissionAmount: tenantData.commissionAmount,
    },
  });

  // Ensure transaction templates exist
  const { ensureDefaultTemplates } = await import("../transactions/actions");
  await ensureDefaultTemplates(ctx.orgId);

  const txType = listing.type === "sale" ? "sale" : "rental";
  const template = await prisma.transactionTemplate.findFirst({
    where: { orgId: ctx.orgId, type: txType, isActive: true },
    orderBy: { isDefault: "desc" },
    include: { tasks: { orderBy: { sortOrder: "asc" } } },
  });

  const defaultStage = getDefaultStageForType(txType);
  const commission = tenantData.commissionAmount ?? (listing.commissionAmount ? Number(listing.commissionAmount) : undefined);

  const transaction = await prisma.transaction.create({
    data: {
      orgId: ctx.orgId,
      listingId,
      agentId: listing.agentId,
      type: txType,
      stage: defaultStage,
      propertyAddress: listing.address,
      propertyUnit: listing.unit,
      propertyCity: listing.city,
      propertyState: listing.state || "NY",
      propertyName: listing.property?.name,
      transactionValue: listing.rentPrice || listing.askingPrice,
      commissionAmount: commission,
      clientName: tenantData.tenantName,
      clientEmail: tenantData.tenantEmail,
      clientPhone: tenantData.tenantPhone,
      leaseStartDate: parseOptionalDate(tenantData.leaseStartDate),
      notes: `Created from listing: ${listing.address}${listing.unit ? ` ${listing.unit}` : ""}`,
    },
  });

  // Copy template tasks
  if (template && template.tasks.length > 0) {
    const now = new Date();
    await prisma.transactionTask.createMany({
      data: template.tasks.map((t) => ({
        transactionId: transaction.id,
        title: t.title,
        description: t.description,
        stage: t.stage,
        sortOrder: t.sortOrder,
        isRequired: t.isRequired,
        dueDate: t.defaultDueDays
          ? new Date(now.getTime() + t.defaultDueDays * 86400000)
          : undefined,
      })),
    });
  }

  // Create TransactionAgent record for primary agent
  if (listing.agentId) {
    const agent = await prisma.brokerAgent.findUnique({
      where: { id: listing.agentId },
      select: { defaultSplitPct: true },
    });
    await prisma.transactionAgent.create({
      data: {
        transactionId: transaction.id,
        agentId: listing.agentId,
        role: "primary",
        splitPct: agent?.defaultSplitPct || undefined,
      },
    });
  }

  logListingAction(ctx.orgId, actor(ctx), "leased", listingId, {
    transactionId: transaction.id,
    tenantName: tenantData.tenantName,
    commission,
  });

  return { transactionId: transaction.id };
}

// ── Listing Stats ───────────────────────────────────────────

export async function getListingStats(): Promise<ListingStats> {
  const ctx = await getCurrentOrg();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [listings, leasedThisMonth] = await Promise.all([
    prisma.bmsListing.findMany({
      where: { orgId: ctx.orgId },
      select: { status: true, type: true },
    }),
    prisma.bmsListing.count({
      where: {
        orgId: ctx.orgId,
        status: "leased",
        leasedAt: { gte: startOfMonth },
      },
    }),
  ]);

  const stats: ListingStats = {
    total: listings.length,
    available: 0,
    showing: 0,
    application: 0,
    approved: 0,
    leasedThisMonth,
    byType: {},
  };

  for (const l of listings) {
    if (l.status === "available") stats.available++;
    else if (l.status === "showing") stats.showing++;
    else if (l.status === "application") stats.application++;
    else if (l.status === "approved") stats.approved++;
    stats.byType[l.type] = (stats.byType[l.type] || 0) + 1;
  }

  return stats;
}

// ── Bulk Create Listings ────────────────────────────────────

export async function bulkCreateListings(
  rows: ListingBulkRow[],
): Promise<{ created: number; errors: string[] }> {
  const ctx = await getCurrentOrg();
  const errors: string[] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row.address) {
        errors.push(`Row ${(row._rowIndex ?? i) + 1}: Missing address`);
        continue;
      }

      // Determine listing type and price
      const type = (row.type || "rental") as "rental" | "sale";
      const hasRent = row.rentPrice !== undefined && row.rentPrice > 0;
      const hasAsking = row.askingPrice !== undefined && row.askingPrice > 0;

      if (!hasRent && !hasAsking) {
        errors.push(`Row ${(row._rowIndex ?? i) + 1}: Must have either rent price or asking price`);
        continue;
      }

      await prisma.bmsListing.create({
        data: {
          orgId: ctx.orgId,
          propertyId: row._propertyId || undefined,
          address: row.address,
          unit: row.unit,
          type: type,
          status: "available",
          rentPrice: row.rentPrice,
          askingPrice: row.askingPrice,
          bedrooms: row.bedrooms,
          bathrooms: row.bathrooms,
          sqft: row.sqft,
          availableDate: parseOptionalDate(row.availableDate),
          agentId: row._agentId || undefined,
          notes: row.notes,
        },
      });
      created++;
    } catch (err) {
      errors.push(`Row ${(row._rowIndex ?? i) + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  logListingAction(ctx.orgId, actor(ctx), "bulk_created_listings", "", {
    count: created,
    errorCount: errors.length,
  });

  return { created, errors };
}

// ── Property CRUD ───────────────────────────────────────────

export async function createProperty(input: BmsPropertyInput): Promise<BmsPropertyRecord> {
  const ctx = await getCurrentOrg();

  const property = await prisma.bmsProperty.create({
    data: {
      orgId: ctx.orgId,
      name: input.name,
      address: input.address,
      city: input.city || "New York",
      state: input.state || "NY",
      zipCode: input.zipCode,
      landlordName: input.landlordName,
      landlordEmail: input.landlordEmail,
      landlordPhone: input.landlordPhone,
      managementCo: input.managementCo,
      totalUnits: input.totalUnits,
      notes: input.notes,
    },
  });

  logPropertyAction(ctx.orgId, actor(ctx), "created", property.id, {
    name: input.name,
  });

  return serialize(property) as BmsPropertyRecord;
}

export async function updateProperty(
  id: string,
  data: Partial<BmsPropertyInput>,
): Promise<BmsPropertyRecord> {
  const ctx = await getCurrentOrg();

  const existing = await prisma.bmsProperty.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!existing) throw new Error("Property not found");

  const updateData: Record<string, unknown> = {};
  const fields = [
    "name", "address", "city", "state", "zipCode",
    "landlordName", "landlordEmail", "landlordPhone", "managementCo", "notes",
  ] as const;

  for (const field of fields) {
    if (data[field] !== undefined) updateData[field] = data[field];
  }
  if (data.totalUnits !== undefined) updateData.totalUnits = data.totalUnits;

  const updated = await prisma.bmsProperty.update({
    where: { id },
    data: updateData as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  logPropertyAction(ctx.orgId, actor(ctx), "updated", id, {
    fields: Object.keys(updateData),
  });

  return serialize(updated) as BmsPropertyRecord;
}

export async function deleteProperty(id: string): Promise<void> {
  const ctx = await getCurrentOrg();

  const property = await prisma.bmsProperty.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!property) throw new Error("Property not found");

  // Check if property has listings
  const listingCount = await prisma.bmsListing.count({
    where: { propertyId: id },
  });
  if (listingCount > 0) {
    throw new Error(`Cannot delete property with ${listingCount} listing(s). Remove listings first.`);
  }

  await prisma.bmsProperty.delete({ where: { id } });

  logPropertyAction(ctx.orgId, actor(ctx), "deleted", id, {
    name: property.name,
  });
}

export async function getProperty(id: string): Promise<BmsPropertyRecord> {
  const ctx = await getCurrentOrg();

  const property = await prisma.bmsProperty.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      _count: { select: { listings: true } },
    },
  });
  if (!property) throw new Error("Property not found");

  const result = serialize(property) as BmsPropertyRecord;
  result._listingCount = property._count.listings;
  return result;
}

export async function getProperties(): Promise<BmsPropertyRecord[]> {
  const ctx = await getCurrentOrg();

  const properties = await prisma.bmsProperty.findMany({
    where: { orgId: ctx.orgId },
    include: {
      _count: { select: { listings: true } },
    },
    orderBy: { name: "asc" },
  });

  return properties.map((p) => {
    const result = serialize(p) as BmsPropertyRecord;
    result._listingCount = p._count.listings;
    return result;
  });
}

// ── Property Summary (for vacancy dashboard) ────────────────

export async function getPropertySummaries(): Promise<PropertySummary[]> {
  const ctx = await getCurrentOrg();

  const properties = await prisma.bmsProperty.findMany({
    where: { orgId: ctx.orgId },
    include: {
      listings: {
        select: { status: true, rentPrice: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return properties.map((p) => {
    const listings = p.listings;
    const available = listings.filter((l) => l.status === "available").length;
    const leased = listings.filter((l) => l.status === "leased").length;
    const inProgress = listings.filter((l) =>
      ["showing", "application", "approved"].includes(l.status),
    ).length;
    const total = listings.length;
    const occupancyRate = total > 0 ? Math.round((leased / total) * 100) : 0;

    const rents = listings
      .filter((l) => l.rentPrice)
      .map((l) => Number(l.rentPrice));
    const rentRange = rents.length > 0
      ? { min: Math.min(...rents), max: Math.max(...rents) }
      : null;

    return {
      id: p.id,
      name: p.name,
      address: p.address,
      landlordName: p.landlordName,
      totalUnits: p.totalUnits,
      listingCount: total,
      availableCount: available,
      leasedCount: leased,
      inProgressCount: inProgress,
      occupancyRate,
      rentRange,
    };
  });
}

// ── Agents list (for dropdowns) ─────────────────────────────

export async function getAgentsForDropdown(): Promise<
  Array<{ id: string; firstName: string; lastName: string; email: string }>
> {
  const ctx = await getCurrentOrg();

  const agents = await prisma.brokerAgent.findMany({
    where: { orgId: ctx.orgId, status: "active" },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  return agents;
}

// ── Fuzzy match properties (for bulk upload resolution) ─────

export async function fuzzyMatchProperties(
  names: string[],
): Promise<Record<string, { id: string; name: string; listingCount: number } | null>> {
  const ctx = await getCurrentOrg();

  const properties = await prisma.bmsProperty.findMany({
    where: { orgId: ctx.orgId },
    include: { _count: { select: { listings: true } } },
  });

  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

  const result: Record<string, { id: string; name: string; listingCount: number } | null> = {};

  for (const name of names) {
    const norm = normalize(name);
    const match = properties.find((p) => {
      const pNorm = normalize(p.name);
      return pNorm === norm || pNorm.includes(norm) || norm.includes(pNorm);
    });

    result[name] = match
      ? { id: match.id, name: match.name, listingCount: match._count.listings }
      : null;
  }

  return result;
}

// ── Fuzzy match agents by name ──────────────────────────────

export async function fuzzyMatchAgents(
  names: string[],
): Promise<Record<string, { id: string; name: string } | null>> {
  const ctx = await getCurrentOrg();

  const agents = await prisma.brokerAgent.findMany({
    where: { orgId: ctx.orgId, status: "active" },
    select: { id: true, firstName: true, lastName: true },
  });

  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

  const result: Record<string, { id: string; name: string } | null> = {};

  for (const name of names) {
    const norm = normalize(name);
    const match = agents.find((a) => {
      const full = normalize(`${a.firstName} ${a.lastName}`);
      const last = normalize(a.lastName);
      return full === norm || full.includes(norm) || norm.includes(full) || last === norm;
    });

    result[name] = match
      ? { id: match.id, name: `${match.firstName} ${match.lastName}` }
      : null;
  }

  return result;
}
