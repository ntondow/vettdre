import { redirect } from "next/navigation";
import { getCurrentBrokerageRole } from "@/lib/bms-auth";
import { hasPermission } from "@/lib/bms-permissions";
import { getMySubmissions } from "@/app/(dashboard)/brokerage/deal-submissions/actions";
import { getProfile } from "@/app/(dashboard)/settings/actions";
import { computeMissingProfileFields } from "@/components/profile-completion-banner";
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

  // Slice 13 / B-017: server-side profile-completeness check. getProfile
  // returns the actual logged-in user's profile (not the override target's),
  // because getCurrentOrgContext only swaps orgId when ?as_org is set —
  // userId stays put. Banner appears for the agent themselves, not for
  // super_admins viewing the page through the override.
  const [submissionsResult, profile] = await Promise.all([
    getMySubmissions({ overrideAsOrg: as_org }),
    getProfile(),
  ]);
  const profileMissingFields = computeMissingProfileFields(profile);

  return (
    <MyDealsView
      asOrg={as_org}
      initialSubmissions={submissionsResult.data ?? []}
      showSuccessBanner={showSuccessBanner}
      profileMissingFields={profileMissingFields}
    />
  );
}
