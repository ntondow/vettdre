// Feature gating — NO "use server" so client components can import types & helpers

export type Feature =
  // Nav
  | "nav_market_intel"
  | "nav_deal_modeler"
  | "nav_prospecting"
  | "nav_portfolios"
  | "nav_campaigns"
  | "nav_sequences"
  | "nav_financing"
  | "nav_investors"
  | "nav_comp_analysis"
  // Market Intel
  | "market_nyc"
  | "market_nys"
  | "market_nj"
  | "search_unlimited"
  // Building Profile
  | "bp_owner_name"
  | "bp_owner_contact"
  | "bp_distress_score"
  | "bp_investment_score"
  | "bp_rpie"
  | "bp_live_listings"
  | "bp_web_intel"
  | "bp_apollo_enrichment"
  // Census / Neighborhood
  | "bp_census_basic"
  | "bp_census_full"
  | "bp_census_trends"
  // Market Trends
  | "bp_market_trends"
  // Fannie Mae
  | "bp_fannie_mae_loan"
  // Renovation
  | "bp_renovation_basic"
  | "bp_renovation_full"
  // Corporate Filing
  | "bp_corp_basic"
  | "bp_corp_full"
  // Map
  | "map_search"
  // Phone & SMS
  | "phone_sms"
  | "phone_multi_numbers"
  // Other
  | "deal_modeler"
  | "prospecting"
  | "portfolios"
  | "comp_analysis"
  | "campaigns"
  | "sequences"
  | "financing"
  | "investors"
  | "api_access"
  // Promote Model
  | "promote_model"
  | "nav_promote_model"
  | "promote_templates"
  | "promote_sensitivity"
  | "promote_export";

export type UserPlan = "free" | "explorer" | "pro" | "team" | "enterprise";

const FREE_FEATURES: Feature[] = [
  "nav_market_intel",
  "market_nyc",
  "bp_census_basic",
];

const EXPLORER_FEATURES: Feature[] = [
  ...FREE_FEATURES,
  "market_nys",
  "market_nj",
  "map_search",
  "search_unlimited",
  "bp_owner_name",
  "bp_distress_score",
  "bp_investment_score",
  "bp_rpie",
  "bp_live_listings",
  "bp_web_intel",
  "bp_census_full",
  "bp_market_trends",
  "bp_fannie_mae_loan",
  "bp_renovation_basic",
  "bp_corp_basic",
];

const PRO_FEATURES: Feature[] = [
  ...EXPLORER_FEATURES,
  "nav_deal_modeler",
  "nav_prospecting",
  "nav_portfolios",
  "nav_campaigns",
  "nav_sequences",
  "nav_financing",
  "nav_comp_analysis",
  "bp_owner_contact",
  "bp_apollo_enrichment",
  "bp_census_trends",
  "bp_corp_full",
  "bp_renovation_full",
  "phone_sms",
  "deal_modeler",
  "prospecting",
  "portfolios",
  "comp_analysis",
  "campaigns",
  "sequences",
  "financing",
  "api_access",
  "promote_model",
  "nav_promote_model",
];

const TEAM_FEATURES: Feature[] = [
  ...PRO_FEATURES,
  "nav_investors",
  "investors",
  "phone_multi_numbers",
  "promote_templates",
  "promote_sensitivity",
  "promote_export",
];

// Enterprise gets everything
const ENTERPRISE_FEATURES: Feature[] = [...TEAM_FEATURES];

export const TIER_PERMISSIONS: Record<UserPlan, Set<Feature>> = {
  free: new Set(FREE_FEATURES),
  explorer: new Set(EXPLORER_FEATURES),
  pro: new Set(PRO_FEATURES),
  team: new Set(TEAM_FEATURES),
  enterprise: new Set(ENTERPRISE_FEATURES),
};

export function hasPermission(plan: UserPlan, feature: Feature): boolean {
  if (plan === "team" || plan === "enterprise") return true;
  return TIER_PERMISSIONS[plan].has(feature);
}

const PLAN_ORDER: UserPlan[] = ["free", "explorer", "pro", "team", "enterprise"];

