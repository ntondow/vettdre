"use client";

import FullPageGate from "@/components/ui/full-page-gate";

export default function ProspectingGateWrapper({ children }: { children: React.ReactNode }) {
  return <FullPageGate feature="prospecting">{children}</FullPageGate>;
}
