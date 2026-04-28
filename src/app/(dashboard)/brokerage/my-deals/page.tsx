import { redirect } from "next/navigation";
import { getCurrentBrokerageRole } from "@/lib/bms-auth";
import { hasPermission } from "@/lib/bms-permissions";
import { getMySubmissions } from "@/app/(dashboard)/brokerage/deal-submissions/actions";
import MyDealsView from "./my-deals-view";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ submitted?: string; as_org?: string }>;
}

export default async function MyDealsPage({ searchParams }: Props) {
  const params = await searchParams;
  const as_org = params.as_org;
  const role = await getCurrentBrokerageRole({ overrideAsOrg: as_org });
  if (!role || !hasPermission(role, "view_own_submissions")) {
    redirect("/login");
  }

  const showSuccessBanner = params.submitted === "1";

  const result = await getMySubmissions({ overrideAsOrg: as_org });

  return (
    <MyDealsView
      initialSubmissions={result.data ?? []}
      showSuccessBanner={showSuccessBanner}
    />
  );
}
