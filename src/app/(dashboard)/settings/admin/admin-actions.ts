"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const ADMIN_EMAIL = "nathan@ntrec.co";

export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");
  if (authUser.email !== ADMIN_EMAIL) redirect("/settings");
  return authUser;
}

export async function getAdminStats() {
  await requireAdmin();
  const [total, approved, pending, free, pro, team, enterprise] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isApproved: true } }),
    prisma.user.count({ where: { isApproved: false } }),
    prisma.user.count({ where: { plan: "free" } }),
    prisma.user.count({ where: { plan: "pro" } }),
    prisma.user.count({ where: { plan: "team" } }),
    prisma.user.count({ where: { plan: "enterprise" } }),
  ]);
  return { total, approved, pending, free, pro, team, enterprise };
}

export async function getUsers(
  search?: string,
  planFilter?: string,
  approvedFilter?: string,
) {
  await requireAdmin();
  const where: any = {};

  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (planFilter && planFilter !== "all") {
    where.plan = planFilter;
  }
  if (approvedFilter === "approved") where.isApproved = true;
  else if (approvedFilter === "pending") where.isApproved = false;

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fullName: true,
      email: true,
      plan: true,
      isApproved: true,
      isActive: true,
      role: true,
      createdAt: true,
      lastLoginAt: true,
      orgId: true,
      organization: { select: { name: true } },
    },
  });

  return users.map(u => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() || null,
    orgName: u.organization.name,
  }));
}

export async function updateUserApproval(userId: string, approved: boolean) {
  await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { isApproved: approved },
  });
  return { success: true };
}

export async function updateUserActive(userId: string, active: boolean) {
  await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { isActive: active },
  });
  return { success: true };
}

export async function updateUserPlan(userId: string, plan: string) {
  await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { plan: plan as any },
  });
  return { success: true };
}

export async function deleteUser(userId: string) {
  await requireAdmin();
  await prisma.user.delete({ where: { id: userId } });
  return { success: true };
}

export async function createUser(name: string, email: string, plan: string, approved: boolean) {
  await requireAdmin();

  // Check if user already exists
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (existing) return { error: "A user with this email already exists" };

  // Find or create a default org for manually created users
  let org = await prisma.organization.findFirst({ where: { slug: "default" } });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: "VettdRE", slug: "default" },
    });
  }

  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      email: email.toLowerCase().trim(),
      fullName: name.trim(),
      plan: plan as any,
      isApproved: approved,
      role: "agent",
    },
  });

  return { success: true, userId: user.id };
}
