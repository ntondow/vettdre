"use client";

import FullPageGate from "@/components/ui/full-page-gate";

export default function PromoteGateWrapper({ children }: { children: React.ReactNode }) {
  return (
    <FullPageGate feature="promote_model">
      {children}
    </FullPageGate>
  );
}
