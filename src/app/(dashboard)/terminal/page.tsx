import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/feature-gate";
import type { UserPlan } from "@/lib/feature-gate";
import { getTerminalPreferences, getTerminalEvents, getEventCategories, getEventCategoryCounts } from "./actions";
import TerminalFeed from "./components/terminal-feed";
import TerminalPaywall from "./components/terminal-paywall";

export const metadata = { title: "Terminal — VettdRE" };

export default async function TerminalPage() {
  // Feature gate: check user plan server-side
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (authUser) {
    const user = await prisma.user.findFirst({
      where: { OR: [{ authProviderId: authUser.id }, { email: authUser.email || "" }] },
      select: { plan: true },
    });
    const plan = (user?.plan || "free") as UserPlan;
    if (!hasPermission(plan, "terminal_access")) {
      return <TerminalPaywall />;
    }
  }

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
