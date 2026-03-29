import { redirect } from "next/navigation";
import { getCurrentBrokerageRole } from "@/lib/bms-auth";
import { hasPermission } from "@/lib/bms-permissions";
import { getAgentEarningsReport, getRevenuePipeline, getRevenueByMonth } from "./actions";
import RevenueDashboard from "./revenue-dashboard";

export const dynamic = "force-dynamic";

export default async function RevenueReportPage() {
  const role = await getCurrentBrokerageRole();
  if (!role || !hasPermission(role, "view_reports")) {
    redirect("/brokerage/dashboard");
  }

  const [earningsResult, pipelineResult, monthlyResult] = await Promise.all([
    getAgentEarningsReport(),
    getRevenuePipeline(),
    getRevenueByMonth(),
  ]);

  return (
    <RevenueDashboard
      initialEarnings={earningsResult.data ?? { agents: [], orgTotals: {} }}
      initialPipeline={pipelineResult.data ?? { pipeline: {}, totalRevenueCollected: 0, totalAgentPayoutsCompleted: 0, pendingInvoicing: 0, pendingPayment: 0 }}
      initialMonthly={monthlyResult.data ?? []}
    />
  );
}
