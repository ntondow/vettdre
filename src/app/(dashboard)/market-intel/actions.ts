"use server";

const BASE = "https://data.cityofnewyork.us/resource";
const SALES_ID = "usep-8jbt";
const VIOLATIONS_ID = "3h2n-5cm9";

const BORO_CODE: Record<string, string> = {
  Manhattan: "1", Bronx: "2", Brooklyn: "3", Queens: "4", "Staten Island": "5",
};

export async function lookupProperty(formData: FormData) {
  const rawAddress = (formData.get("address") as string).trim();
  const borough = formData.get("borough") as string;

  if (!rawAddress || !borough) throw new Error("Address and borough are required");

  const parts = rawAddress.split(/\s+/);
  const houseNum = parts[0];
  const streetName = parts.slice(1).join(" ").toUpperCase();
  const boroCode = BORO_CODE[borough] || "1";

  console.log("=== MARKET INTEL SEARCH ===");
  console.log("Street:", streetName, "| House:", houseNum, "| Borough:", borough, boroCode);

  let sales: any[] = [];
  let permits: any[] = [];
  let violations: any[] = [];

  // === SALES ===
  try {
    const where = `borough='${boroCode}' AND upper(address) like '%${streetName}%'`;
    const url = new URL(`${BASE}/${SALES_ID}.json`);
    url.searchParams.set("$where", where);
    url.searchParams.set("$order", "sale_date DESC");
    url.searchParams.set("$limit", "25");
    console.log("Sales URL:", url.toString());
    const res = await fetch(url.toString());
    console.log("Sales status:", res.status);
    if (res.ok) {
      const data = await res.json();
      console.log("Sales raw count:", data.length);
      sales = data
        .filter((r: any) => parseInt((r.sale_price || "0").replace(/,/g, "")) > 1000)
        .map((r: any) => ({
          address: r.address || "",
          apartmentNumber: r.apartment_number || null,
          neighborhood: r.neighborhood || "",
          borough: ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(r.borough)] || "",
          salePrice: parseInt((r.sale_price || "0").replace(/,/g, "")),
          saleDate: r.sale_date || "",
          grossSqft: parseInt((r.gross_square_feet || "0").replace(/,/g, "")),
          landSqft: parseInt((r.land_square_feet || "0").replace(/,/g, "")),
          yearBuilt: parseInt(r.year_built || "0"),
          totalUnits: parseInt(r.total_units || "0"),
          residentialUnits: parseInt(r.residential_units || "0"),
          buildingClass: r.building_class_at_time_of || r.building_class_category || "",
          zipCode: r.zip_code || "",
        }));
    } else {
      console.log("Sales error:", (await res.text()).substring(0, 300));
    }
  } catch (err) { console.error("Sales fetch error:", err); }

  // === PERMITS (DOB Now: Build) ===
  try {
    const where = `upper(house_no)='${houseNum}' AND upper(street_name) like '%${streetName}%'`;
    const url = new URL(`${BASE}/ic3t-wcy2.json`);
    url.searchParams.set("$where", where);
    url.searchParams.set("$order", "filing_date DESC");
    url.searchParams.set("$limit", "20");
    console.log("Permits URL:", url.toString());
    const res = await fetch(url.toString());
    console.log("Permits status:", res.status);
    if (res.ok) {
      const data = await res.json();
      console.log("Permits raw count:", data.length);
      if (data.length > 0) console.log("Permits fields:", Object.keys(data[0]).slice(0, 15).join(", "));
      permits = data.map((r: any) => ({
        jobNumber: r.job_filing_number || r.job_number || "",
        jobType: r.filing_reason || r.job_type || "",
        jobDescription: r.work_type || r.job_description || "",
        filingDate: r.filing_date || "",
        issuanceDate: r.approved_date || null,
        expirationDate: r.expiration_date || null,
        status: r.filing_status || r.current_status || "",
        ownerName: r.owner_name || r.applicant_business_name || null,
        estimatedCost: r.estimated_job_costs ? parseFloat(String(r.estimated_job_costs).replace(/,/g, "")) : null,
      }));
    } else {
      console.log("Permits error:", (await res.text()).substring(0, 300));
    }
  } catch (err) { console.error("Permits fetch error:", err); }

  // === VIOLATIONS (fields: house_number, street) ===
  try {
    const where = `house_number='${houseNum}' AND upper(street) like '%${streetName}%'`;
    const url = new URL(`${BASE}/${VIOLATIONS_ID}.json`);
    url.searchParams.set("$where", where);
    url.searchParams.set("$order", "issue_date DESC");
    url.searchParams.set("$limit", "20");
    console.log("Violations URL:", url.toString());
    const res = await fetch(url.toString());
    console.log("Violations status:", res.status);
    if (res.ok) {
      const data = await res.json();
      console.log("Violations raw count:", data.length);
      violations = data.map((r: any) => ({
        violationNumber: r.violation_number || r.isn_dob_bis_viol || "",
        violationType: r.violation_type || r.violation_type_code || "",
        violationCategory: r.violation_category || "",
        description: r.description || "",
        issueDate: r.issue_date || "",
        dispositionDate: r.disposition_date || null,
        dispositionComments: r.disposition_comments || null,
        status: r.disposition_date ? "Resolved" : "Open",
      }));
    } else {
      console.log("Violations error:", (await res.text()).substring(0, 300));
    }
  } catch (err) { console.error("Violations fetch error:", err); }

  console.log(`=== RESULTS: ${sales.length} sales, ${permits.length} permits, ${violations.length} violations ===`);
  return { sales, permits, violations, query: { address: rawAddress, borough, zip: "" } };
}
