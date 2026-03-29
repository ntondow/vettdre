// Agent badge definitions — NO "use server"
// Pure data safe for both server actions and client components

export interface AgentLifetimeStats {
  totalDeals: number;
  totalRevenue: number;
  totalListingsLeased: number;
  monthsActive: number;
}

export interface BadgeDefinition {
  name: string;
  description: string;
  icon: string;
  category: "lifetime" | "streak" | "monthly";
}

export const BADGE_DEFINITIONS: Record<string, BadgeDefinition> = {
  first_deal: {
    name: "First Deal",
    description: "Closed your first deal",
    icon: "🎉",
    category: "lifetime",
  },
  deals_10: {
    name: "Double Digits",
    description: "Closed 10 deals lifetime",
    icon: "🔟",
    category: "lifetime",
  },
  deals_50: {
    name: "Half Century",
    description: "Closed 50 deals lifetime",
    icon: "🌟",
    category: "lifetime",
  },
  century_club: {
    name: "Century Club",
    description: "Closed 100 deals lifetime",
    icon: "💯",
    category: "lifetime",
  },
  streak_3: {
    name: "3-Month Streak",
    description: "Hit targets 3 months in a row",
    icon: "🔥",
    category: "streak",
  },
  streak_6: {
    name: "Half-Year Streak",
    description: "Hit targets 6 months in a row",
    icon: "🔥🔥",
    category: "streak",
  },
  streak_12: {
    name: "Iron Streak",
    description: "Hit targets 12 months straight",
    icon: "🏅",
    category: "streak",
  },
  monthly_mvp: {
    name: "Monthly MVP",
    description: "Top producer of the month",
    icon: "🏆",
    category: "monthly",
  },
  fastest_lease: {
    name: "Speed Demon",
    description: "Fastest average days-to-lease in a month",
    icon: "⚡",
    category: "monthly",
  },
  top_revenue: {
    name: "Money Maker",
    description: "Highest revenue in a single month",
    icon: "💰",
    category: "monthly",
  },
};

// Lifetime badge thresholds — used by checkAndAwardBadges
export const LIFETIME_BADGE_THRESHOLDS: Array<{
  type: string;
  field: keyof AgentLifetimeStats;
  threshold: number;
}> = [
  { type: "first_deal", field: "totalDeals", threshold: 1 },
  { type: "deals_10", field: "totalDeals", threshold: 10 },
  { type: "deals_50", field: "totalDeals", threshold: 50 },
  { type: "century_club", field: "totalDeals", threshold: 100 },
];

// Streak badge thresholds
export const STREAK_BADGE_THRESHOLDS: Array<{
  type: string;
  threshold: number;
}> = [
  { type: "streak_3", threshold: 3 },
  { type: "streak_6", threshold: 6 },
  { type: "streak_12", threshold: 12 },
];
