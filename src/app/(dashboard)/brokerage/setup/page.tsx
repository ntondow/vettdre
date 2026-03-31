"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Users,
  Home,
  DollarSign,
  Shield,
  Settings,
  Palette,
  ArrowRight,
  Rocket,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { getSetupProgress } from "./actions";

interface SetupStep {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  complete: boolean;
  count?: number;
  cta: string;
  tip?: string;
}

export default function BrokerSetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [expandedTip, setExpandedTip] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const progress = await getSetupProgress();
        const stepDefs: SetupStep[] = [
          {
            id: "agents",
            title: "Add Your Agents",
            description: `${progress.agentCount} agent${progress.agentCount !== 1 ? "s" : ""} added`,
            href: "/brokerage/agents",
            icon: Users,
            complete: progress.agentCount > 0,
            count: progress.agentCount,
            cta: progress.agentCount > 0 ? "Manage Agents" : "Add First Agent",
            tip: "Add agents one by one or import from a spreadsheet. Each agent gets an invite link to create their own account.",
          },
          {
            id: "listings",
            title: "Add Listings",
            description: `${progress.listingCount} listing${progress.listingCount !== 1 ? "s" : ""} created`,
            href: "/brokerage/listings",
            icon: Home,
            complete: progress.listingCount > 0,
            count: progress.listingCount,
            cta: progress.listingCount > 0 ? "Manage Listings" : "Add First Listing",
            tip: "Add your brokerage exclusive listings. Agents will see these in their dashboard. You can also bulk import from a spreadsheet.",
          },
          {
            id: "commission",
            title: "Set Up Commission Plans",
            description: `${progress.commissionPlanCount} plan${progress.commissionPlanCount !== 1 ? "s" : ""} configured`,
            href: "/brokerage/commission-plans",
            icon: DollarSign,
            complete: progress.commissionPlanCount > 0,
            count: progress.commissionPlanCount,
            cta: progress.commissionPlanCount > 0 ? "Edit Plans" : "Create First Plan",
            tip: "Create tiered commission plans (volume-based, value-based, or flat). Assign plans to individual agents for automatic split calculations.",
          },
          {
            id: "compliance",
            title: "Upload Compliance Documents",
            description: progress.complianceDocCount > 0
              ? `${progress.complianceDocCount} document${progress.complianceDocCount !== 1 ? "s" : ""} on file`
              : "Track licenses, E&O insurance, and more",
            href: "/brokerage/compliance",
            icon: Shield,
            complete: progress.complianceDocCount > 0,
            count: progress.complianceDocCount,
            cta: progress.complianceDocCount > 0 ? "View Documents" : "Upload Documents",
            tip: "Keep agent licenses, E&O insurance, and continuing education on file. You'll get alerts before anything expires.",
          },
          {
            id: "branding",
            title: "Customize Branding",
            description: progress.hasBranding ? "Branding configured" : "Add your logo and colors",
            href: "/brokerage/settings",
            icon: Palette,
            complete: progress.hasBranding,
            cta: progress.hasBranding ? "Edit Branding" : "Set Up Branding",
            tip: "Upload your brokerage logo, set brand colors, and customize invoice headers. Your branding appears on client-facing documents.",
          },
          {
            id: "settings",
            title: "Configure Brokerage Settings",
            description: progress.hasSettings ? "Settings configured" : "Set defaults, permissions, and roles",
            href: "/brokerage/settings",
            icon: Settings,
            complete: progress.hasSettings,
            cta: progress.hasSettings ? "Edit Settings" : "Configure Settings",
            tip: "Set default commission splits, configure agent permissions by role, manage the public deal submission link, and set up billing preferences.",
          },
        ];
        setSteps(stepDefs);
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const completed = steps.filter((s) => s.complete).length;
  const total = steps.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total;

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="h-4 bg-slate-100 rounded w-96" />
          <div className="h-2 bg-slate-200 rounded-full w-full mt-4" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Rocket className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Brokerage Setup</h1>
            <p className="text-sm text-slate-500">Get your brokerage up and running in a few steps</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">{completed} of {total} steps complete</span>
            <span className="text-sm font-medium text-slate-500">{pct}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* All done banner */}
      {allDone && (
        <div className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-green-800">You&apos;re all set!</h2>
              <p className="text-sm text-green-600 mt-1">
                Your brokerage is fully configured. Head to the dashboard to start managing your business.
              </p>
              <Link
                href="/brokerage/dashboard"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                Go to Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isExpanded = expandedTip === step.id;
          return (
            <div
              key={step.id}
              className={`border rounded-xl transition-all ${
                step.complete
                  ? "border-green-200 bg-green-50/50"
                  : "border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-4 p-4">
                {/* Step number / check */}
                <div className="flex-shrink-0">
                  {step.complete ? (
                    <CheckCircle2 className="h-7 w-7 text-green-500" />
                  ) : (
                    <div className="h-7 w-7 rounded-full border-2 border-slate-300 flex items-center justify-center">
                      <span className="text-xs font-bold text-slate-400">{idx + 1}</span>
                    </div>
                  )}
                </div>

                {/* Icon */}
                <div className={`p-2 rounded-lg flex-shrink-0 ${step.complete ? "bg-green-100" : "bg-slate-100"}`}>
                  <Icon className={`h-5 w-5 ${step.complete ? "text-green-600" : "text-slate-500"}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm font-semibold ${step.complete ? "text-green-800" : "text-slate-800"}`}>
                    {step.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
                </div>

                {/* Tip toggle */}
                {step.tip && (
                  <button
                    onClick={() => setExpandedTip(isExpanded ? null : step.id)}
                    className="p-1 text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0"
                    title="Tips"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                )}

                {/* CTA */}
                <Link
                  href={step.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex-shrink-0 ${
                    step.complete
                      ? "text-green-700 bg-green-100 hover:bg-green-200"
                      : "text-white bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {step.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {/* Tip content */}
              {isExpanded && step.tip && (
                <div className="px-4 pb-4 pt-0 ml-[4.5rem]">
                  <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">{step.tip}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick links */}
      <div className="mt-8 pt-6 border-t border-slate-200">
        <h3 className="text-sm font-medium text-slate-500 mb-3">Quick Links</h3>
        <div className="flex flex-wrap gap-2">
          <Link href="/brokerage/dashboard" className="text-sm text-blue-600 hover:text-blue-700 font-medium">Dashboard</Link>
          <span className="text-slate-300">|</span>
          <Link href="/brokerage/deal-submissions" className="text-sm text-blue-600 hover:text-blue-700 font-medium">Deal Submissions</Link>
          <span className="text-slate-300">|</span>
          <Link href="/brokerage/invoices" className="text-sm text-blue-600 hover:text-blue-700 font-medium">Invoices</Link>
          <span className="text-slate-300">|</span>
          <Link href="/brokerage/reports/pnl" className="text-sm text-blue-600 hover:text-blue-700 font-medium">Reports</Link>
        </div>
      </div>
    </div>
  );
}
