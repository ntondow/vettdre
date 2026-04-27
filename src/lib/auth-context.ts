import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import type { UserRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export interface OrgContext {
  orgId: string;
  userId: string;
  userEmail: string;
  userRole: UserRole;
  userName: string;
  isOverride: boolean;
  realOrgId: string;
  realOrgName?: string;
  viewingOrgName?: string;
}

interface Options {
  // Page components (server components) receive searchParams as a prop and can
  // pass `searchParams.as_org` directly. Server actions don't have searchParams
  // available, so they fall back to the helper's referer-parsing path.
  overrideAsOrg?: string;
}

// Server actions POST to the page's path without the original ?as_org query
// string. The browser includes the page URL as the referer, so we parse the
// override from there.
async function readAsOrgFromReferer(): Promise<string | null> {
  try {
    const h = await headers();
    const referer = h.get("referer");
    if (!referer) return null;
    const url = new URL(referer);
    return url.searchParams.get("as_org");
  } catch {
    return null;
  }
}

export const getCurrentOrgContext = cache(async function (
  options: Options = {},
): Promise<OrgContext | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  // Robust lookup: authProviderId primary, email fallback. Covers admin-created
  // invites that haven't been linked yet — middleware self-heals on first login.
  let user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: { organization: { select: { id: true, name: true } } },
  });
  if (!user && authUser.email) {
    user = await prisma.user.findFirst({
      where: { email: authUser.email },
      include: { organization: { select: { id: true, name: true } } },
    });
  }
  if (!user) return null;

  const realOrgId = user.orgId;
  const realOrgName = user.organization?.name;
  const userRole = user.role;

  // Explicit param wins over referer (page components pass searchParams.as_org).
  const requestedAsOrg = options.overrideAsOrg ?? (await readAsOrgFromReferer());

  let effectiveOrgId = realOrgId;
  let viewingOrgName: string | undefined;
  let isOverride = false;

  // Override is honored only when:
  //   1. user is super_admin (strict role check — non-super_admin users can append
  //      ?as_org=... to a URL but it's silently ignored)
  //   2. requested org differs from real org (a no-op override is just the
  //      regular view; don't activate banner / audit metadata for it)
  //   3. target org actually exists (bogus UUIDs silently fall back; do NOT 404)
  if (
    userRole === ("super_admin" satisfies UserRole) &&
    requestedAsOrg &&
    requestedAsOrg !== realOrgId
  ) {
    // Wrapped: malformed UUIDs raise PrismaClientValidationError instead of
    // returning null. Catch-and-fallback keeps a bogus ?as_org=garbage from
    // 500'ing the page.
    let target: { id: string; name: string } | null = null;
    try {
      target = await prisma.organization.findUnique({
        where: { id: requestedAsOrg },
        select: { id: true, name: true },
      });
    } catch {
      target = null;
    }
    if (target) {
      effectiveOrgId = target.id;
      viewingOrgName = target.name;
      isOverride = true;
    }
  }

  return {
    orgId: effectiveOrgId,
    userId: user.id,
    userEmail: user.email,
    userRole,
    userName: user.fullName || user.email,
    isOverride,
    realOrgId,
    realOrgName,
    viewingOrgName,
  };
});
