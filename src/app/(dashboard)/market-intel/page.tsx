import { Suspense } from "react";
import MarketIntelSearch from "./market-intel-search";

export default function MarketIntelPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" /></div>}>
      <MarketIntelSearch />
    </Suspense>
  );
}
