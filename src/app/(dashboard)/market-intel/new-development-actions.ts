"use server";

export interface NewDevelopment {
  jobFilingNumber: string;
  address: string;
  borough: string;
  block: string;
  lot: string;
  zip: string;
  jobType: string;
  proposedUnits: number;
  proposedStories: number;
  proposedOccupancy: string;
  filingStatus: string;
  filingStatusDescription: string;
  filingDate: string;
  estimatedCost: number;
  ownerName: string;
  ownerBusiness: string;
  ownerPhone: string;
  permitteeName: string;
  permitteeBusiness: string;
  permitteePhone: string;
  communityBoard: string;
  zoningDistrict: string;
  lat: number;
  lng: number;
}

// Borough name mapping — the DOB dataset uses UPPERCASE borough names
const BOROUGH_MAP: Record<string, string> = {
  Manhattan: "MANHATTAN",
  Brooklyn: "BROOKLYN",
  Queens: "QUEENS",
  Bronx: "BRONX",
  "Staten Island": "STATEN ISLAND",
  MANHATTAN: "MANHATTAN",
  BROOKLYN: "BROOKLYN",
  QUEENS: "QUEENS",
  BRONX: "BRONX",
  "STATEN ISLAND": "STATEN ISLAND",
};

export async function searchNewDevelopments(filters: {
  borough?: string;
  minUnits?: number;
  jobType?: "NB" | "A1" | "both";
  status?: string;
  minCost?: number;
  filedAfter?: string;
  zipCodes?: string[];
}): Promise<NewDevelopment[]> {
  const conditions: string[] = [];

  // Job type filter
  if (filters.jobType === "NB") {
    conditions.push("job_type='NB'");
  } else if (filters.jobType === "A1") {
    conditions.push("job_type='A1'");
  } else {
    conditions.push("(job_type='NB' OR job_type='A1')");
  }

  // Borough filter — DOB uses UPPERCASE borough names
  if (filters.borough) {
    const upperBoro = BOROUGH_MAP[filters.borough] || filters.borough.toUpperCase();
    conditions.push(`borough='${upperBoro}'`);
  }

  // proposed_dwelling_units is a TEXT field in this dataset, so we can't do
  // numeric >= comparison server-side. We filter out non-numeric values and
  // do the minUnits filter client-side after parsing.
  // But we can exclude obvious non-dwelling records:
  conditions.push("proposed_dwelling_units IS NOT NULL");
  conditions.push("proposed_dwelling_units != 'NONE'");
  conditions.push("proposed_dwelling_units != '0'");
  conditions.push("proposed_dwelling_units != ''");

  // Job status filter (field is job_status, not filing_status)
  if (filters.status) {
    conditions.push(`job_status='${filters.status}'`);
  }

  // Filed after date (field is pre__filing_date, not filing_date)
  if (filters.filedAfter) {
    conditions.push(`pre__filing_date >= '${filters.filedAfter}'`);
  }

  // Zip code filter (field is zip, not zip_code)
  if (filters.zipCodes && filters.zipCodes.length > 0) {
    const zipList = filters.zipCodes.map(z => `'${z}'`).join(",");
    conditions.push(`zip in(${zipList})`);
  }

  const whereClause = conditions.join(" AND ");
  // Fetch more than needed so we can filter client-side by units
  const url = `https://data.cityofnewyork.us/resource/ic3t-wcy2.json?$where=${encodeURIComponent(whereClause)}&$order=pre__filing_date DESC&$limit=500`;

  try {
    const res = await fetch(url, {
      headers: { "X-App-Token": process.env.NYC_OPEN_DATA_TOKEN || "" },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error("DOB API error:", res.status, await res.text());
      return [];
    }

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const minUnits = filters.minUnits || 1;
    const minCost = filters.minCost || 0;

    // Parse and filter results client-side
    const results: NewDevelopment[] = [];
    const seen = new Set<string>(); // deduplicate by job number

    for (const d of data) {
      const units = parseInt(d.proposed_dwelling_units || "0");
      if (isNaN(units) || units < minUnits) continue;

      // Parse initial_cost (comes as "$1,234,567.00" or "$0.00")
      const costStr = (d.initial_cost || "0").replace(/[$,]/g, "");
      const cost = parseFloat(costStr) || 0;
      if (minCost > 0 && cost < minCost) continue;

      // Deduplicate — same job can appear multiple times with different doc numbers
      const jobKey = d.job__ || "";
      if (seen.has(jobKey)) continue;
      seen.add(jobKey);

      results.push({
        jobFilingNumber: jobKey,
        address: [d.house__, d.street_name].filter(Boolean).join(" ").trim(),
        borough: d.borough || "",
        block: d.block || "",
        lot: d.lot || "",
        zip: d.zip || "",
        jobType: d.job_type || "",
        proposedUnits: units,
        proposedStories: parseInt(d.proposed_no_of_stories || "0"),
        proposedOccupancy: d.proposed_occupancy || "",
        filingStatus: d.job_status || "",
        filingStatusDescription: d.job_status_descrp || "",
        filingDate: d.pre__filing_date || "",
        estimatedCost: cost,
        ownerName: [d.owner_s_first_name, d.owner_s_last_name].filter(Boolean).join(" ").trim(),
        ownerBusiness: d.owner_s_business_name || "",
        ownerPhone: d.owner_sphone__ || "",
        permitteeName: [d.applicant_s_first_name, d.applicant_s_last_name].filter(Boolean).join(" ").trim(),
        permitteeBusiness: "",
        permitteePhone: "",
        communityBoard: d.community___board || "",
        zoningDistrict: d.zoning_dist1 || "",
        lat: parseFloat(d.gis_latitude || "0"),
        lng: parseFloat(d.gis_longitude || "0"),
      });

      if (results.length >= 200) break;
    }

    // Sort by units descending
    results.sort((a, b) => b.proposedUnits - a.proposedUnits);

    return results;
  } catch (err) {
    console.error("New development search error:", err);
    return [];
  }
}
