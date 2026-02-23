"use client";

import FullPageGate from "@/components/ui/full-page-gate";

export default function FullPageGateWrapper({ children }: { children: React.ReactNode }) {
  return <FullPageGate feature="deal_modeler">{children}</FullPageGate>;
}
