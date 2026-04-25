/**
 * /buildings/[bbl] — Canonical building intelligence dossier page.
 * Full-page version of the building profile slide-over.
 * Server-side rendered for shareability + SEO.
 * Plan-gated: free/explorer see paywall + upgrade CTA.
 */

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/feature-gate";
import type { UserPlan } from "@/lib/feature-gate";
import BuildingDossierClient from "./client";

export async function generateMetadata({ params }: { params: Promise<{ bbl: string }> }) {
  const { bbl } = await params;
  const building = await prisma.coBuilding.findFirst({
    where: { bbl },
    select: { address: true },
  });
  return {
    title: building ? `${building.address} — VettdRE Intel` : `Building ${bbl} — VettdRE Intel`,
  };
}

export default async function BuildingDossierPage({ params }: { params: Promise<{ bbl: string }> }) {
  const { bbl } = await params;

  // Auth + plan check
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  let plan: UserPlan = "free";
  if (authUser) {
    const user = await prisma.user.findFirst({
      where: { OR: [{ authProviderId: authUser.id }, { email: authUser.email || "" }] },
      select: { plan: true },
    });
    plan = (user?.plan || "free") as UserPlan;
  }

  const hasCondo = hasPermission(plan, "condo_intel");

  // Fetch building (SSR for SEO regardless of plan)
  const building = await prisma.coBuilding.findFirst({
    where: { bbl },
    select: {
      id: true, bbl: true, address: true, normalizedAddress: true,
      borough: true, totalUnits: true, residentialUnits: true,
      yearBuilt: true, buildingClass: true, propertyType: true,
    },
  });

  if (!building) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Building Not Found</h1>
        <p className="text-sm text-slate-500 mt-2">BBL {bbl} is not in the building intelligence database yet.</p>
        <p className="text-sm text-slate-400 mt-1">Data is populated as buildings are ingested from NYC Open Data sources.</p>
      </div>
    );
  }

  return (
    <BuildingDossierClient
      bbl={bbl}
      building={JSON.parse(JSON.stringify(building))}
      hasCondo={hasCondo}
      plan={plan}
    />
  );
}
