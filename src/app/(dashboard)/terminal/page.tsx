import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";
import { hasPermission } from "@/lib/feature-gate";
import type { UserPlan } from "@/lib/feature-gate";
import { getTerminalPreferences, getTerminalEvents, getEventCategories, getEventCategoryCounts } from "./actions";
import TerminalFeed from "./components/terminal-feed";
import TerminalPaywall from "./components/terminal-paywall";

export const metadata = { title: "Terminal — VettdRE" };

export default async function TerminalPage() {
  // Feature gate: check user plan server-side
  const ctx = await getCurrentOrgContext();
  let orgId = "";
  if (ctx) {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { plan: true },
    });
    const plan = (user?.plan || "free") as UserPlan;
    if (!hasPermission(plan, "terminal_access")) {
      return <TerminalPaywall />;
    }
    orgId = ctx.orgId;
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
      limit: 20,
    }),
    getEventCategoryCounts(enabledBoroughs),
  ]);

  return (
    <TerminalFeed
      orgId={orgId}
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
