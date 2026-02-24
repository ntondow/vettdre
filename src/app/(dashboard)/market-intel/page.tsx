import { Suspense } from "react";
import MarketIntelSearch from "./market-intel-search";
import RecentActivityWidget from "./recent-activity-widget";

export default function MarketIntelPage() {
  return (
    <>
      <div className="px-4 md:px-8 pt-4">
        <RecentActivityWidget />
      </div>
      <Suspense fallback={<div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" /></div>}>
        <MarketIntelSearch />
      </Suspense>
    </>
  );
}
