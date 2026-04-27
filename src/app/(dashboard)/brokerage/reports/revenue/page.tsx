import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";
import { hasPermission } from "@/lib/bms-permissions";
import type { BrokerageRoleType } from "@/lib/bms-types";
import { getAgentEarningsReport, getRevenuePipeline, getRevenueByMonth } from "./actions";
import RevenueDashboard from "./revenue-dashboard";

export const dynamic = "force-dynamic";

export default async function RevenueReportPage() {
  // ── Auth + Permission Check ────────────────────────────────
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    include: { brokerAgent: { select: { brokerageRole: true } } },
  });
  if (!user) redirect("/login");

  let role: BrokerageRoleType = "agent";
  if (user.role === "owner" || user.role === "admin" || user.role === "super_admin") {
    role = "brokerage_admin";
  } else if (user.brokerAgent?.brokerageRole) {
    role = user.brokerAgent.brokerageRole as BrokerageRoleType;
  }

  if (!hasPermission(role, "view_reports")) {
    redirect("/brokerage/dashboard");
  }

  // ── Parallel Data Fetch ────────────────────────────────────
  const [earningsReport, pipeline, monthlyRevenue] = await Promise.all([
    getAgentEarningsReport(),
    getRevenuePipeline(),
    getRevenueByMonth(),
  ]);

  return (
    <RevenueDashboard
      initialEarnings={earningsReport}
      initialPipeline={pipeline}
      initialMonthly={monthlyRevenue}
      canView1099={hasPermission(role, "view_1099")}
    />
  );
}
