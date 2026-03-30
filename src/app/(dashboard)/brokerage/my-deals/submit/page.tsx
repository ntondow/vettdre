import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { getExclusiveProperties } from "@/app/(dashboard)/brokerage/deal-submissions/actions";
import SubmitDealForm from "./submit-deal-form";

interface ExclusiveBuilding {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  landlordName?: string | null;
  landlordEmail?: string | null;
  landlordPhone?: string | null;
  managementCo?: string | null;
  totalUnits?: number | null;
}

export const dynamic = "force-dynamic";

export default async function SubmitDealPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: {
      brokerAgent: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          licenseNumber: true,
          defaultSplitPct: true,
          houseExclusiveSplitPct: true,
          personalExclusiveSplitPct: true,
        },
      },
      organization: {
        select: {
          bmsSettings: true,
          defaultHouseExclusiveSplitPct: true,
          defaultPersonalExclusiveSplitPct: true,
        },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  // Extract agent info
  const agentInfo = user.brokerAgent
    ? {
        firstName: user.brokerAgent.firstName,
        lastName: user.brokerAgent.lastName,
        email: user.brokerAgent.email,
        phone: user.brokerAgent.phone ?? undefined,
        licenseNumber: user.brokerAgent.licenseNumber ?? undefined,
      }
    : {
        firstName: user.fullName?.split(" ")[0] ?? "",
        lastName: user.fullName?.split(" ").slice(1).join(" ") ?? "",
        email: user.email,
        phone: user.phone ?? undefined,
        licenseNumber: user.licenseNumber ?? undefined,
      };

  // Extract org-level default splits from Organization columns
  const orgSplits = {
    defaultHouseExclusiveSplitPct: user.organization?.defaultHouseExclusiveSplitPct
      ? Number(user.organization.defaultHouseExclusiveSplitPct)
      : 35,
    defaultPersonalExclusiveSplitPct: user.organization?.defaultPersonalExclusiveSplitPct
      ? Number(user.organization.defaultPersonalExclusiveSplitPct)
      : 70,
  };

  // Agent-level split overrides (from BrokerAgent record — null = use org defaults)
  const agentSplitOverrides = user.brokerAgent
    ? {
        houseExclusiveSplitPct: user.brokerAgent.houseExclusiveSplitPct
          ? Number(user.brokerAgent.houseExclusiveSplitPct)
          : undefined,
        personalExclusiveSplitPct: user.brokerAgent.personalExclusiveSplitPct
          ? Number(user.brokerAgent.personalExclusiveSplitPct)
          : undefined,
        defaultSplitPct: Number(user.brokerAgent.defaultSplitPct),
      }
    : undefined;

  // Fetch exclusive buildings for the brokerage dropdown
  const exclusivesResult = await getExclusiveProperties();
  const exclusiveBuildings = (exclusivesResult.data ?? []) as ExclusiveBuilding[];

  return (
    <div className="min-h-screen bg-slate-50">
      <SubmitDealForm
        agentInfo={agentInfo}
        orgSplits={orgSplits}
        agentSplitOverrides={agentSplitOverrides}
        exclusiveBuildings={exclusiveBuildings}
      />
    </div>
  );
}
