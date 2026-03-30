"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/bms-permissions";
import { logPropertyAction } from "@/lib/bms-audit";
import type { BmsPropertyInput } from "@/lib/bms-types";

// ── Auth Helper ───────────────────────────────────────────────

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: {
      brokerAgent: {
        select: { id: true, role: true },
      },
    },
  });
  if (!user) throw new Error("User not found");

  const bmsRole = user.brokerAgent?.role ?? "agent";
  if (!hasPermission(bmsRole as "owner" | "admin" | "manager" | "agent", "manage_brokerage_settings")) {
    throw new Error("Insufficient permissions");
  }

  return { userId: user.id, orgId: user.orgId, bmsRole };
}

// ── 1. List Exclusive Buildings ──────────────────────────────

export async function getExclusiveBuildings(params?: {
  search?: string;
  page?: number;
  limit?: number;
}) {
  try {
    const { orgId } = await getAuthContext();

    const search = params?.search?.trim() || "";
    const page = params?.page || 1;
    const limit = params?.limit || 25;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      orgId,
      isExclusive: true,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
        { landlordName: { contains: search, mode: "insensitive" } },
        { billingEntityName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.bmsProperty.findMany({
        where,
        include: {
          _count: {
            select: {
              listings: true,
              dealSubmissions: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.bmsProperty.count({ where }),
    ]);

    return JSON.parse(
      JSON.stringify({
        data,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      }),
    );
  } catch (error) {
    console.error("getExclusiveBuildings error:", error);
    return { data: [], total: 0, page: 1, totalPages: 0 };
  }
}

// ── 2. Create Exclusive Building ─────────────────────────────

export async function createExclusiveBuilding(input: BmsPropertyInput) {
  try {
    const { userId, orgId } = await getAuthContext();

    if (!input.name?.trim()) {
      return { success: false, error: "Building name is required" };
    }
    if (!input.address?.trim()) {
      return { success: false, error: "Address is required" };
    }

    const property = await prisma.bmsProperty.create({
      data: {
        orgId,
        name: input.name.trim(),
        address: input.address?.trim() || null,
        city: input.city?.trim() || "New York",
        state: input.state?.trim() || "NY",
        zipCode: input.zipCode?.trim() || null,
        landlordName: input.landlordName?.trim() || null,
        landlordEmail: input.landlordEmail?.trim() || null,
        landlordPhone: input.landlordPhone?.trim() || null,
        managementCo: input.managementCo?.trim() || null,
        totalUnits: input.totalUnits ?? null,
        notes: input.notes?.trim() || null,
        billingEntityName: input.billingEntityName?.trim() || null,
        billingEntityAddress: input.billingEntityAddress?.trim() || null,
        billingEntityEmail: input.billingEntityEmail?.trim() || null,
        billingEntityPhone: input.billingEntityPhone?.trim() || null,
        isExclusive: true,
      },
    });

    logPropertyAction(orgId, { id: userId }, "created_exclusive", property.id, {
      name: input.name,
      address: input.address,
    });

    return JSON.parse(JSON.stringify({ success: true, property }));
  } catch (error) {
    console.error("createExclusiveBuilding error:", error);
    return { success: false, error: "Failed to create exclusive building" };
  }
}

// ── 3. Update Exclusive Building ─────────────────────────────

export async function updateExclusiveBuilding(
  id: string,
  input: Partial<BmsPropertyInput>,
) {
  try {
    const { userId, orgId } = await getAuthContext();

    const existing = await prisma.bmsProperty.findFirst({
      where: { id, orgId },
    });
    if (!existing) {
      return { success: false, error: "Building not found" };
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.address !== undefined) data.address = input.address?.trim() || null;
    if (input.city !== undefined) data.city = input.city?.trim() || null;
    if (input.state !== undefined) data.state = input.state?.trim() || null;
    if (input.zipCode !== undefined) data.zipCode = input.zipCode?.trim() || null;
    if (input.landlordName !== undefined) data.landlordName = input.landlordName?.trim() || null;
    if (input.landlordEmail !== undefined) data.landlordEmail = input.landlordEmail?.trim() || null;
    if (input.landlordPhone !== undefined) data.landlordPhone = input.landlordPhone?.trim() || null;
    if (input.managementCo !== undefined) data.managementCo = input.managementCo?.trim() || null;
    if (input.totalUnits !== undefined) data.totalUnits = input.totalUnits ?? null;
    if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
    if (input.billingEntityName !== undefined) data.billingEntityName = input.billingEntityName?.trim() || null;
    if (input.billingEntityAddress !== undefined) data.billingEntityAddress = input.billingEntityAddress?.trim() || null;
    if (input.billingEntityEmail !== undefined) data.billingEntityEmail = input.billingEntityEmail?.trim() || null;
    if (input.billingEntityPhone !== undefined) data.billingEntityPhone = input.billingEntityPhone?.trim() || null;

    const property = await prisma.bmsProperty.update({
      where: { id },
      data,
    });

    logPropertyAction(orgId, { id: userId }, "updated_exclusive", id, {
      name: property.name,
      updatedFields: Object.keys(data),
    });

    return JSON.parse(JSON.stringify({ success: true, property }));
  } catch (error) {
    console.error("updateExclusiveBuilding error:", error);
    return { success: false, error: "Failed to update exclusive building" };
  }
}

// ── 4. Delete Exclusive Building ─────────────────────────────

export async function deleteExclusiveBuilding(id: string) {
  try {
    const { userId, orgId } = await getAuthContext();

    const property = await prisma.bmsProperty.findFirst({
      where: { id, orgId },
      include: {
        _count: { select: { dealSubmissions: true } },
      },
    });
    if (!property) {
      return { success: false, error: "Building not found" };
    }

    if (property._count.dealSubmissions > 0) {
      return {
        success: false,
        error: `Cannot delete building "${property.name}" because it has ${property._count.dealSubmissions} associated deal submission${property._count.dealSubmissions === 1 ? "" : "s"}. Remove the exclusive flag instead, or reassign the deals first.`,
        hasSubmissions: true,
        submissionCount: property._count.dealSubmissions,
      };
    }

    await prisma.bmsProperty.delete({ where: { id } });

    logPropertyAction(orgId, { id: userId }, "deleted_exclusive", id, {
      name: property.name,
      address: property.address,
    });

    return { success: true };
  } catch (error) {
    console.error("deleteExclusiveBuilding error:", error);
    return { success: false, error: "Failed to delete exclusive building" };
  }
}

// ── 5. Toggle Exclusive Flag ─────────────────────────────────

export async function toggleExclusiveFlag(id: string, isExclusive: boolean) {
  try {
    const { userId, orgId } = await getAuthContext();

    const existing = await prisma.bmsProperty.findFirst({
      where: { id, orgId },
    });
    if (!existing) {
      return { success: false, error: "Building not found" };
    }

    const property = await prisma.bmsProperty.update({
      where: { id },
      data: { isExclusive },
    });

    logPropertyAction(
      orgId,
      { id: userId },
      isExclusive ? "marked_exclusive" : "unmarked_exclusive",
      id,
      { name: property.name },
    );

    return JSON.parse(JSON.stringify({ success: true, property }));
  } catch (error) {
    console.error("toggleExclusiveFlag error:", error);
    return { success: false, error: "Failed to toggle exclusive flag" };
  }
}
