"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/bms-permissions";
import { logPropertyAction } from "@/lib/bms-audit";
import type { BmsPropertyInput, BrokerageRoleType } from "@/lib/bms-types";

// ── Auth Helper ─────────────────────────────────────────────

interface AuthContext {
  userId: string;
  orgId: string;
  role: BrokerageRoleType;
  fullName: string;
}

async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  let user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: {
      brokerAgent: { select: { id: true, brokerageRole: true, status: true } },
    },
  });
  if (!user && authUser.email) {
    user = await prisma.user.findFirst({
      where: { email: authUser.email },
      include: {
        brokerAgent: { select: { id: true, brokerageRole: true, status: true } },
      },
    });
  }
  if (!user) return null;

  let role: BrokerageRoleType | null = null;

  if (user.role === "owner" || user.role === "admin") {
    role = "brokerage_admin";
  } else {
    const firstOrgUser = await prisma.user.findFirst({
      where: { orgId: user.orgId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (firstOrgUser && firstOrgUser.id === user.id) {
      role = "brokerage_admin";
    }
  }

  if (!role) {
    const ROLE_MAP: Partial<Record<string, BrokerageRoleType>> = {
      admin: "brokerage_admin",
      manager: "manager",
    };
    if (user.role && ROLE_MAP[user.role]) {
      role = ROLE_MAP[user.role]!;
    } else if (user.brokerAgent?.brokerageRole) {
      role = user.brokerAgent.brokerageRole as BrokerageRoleType;
    }
  }

  if (!role) return null;

  return {
    userId: user.id,
    orgId: user.orgId,
    role,
    fullName: user.fullName || user.email,
  };
}

// ── Serialization ───────────────────────────────────────────

function serialize<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => {
      if (value instanceof Date) return value.toISOString();
      if (typeof value === "bigint") return Number(value);
      return value;
    }),
  );
}

// ── 1. getExclusiveBuildings ────────────────────────────────

export async function getExclusiveBuildings(params?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{
  success: boolean;
  data?: Record<string, unknown>[];
  total?: number;
  page?: number;
  totalPages?: number;
  error?: string;
}> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "properties_view")) {
      return { success: false, error: "Not authorized" };
    }

    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(100, Math.max(1, params?.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      orgId: ctx.orgId,
      isExclusive: true,
    };

    if (params?.search?.trim()) {
      const term = params.search.trim();
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { address: { contains: term, mode: "insensitive" } },
        { landlordName: { contains: term, mode: "insensitive" } },
        { billingEntityName: { contains: term, mode: "insensitive" } },
      ];
    }

    const [properties, total] = await Promise.all([
      prisma.bmsProperty.findMany({
        where,
        include: {
          _count: { select: { listings: true, dealSubmissions: true } },
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.bmsProperty.count({ where }),
    ]);

    const data = properties.map((p) => {
      const record = serialize(p);
      return {
        ...record,
        _listingCount: p._count.listings,
        _dealSubmissionCount: p._count.dealSubmissions,
      };
    });

    return {
      success: true,
      data: data as unknown as Record<string, unknown>[],
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error: unknown) {
    console.error("getExclusiveBuildings error:", error);
    return { success: false, error: "Failed to fetch exclusive buildings" };
  }
}

// ── 2. createExclusiveBuilding ──────────────────────────────

export async function createExclusiveBuilding(
  input: BmsPropertyInput,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "properties_manage")) {
      return { success: false, error: "Not authorized" };
    }

    if (!input.name?.trim()) return { success: false, error: "Building name is required" };
    if (!input.address?.trim()) return { success: false, error: "Address is required" };

    const property = await prisma.bmsProperty.create({
      data: {
        orgId: ctx.orgId,
        name: input.name.trim(),
        address: input.address.trim(),
        city: input.city?.trim() || "New York",
        state: input.state?.trim() || "NY",
        zipCode: input.zipCode?.trim() || null,
        landlordName: input.landlordName?.trim() || null,
        landlordEmail: input.landlordEmail?.trim() || null,
        landlordPhone: input.landlordPhone?.trim() || null,
        managementCo: input.managementCo?.trim() || null,
        totalUnits: input.totalUnits ?? null,
        notes: input.notes?.trim() || null,
        isExclusive: true,
        billingEntityName: input.billingEntityName?.trim() || null,
        billingEntityAddress: input.billingEntityAddress?.trim() || null,
        billingEntityEmail: input.billingEntityEmail?.trim() || null,
        billingEntityPhone: input.billingEntityPhone?.trim() || null,
      },
    });

    logPropertyAction(
      ctx.orgId,
      { id: ctx.userId, name: ctx.fullName, role: ctx.role },
      "created",
      property.id,
      { name: property.name, address: property.address },
    );

    return { success: true, data: serialize(property) as unknown as Record<string, unknown> };
  } catch (error: unknown) {
    console.error("createExclusiveBuilding error:", error);
    return { success: false, error: "Failed to create building" };
  }
}

