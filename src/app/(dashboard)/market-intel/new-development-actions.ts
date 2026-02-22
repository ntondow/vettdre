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
}

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
    conditions.push("job_type IN('NB','A1')");
  }

  // Borough filter - the DOB dataset uses full borough names
  if (filters.borough) {
    conditions.push(`borough='${filters.borough}'`);
  }

  // Min units
  if (filters.minUnits) {
    conditions.push(`proposed_dwelling_units >= ${filters.minUnits}`);
  }

  // Filing status
  if (filters.status) {
    conditions.push(`filing_status='${filters.status}'`);
  }

  // Min estimated cost
  if (filters.minCost) {
    conditions.push(`estimated_job_costs >= ${filters.minCost}`);
  }

  // Filed after date
  if (filters.filedAfter) {
    conditions.push(`filing_date >= '${filters.filedAfter}'`);
  }

  // Zip code filter (for neighborhood filtering)
  if (filters.zipCodes && filters.zipCodes.length > 0) {
    const zipList = filters.zipCodes.map(z => `'${z}'`).join(",");
    conditions.push(`zip_code IN(${zipList})`);
  }

  const whereClause = conditions.join(" AND ");
  const url = `https://data.cityofnewyork.us/resource/ic3t-wcy2.json?$where=${encodeURIComponent(whereClause)}&$order=proposed_dwelling_units DESC&$limit=200`;

  try {
    const res = await fetch(url, {
      headers: { "X-App-Token": process.env.NYC_OPEN_DATA_TOKEN || "" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((d: any) => ({
      jobFilingNumber: d.job_filing_number || d.job__ || "",
      address: [d.house__, d.street_name].filter(Boolean).join(" ").trim(),
      borough: d.borough || "",
      block: d.block || "",
      lot: d.lot || "",
      zip: d.zip_code || "",
      jobType: d.job_type || "",
      proposedUnits: parseInt(d.proposed_dwelling_units || "0"),
      proposedStories: parseInt(d.proposed_no_of_stories || "0"),
      proposedOccupancy: d.proposed_occupancy || "",
      filingStatus: d.filing_status || "",
      filingDate: d.filing_date || "",
      estimatedCost: parseFloat(d.estimated_job_costs || "0"),
      ownerName: [d.owner_s_first_name, d.owner_s_last_name].filter(Boolean).join(" ").trim(),
      ownerBusiness: d.owner_s_business_name || "",
      ownerPhone: d.owner_sphone__ || "",
      permitteeName: [d.permittee_s_first_name, d.permittee_s_last_name].filter(Boolean).join(" ").trim(),
      permitteeBusiness: d.permittee_s_business_name || "",
      permitteePhone: d.permittee_s_phone__ || "",
      communityBoard: d.community_board || "",
      zoningDistrict: d.zoning_dist1 || "",
    }));
  } catch (err) {
    console.error("New development search error:", err);
    return [];
  }
}
