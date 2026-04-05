import { getTerminalPreferences, getTerminalEvents, getEventCategories, getEventCategoryCounts } from "./actions";
import TerminalFeed from "./components/terminal-feed";

export const metadata = { title: "Terminal — VettdRE" };

export default async function TerminalPage() {
  const [prefs, categories] = await Promise.all([
    getTerminalPreferences(),
    getEventCategories(),
  ]);

  const enabledBoroughs = prefs?.enabledBoroughs || [1, 2, 3, 4, 5];
  const enabledCategories = prefs?.enabledCategories || categories.filter(c => c.defaultEnabled).map(c => c.eventType);
  const selectedNtas = prefs?.selectedNtas || [];

  const [initialEvents, categoryCounts] = await Promise.all([
    getTerminalEvents({
      boroughs: enabledBoroughs,
      categories: enabledCategories,
      ntas: selectedNtas,
      limit: 50,
    }),
    getEventCategoryCounts(enabledBoroughs),
  ]);

  return (
    <TerminalFeed
      initialEvents={initialEvents.events}
      initialHasMore={initialEvents.hasMore}
      initialBoroughs={enabledBoroughs}
      initialCategories={enabledCategories}
      initialNtas={selectedNtas}
      categories={categories}
      categoryCounts={categoryCounts}
    />
  );
}
