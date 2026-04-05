"use client";

import Link from "next/link";
import { MonitorDot, Zap, Filter, Bell } from "lucide-react";

export default function TerminalPaywall() {
  return (
    <div className="min-h-[80vh] bg-[#0D1117] flex items-center justify-center -m-4 md:-m-6 px-4">
      <div className="max-w-md w-full">
        {/* Preview card */}
        <div className="bg-[#161B22] border border-[#21262D] rounded-xl p-6 space-y-5">
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-[#0A84FF]/10 flex items-center justify-center mx-auto mb-3">
              <MonitorDot className="w-6 h-6 text-[#0A84FF]" />
            </div>
            <h1 className="text-xl font-bold font-mono text-[#E6EDF3]">
              VettdRE <span className="text-[#0A84FF]">Terminal</span>
            </h1>
            <p className="text-sm text-[#8B949E] mt-1">
              Real-time NYC property intelligence
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-3">
            <FeatureRow icon={<Zap size={14} />} text="Real-time event detection across 9 NYC datasets" />
            <FeatureRow icon={<MonitorDot size={14} />} text="AI-generated Bloomberg-style intelligence briefs" />
            <FeatureRow icon={<Filter size={14} />} text="Filter by borough, neighborhood, and event category" />
            <FeatureRow icon={<Bell size={14} />} text="Watchlist alerts for properties, blocks, and owners" />
          </div>

          {/* Sample brief preview */}
          <div className="bg-[#0D1117] rounded-lg p-3 border-l-[3px] border-l-[#30D158]">
            <p className="font-mono text-[11px] text-[#8B949E] leading-relaxed">
              ■ SALE RECORDED | 123 Main St, Manhattan | 1000150042<br />
              &nbsp;&nbsp;$4.2M · 12 units · $350K/unit · 8.2% cap<br />
              &nbsp;&nbsp;_______________________________________________<br />
              &nbsp;&nbsp;· 23% above NTA median price per unit<br />
              &nbsp;&nbsp;· Seller held 7.3 years, implied 62% gain<br />
              &nbsp;&nbsp;· 3 open Class C HPD violations
            </p>
          </div>

          {/* CTA */}
          <Link
            href="/settings/billing"
            className="block w-full text-center bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white text-sm font-semibold py-3 rounded-lg transition-colors"
          >
            Upgrade to Pro
          </Link>

          <p className="text-center text-[10px] text-[#8B949E]">
            Terminal is included with Pro, Team, and Enterprise plans
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="text-[#0A84FF] mt-0.5 shrink-0">{icon}</div>
      <span className="text-sm text-[#E6EDF3]">{text}</span>
    </div>
  );
}
