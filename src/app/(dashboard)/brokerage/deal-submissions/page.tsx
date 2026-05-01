import { redirect } from "next/navigation";
import { getCurrentBrokerageRole } from "@/lib/bms-auth";
import { hasPermission } from "@/lib/bms-permissions";
import { getAllSubmissions, getSubmissionStats } from "./actions";
import SubmissionsDashboard from "./submissions-dashboard";

export const dynamic = "force-dynamic";

export default async function DealSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ as_org?: string }>;
}) {
  const { as_org } = await searchParams;
  const role = await getCurrentBrokerageRole({ overrideAsOrg: as_org });
  if (!role || !hasPermission(role, "view_all_submissions")) {
    // Preserve ?as_org= on redirect so super_admin override survives the
    // bounce — slice-0c-class regression guard. super_admin shouldn't hit
    // this branch (line-25 short-circuit in bms-auth.ts maps them to
    // brokerage_admin which has view_all_submissions), but if a transient
    // role lookup fails or a future role lacks the permission, we still
    // hand the override to the destination.
    redirect(
      as_org
        ? `/brokerage/my-deals?as_org=${encodeURIComponent(as_org)}`
        : "/brokerage/my-deals",
    );
  }

  const [submissionsResult, statsResult] = await Promise.all([
    getAllSubmissions({ page: 1, limit: 25 }, { overrideAsOrg: as_org }),
    getSubmissionStats({ overrideAsOrg: as_org }),
  ]);

  return (
    <SubmissionsDashboard
      asOrg={as_org}
      initialSubmissions={submissionsResult.data ?? []}
      initialTotal={submissionsResult.total ?? 0}
      initialStats={
        (statsResult.data as {
          total: number;
          byStatus: Record<string, number>;
          byExclusiveType: Record<string, number>;
          totalCommissionPending: number;
          totalCommissionPaid: number;
        }) ?? {
          total: 0,
          byStatus: {},
          byExclusiveType: {},
          totalCommissionPending: 0,
          totalCommissionPaid: 0,
        }
      }
    />
  );
}
