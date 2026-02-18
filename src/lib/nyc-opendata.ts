// NYC Open Data (Socrata SODA API) — Free, no auth required
// Docs: https://dev.socrata.com/foundry/data.cityofnewyork.us/

const BASE = "https://data.cityofnewyork.us/resource";

// ACRIS Real Property Sales
// Dataset: https://data.cityofnewyork.us/City-Government/ACRIS-Real-Property-Parties/636b-3b5g
// Sales: https://data.cityofnewyork.us/City-Government/Annualized-Rolling-Sales-Update/uzf5-f8n2
const ROLLING_SALES_ID = "uzf5-f8n2";

// DOB Permits
// Dataset: https://data.cityofnewyork.us/Housing-Development/DOB-Permit-Issuance/ipu4-2vj7
const DOB_PERMITS_ID = "ipu4-2vj7";

// DOB Violations
// Dataset: https://data.cityofnewyork.us/Housing-Development/DOB-Violations/3h2n-5cm9
const DOB_VIOLATIONS_ID = "3h2n-5cm9";

// Borough mapping
const BOROUGH_MAP: Record<string, string> = {
  "manhattan": "1", "new york": "1", "mn": "1",
  "bronx": "2", "bx": "2",
  "brooklyn": "3", "kings": "3", "bk": "3",
  "queens": "4", "qn": "4",
  "staten island": "5", "richmond": "5", "si": "5",
};

function getBorough(input: string): string | null {
  const lower = input.toLowerCase().trim();
  return BOROUGH_MAP[lower] || null;
}

// Helper to clean addresses for matching
function normalizeAddress(addr: string): string {
  return addr.toUpperCase().trim()
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bPLACE\b/g, "PL")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bLANE\b/g, "LN")
    .replace(/\bCOURT\b/g, "CT")
    .replace(/\bEAST\b/g, "E")
    .replace(/\bWEST\b/g, "W")
    .replace(/\bNORTH\b/g, "N")
    .replace(/\bSOUTH\b/g, "S")
    .replace(/\s+/g, " ");
}

export interface SalesRecord {
  borough: string;
  neighborhood: string;
  buildingClass: string;
  address: string;
  apartmentNumber: string | null;
  zipCode: string;
  residentialUnits: number;
  commercialUnits: number;
  totalUnits: number;
  landSqft: number;
  grossSqft: number;
  yearBuilt: number;
  salePrice: number;
  saleDate: string;
}

export interface Permit {
  jobNumber: string;
  jobType: string;
  jobDescription: string;
  filingDate: string;
  issuanceDate: string | null;
  expirationDate: string | null;
  status: string;
  applicantName: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  estimatedCost: number | null;
}

export interface Violation {
  violationNumber: string;
  violationType: string;
  violationCategory: string;
  description: string;
  issueDate: string;
  dispositionDate: string | null;
  dispositionComments: string | null;
  status: string;
}

export async function searchSalesHistory(address: string, borough: string, zip?: string): Promise<SalesRecord[]> {
  // Parse house number from address
  const parts = address.trim().split(/\s+/);
  const houseNumber = parts[0];
  const streetParts = parts.slice(1);
  const streetName = normalizeAddress(streetParts.join(" "));

  // Build query - search by borough and address
  const boroughCode = getBorough(borough);
  let query = `$where=upper(address) like '%25${encodeURIComponent(streetName)}%25'`;

  if (boroughCode) {
    query += ` AND borough='${boroughCode}'`;
  }

  if (zip) {
    query += ` AND zip_code='${zip}'`;
  }

  query += `&$order=sale_date DESC&$limit=20`;

  const url = `${BASE}/${ROLLING_SALES_ID}.json?${query}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } }); // Cache 1 hour
    if (!res.ok) throw new Error(`Sales API error: ${res.status}`);
    const data = await res.json();

    return data
      .filter((r: any) => parseInt(r.sale_price || "0") > 1000) // Filter out $0 / nominal sales
      .map((r: any) => ({
        borough: ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(r.borough)] || r.borough,
        neighborhood: r.neighborhood || "",
        buildingClass: r.building_class_at_time_of_sale || r.building_class_category || "",
        address: r.address || "",
        apartmentNumber: r.apartment_number || null,
        zipCode: r.zip_code || "",
        residentialUnits: parseInt(r.residential_units || "0"),
        commercialUnits: parseInt(r.commercial_units || "0"),
        totalUnits: parseInt(r.total_units || "0"),
        landSqft: parseInt(r.land_square_feet || "0"),
        grossSqft: parseInt(r.gross_square_feet || "0"),
        yearBuilt: parseInt(r.year_built || "0"),
        salePrice: parseInt(r.sale_price || "0"),
        saleDate: r.sale_date || "",
      }));
  } catch (err) {
    console.error("Sales search error:", err);
    return [];
  }
}

export async function searchPermits(houseNumber: string, streetName: string, borough: string): Promise<Permit[]> {
  const boroughName = borough.toUpperCase();
  const normalizedStreet = normalizeAddress(streetName);

  let query = `$where=upper(street_name) like '%25${encodeURIComponent(normalizedStreet)}%25'`;

  if (houseNumber) {
    query += ` AND house__='${encodeURIComponent(houseNumber)}'`;
  }

  if (boroughName) {
    query += ` AND upper(borough) like '%25${encodeURIComponent(boroughName)}%25'`;
  }

  query += `&$order=filing_date DESC&$limit=20`;

  const url = `${BASE}/${DOB_PERMITS_ID}.json?${query}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`Permits API error: ${res.status}`);
    const data = await res.json();

    return data.map((r: any) => ({
      jobNumber: r.job__ || "",
      jobType: r.job_type || "",
      jobDescription: r.job_description || r.job_type_desc || "",
      filingDate: r.filing_date || "",
      issuanceDate: r.issuance_date || null,
      expirationDate: r.expiration_date || null,
      status: r.filing_status || r.job_status || "",
      applicantName: r.applicant_s_first_name ? `${r.applicant_s_first_name} ${r.applicant_s_last_name || ""}`.trim() : null,
      ownerName: r.owner_s_first_name ? `${r.owner_s_first_name} ${r.owner_s_last_name || ""}`.trim() : (r.owner_s_business_name || null),
      ownerPhone: r.owner_s_phone__ || null,
      estimatedCost: r.estimated_job_cost ? parseFloat(r.estimated_job_cost) : null,
    }));
  } catch (err) {
    console.error("Permits search error:", err);
    return [];
  }
}

export async function searchViolations(houseNumber: string, streetName: string, borough: string): Promise<Violation[]> {
  const normalizedStreet = normalizeAddress(streetName);

  let query = `$where=upper(violation_street_name) like '%25${encodeURIComponent(normalizedStreet)}%25'`;

  if (houseNumber) {
    query += ` AND violation_house_number='${encodeURIComponent(houseNumber)}'`;
  }

  query += `&$order=issue_date DESC&$limit=20`;

  const url = `${BASE}/${DOB_VIOLATIONS_ID}.json?${query}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`Violations API error: ${res.status}`);
    const data = await res.json();

    return data.map((r: any) => ({
      violationNumber: r.violation_number || r.isn_dob_bis_viol || "",
      violationType: r.violation_type || "",
      violationCategory: r.violation_category || "",
      description: r.description || r.violation_type_description || "",
      issueDate: r.issue_date || "",
      dispositionDate: r.disposition_date || null,
      dispositionComments: r.disposition_comments || null,
      status: r.current_status || r.violation_status || "",
    }));
  } catch (err) {
    console.error("Violations search error:", err);
    return [];
  }
}
