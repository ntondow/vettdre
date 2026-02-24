import { Suspense } from "react";
import PromoteGateWrapper from "./promote-gate-wrapper";
import PromoteBuilder from "./promote-builder";

export default function PromotePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    }>
      <PromoteGateWrapper>
        <PromoteBuilder />
      </PromoteGateWrapper>
    </Suspense>
  );
}
