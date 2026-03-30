import { redirect } from "next/navigation";
import { getCurrentBrokerageRole } from "@/lib/bms-auth";
import { hasPermission } from "@/lib/bms-permissions";
import { getMySubmissions } from "@/app/(dashboard)/brokerage/deal-submissions/actions";
import MyDealsView from "./my-deals-view";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ submitted?: string }>;
}

export default async function MyDealsPage({ searchParams }: Props) {
  const role = await getCurrentBrokerageRole();
  if (!role || !hasPermission(role, "view_own_submissions")) {
    redirect("/login");
  }

  const params = await searchParams;
  const showSuccessBanner = params.submitted === "1";

  const result = await getMySubmissions();

  return (
    <MyDealsView
      initialSubmissions={result.data ?? []}
      showSuccessBanner={showSuccessBanner}
    />
  );
}
