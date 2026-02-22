"use server";

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

interface OwnerSummary {
  likelyOwner: string;
  ownerType: string;
  confidence: string;
  ownershipStructure: string;
  bestContactAddress: string;
  bestContactSource: string;
  bestPhone: string;
  bestPhoneSource: string;
  portfolioSize: number;
  keyNames: string[];
  keyEntities: string[];
  commonAddress: string;
  lastTransaction: string;
  lastTransactionDate: string;
  lastTransactionAmount: string;
  buildingAge: number;
  insights: string[];
}

export async function analyzeOwnership(building: {
  address: string;
  block: string;
  lot: string;
  boro: string;
  totalUnits?: number;
  yearBuilt?: number;
  assessedValue?: number;
  numFloors?: number;
  bldgArea?: number;
  zoneDist?: string;
}, candidates: any[], transactions: any[], nysEntities: any[], portfolio?: any, apolloData?: {
  person?: any;
  org?: any;
  keyPeople?: any[];
}, dobFilings?: any[]): Promise<{ summary: OwnerSummary | null; error: string | null }> {

  const candidateSummary = candidates.slice(0, 8).map((c: any, i: number) => {
    return `#${i + 1} ${c.name} (${c.isEntity ? "Entity" : "Individual"}, confidence: ${c.confidence}%)
  Signals: ${c.signals.map((s: any) => `${s.source}: ${s.role}${s.date && s.date !== "current" ? " (" + s.date.substring(0, 10) + ")" : ""}${s.detail ? " " + s.detail : ""}`).join("; ")}
  Contact: ${c.contactInfo.map((ci: any) => ci.value + " [" + ci.source + "]").join("; ") || "None found"}
  Linked: ${c.linkedEntities.join(", ") || "None"}`;
  }).join("\n\n");

  const txSummary = transactions.slice(0, 10).map((t: any) => {
    const parties = t.parties?.map((p: any) => `${p.partyType}: ${p.name}`).join(", ") || "";
    return `${t.docType} ${t.recordedDate?.substring(0, 10) || ""} ${t.amount > 0 ? "$" + t.amount.toLocaleString() : ""} — ${parties}`;
  }).join("\n");

  // Build Apollo data section
  let apolloSection = "";
  if (apolloData?.person) {
    const p = apolloData.person;
    apolloSection += `\nAPOLLO PERSON MATCH:
  Name: ${p.firstName} ${p.lastName} | Title: ${p.title || "?"} | Company: ${p.company || "?"}
  Email: ${p.email || "none"} | Phone: ${p.phone || "none"} | LinkedIn: ${p.linkedinUrl || "none"}
  Industry: ${p.companyIndustry || "?"} | Company Size: ${p.companySize || "?"} employees`;
  }
  if (apolloData?.org) {
    const o = apolloData.org;
    apolloSection += `\nAPOLLO ORGANIZATION:
  Name: ${o.name} | Industry: ${o.industry || "?"} | Employees: ${o.employeeCount || "?"}
  Revenue: ${o.revenue || "?"} | Phone: ${o.phone || "none"} | Website: ${o.website || "none"}
  Founded: ${o.foundedYear || "?"} | Address: ${o.address || "?"}`;
  }
  if (apolloData?.keyPeople?.length) {
    apolloSection += `\nAPOLLO KEY PEOPLE AT ORG:
  ${apolloData.keyPeople.map((kp: any) => `${kp.firstName} ${kp.lastName} — ${kp.title || "?"} (${kp.seniority || "?"})`).join("\n  ")}`;
  }

  // Build DOB filings section
  let dobSection = "";
  if (dobFilings && dobFilings.length > 0) {
    const filingsSorted = [...dobFilings].sort((a, b) => (b.filingDate || "").localeCompare(a.filingDate || "")).slice(0, 10);
    dobSection = `\nDOB JOB APPLICATION FILINGS (${dobFilings.length} total):
  ${filingsSorted.map((f: any) => {
    const owner = f.ownerBusiness || f.ownerName || "?";
    const date = f.filingDate?.substring(0, 10) || "?";
    const type = f.jobType || "?";
    return `${type} ${date} — Owner: ${owner}${f.ownerPhone ? " Ph:" + f.ownerPhone : ""}${f.permittee ? " | Permittee: " + f.permittee : ""}${f.units > 0 ? " | " + f.units + " units" : ""}${f.cost ? " | Cost: $" + f.cost : ""}${f.status ? " | " + f.status : ""}`;
  }).join("\n  ")}`;
    // Check for owner name discrepancies
    const uniqueOwners = [...new Set(dobFilings.map((f: any) => (f.ownerBusiness || f.ownerName || "").toUpperCase()).filter((n: string) => n.length > 2))];
    if (uniqueOwners.length > 1) {
      dobSection += `\n  NOTE: Multiple different owner names across filings: ${uniqueOwners.join(", ")}`;
    }
    const hasNB = dobFilings.some((f: any) => f.jobType === "NB");
    if (hasNB) {
      dobSection += `\n  NOTE: New Building (NB) permit found — this property has/had new construction`;
    }
  }

  const prompt = `You are analyzing NYC property ownership data. Return ONLY valid JSON, no markdown, no backticks, no preamble.

PROPERTY: ${building.address}, ${building.boro} | Block ${building.block}, Lot ${building.lot}
Units: ${building.totalUnits || "?"} | Built: ${building.yearBuilt || "?"} | Assessed: ${building.assessedValue ? "$" + building.assessedValue.toLocaleString() : "?"}

CANDIDATES:
${candidateSummary}

TRANSACTIONS:
${txSummary || "None"}

NYS ENTITIES:
${nysEntities.length > 0 ? nysEntities.map((e: any) => `${e.corpName} — ${e.nameStatus}`).join("; ") : "None"}
${apolloSection}
${dobSection}

PORTFOLIO: ${portfolio?.properties?.length || 0} other properties connected

IMPORTANT:
- If Apollo data confirms a candidate's identity, title, or company — increase your confidence.
- If Apollo phone matches a DOB filing phone, that's very strong evidence.
- DOB filings show who filed as the OWNER on building permits. If the same name appears across multiple filings, ownership is highly likely.
- Flag any insights about permit activity: recent permits suggest active management, NB permits indicate development, multiple permits show ongoing investment, different owner names across filings may indicate ownership changes.

Return this exact JSON structure:
{
  "likelyOwner": "The most likely TRUE INDIVIDUAL owner name, not an LLC",
  "ownerType": "Individual" or "Entity" or "Unknown",
  "confidence": "High" or "Medium" or "Low",
  "ownershipStructure": "Brief chain, e.g. 'John Smith → ABC LLC → Building' or 'Direct ownership'",
  "bestContactAddress": "The best mailing address to reach the owner",
  "bestPhone": "Phone number if found in any data source, or empty string",
  "bestPhoneSource": "Where the phone was found, or empty",
  "bestContactSource": "Where that address came from, e.g. 'ACRIS Deed Filing'",
  "portfolioSize": number of total properties including this one,
  "keyNames": ["topndividual names associated with this property"],
  "keyEntities": ["top 3-5 LLC/Corp names associated with this property"],
  "commonAddress": "Most common business address across registrations",
  "lastTransaction": "Brief description like 'Deed transfer' or 'Mortgage refinance'",
  "lastTransactionDate": "YYYY-MM-DD or empty",
  "lastTransactionAmount": "$X,XXX,XXX or empty",
  "buildingAge": ${new Date().getFullYear()} - ${building.yearBuilt || new Date().getFullYear()},
  "insights": ["2-3 short factual observations, no fluff"]
}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("");

    const cleaned = text.replace(/```json|```/g, "").trim();
    const summary = JSON.parse(cleaned) as OwnerSummary;
    return { summary, error: null };
  } catch (err: any) {
    console.error("Claude API error:", err.message);
    return { summary: null, error: err.message };
  }
}
