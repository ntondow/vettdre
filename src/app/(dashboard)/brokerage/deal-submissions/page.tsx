import { redirect } from "next/navigation";
import { getCurrentBrokerageRole } from "@/lib/bms-auth";
import { hasPermission } from "@/lib/bms-permissions";
import { getAllSubmissions, getSubmissionStats } from "./actions";
import SubmissionsDashboard from "./submissions-dashboard";

export const dynamic = "force-dynamic";

export default async function DealSubmissionsPage() {
  const role = await getCurrentBrokerageRole();
  if (!role || !hasPermission(role, "view_all_submissions")) {
    redirect("/brokerage/my-deals");
  }

  const [submissionsResult, statsResult] = await Promise.all([
    getAllSubmissions({ page: 1, limit: 25 }),
    getSubmissionStats(),
  ]);

  return (
    <SubmissionsDashboard
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
