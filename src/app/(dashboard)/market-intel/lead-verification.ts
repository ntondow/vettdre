"use server";

// ============================================================
// AI Lead Scoring Engine
// ============================================================
export interface LeadScore {
  total: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  signals: { label: string; points: number; detail: string }[];
  recommendation: string;
}

export async function calculateLeadScore(params: {
  // NYC data
  portfolioSize?: number;
  totalUnits?: number;
  totalValue?: number;
  distressScore?: number;
  openViolations?: number;
  openLitigation?: number;
  ecbPenalties?: number;
  onSpeculationList?: boolean;
  recentSales?: number; // sales in last 2 years
  // Contact data
  hasPhone?: boolean;
  hasEmail?: boolean;
  hasLinkedin?: boolean;
  // Apollo/PDL data
  jobTitle?: string;
  company?: string;
  isRealEstateIndustry?: boolean;
  companySize?: number;
  // Verification
  identityVerified?: boolean;
  multipleSourcesMatch?: boolean;
  // Apollo-specific signals
  apolloPersonMatch?: boolean;
  apolloPhoneMatchesDOB?: boolean;
  apolloEmailFound?: boolean;
  apolloOrgMatchesHPD?: boolean;
  apolloOrgHasWebsite?: boolean;
  apolloFoundKeyPeople?: boolean;
}): Promise<LeadScore> {
  const signals: { label: string; points: number; detail: string }[] = [];
  let total = 0;

  // Portfolio signals (0-30 points)
  if (params.portfolioSize && params.portfolioSize >= 5) {
    const pts = Math.min(15, params.portfolioSize);
    signals.push({ label: "Large Portfolio", points: pts, detail: params.portfolioSize + " properties" });
    total += pts;
  }
  if (params.totalUnits && params.totalUnits >= 50) {
    const pts = Math.min(15, Math.round(params.totalUnits / 20));
    signals.push({ label: "High Unit Count", points: pts, detail: params.totalUnits + " total units" });
    total += pts;
  }

  // Distress signals (0-25 points)
  if (params.distressScore && params.distressScore >= 40) {
    signals.push({ label: "High Distress", points: 15, detail: "Distress score: " + params.distressScore });
    total += 15;
  } else if (params.distressScore && params.distressScore >= 20) {
    signals.push({ label: "Moderate Distress", points: 8, detail: "Distress score: " + params.distressScore });
    total += 8;
  }
  if (params.openLitigation && params.openLitigation > 0) {
    signals.push({ label: "Active Lawsuits", points: 10, detail: params.openLitigation + " open cases" });
    total += 10;
  }
  if (params.ecbPenalties && params.ecbPenalties > 10000) {
    signals.push({ label: "Heavy ECB Fines", points: 8, detail: "$" + Math.round(params.ecbPenalties).toLocaleString() + " owed" });
    total += 8;
  }
  if (params.onSpeculationList) {
    signals.push({ label: "Speculation Watch List", points: 7, detail: "HPD flagged" });
    total += 7;
  }

  // Transaction velocity (0-10 points)
  if (params.recentSales && params.recentSales >= 2) {
    signals.push({ label: "Active Seller", points: 10, detail: params.recentSales + " sales in 2 years" });
    total += 10;
  }

  // Contact accessibility (0-15 points)
  if (params.hasPhone) {
    signals.push({ label: "Phone Available", points: 7, detail: "Direct phone number" });
    total += 7;
  }
  if (params.hasEmail) {
    signals.push({ label: "Email Available", points: 5, detail: "Email address found" });
    total += 5;
  }
  if (params.hasLinkedin) {
    signals.push({ label: "LinkedIn Profile", points: 3, detail: "Professional profile found" });
    total += 3;
  }

  // Professional signals (0-10 points)
  if (params.isRealEstateIndustry) {
    signals.push({ label: "RE Industry", points: 5, detail: "Works in real estate" });
    total += 5;
  }
  if (params.jobTitle && params.jobTitle.match(/owner|president|ceo|director|manager|partner|principal/i)) {
    signals.push({ label: "Decision Maker", points: 5, detail: params.jobTitle });
    total += 5;
  }

  // Verification bonus (0-10 points)
  if (params.identityVerified) {
    signals.push({ label: "Identity Verified", points: 5, detail: "Matched across multiple databases" });
    total += 5;
  }
  if (params.multipleSourcesMatch) {
    signals.push({ label: "Multi-Source Match", points: 5, detail: "HPD + PLUTO + Apollo/PDL aligned" });
    total += 5;
  }

  // Apollo-specific signals (0-50 bonus points)
  if (params.apolloPersonMatch) {
    signals.push({ label: "Apollo Match", points: 10, detail: "Person found in Apollo database" });
    total += 10;
  }
  if (params.apolloPhoneMatchesDOB) {
    signals.push({ label: "Phone Confirmed", points: 15, detail: "Apollo phone matches DOB filing" });
    total += 15;
  }
  if (params.apolloEmailFound) {
    signals.push({ label: "Apollo Email", points: 5, detail: "Verified email via Apollo" });
    total += 5;
  }
  if (params.apolloOrgMatchesHPD) {
    signals.push({ label: "Org Confirmed", points: 10, detail: "Apollo org matches HPD entity" });
    total += 10;
  }
  if (params.apolloOrgHasWebsite) {
    signals.push({ label: "Company Website", points: 5, detail: "Organization has web presence" });
    total += 5;
  }
  if (params.apolloFoundKeyPeople) {
    signals.push({ label: "Key People Found", points: 5, detail: "Decision-makers identified at org" });
    total += 5;
  }

  total = Math.min(100, total);

  // Grade
  let grade: "A" | "B" | "C" | "D" | "F";
  if (total >= 80) grade = "A";
  else if (total >= 60) grade = "B";
  else if (total >= 40) grade = "C";
  else if (total >= 20) grade = "D";
  else grade = "F";

  // Recommendation
  let recommendation: string;
  if (total >= 80) recommendation = "Hot lead — high-value target with multiple distress signals. Prioritize outreach immediately.";
  else if (total >= 60) recommendation = "Strong lead — significant portfolio with motivated seller indicators. Schedule outreach this week.";
  else if (total >= 40) recommendation = "Moderate lead — some positive signals. Worth a call to gauge interest.";
  else if (total >= 20) recommendation = "Low priority — limited signals. Monitor for changes in distress or transaction activity.";
  else recommendation = "Insufficient data — need more information to score this lead effectively.";

  signals.sort((a, b) => b.points - a.points);

  return { total, grade, signals, recommendation };
}