// ── 3. updateExclusiveBuilding ──────────────────────────────

export async function updateExclusiveBuilding(
  id: string,
  input: Partial<BmsPropertyInput>,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "properties_manage")) {
      return { success: false, error: "Not authorized" };
    }

    const existing = await prisma.bmsProperty.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!existing) return { success: false, error: "Building not found" };

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.address !== undefined) data.address = input.address.trim();
    if (input.city !== undefined) data.city = input.city.trim() || "New York";
    if (input.state !== undefined) data.state = input.state.trim() || "NY";
    if (input.zipCode !== undefined) data.zipCode = input.zipCode?.trim() || null;
    if (input.landlordName !== undefined) data.landlordName = input.landlordName?.trim() || null;
    if (input.landlordEmail !== undefined) data.landlordEmail = input.landlordEmail?.trim() || null;
    if (input.landlordPhone !== undefined) data.landlordPhone = input.landlordPhone?.trim() || null;
    if (input.managementCo !== undefined) data.managementCo = input.managementCo?.trim() || null;
    if (input.totalUnits !== undefined) data.totalUnits = input.totalUnits ?? null;
    if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
    if (input.isExclusive !== undefined) data.isExclusive = input.isExclusive;
    if (input.billingEntityName !== undefined) data.billingEntityName = input.billingEntityName?.trim() || null;
    if (input.billingEntityAddress !== undefined) data.billingEntityAddress = input.billingEntityAddress?.trim() || null;
    if (input.billingEntityEmail !== undefined) data.billingEntityEmail = input.billingEntityEmail?.trim() || null;
    if (input.billingEntityPhone !== undefined) data.billingEntityPhone = input.billingEntityPhone?.trim() || null;

    const updated = await prisma.bmsProperty.update({ where: { id }, data });

    logPropertyAction(
      ctx.orgId,
      { id: ctx.userId, name: ctx.fullName, role: ctx.role },
      "updated",
      id,
      { changes: Object.keys(data) },
    );

    return { success: true, data: serialize(updated) as unknown as Record<string, unknown> };
  } catch (error: unknown) {
    console.error("updateExclusiveBuilding error:", error);
    return { success: false, error: "Failed to update building" };
  }
}

// ── 4. deleteExclusiveBuilding ──────────────────────────────

export async function deleteExclusiveBuilding(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "properties_manage")) {
      return { success: false, error: "Not authorized" };
    }

    const property = await prisma.bmsProperty.findFirst({
      where: { id, orgId: ctx.orgId },
      include: { _count: { select: { dealSubmissions: true } } },
    });
    if (!property) return { success: false, error: "Building not found" };

    if (property._count.dealSubmissions > 0) {
      return {
        success: false,
        error: `Cannot delete — ${property._count.dealSubmissions} deal submission${property._count.dealSubmissions === 1 ? "" : "s"} reference this building. Remove the exclusive flag instead.`,
      };
    }

    await prisma.bmsProperty.delete({ where: { id } });

    logPropertyAction(
      ctx.orgId,
      { id: ctx.userId, name: ctx.fullName, role: ctx.role },
      "deleted",
      id,
      { name: property.name, address: property.address },
    );

    return { success: true };
  } catch (error: unknown) {
    console.error("deleteExclusiveBuilding error:", error);
    return { success: false, error: "Failed to delete building" };
  }
}

// ── 5. toggleExclusiveFlag ──────────────────────────────────

export async function toggleExclusiveFlag(
  id: string,
  isExclusive: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "properties_manage")) {
      return { success: false, error: "Not authorized" };
    }

    const property = await prisma.bmsProperty.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!property) return { success: false, error: "Building not found" };

    await prisma.bmsProperty.update({
      where: { id },
      data: { isExclusive },
    });

    logPropertyAction(
      ctx.orgId,
      { id: ctx.userId, name: ctx.fullName, role: ctx.role },
      "updated",
      id,
      { isExclusive, name: property.name },
    );

    return { success: true };
  } catch (error: unknown) {
    console.error("toggleExclusiveFlag error:", error);
    return { success: false, error: "Failed to update exclusive flag" };
  }
}
