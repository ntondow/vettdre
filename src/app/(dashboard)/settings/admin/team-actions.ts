"use server";

import prisma from "@/lib/prisma";
import { requireAdmin } from "./admin-actions";

async function getAdminOrgId() {
  const ctx = await getAdminContext();
  return ctx.orgId;
}

async function getAdminContext() {
  const authUser = await requireAdmin();
  const dbUser = await prisma.user.findFirst({
    where: { authProviderId: authUser.id },
    select: { orgId: true, role: true },
  });
  if (!dbUser?.orgId) throw new Error("No organization found");
  return { orgId: dbUser.orgId, isSuperAdmin: dbUser.role === "super_admin" };
}

export async function getTeams() {
  const { orgId, isSuperAdmin } = await getAdminContext();

  const teams = await prisma.team.findMany({
    where: isSuperAdmin ? {} : { orgId },
    orderBy: isSuperAdmin
      ? [{ organization: { name: "asc" } }, { name: "asc" }]
      : { name: "asc" },
    include: {
      _count: { select: { users: true, subTeams: true } },
      parentTeam: { select: { id: true, name: true } },
      organization: { select: { id: true, name: true } },
    },
  });

  return {
    isSuperAdmin,
    viewerOrgId: orgId,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      type: t.type,
      orgId: t.orgId,
      orgName: t.organization?.name ?? "",
      parentTeamId: t.parentTeamId,
      parentTeamName: t.parentTeam?.name ?? null,
      description: t.description,
      memberCount: t._count.users,
      subTeamCount: t._count.subTeams,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

export async function getTeamDetail(teamId: string) {
  const { orgId, isSuperAdmin } = await getAdminContext();

  const team = await prisma.team.findFirst({
    where: isSuperAdmin ? { id: teamId } : { id: teamId, orgId },
    include: {
      parentTeam: { select: { id: true, name: true } },
      organization: { select: { id: true, name: true } },
      subTeams: {
        select: { id: true, name: true, slug: true, type: true, _count: { select: { users: true } } },
        orderBy: { name: "asc" },
      },
      users: {
        select: { id: true, fullName: true, email: true, role: true, plan: true },
        orderBy: { fullName: "asc" },
      },
    },
  });
  if (!team) return null;

  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    type: team.type,
    description: team.description,
    orgId: team.orgId,
    orgName: team.organization?.name ?? "",
    parentTeamId: team.parentTeamId,
    parentTeamName: team.parentTeam?.name ?? null,
    createdAt: team.createdAt.toISOString(),
    members: team.users,
    subTeams: team.subTeams.map((st) => ({
      id: st.id,
      name: st.name,
      slug: st.slug,
      type: st.type,
      memberCount: st._count.users,
    })),
  };
}

export async function createTeam(data: {
  name: string;
  type: string;
  description?: string;
  parentTeamId?: string;
}) {
  const orgId = await getAdminOrgId();
  const slug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Check for duplicate slug
  const existing = await prisma.team.findFirst({ where: { orgId, slug } });
  if (existing) return { error: "A team with this name already exists" };

  const team = await prisma.team.create({
    data: {
      orgId,
      name: data.name.trim(),
      slug,
      type: data.type || "generic",
      description: data.description?.trim() || null,
      parentTeamId: data.parentTeamId || null,
    },
  });

  return { success: true, teamId: team.id };
}

export async function updateTeam(
  teamId: string,
  data: { name?: string; type?: string; description?: string; parentTeamId?: string | null },
) {
  const orgId = await getAdminOrgId();

  const team = await prisma.team.findFirst({ where: { id: teamId, orgId } });
  if (!team) throw new Error("Team not found");

  const updateData: any = {};
  if (data.name !== undefined) {
    updateData.name = data.name.trim();
    updateData.slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    // Check slug uniqueness
    const dup = await prisma.team.findFirst({
      where: { orgId, slug: updateData.slug, id: { not: teamId } },
    });
    if (dup) return { error: "A team with this name already exists" };
  }
  if (data.type !== undefined) updateData.type = data.type;
  if (data.description !== undefined) updateData.description = data.description.trim() || null;
  if (data.parentTeamId !== undefined) {
    // Prevent self-reference
    if (data.parentTeamId === teamId) return { error: "A team cannot be its own parent" };
    updateData.parentTeamId = data.parentTeamId || null;
  }

  await prisma.team.update({ where: { id: teamId }, data: updateData });
  return { success: true };
}

export async function deleteTeam(teamId: string) {
  const orgId = await getAdminOrgId();
  const team = await prisma.team.findFirst({
    where: { id: teamId, orgId },
    include: { _count: { select: { users: true } } },
  });
  if (!team) throw new Error("Team not found");

  // Unassign all members first
  await prisma.user.updateMany({ where: { teamId }, data: { teamId: null } });
  // Unlink sub-teams
  await prisma.team.updateMany({ where: { parentTeamId: teamId }, data: { parentTeamId: null } });
  // Delete team
  await prisma.team.delete({ where: { id: teamId } });
  return { success: true };
}

export async function addMemberToTeam(teamId: string, userId: string) {
  const orgId = await getAdminOrgId();
  const team = await prisma.team.findFirst({ where: { id: teamId, orgId } });
  if (!team) throw new Error("Team not found");

  await prisma.user.update({ where: { id: userId }, data: { teamId } });
  return { success: true };
}

export async function removeMemberFromTeam(userId: string) {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { teamId: null } });
  return { success: true };
}

export async function getUnassignedUsers() {
  const orgId = await getAdminOrgId();
  return prisma.user.findMany({
    where: { orgId, teamId: null },
    select: { id: true, fullName: true, email: true },
    orderBy: { fullName: "asc" },
  });
}

export async function assignUserToTeam(userId: string, teamId: string) {
  await requireAdmin();
  return prisma.user.update({
    where: { id: userId },
    data: { teamId },
  });
}

export async function removeUserFromTeam(userId: string) {
  await requireAdmin();
  return prisma.user.update({
    where: { id: userId },
    data: { teamId: null },
  });
}