// ============================================================
// Full Lead Verification (combines everything)
// ============================================================
export async function verifyLead(
  ownerName: string,
  companyName: string | null,
  address: string,
  borough: string,
  buildingData?: any
) {
  console.log("=== LEAD VERIFICATION ===", ownerName, "|", companyName);

  const results: any = {
    leadScore: null,
    verified: false,
    verificationDetails: [],
  };

  // Check PDL enrichment data from building profile
  const pdl = buildingData?.pdlEnrichment;
  if (pdl && !pdl.error) {
    results.verified = true;
    results.verificationDetails.push("Matched via People Data Labs (likelihood: " + (pdl.likelihood || "N/A") + ")");
    if (pdl.jobCompany && companyName) {
      const pdlCo = (pdl.jobCompany || "").toUpperCase();
      const nycCo = companyName.toUpperCase();
      if (pdlCo.includes(nycCo.split(" ")[0]) || nycCo.includes(pdlCo.split(" ")[0])) {
        results.verificationDetails.push("Company matches across PDL + NYC records");
      }
    }
  } else {
    const isLLC = ownerName.toUpperCase().match(/LLC|CORP|INC|L\.P\.|TRUST/);
    if (isLLC) {
      results.verificationDetails.push("Corporate entity — individual behind LLC not yet identified");
    } else {
      results.verificationDetails.push("No PDL match found — limited verification");
    }
  }

  // Check Apollo enrichment data
  const apolloPerson = buildingData?.apolloEnrichment;
  const apolloOrg = buildingData?.apolloOrgEnrichment;
  const apolloKeyPeople = buildingData?.apolloKeyPeople;

  if (apolloPerson) {
    results.verified = true;
    results.verificationDetails.push("Matched via Apollo.io (email: " + (apolloPerson.email ? "found" : "none") + ", phone: " + (apolloPerson.phone ? "found" : "none") + ")");
    if (apolloPerson.company && companyName) {
      const apolloCo = (apolloPerson.company || "").toUpperCase();
      const nycCo = companyName.toUpperCase();
      if (apolloCo.includes(nycCo.split(" ")[0]) || nycCo.includes(apolloCo.split(" ")[0])) {
        results.verificationDetails.push("Apollo company matches NYC entity records");
      }
    }
  }
  if (apolloOrg) {
    results.verificationDetails.push("Organization enriched via Apollo: " + apolloOrg.name + (apolloOrg.industry ? " (" + apolloOrg.industry + ")" : ""));
  }
  if (apolloKeyPeople?.length > 0) {
    results.verificationDetails.push("Found " + apolloKeyPeople.length + " key people at organization via Apollo");
  }

  // Check if Apollo phone matches DOB phone
  const dobPhones = (buildingData?.phoneRankings || []).map((p: any) => p.phone?.replace(/\D/g, "").slice(-10));
  const apolloPhoneClean = apolloPerson?.phone?.replace(/\D/g, "").slice(-10);
  const apolloPhoneMatchesDOB = !!(apolloPhoneClean && dobPhones.some((dp: string) => dp === apolloPhoneClean));
  if (apolloPhoneMatchesDOB) {
    results.verificationDetails.push("Apollo phone matches DOB filing phone — HIGH confidence");
  }

  // Check if Apollo org matches HPD entity
  const hpdCorps = (buildingData?.hpdContacts || [])
    .filter((c: any) => c.type === "CorporateOwner")
    .map((c: any) => (c.corporateName || "").toUpperCase());
  const apolloOrgMatchesHPD = !!(apolloOrg?.name && hpdCorps.some((hc: string) =>
    hc.includes(apolloOrg.name.split(" ")[0].toUpperCase()) || apolloOrg.name.toUpperCase().includes(hc.split(" ")[0])
  ));

  // Calculate lead score using PDL + Apollo data
  const scoreParams: any = {
    hasPhone: !!buildingData?.rankedContacts?.some((c: any) => c.phone) || !!pdl?.phones?.length || !!apolloPerson?.phone,
    hasEmail: !!pdl?.emails?.length || !!apolloPerson?.email,
    hasLinkedin: !!pdl?.linkedin || !!apolloPerson?.linkedinUrl,
    distressScore: buildingData?.distressScore || 0,
    openViolations: buildingData?.violationSummary?.open || 0,
    openLitigation: buildingData?.litigationSummary?.open || 0,
    ecbPenalties: buildingData?.ecbSummary?.totalPenalty || 0,
    onSpeculationList: buildingData?.speculation?.onWatchList || false,
    portfolioSize: buildingData?.relatedCount || 0,
    totalUnits: buildingData?.pluto?.unitsRes || 0,
    identityVerified: results.verified,
    multipleSourcesMatch: results.verified && (!!buildingData?.rankedContacts?.some((c: any) => c.phone) || !!apolloPerson),
    // Apollo-specific signals
    apolloPersonMatch: !!apolloPerson,
    apolloPhoneMatchesDOB,
    apolloEmailFound: !!apolloPerson?.email,
    apolloOrgMatchesHPD,
    apolloOrgHasWebsite: !!apolloOrg?.website,
    apolloFoundKeyPeople: (apolloKeyPeople?.length || 0) > 0,
  };

  if (apolloPerson) {
    scoreParams.jobTitle = apolloPerson.title || pdl?.jobTitle;
    scoreParams.company = apolloPerson.company || pdl?.jobCompany;
    scoreParams.isRealEstateIndustry = (apolloPerson.companyIndustry || apolloPerson.company || pdl?.jobCompany || "").toLowerCase().match(/real estate|realty|property|housing/);
  } else if (pdl) {
    scoreParams.jobTitle = pdl.jobTitle;
    scoreParams.company = pdl.jobCompany;
    scoreParams.isRealEstateIndustry = (pdl.jobCompany || "").toLowerCase().match(/real estate|realty|property|housing/);
  }

  results.leadScore = await calculateLeadScore(scoreParams);

  console.log("Lead score:", results.leadScore.total, results.leadScore.grade);
  return results;
}
