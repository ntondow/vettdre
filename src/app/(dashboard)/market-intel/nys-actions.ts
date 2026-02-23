"use server";

// ============================================================
// NYS Server Actions — data.ny.gov Socrata API
// Assessment Rolls + Municipal Tax Rates
// ============================================================

const NYS_ASSESSMENT_API = "https://data.ny.gov/resource/7vem-aaz7.json";
const NYS_TAX_RATES_API = "https://data.ny.gov/resource/iq85-sdzs.json";

const NYS_TOKEN = process.env.NYS_OPEN_DATA_TOKEN || "";

// Multifamily property classes in NYS assessment rolls
const MULTIFAMILY_CLASSES = ["210","220","230","280","411","414","480","481","482","483"];

export interface NYSPropertyResult {
  swisCode: string;
  printKey: string;
  municipality: string;
  county: string;
  address: string;
  ownerName: string;
  mailingAddress: string;
  propertyClass: string;
  propertyClassDesc: string;
  yearBuilt: number;
  totalUnits: number;
  totalLivingArea: number;
  stories: number;
  fullMarketValue: number;
  totalAssessedValue: number;
  landValue: number;
  salePrice: number;
  saleDate: string;
  rollYear: string;
  lat: number;
  lng: number;
}

export interface NYSSearchFilters {
  county?: string;
  municipality?: string;
  streetAddress?: string;
  ownerName?: string;
  propertyClass?: string;
  minUnits?: number;
  minMarketValue?: number;
}

export interface NYSTaxRate {
  swisCode: string;
  municipality: string;
  county: string;
  taxRate: number;       // per $1000 of assessed value
  rollYear: string;
}