export function getRequiredPlan(feature: Feature): UserPlan {
  for (const plan of PLAN_ORDER) {
    if (TIER_PERMISSIONS[plan].has(feature)) return plan;
  }
  return "enterprise";
}

const UPGRADE_MESSAGES: Partial<Record<Feature, string>> = {
  market_nys: "Upgrade to Explorer to unlock NYS & NJ markets",
  market_nj: "Upgrade to Explorer to unlock NYS & NJ markets",
  map_search: "Upgrade to Explorer to unlock Map Search",
  bp_owner_name: "Upgrade to Explorer to see owner names",
  bp_owner_contact: "Upgrade to Pro to access owner contact info",
  bp_distress_score: "Upgrade to Explorer to see distress scores",
  bp_investment_score: "Upgrade to Explorer to see investment scores",
  bp_rpie: "Upgrade to Explorer to see RPIE status",
  bp_live_listings: "Upgrade to Explorer to see live listings",
  bp_web_intel: "Upgrade to Explorer to see web intelligence",
  bp_apollo_enrichment: "Upgrade to Pro to access Apollo enrichment",
  bp_census_full: "Upgrade to Explorer for full census demographics",
  bp_market_trends: "Upgrade to Explorer for market trends and appreciation data",
  bp_fannie_mae_loan: "Upgrade to Explorer to see Fannie Mae loan status",
  bp_renovation_basic: "Upgrade to Explorer for renovation cost estimates",
  bp_renovation_full: "Upgrade to Pro for full renovation analysis, ARV, and ROI",
  bp_census_trends: "Upgrade to Pro for neighborhood trend data",
  bp_corp_basic: "Upgrade to Explorer to see corporate filing data",
  bp_corp_full: "Upgrade to Pro to see related entities & LLC piercing",
  deal_modeler: "Upgrade to Pro to access the Deal Modeler",
  nav_deal_modeler: "Upgrade to Pro to access the Deal Modeler",
  prospecting: "Upgrade to Pro to access Prospecting",
  nav_prospecting: "Upgrade to Pro to access Prospecting",
  portfolios: "Upgrade to Pro to access Portfolios",
  nav_portfolios: "Upgrade to Pro to access Portfolios",
  comp_analysis: "Upgrade to Pro to access Comp Analysis",
  nav_comp_analysis: "Upgrade to Pro to access Comp Analysis",
  campaigns: "Upgrade to Pro to access Campaigns",
  nav_campaigns: "Upgrade to Pro to access Campaigns",
  sequences: "Upgrade to Pro to access Sequences",
  nav_sequences: "Upgrade to Pro to access Sequences",
  financing: "Upgrade to Pro to access Financing",
  nav_financing: "Upgrade to Pro to access Financing",
  investors: "Upgrade to Team to access Investors",
  nav_investors: "Upgrade to Team to access Investors",
  phone_sms: "Upgrade to Pro to use Phone & SMS",
  phone_multi_numbers: "Upgrade to Team for multiple phone numbers",
  promote_model: "Upgrade to Pro to access the Promote Model",
  nav_promote_model: "Upgrade to Pro to access the Promote Model",
  promote_templates: "Upgrade to Team for waterfall templates",
  promote_sensitivity: "Upgrade to Team for sensitivity analysis",
  promote_export: "Upgrade to Team for promote export",
};

export function getUpgradeMessage(feature: Feature): string {
  return UPGRADE_MESSAGES[feature] || `Upgrade to ${PLAN_DISPLAY[getRequiredPlan(feature)].name} to unlock this feature`;
}

export interface PlanDisplayInfo {
  name: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  color: string;
}

export const PLAN_DISPLAY: Record<UserPlan, PlanDisplayInfo> = {
  free: { name: "Free", monthlyPrice: 0, annualPrice: 0, color: "slate" },
  explorer: { name: "Explorer", monthlyPrice: 59, annualPrice: 49, color: "emerald" },
  pro: { name: "Pro", monthlyPrice: 219, annualPrice: 199, color: "blue" },
  team: { name: "Team", monthlyPrice: 399, annualPrice: null, color: "violet" },
  enterprise: { name: "Enterprise", monthlyPrice: null, annualPrice: null, color: "amber" },
};

export const FREE_DAILY_SEARCH_LIMIT = 5;
