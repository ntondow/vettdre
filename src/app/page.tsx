import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Slice 1b: role-aware default landing.
//
// Hits this surface in two cases:
//   1. User types `vettdre.com/` directly while logged in.
//   2. Middleware's auth-page bounce (lib/supabase/middleware.ts) now
//      redirects to "/" when no ?redirect= deep-link is present, so
//      post-login flows route through here too. That keeps the
//      role-to-landing map in exactly one place.
//
// Deep links (?redirect= queries through /login) are honored by the
// middleware bounce directly — they never reach this page.

export default async function RootPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Email is the durable lookup key — auth_provider_id may be NULL
  // for admin-created users until first login self-heals it. Same
  // pattern the middleware uses.
  const dbUser = await prisma.user.findFirst({
    where: { email: user.email! },
    select: { role: true },
  });
  redirect(landingForRole(dbUser?.role));
}

// Exported for the smoke test — pure function, role string in / path
// out, no auth or DB. Keep this in sync with the table in slice 1b's
// proposal (SLICES.md → 1b).
export function landingForRole(role: string | undefined | null): string {
  switch (role) {
    case "super_admin":
      // Interim destination — see SLICES.md → 3.Z (Admin Home for
      // super_admin) for the dedicated admin surface that will replace
      // /dashboard for this role.
      return "/dashboard";
    case "owner":
    case "admin":
    case "manager":
      return "/brokerage/dashboard";
    case "agent":
      return "/brokerage/my-deals";
    default:
      // Orphaned (no DB row yet during auto-provision race) or unknown
      // role. Falls back to the historical default so nothing 404s.
      return "/market-intel";
  }
}