// ============================================================
// Search NYS Properties
// ============================================================
export async function searchNYSProperties(
  filters: NYSSearchFilters
): Promise<{ properties: NYSPropertyResult[]; total: number }> {
  const where: string[] = [];

  // Always filter for latest roll year
  where.push(`roll_year = '${new Date().getFullYear() - 1}'`);

  // Filter multifamily by default unless specific class requested
  if (filters.propertyClass) {
    where.push(`property_class = '${filters.propertyClass}'`);
  } else {
    const classFilter = MULTIFAMILY_CLASSES.map(c => `'${c}'`).join(",");
    where.push(`property_class in(${classFilter})`);
  }

  if (filters.county) {
    where.push(`county_name = '${filters.county.toUpperCase()}'`);
  }

  if (filters.municipality) {
    where.push(`municipality_name = '${filters.municipality.toUpperCase()}'`);
  }

  if (filters.streetAddress) {
    where.push(`upper(street_address) like '%${filters.streetAddress.toUpperCase().replace(/'/g, "''")}%'`);
  }

  if (filters.ownerName) {
    where.push(`upper(owner_name) like '%${filters.ownerName.toUpperCase().replace(/'/g, "''")}%'`);
  }

  if (filters.minMarketValue) {
    where.push(`full_market_value >= ${filters.minMarketValue}`);
  }

  // For units, NYS data has total_units in some records
  if (filters.minUnits) {
    where.push(`residential_units >= ${filters.minUnits}`);
  }

  const whereClause = where.join(" AND ");
  const url = `${NYS_ASSESSMENT_API}?$where=${encodeURIComponent(whereClause)}&$order=full_market_value DESC&$limit=200`;

  const headers: Record<string, string> = {};
  if (NYS_TOKEN) headers["X-App-Token"] = NYS_TOKEN;

  try {
    const response = await fetch(url, {
      headers,
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      console.error("NYS API error:", response.status, await response.text());
      return { properties: [], total: 0 };
    }

    const rawData = await response.json();
    if (!Array.isArray(rawData)) return { properties: [], total: 0 };

    const properties: NYSPropertyResult[] = rawData.map((r: any) => parseNYSRecord(r));

    return { properties, total: properties.length };
  } catch (error) {
    console.error("NYS search error:", error);
    return { properties: [], total: 0 };
  }
}

// ============================================================
// Lookup Single Property by Parcel
// ============================================================
export async function getNYSPropertyByParcel(
  swisCode: string,
  printKey: string
): Promise<NYSPropertyResult | null> {
  const where = `swis_code = '${swisCode}' AND print_key = '${printKey}'`;
  const url = `${NYS_ASSESSMENT_API}?$where=${encodeURIComponent(where)}&$order=roll_year DESC&$limit=1`;

  const headers: Record<string, string> = {};
  if (NYS_TOKEN) headers["X-App-Token"] = NYS_TOKEN;

  try {
    const response = await fetch(url, { headers, next: { revalidate: 3600 } });
    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    return parseNYSRecord(data[0]);
  } catch (error) {
    console.error("NYS parcel lookup error:", error);
    return null;
  }
}

// ============================================================
// Get Municipal Tax Rate
// ============================================================
export async function getNYSTaxRate(swisCode: string): Promise<NYSTaxRate | null> {
  const where = `swis_code = '${swisCode}'`;
  const url = `${NYS_TAX_RATES_API}?$where=${encodeURIComponent(where)}&$order=roll_year DESC&$limit=1`;

  const headers: Record<string, string> = {};
  if (NYS_TOKEN) headers["X-App-Token"] = NYS_TOKEN;

  try {
    const response = await fetch(url, { headers, next: { revalidate: 86400 } });
    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const r = data[0];
    return {
      swisCode: r.swis_code || swisCode,
      municipality: r.municipality_name || "",
      county: r.county_name || "",
      taxRate: parseFloat(r.total_tax_rate || r.tax_rate || "0"),
      rollYear: r.roll_year || "",
    };
  } catch (error) {
    console.error("NYS tax rate error:", error);
    return null;
  }
}

// ============================================================
// Address Search (typeahead) for NYS
// ============================================================
export async function searchNYSAddresses(
  query: string,
  county?: string
): Promise<{ address: string; municipality: string; swisCode: string; printKey: string }[]> {
  if (!query || query.length < 3) return [];

  const where: string[] = [
    `roll_year = '${new Date().getFullYear() - 1}'`,
    `upper(street_address) like '%${query.toUpperCase().replace(/'/g, "''")}%'`,
  ];

  if (county) {
    where.push(`county_name = '${county.toUpperCase()}'`);
  }

  const url = `${NYS_ASSESSMENT_API}?$where=${encodeURIComponent(where.join(" AND "))}&$select=street_address,municipality_name,swis_code,print_key&$limit=15`;

  const headers: Record<string, string> = {};
  if (NYS_TOKEN) headers["X-App-Token"] = NYS_TOKEN;

  try {
    const response = await fetch(url, { headers, next: { revalidate: 3600 } });
    if (!response.ok) return [];

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.map((r: any) => ({
      address: r.street_address || "",
      municipality: r.municipality_name || "",
      swisCode: r.swis_code || "",
      printKey: r.print_key || "",
    }));
  } catch {
    return [];
  }
}

// ============================================================
// NYS Comps Search
// ============================================================
export async function searchNYSComps(params: {
  county: string;
  minPrice?: number;
  yearsBack?: number;
  limit?: number;
}): Promise<{ comps: NYSPropertyResult[]; avgPricePerUnit: number; medianPricePerUnit: number }> {
  const { county, minPrice = 500000, yearsBack = 5, limit = 50 } = params;

  const cutoffYear = new Date().getFullYear() - yearsBack;
  const classFilter = MULTIFAMILY_CLASSES.map(c => `'${c}'`).join(",");

  const where = [
    `county_name = '${county.toUpperCase()}'`,
    `property_class in(${classFilter})`,
    `sale_price >= ${minPrice}`,
    `sale_date_ccyymmdd >= '${cutoffYear}0101'`,
    `roll_year = '${new Date().getFullYear() - 1}'`,
  ].join(" AND ");

  const url = `${NYS_ASSESSMENT_API}?$where=${encodeURIComponent(where)}&$order=sale_date_ccyymmdd DESC&$limit=${limit}`;

  const headers: Record<string, string> = {};
  if (NYS_TOKEN) headers["X-App-Token"] = NYS_TOKEN;

  try {
    const response = await fetch(url, { headers, next: { revalidate: 3600 } });
    if (!response.ok) return { comps: [], avgPricePerUnit: 0, medianPricePerUnit: 0 };

    const data = await response.json();
    if (!Array.isArray(data)) return { comps: [], avgPricePerUnit: 0, medianPricePerUnit: 0 };

    const comps = data.map((r: any) => parseNYSRecord(r)).filter(c => c.salePrice >= minPrice);

    // Calculate stats
    const ppuValues = comps
      .map(c => c.totalUnits > 0 ? Math.round(c.salePrice / c.totalUnits) : 0)
      .filter(v => v > 0)
      .sort((a, b) => a - b);

    const avgPricePerUnit = ppuValues.length > 0 ? Math.round(ppuValues.reduce((s, v) => s + v, 0) / ppuValues.length) : 0;
    const mid = Math.floor(ppuValues.length / 2);
    const medianPricePerUnit = ppuValues.length === 0 ? 0 :
      ppuValues.length % 2 !== 0 ? ppuValues[mid] : Math.round((ppuValues[mid - 1] + ppuValues[mid]) / 2);

    return { comps, avgPricePerUnit, medianPricePerUnit };
  } catch (error) {
    console.error("NYS comps error:", error);
    return { comps: [], avgPricePerUnit: 0, medianPricePerUnit: 0 };
  }
}

// ============================================================
// NYS Deal Pre-fill Data
// ============================================================
export interface NYSDealPrefillData {
  address: string;
  municipality: string;
  county: string;
  swisCode: string;
  printKey: string;
  ownerName: string;
  unitsRes: number;
  unitsTotal: number;
  yearBuilt: number;
  numFloors: number;
  bldgArea: number;
  lotArea: number;
  fullMarketValue: number;
  totalAssessedValue: number;
  landValue: number;
  lastSalePrice: number;
  lastSaleDate: string;
  annualTaxes: number;
  propertyClass: string;
  suggestedUnitMix: { type: string; count: number; monthlyRent: number }[];
}

export async function fetchNYSDealPrefill(
  swisCode: string,
  printKey: string,
  county: string
): Promise<NYSDealPrefillData | null> {
  const [property, taxRate] = await Promise.all([
    getNYSPropertyByParcel(swisCode, printKey),
    getNYSTaxRate(swisCode),
  ]);

  if (!property) return null;

  // Calculate annual taxes from assessed value and tax rate
  let annualTaxes = 0;
  if (taxRate && taxRate.taxRate > 0 && property.totalAssessedValue > 0) {
    annualTaxes = Math.round((property.totalAssessedValue / 1000) * taxRate.taxRate);
  } else if (property.fullMarketValue > 0) {
    // Fallback: estimate ~2.5% effective rate for suburban NY
    annualTaxes = Math.round(property.fullMarketValue * 0.025);
  }

  // Estimate unit mix
  const units = property.totalUnits || 1;
  const mix = estimateUnitMixNYS(units);

  return {
    address: property.address,
    municipality: property.municipality,
    county: property.county,
    swisCode,
    printKey,
    ownerName: property.ownerName,
    unitsRes: units,
    unitsTotal: units,
    yearBuilt: property.yearBuilt,
    numFloors: property.stories,
    bldgArea: property.totalLivingArea,
    lotArea: 0,
    fullMarketValue: property.fullMarketValue,
    totalAssessedValue: property.totalAssessedValue,
    landValue: property.landValue,
    lastSalePrice: property.salePrice,
    lastSaleDate: property.saleDate,
    annualTaxes,
    propertyClass: property.propertyClass,
    suggestedUnitMix: mix,
  };
}

// ============================================================
// Helpers
// ============================================================
function parseNYSRecord(r: any): NYSPropertyResult {
  // Parse sale date from CCYYMMDD format
  let saleDate = "";
  if (r.sale_date_ccyymmdd) {
    const d = r.sale_date_ccyymmdd;
    if (d.length === 8) {
      saleDate = `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
    }
  } else if (r.sale_date) {
    saleDate = r.sale_date;
  }

  return {
    swisCode: r.swis_code || "",
    printKey: r.print_key || "",
    municipality: r.municipality_name || "",
    county: r.county_name || "",
    address: r.street_address || r.print_key || "",
    ownerName: r.owner_name || "",
    mailingAddress: [r.mail_addr, r.mail_city, r.mail_state, r.mail_zip].filter(Boolean).join(", "),
    propertyClass: r.property_class || "",
    propertyClassDesc: r.property_class_description || getPropertyClassDesc(r.property_class || ""),
    yearBuilt: parseInt(r.year_built || "0"),
    totalUnits: parseInt(r.residential_units || r.total_units || "0"),
    totalLivingArea: parseInt(r.total_living_area || r.square_footage || "0"),
    stories: parseInt(r.stories || r.number_of_stories || "0"),
    fullMarketValue: parseInt(r.full_market_value || "0"),
    totalAssessedValue: parseInt(r.total_assessed_value || "0"),
    landValue: parseInt(r.land_assessed_value || "0"),
    salePrice: parseInt(r.sale_price || "0"),
    saleDate,
    rollYear: r.roll_year || "",
    lat: parseFloat(r.latitude || "0"),
    lng: parseFloat(r.longitude || "0"),
  };
}

function getPropertyClassDesc(code: string): string {
  const descs: Record<string, string> = {
    "210": "1-Family Residence",
    "220": "2-Family Residence",
    "230": "3-Family Residence",
    "280": "Multi-Purpose Residential",
    "411": "Apartments (4-6 units)",
    "414": "Living Accommodations",
    "480": "Multiple Residences",
    "481": "Multiple Residences (3+ stories)",
    "482": "Multiple Residences (Garden)",
    "483": "Multiple Residences (Converted)",
  };
  return descs[code] || `Class ${code}`;
}

function estimateUnitMixNYS(totalUnits: number): { type: string; count: number; monthlyRent: number }[] {
  if (totalUnits <= 3) {
    return [
      { type: "2BR", count: totalUnits, monthlyRent: 1500 },
    ];
  }
  if (totalUnits <= 10) {
    const oneBr = Math.round(totalUnits * 0.4);
    const twoBr = Math.round(totalUnits * 0.4);
    const studio = totalUnits - oneBr - twoBr;
    return [
      ...(studio > 0 ? [{ type: "Studio", count: studio, monthlyRent: 1000 }] : []),
      { type: "1BR", count: oneBr, monthlyRent: 1200 },
      { type: "2BR", count: twoBr, monthlyRent: 1500 },
    ];
  }
  const studio = Math.round(totalUnits * 0.15);
  const oneBr = Math.round(totalUnits * 0.35);
  const twoBr = Math.round(totalUnits * 0.35);
  const threeBr = totalUnits - studio - oneBr - twoBr;
  return [
    { type: "Studio", count: studio, monthlyRent: 1000 },
    { type: "1BR", count: oneBr, monthlyRent: 1200 },
    { type: "2BR", count: twoBr, monthlyRent: 1500 },
    ...(threeBr > 0 ? [{ type: "3BR", count: threeBr, monthlyRent: 1800 }] : []),
  ];
}
