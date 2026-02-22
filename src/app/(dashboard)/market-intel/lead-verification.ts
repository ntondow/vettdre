"use server";

// ============================================================
// Data Confidence Scoring Engine
// ============================================================
export interface ConfidenceFactor {
  name: string;
  points: number;
  maxPoints: number;
  source: string;
  matched: boolean;
}

export interface ConfidenceScoreBreakdown {
  total: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  factors: ConfidenceFactor[];
  recommendation: string;
}

export async function calculateConfidenceScore(params: {
  hpdOwnerMatch?: boolean;
  acrisDeedMatch?: boolean;
  plutoOwnerMatch?: boolean;
  dobFilingMatch?: boolean;
  phoneFound?: boolean;
  phoneVerified?: boolean; // 2+ sources
  dobPhoneFound?: boolean;
  dobPhoneCrossMatch?: boolean; // DOB phone matches another source
  pdlEmailFound?: boolean;
  apolloEmailFound?: boolean;
  emailsSameAcrossSources?: boolean; // PDL + Apollo confirm same email
  apolloPersonMatch?: boolean;
  apolloOrgMatch?: boolean;
  pdlPersonMatch?: boolean;
  linkedinFound?: boolean;
  mailingAddressMatch?: boolean;
}): Promise<ConfidenceScoreBreakdown> {
  const factors: ConfidenceFactor[] = [];
  let total = 0;

  // === IDENTITY (NYC public data confirms who owns the building) ===

  // HPD Registration Match: +15
  const hpdMatched = !!params.hpdOwnerMatch;
  factors.push({ name: "HPD Registration Match", points: hpdMatched ? 15 : 0, maxPoints: 15, source: "HPD", matched: hpdMatched });
  if (hpdMatched) total += 15;

  // ACRIS Deed Match: +15
  const acrisMatched = !!params.acrisDeedMatch;
  factors.push({ name: "ACRIS Deed Match", points: acrisMatched ? 15 : 0, maxPoints: 15, source: "ACRIS", matched: acrisMatched });
  if (acrisMatched) total += 15;

  // PLUTO Owner Match: +10
  const plutoMatched = !!params.plutoOwnerMatch;
  factors.push({ name: "PLUTO Owner Match", points: plutoMatched ? 10 : 0, maxPoints: 10, source: "PLUTO", matched: plutoMatched });
  if (plutoMatched) total += 10;

  // DOB Filing Match: +5
  const dobMatched = !!params.dobFilingMatch;
  factors.push({ name: "DOB Filing Match", points: dobMatched ? 5 : 0, maxPoints: 5, source: "DOB", matched: dobMatched });
  if (dobMatched) total += 5;

  // === REACHABILITY (can we actually contact the owner?) ===

  // Phone Found: +5
  const phoneFound = !!params.phoneFound;
  factors.push({ name: "Phone Found", points: phoneFound ? 5 : 0, maxPoints: 5, source: "Skip Trace", matched: phoneFound });
  if (phoneFound) total += 5;

  // Phone Verified (2+ sources): +10
  const phoneVerified = !!params.phoneVerified;
  factors.push({ name: "Phone Verified (2+ sources)", points: phoneVerified ? 10 : 0, maxPoints: 10, source: "Multi-Source", matched: phoneVerified });
  if (phoneVerified) total += 10;

  // DOB Phone Found: +5
  const dobPhoneFound = !!params.dobPhoneFound;
  factors.push({ name: "DOB Phone Found", points: dobPhoneFound ? 5 : 0, maxPoints: 5, source: "DOB", matched: dobPhoneFound });
  if (dobPhoneFound) total += 5;

  // DOB Phone Cross-Match: +5 (DOB phone matches PDL/Apollo)
  const dobPhoneCrossMatch = !!params.dobPhoneCrossMatch;
  factors.push({ name: "DOB Phone Cross-Match", points: dobPhoneCrossMatch ? 5 : 0, maxPoints: 5, source: "Multi-Source", matched: dobPhoneCrossMatch });
  if (dobPhoneCrossMatch) total += 5;

  // Email — PDL: +5, Apollo: +8, both same email: +12 total (capped)
  const pdlEmail = !!params.pdlEmailFound;
  const apolloEmail = !!params.apolloEmailFound;
  const emailSame = !!params.emailsSameAcrossSources;
  let emailPoints = 0;
  if (emailSame && pdlEmail && apolloEmail) {
    emailPoints = 12;
    factors.push({ name: "Email Confirmed (PDL + Apollo)", points: 12, maxPoints: 12, source: "Multi-Source", matched: true });
  } else {
    if (pdlEmail) {
      emailPoints += 5;
      factors.push({ name: "PDL Email Found", points: 5, maxPoints: 5, source: "PDL", matched: true });
    } else {
      factors.push({ name: "PDL Email Found", points: 0, maxPoints: 5, source: "PDL", matched: false });
    }
    if (apolloEmail) {
      emailPoints += 8;
      factors.push({ name: "Apollo Email Found", points: 8, maxPoints: 8, source: "Apollo", matched: true });
    } else {
      factors.push({ name: "Apollo Email Found", points: 0, maxPoints: 8, source: "Apollo", matched: false });
    }
  }
  total += emailPoints;

  // === ENRICHMENT (additional data quality signals) ===

  // Apollo Person Match: +10
  const apolloPersonMatched = !!params.apolloPersonMatch;
  factors.push({ name: "Apollo Person Match", points: apolloPersonMatched ? 10 : 0, maxPoints: 10, source: "Apollo", matched: apolloPersonMatched });
  if (apolloPersonMatched) total += 10;

  // Apollo Org Match: +5
  const apolloOrgMatched = !!params.apolloOrgMatch;
  factors.push({ name: "Apollo Org Match", points: apolloOrgMatched ? 5 : 0, maxPoints: 5, source: "Apollo", matched: apolloOrgMatched });
  if (apolloOrgMatched) total += 5;

  // PDL Person Match: +5
  const pdlMatched = !!params.pdlPersonMatch;
  factors.push({ name: "PDL Person Match", points: pdlMatched ? 5 : 0, maxPoints: 5, source: "PDL", matched: pdlMatched });
  if (pdlMatched) total += 5;

  // LinkedIn Found: +5
  const linkedinFound = !!params.linkedinFound;
  factors.push({ name: "LinkedIn Found", points: linkedinFound ? 5 : 0, maxPoints: 5, source: "Apollo/PDL", matched: linkedinFound });
  if (linkedinFound) total += 5;

  // Mailing Address Match: +5
  const mailingMatched = !!params.mailingAddressMatch;
  factors.push({ name: "Mailing Address Match", points: mailingMatched ? 5 : 0, maxPoints: 5, source: "PDL", matched: mailingMatched });
  if (mailingMatched) total += 5;

  total = Math.min(100, total);

  // Grade
  let grade: "A" | "B" | "C" | "D" | "F";
  if (total >= 85) grade = "A";
  else if (total >= 70) grade = "B";
  else if (total >= 50) grade = "C";
  else if (total >= 30) grade = "D";
  else grade = "F";

  // Recommendation
  let recommendation: string;
  if (total >= 85) recommendation = "High confidence -- ownership and contact data verified across multiple authoritative sources. Safe to initiate outreach.";
  else if (total >= 70) recommendation = "Good confidence -- most key data points confirmed. Minor gaps remain but outreach is well-supported.";
  else if (total >= 50) recommendation = "Moderate confidence -- some data verified but significant gaps exist. Verify key details before outreach.";
  else if (total >= 30) recommendation = "Low confidence -- limited verification. Cross-reference with additional sources before relying on this data.";
  else recommendation = "Insufficient data -- unable to verify ownership or contact information. Additional research required.";

  return { total, grade, factors, recommendation };
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
    confidenceScore: null,
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
      results.verificationDetails.push("Corporate entity -- individual behind LLC not yet identified");
    } else {
      results.verificationDetails.push("No PDL match found -- limited verification");
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
    results.verificationDetails.push("Apollo phone matches DOB filing phone -- HIGH confidence");
  }

  // Check if Apollo org matches HPD entity
  const hpdCorps = (buildingData?.hpdContacts || [])
    .filter((c: any) => c.type === "CorporateOwner")
    .map((c: any) => (c.corporateName || "").toUpperCase());
  const apolloOrgMatchesHPD = !!(apolloOrg?.name && hpdCorps.some((hc: string) =>
    hc.includes(apolloOrg.name.split(" ")[0].toUpperCase()) || apolloOrg.name.toUpperCase().includes(hc.split(" ")[0])
  ));

  // --- Build confidence score params ---
  const ownerUpper = ownerName.toUpperCase();

  // HPD owner match: check if any HPD contact name matches the owner name
  const hpdContacts = buildingData?.hpdContacts || [];
  const hpdOwnerMatch = hpdContacts.some((c: any) => {
    const name = ((c.firstName || "") + " " + (c.lastName || "")).trim().toUpperCase();
    const corp = (c.corporateName || "").toUpperCase();
    return (name && ownerUpper.includes(name.split(" ")[0]) || ownerUpper.includes(corp.split(" ")[0]) && corp.length > 2);
  });

  // PLUTO owner match: check if PLUTO ownerName matches
  const plutoOwner = (buildingData?.pluto?.ownerName || "").toUpperCase();
  const plutoOwnerMatch = plutoOwner.length > 2 && (
    plutoOwner.includes(ownerUpper.split(" ")[0]) || ownerUpper.includes(plutoOwner.split(" ")[0])
  );

  // DOB filing match: check if any DOB permit has matching owner name
  const dobPermits = buildingData?.dobPermits || [];
  const dobFilingMatch = dobPermits.some((p: any) => {
    const permitOwner = (p.owner_s_first_name || "" + " " + p.owner_s_last_name || "").toUpperCase();
    const permitBiz = (p.owner_s_business_name || "").toUpperCase();
    return (permitOwner.length > 2 && ownerUpper.includes(permitOwner.split(" ")[0])) ||
           (permitBiz.length > 2 && ownerUpper.includes(permitBiz.split(" ")[0]));
  });

  // Phone found: any phone found for the owner
  const phoneFound = !!buildingData?.rankedContacts?.some((c: any) => c.phone) || !!pdl?.phones?.length || !!apolloPerson?.phone;

  // Phone verified: phone found in 2+ sources
  const phoneSources = [
    !!buildingData?.rankedContacts?.some((c: any) => c.phone),
    !!pdl?.phones?.length,
    !!apolloPerson?.phone,
  ].filter(Boolean).length;
  const phoneVerified = phoneSources >= 2;

  // DOB Phone Found: any owner phone from DOB filings
  const dobPhoneNumbers = (buildingData?.phoneRankings || []).map((p: any) => p.phone?.replace(/\D/g, "").slice(-10));
  const dobPhoneFound = dobPhoneNumbers.length > 0;

  // DOB Phone Cross-Match: DOB phone matches PDL or Apollo phone
  const pdlPhones = (pdl?.phones || []).map((p: any) => (p.number || "").replace(/\D/g, "").slice(-10));
  const dobPhoneCrossMatch = dobPhoneFound && (
    (apolloPhoneClean && dobPhoneNumbers.some((dp: string) => dp === apolloPhoneClean)) ||
    pdlPhones.some((pp: string) => pp.length >= 7 && dobPhoneNumbers.some((dp: string) => dp === pp))
  );

  // Email: separate PDL and Apollo
  const pdlEmailFound = !!(pdl?.emails?.length);
  const apolloEmailFound = !!apolloPerson?.email;

  // Check if PDL and Apollo have the same email
  const pdlEmails = (pdl?.emails || []).map((e: string) => e.toLowerCase());
  const apolloEmailLower = apolloPerson?.email?.toLowerCase() || "";
  const emailsSameAcrossSources = pdlEmailFound && apolloEmailFound && pdlEmails.includes(apolloEmailLower);

  // Apollo person match
  const apolloPersonMatch = !!apolloPerson;

  // Apollo org match
  const apolloOrgMatch = apolloOrgMatchesHPD;

  // PDL person match
  const pdlPersonMatch = !!(pdl && !pdl.error);

  // LinkedIn found
  const linkedinFound = !!pdl?.linkedin || !!apolloPerson?.linkedinUrl;

  // Mailing address match: pass false for now
  const mailingAddressMatch = false;

  // ACRIS deed match: pass false for now
  const acrisDeedMatch = false;

  results.confidenceScore = await calculateConfidenceScore({
    hpdOwnerMatch,
    acrisDeedMatch,
    plutoOwnerMatch,
    dobFilingMatch,
    phoneFound,
    phoneVerified,
    dobPhoneFound,
    dobPhoneCrossMatch,
    pdlEmailFound,
    apolloEmailFound,
    emailsSameAcrossSources,
    apolloPersonMatch,
    apolloOrgMatch,
    pdlPersonMatch,
    linkedinFound,
    mailingAddressMatch,
  });

  console.log("Confidence score:", results.confidenceScore.total, results.confidenceScore.grade);
  return results;
}
