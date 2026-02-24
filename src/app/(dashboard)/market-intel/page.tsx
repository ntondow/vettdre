import MarketIntelSearch from "./market-intel-search";
import RecentActivityWidget from "./recent-activity-widget";

export default function MarketIntelPage() {
  return (
    <>
      <div className="px-4 md:px-8 pt-4">
        <RecentActivityWidget />
      </div>
      <MarketIntelSearch />
    </>
  );
}
