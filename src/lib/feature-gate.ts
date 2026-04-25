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
  // STR / Airbnb
  | "bp_str_basic"
  | "bp_str_full"
  // Reports
  | "report_basic"
  | "report_full"
  // Corporate Filing
  | "bp_corp_basic"
  | "bp_corp_full"
  // Ownership Chain & Portfolio
  | "bp_ownership_chain"
  | "bp_portfolio_deep"
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
  | "promote_export"
  // Deal Structures
  | "deal_structure_all_cash"
  | "deal_structure_conventional"
  | "deal_structure_bridge_refi"
  | "deal_structure_assumable"
  | "deal_structure_syndication"
  | "deal_structure_compare"
  // Brokerage Management System
  | "bms_submissions"
  | "bms_invoices"
  | "bms_bulk_upload"
  | "bms_agents"
  | "bms_commission_plans"
  | "bms_compliance"
  | "bms_payments"
  | "bms_agent_portal"
  | "bms_agent_onboarding"
  | "bms_audit_log"
  | "bms_file_upload"
  // Motivation Scoring
  | "motivation_basic"
  | "motivation_scoring"
  // Neighborhood Vitality
  | "vitality_basic"
  | "vitality_overlay"
  // Street Intelligence
  | "street_intel_construction"
  | "street_intel_sales"
  | "street_intel_violations"
  | "street_intel_311"
  | "building_labels"
  | "street_view"
  // Quick Screen
  | "quick_screen"
  // BOV Generation
  | "bov_generation"
  // Investment Summary
  | "investment_summary"
  // Phase 2 — granular intelligence gates
  | "ai_ownership"
  | "contact_enrichment"
  | "deep_ownership"
  | "cap_rate_analysis"
  | "expense_benchmarks"
  | "distress_scores"
  // Screening
  | "screening_view"
  | "screening_create"
  | "screening_enhanced"
  // Terminal
  | "nav_terminal"
  | "terminal_access"
  | "terminal_ai_brief"
  // Condo Intelligence (Phase 7)
  | "condo_intel";

export type UserPlan = "free" | "explorer" | "pro" | "team" | "enterprise";

// ── Free: genuine daily-use value ────────────────────────────
// Market Intel (all 4 search modes + map), building profile basics
// (PLUTO + HPD owner + condition + market), core BMS, CRM basics
const FREE_FEATURES: Feature[] = [
  "nav_market_intel",
  "market_nyc",
  "map_search",
  "bp_owner_name",
  "bp_census_basic",
  "bp_live_listings",
  "bp_market_trends",
  "bp_rpie",
  // BMS core
  "bms_submissions",
  "bms_invoices",
  "bms_agent_portal",
  "bms_agent_onboarding",
];

// ── Explorer: expanded research ──────────────────────────────
const EXPLORER_FEATURES: Feature[] = [
  ...FREE_FEATURES,
  "market_nys",
  "market_nj",
  "search_unlimited",
  "bp_distress_score",
  "bp_investment_score",
  "bp_web_intel",
  "bp_census_full",
  "bp_fannie_mae_loan",
  "bp_renovation_basic",
  "bp_str_basic",
  "report_basic",
  "bp_corp_basic",
  "bp_ownership_chain",
  "deal_structure_all_cash",
  "motivation_basic",
  "vitality_basic",
  "street_intel_construction",
  "street_intel_sales",
  "building_labels",
  "quick_screen",
  "nav_terminal",
];

// ── Pro: full intelligence suite ─────────────────────────────
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
  "bp_portfolio_deep",
  "bp_renovation_full",
  "bp_str_full",
  "report_full",
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
  "deal_structure_conventional",
  "deal_structure_bridge_refi",
  "deal_structure_assumable",
  "deal_structure_syndication",
  "deal_structure_compare",
  "motivation_scoring",
  "vitality_overlay",
  "street_intel_violations",
  "street_intel_311",
  "street_view",
  "bov_generation",
  "investment_summary",
  // Phase 2 intelligence gates
  "ai_ownership",
  "contact_enrichment",
  "deep_ownership",
  "cap_rate_analysis",
  "expense_benchmarks",
  "distress_scores",
  // Screening
  "screening_view",
  "screening_create",
  // Terminal
  "terminal_access",
  "terminal_ai_brief",
  // Condo Intelligence (Phase 7)
  "condo_intel",
];

