"use client";

import FullPageGate from "@/components/ui/full-page-gate";

export default function PortfolioGateWrapper({ children }: { children: React.ReactNode }) {
  return <FullPageGate feature="portfolios">{children}</FullPageGate>;
}
