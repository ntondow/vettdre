/**
 * Shared types for the Data Fusion Engine.
 * Extracted to a separate file to avoid circular dependency issues
 * when client components import types from the "use server" data-fusion-engine.ts.
 */

import type {
  NormalizedAddress,
  ResolvedEntity,
  ResolvedContact,
  ConfidentValue,
} from "./entity-resolver";

export type { NormalizedAddress, ResolvedEntity, ResolvedContact, ConfidentValue };

export interface SourceTiming {
  source: string;
  durationMs: number;
  cached: boolean;
  timedOut: boolean;
  error: boolean;
}

export interface BuildingIntelligence {
  bbl: string;
  bin?: string;
  address: NormalizedAddress;
  alternateAddresses: NormalizedAddress[];

  property: {
    units: ConfidentValue<number> | null;
    residentialUnits: ConfidentValue<number> | null;
    commercialUnits: ConfidentValue<number> | null;
    yearBuilt: ConfidentValue<number> | null;
    grossSqft: ConfidentValue<number> | null;
    lotSqft: ConfidentValue<number> | null;
    stories: ConfidentValue<number> | null;
    buildingClass: ConfidentValue<string> | null;
    zoning: ConfidentValue<string> | null;
    builtFAR: ConfidentValue<number> | null;
    maxFAR: ConfidentValue<number> | null;
    hasElevator: ConfidentValue<boolean> | null;
    rentStabilizedUnits: ConfidentValue<number> | null;
  };

  ownership: {
    likelyOwner: ResolvedEntity;
    registeredOwner: string;
    hpdRegistration?: {
      owner: string;
      managingAgent: string;
      agentPhone: string;
      agentAddress: string;
    };
    deedHolder?: string;
    llcName?: string;
    corporateAffiliations: string[];
    mailingAddress?: string;
    ownerPortfolio: { bbl: string; address: string; units: number }[];
    confidence: number;
    sources: string[];
  };

  corporateIntel?: {
    entityName: string;
    dosId: string;
    entityType: string;
    filingDate: string;
    processName: string;
    processAddress: string;
    registeredAgent: string | null;
    registeredAgentAddress: string | null;
    relatedEntities: { name: string; dosId: string; filingDate: string; entityType: string }[];
    totalRelatedEntities: number;
  };

  financials: {
    assessedValue: { value: number; source: string; year: number } | null;
    marketValue: { value: number; source: string; year: number } | null;
    annualTax: { value: number; source: string; year: number } | null;
    taxRate: { value: number; source: string } | null;
    lastSale: {
      price: number;
      date: string;
      buyer: string;
      seller: string;
      source: string;
    } | null;
    allSales: {
      price: number;
      date: string;
      buyer: string;
      seller: string;
      docType: string;
    }[];
    estimatedValue: {
      low: number;
      mid: number;
      high: number;
      methodology: string;
    } | null;
  };

  energy: {
    energyStarGrade: string;
    energyStarScore: number;
    siteEUI: number;
    sourceEUI: number;
    electricityKwh: number;
    gasTherms: number;
    waterKgal: number;
    fuelOilGal: number;
    ghgEmissions: number;
    estimatedUtilityCost: number;
    ll97Status: "compliant" | "at_risk_2030" | "non_compliant";
    ll97PenaltyEstimate: number;
    reportingYear: number;
  } | null;

  compliance: {
    hpdViolations: {
      open: number;
      total: number;
      classA: number;
      classB: number;
      classC: number;
      recentViolations: any[];
    };
    dobViolations: { open: number; ecb: number; ecbPenalty: number };
    dobPermits: { active: number; recent: any[] };
    rpieStatus: "compliant" | "non_compliant" | "unknown";
    rpieYearsMissed: string[];
    ll84Status: "reported" | "not_reported" | "not_required";
    complaints311: number;
    recentComplaints: number;
    topComplaintTypes: { type: string; count: number }[];
    litigationCount: number;
    openLitigation: number;
    harassmentFinding: boolean;
  };

  distressSignals: {
    score: number;
    signals: {
      type: string;
      severity: "low" | "medium" | "high";
      description: string;
      source: string;
    }[];
  };

  investmentSignals: {
    score: number;
    signals: {
      type: string;
      description: string;
      estimatedUpside: string;
    }[];
  };

  comps: {
    count: number;
    avgPricePerUnit: number;
    medianPricePerUnit: number;
    avgPricePerSqft: number;
    subjectVsMarket: number;
    recentComps: any[];
  } | null;

  marketTrends: {
    localAppreciation1Yr: number | null;
    metroAppreciation1Yr: number;
    medianDaysOnMarket: number | null;
    marketTemperature: "hot" | "warm" | "cool" | "cold" | null;
    trend: "appreciating" | "stable" | "declining";
  } | null;

  fannieMaeLoan: {
    isOwnedByFannieMae: boolean;
    servicerName?: string;
    lookupDate: string;
  } | null;

  renovationEstimate: {
    recommendedLevel: "light" | "moderate" | "gut";
    totalCost: number;
    costPerUnit: number;
    arv: number;
    roi: number;
    conditionSignals: string[];
  } | null;

  strProjection: {
    monthlySTRPerUnit: number;
    monthlyLTRPerUnit: number;
    strPremium: number;
    annualDelta: number;
    regulatoryRisk: string;
    neighborhood: string;
  } | null;

  liveListings: {
    forSale: {
      address: string;
      price: number;
      priceStr: string;
      units?: number;
      sqft?: number;
      pricePerUnit?: number;
      pricePerSqft?: number;
      broker?: string;
      brokerage?: string;
      daysOnMarket?: number;
      sourceUrl: string;
      sourceDomain: string;
      description: string;
    }[];
    forRent: {
      address: string;
      price: number;
      priceStr: string;
      beds?: number;
      sourceUrl: string;
      sourceDomain: string;
      description: string;
    }[];
    webComps: {
      address: string;
      price: number;
      priceStr: string;
      units?: number;
      pricePerUnit?: number;
      sourceUrl: string;
      type: string;
    }[];
    marketTrend: "rising" | "stable" | "declining" | "unknown";
    marketInsight: string;
  } | null;

  webIntelligence: {
    entityName: string;
    newsCount: number;
    courtFilingCount: number;
    hasNegativeNews: boolean;
    hasLawsuits: boolean;
    topArticles: {
      title: string;
      url: string;
      domain: string;
      snippet: string;
      category: string;
      sentiment?: string;
    }[];
    aiSummary?: string;
  } | null;

  contacts: {
    ownerContacts: ResolvedContact[];
    managingAgentContacts: ResolvedContact[];
  };

  raw: {
    pluto: any;
    violations: any[];
    violationSummary: any;
    complaints: any[];
    complaintSummary: any;
    permits: any[];
    hpdContacts: any[];
    registrations: any[];
    litigation: any[];
    litigationSummary: any;
    ecbViolations: any[];
    ecbSummary: any;
    rentStabilized: any;
    speculation: any;
    dobFilings: any[];
    phoneRankings: any[];
    neighborhoodData: any;
    pdlEnrichment: any;
    apolloEnrichment: any;
    apolloOrgEnrichment: any;
    apolloKeyPeople: any[];
    leadVerification: any;
    rankedContacts: any[];
    ownerContacts: any[];
    corporateIntel: any;
  };

  dataSources: string[];
  dataFreshness: Record<string, string>;
  overallConfidence: number;
  lastUpdated: string;

  timing?: {
    totalMs: number;
    cacheHitRate: number;
    sources: SourceTiming[];
  };
}
