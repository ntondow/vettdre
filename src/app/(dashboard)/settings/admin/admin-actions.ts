"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

const ADMIN_EMAIL = "nathan@ntrec.co";

// Lazy-init Supabase admin client with service role key
let _supabaseAdmin: ReturnType<typeof createSupabaseAdmin> | null = null;
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    }
    _supabaseAdmin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  }
  return _supabaseAdmin;
}

// Admin access for auth actions: admin email OR team/enterprise plan
async function requireAdminAccess() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");
  if (authUser.email === ADMIN_EMAIL) return authUser;

  const dbUser = await prisma.user.findFirst({
    where: { authProviderId: authUser.id },
    select: { plan: true },
  });
  if (!dbUser || !["team", "enterprise"].includes(dbUser.plan)) {
    throw new Error("Unauthorized: requires team or enterprise plan");
  }
  return authUser;
}

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

// --- Auth management actions (require service role key) ---

export async function getAuthStatuses(): Promise<Record<string, { emailConfirmed: boolean; authId: string }>> {
  await requireAdminAccess();
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error("Failed to fetch auth users: " + error.message);

  const statuses: Record<string, { emailConfirmed: boolean; authId: string }> = {};
  for (const user of data.users) {
    if (user.email) {
      statuses[user.email.toLowerCase()] = {
        emailConfirmed: !!user.email_confirmed_at,
        authId: user.id,
      };
    }
  }
  return statuses;
}

export async function adminSendPasswordReset(email: string): Promise<{ success: boolean; link?: string }> {
  await requireAdminAccess();
  const admin = getSupabaseAdmin();

  // Try recovery link first
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: "https://app.vettdre.com/auth/callback" },
  });

  if (error) {
    // Fall back to magiclink
    const { data: mlData, error: mlError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: "https://app.vettdre.com/auth/callback" },
    });
    if (mlError) throw new Error(mlError.message);
    return { success: true, link: mlData.properties?.action_link };
  }

  return { success: true, link: data.properties?.action_link };
}

export async function adminSetPassword(
  email: string,
  password: string,
  authId?: string,
): Promise<{ success: boolean }> {
  await requireAdminAccess();
  const admin = getSupabaseAdmin();

  if (authId) {
    // User exists in Supabase Auth — update password
    const { error } = await admin.auth.admin.updateUserById(authId, {
      password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
  } else {
    // User doesn't exist in Auth — create them
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);

    // Link the new auth user to the Prisma user record
    const dbUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (dbUser) {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { authProviderId: data.user.id },
      });
    }
  }

  return { success: true };
}

export async function adminVerifyEmail(authId: string): Promise<{ success: boolean }> {
  await requireAdminAccess();
  const admin = getSupabaseAdmin();

  const { error } = await admin.auth.admin.updateUserById(authId, {
    email_confirm: true,
  });
  if (error) throw new Error(error.message);

  return { success: true };
}
