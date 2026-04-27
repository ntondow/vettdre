import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/auth-context";
import HealthDashboard from "./components/health-dashboard";

export default async function AdminTerminalPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect("/login");
  if (ctx.userRole !== "super_admin") redirect("/settings");

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Terminal Pipeline Health</h1>
        <p className="text-sm text-slate-500 mt-1">
          Monitor ingestion, enrichment, and AI brief generation across all NYC Open Data sources.
        </p>
      </div>
      <HealthDashboard />
    </div>
  );
}
