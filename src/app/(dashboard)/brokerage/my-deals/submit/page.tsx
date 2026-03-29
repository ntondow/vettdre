import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getExclusiveProperties, getAgentSplitForDeal } from "@/app/(dashboard)/brokerage/deal-submissions/actions";
import SubmitDealForm from "./submit-deal-form";

export const dynamic = "force-dynamic";

export default async function SubmitDealPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  // Get user + agent + org info
  let user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: {
      brokerAgent: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          licenseNumber: true,
          houseExclusiveSplitPct: true,
          personalExclusiveSplitPct: true,
        },
      },
      organization: {
        select: {
          id: true,
          defaultHouseExclusiveSplitPct: true,
          defaultPersonalExclusiveSplitPct: true,
        },
      },
    },
  });
  if (!user && authUser.email) {
    user = await prisma.user.findFirst({
      where: { email: authUser.email },
      include: {
        brokerAgent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            licenseNumber: true,
            houseExclusiveSplitPct: true,
            personalExclusiveSplitPct: true,
          },
        },
        organization: {
          select: {
            id: true,
            defaultHouseExclusiveSplitPct: true,
            defaultPersonalExclusiveSplitPct: true,
          },
        },
      },
    });
  }
  if (!user) redirect("/login");

  const agent = user.brokerAgent;
  const org = user.organization;

  const agentInfo = {
    agentId: agent?.id ?? user.id,
    firstName: agent?.firstName ?? user.fullName?.split(" ")[0] ?? "",
    lastName: agent?.lastName ?? user.fullName?.split(" ").slice(1).join(" ") ?? "",
    email: agent?.email ?? user.email,
    phone: agent?.phone ?? "",
    licenseNumber: agent?.licenseNumber ?? "",
  };

  // Org split defaults
  const orgSplits = {
    defaultHouseExclusiveSplitPct: org?.defaultHouseExclusiveSplitPct
      ? Number(org.defaultHouseExclusiveSplitPct)
      : 50,
    defaultPersonalExclusiveSplitPct: org?.defaultPersonalExclusiveSplitPct
      ? Number(org.defaultPersonalExclusiveSplitPct)
      : 70,
  };

  // Agent split overrides
  const agentSplitOverrides = {
    houseExclusiveSplitPct: agent?.houseExclusiveSplitPct
      ? Number(agent.houseExclusiveSplitPct)
      : null,
    personalExclusiveSplitPct: agent?.personalExclusiveSplitPct
      ? Number(agent.personalExclusiveSplitPct)
      : null,
  };

  // Fetch exclusive buildings
  const exclusivesResult = await getExclusiveProperties();
  const exclusiveBuildings = (exclusivesResult.data ?? []) as Array<{
    id: string;
    name: string;
    address?: string;
    landlordName?: string;
    landlordEmail?: string;
    landlordPhone?: string;
    billingEntityAddress?: string;
    managementCo?: string;
    billingEntityName?: string;
    billingEntityEmail?: string;
    billingEntityPhone?: string;
  }>;

  return (
    <SubmitDealForm
      agentInfo={agentInfo}
      orgSplits={orgSplits}
      agentSplitOverrides={agentSplitOverrides}
      exclusiveBuildings={exclusiveBuildings}
    />
  );
}