// ── Team: brokerage management ───────────────────────────────
const TEAM_FEATURES: Feature[] = [
  ...PRO_FEATURES,
  "nav_investors",
  "investors",
  "phone_multi_numbers",
  "promote_templates",
  "promote_sensitivity",
  "promote_export",
  "bms_bulk_upload",
  "bms_agents",
  "bms_commission_plans",
  "bms_compliance",
  "bms_payments",
  "bms_audit_log",
  "bms_file_upload",
  // Screening
  "screening_enhanced",
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
  bp_owner_contact: "Upgrade to Pro to access owner contact info",
  bp_distress_score: "Upgrade to Explorer to see distress scores",
  bp_investment_score: "Upgrade to Explorer to see investment scores",
  bp_web_intel: "Upgrade to Explorer to see web intelligence",
  bp_apollo_enrichment: "Upgrade to Pro to access Apollo enrichment",
  bp_census_full: "Upgrade to Explorer for full census demographics",
  bp_fannie_mae_loan: "Upgrade to Explorer to see Fannie Mae loan status",
  bp_renovation_basic: "Upgrade to Explorer for renovation cost estimates",
  bp_renovation_full: "Upgrade to Pro for full renovation analysis, ARV, and ROI",
  bp_str_basic: "Upgrade to Explorer for short-term rental income projections",
  bp_str_full: "Upgrade to Pro for full STR vs LTR comparison and building-level analysis",
  report_basic: "Upgrade to Explorer to download PDF reports",
  report_full: "Upgrade to Pro for full 4-page PDF reports with comps and investment analysis",
  bp_census_trends: "Upgrade to Pro for neighborhood trend data",
  bp_corp_basic: "Upgrade to Explorer to see corporate filing data",
  bp_corp_full: "Upgrade to Pro to see related entities & LLC piercing",
  bp_ownership_chain: "Upgrade to Explorer to see ownership history timeline",
  bp_portfolio_deep: "Upgrade to Pro for deep portfolio discovery with match sources",
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
  deal_structure_all_cash: "Upgrade to Explorer to use All Cash deal analysis",
  deal_structure_conventional: "Upgrade to Pro to use Conventional debt structures",
  deal_structure_bridge_refi: "Upgrade to Pro to use Bridge \u2192 Refi (BRRRR) analysis",
  deal_structure_assumable: "Upgrade to Pro to use Assumable Mortgage analysis",
  deal_structure_syndication: "Upgrade to Pro to use Syndication deal structures",
  deal_structure_compare: "Upgrade to Pro to compare deal structures side-by-side",
  promote_templates: "Upgrade to Team for waterfall templates",
  promote_sensitivity: "Upgrade to Team for sensitivity analysis",
  promote_export: "Upgrade to Team for promote export",
  bms_bulk_upload: "Upgrade to Team for bulk Excel invoice uploads",
  bms_agents: "Upgrade to Team for agent management",
  bms_commission_plans: "Upgrade to Team for commission plan templates",
  bms_compliance: "Upgrade to Team for compliance tracking",
  bms_payments: "Upgrade to Team for payment tracking",
  bms_audit_log: "Upgrade to Team for audit log tracking",
  bms_file_upload: "Upgrade to Team for file uploads",
  motivation_basic: "Upgrade to Explorer to see seller motivation scores",
  motivation_scoring: "Upgrade to Pro for Hot Leads and batch motivation scoring",
  vitality_basic: "Upgrade to Explorer to see neighborhood vitality scores",
  vitality_overlay: "Upgrade to Pro for the neighborhood vitality heatmap overlay",
  street_intel_construction: "Upgrade to Explorer to see street-level construction activity",
  street_intel_sales: "Upgrade to Explorer to see recent sale prices on the map",
  building_labels: "Upgrade to Explorer to see building owner labels on the map",
  street_intel_violations: "Upgrade to Pro to see violation density heatmap",
  street_intel_311: "Upgrade to Pro to see 311 quality-of-life complaints",
  street_view: "Upgrade to Pro to see Google Street View in building profiles",
  quick_screen: "Upgrade to Explorer to screen deals instantly",
  bov_generation: "Upgrade to Pro to generate Broker Opinion of Value reports",
  investment_summary: "Upgrade to Pro to generate Investment Summary reports",
  // Phase 2 intelligence gates
  ai_ownership: "Upgrade to Pro for AI-powered ownership analysis with LLC piercing",
  contact_enrichment: "Upgrade to Pro for direct phone numbers and verified email addresses",
  deep_ownership: "Upgrade to Pro for ACRIS deed history, corporate filings, and ownership chain",
  cap_rate_analysis: "Upgrade to Pro for market cap rate derivation from comparable sales",
  expense_benchmarks: "Upgrade to Pro for RGB expense benchmarks and proforma modeling",
  distress_scores: "Upgrade to Pro for distress scoring and investment opportunity signals",
  screening_view: "Upgrade to Pro to access tenant screening",
  nav_terminal: "Upgrade to Pro to access the Terminal",
  terminal_access: "Upgrade to Pro to use real-time market intelligence",
  terminal_ai_brief: "Upgrade to Pro for AI-generated intelligence briefs",
  condo_intel: "Upgrade to Pro for unit-level ownership intelligence",
  screening_create: "Upgrade to Pro to create screening applications",
  screening_enhanced: "Upgrade to Team for enhanced tri-bureau screening",
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
