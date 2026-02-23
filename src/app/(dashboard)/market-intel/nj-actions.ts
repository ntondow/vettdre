"use server";

// ============================================================
// NJ Property Search — ArcGIS REST API (Parcels & MOD-IV Composite)
// ============================================================

const ARCGIS_BASE = "https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_and_MODIV_Composite/FeatureServer/0/query";

export interface NJPropertyResult {
  municipality: string;
  county: string;
  block: string;
  lot: string;
  qualifier: string;
  address: string;
  ownerName: string;
  propertyClass: string;
  propertyClassDesc: string;
  units: number;
  assessedLand: number;
  assessedImprove: number;
  assessedTotal: number;
  yearBuilt: number;
  lastSalePrice: number;
  lastSaleDate: string;
  bldgSqft: number;
  lotSqft: number;
  numStories: number;
  lat: number;
  lng: number;
}

export interface NJDealPrefill {
  address: string;
  municipality: string;
  county: string;
  block: string;
  lot: string;
  ownerName: string;
  units: number;
  yearBuilt: number;
  assessedTotal: number;
  lastSalePrice: number;
  lastSaleDate: string;
  bldgSqft: number;
  numStories: number;
}

// Multifamily property classes in NJ MOD-IV
const MULTIFAMILY_CLASSES = ["2", "4A", "4C"];

function parseNJFeature(f: any): NJPropertyResult {
  const a = f.attributes || f;
  return {
    municipality: a.MUN_NAME || a.MUNICIPALITY || "",
    county: a.COUNTY || "",
    block: a.BLOCK || a.PAMS_BLOCK || "",
    lot: a.LOT || a.PAMS_LOT || "",
    qualifier: a.QUAL || a.QUALIFIER || "",
    address: [a.ADDR_HOUSE_NO || a.HOUSE_NUMBER, a.ADDR_STREET || a.STREET_NAME].filter(Boolean).join(" ").trim() || a.PROP_LOC || "",
    ownerName: a.OWNER_NAME || a.OWNER || "",
    propertyClass: a.PROP_CLASS || a.PROPERTY_CLASS || "",
    propertyClassDesc: a.PROP_CLASS_DESC || getClassDesc(a.PROP_CLASS || a.PROPERTY_CLASS || ""),
    units: parseInt(a.DWELL_UNITS || a.NO_OF_DWELLINGS || "0") || 0,
    assessedLand: parseFloat(a.LAND_VALUE || a.ASSESSED_LAND || "0") || 0,
    assessedImprove: parseFloat(a.IMPR_VALUE || a.ASSESSED_IMPROVEMENT || "0") || 0,
    assessedTotal: parseFloat(a.NET_VALUE || a.TOTAL_VALUE || a.ASSESSED_TOTAL || "0") || 0,
    yearBuilt: parseInt(a.YR_BUILT || a.YEAR_BUILT || "0") || 0,
    lastSalePrice: parseFloat(a.SALE_PRICE || a.LAST_SALE_PRICE || "0") || 0,
    lastSaleDate: a.SALE_DATE || a.LAST_SALE_DATE || a.DEED_DATE || "",
    bldgSqft: parseFloat(a.BLDG_SF || a.BUILDING_SQFT || "0") || 0,
    lotSqft: parseFloat(a.LOT_SF || a.LOT_SQFT || a.LAND_SF || "0") || 0,
    numStories: parseFloat(a.NO_OF_STORIES || a.STORIES || "0") || 0,
    lat: f.geometry?.y || parseFloat(a.LAT || a.LATITUDE || "0") || 0,
    lng: f.geometry?.x || parseFloat(a.LON || a.LONGITUDE || "0") || 0,
  };
}

function getClassDesc(cls: string): string {
  const map: Record<string, string> = {
    "1": "Vacant Land", "2": "Residential (4+ units)", "4A": "Commercial",
    "4B": "Industrial", "4C": "Apartment", "15A": "Public School",
    "15B": "Private School", "15C": "Public Property",
  };
  return map[cls] || cls;
}

export async function searchNJProperties(filters: {
  county?: string;
  municipality?: string;
  streetAddress?: string;
  ownerName?: string;
  minUnits?: number;
  propertyClass?: string;
  limit?: number;
}): Promise<{ properties: NJPropertyResult[] }> {
  try {
    const conditions: string[] = [];

    // Default to multifamily
    if (filters.propertyClass) {
      conditions.push(`PROP_CLASS = '${filters.propertyClass}'`);
    } else {
      conditions.push(`PROP_CLASS IN ('2','4A','4C')`);
    }

    if (filters.county) {
      conditions.push(`UPPER(COUNTY) = '${filters.county.toUpperCase()}'`);
    }
    if (filters.municipality) {
      conditions.push(`UPPER(MUN_NAME) LIKE '%${filters.municipality.toUpperCase()}%'`);
    }
    if (filters.streetAddress) {
      conditions.push(`UPPER(PROP_LOC) LIKE '%${filters.streetAddress.toUpperCase()}%'`);
    }
    if (filters.ownerName) {
      conditions.push(`UPPER(OWNER_NAME) LIKE '%${filters.ownerName.toUpperCase()}%'`);
    }

    const where = conditions.join(" AND ");
    const limit = filters.limit || 200;

    const params = new URLSearchParams({
      where,
      outFields: "MUN_NAME,COUNTY,BLOCK,LOT,QUAL,PROP_LOC,OWNER_NAME,PROP_CLASS,DWELL_UNITS,LAND_VALUE,IMPR_VALUE,NET_VALUE,YR_BUILT,SALE_PRICE,SALE_DATE,BLDG_SF,LOT_SF,NO_OF_STORIES,ADDR_HOUSE_NO,ADDR_STREET",
      returnGeometry: "true",
      f: "json",
      resultRecordCount: String(limit),
      orderByFields: "NET_VALUE DESC",
    });

    const res = await fetch(`${ARCGIS_BASE}?${params.toString()}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      console.error("NJ ArcGIS error:", res.status);
      return { properties: [] };
    }

    const json = await res.json();
    if (!json.features || !Array.isArray(json.features)) return { properties: [] };

    let properties = json.features.map(parseNJFeature);

    // Client-side unit filter
    if (filters.minUnits && filters.minUnits > 0) {
      properties = properties.filter((p: NJPropertyResult) => p.units >= filters.minUnits!);
    }

    return { properties };
  } catch (err) {
    console.error("NJ search error:", err);
    return { properties: [] };
  }
}

export async function getNJPropertyByParcel(municipality: string, block: string, lot: string): Promise<NJPropertyResult | null> {
  try {
    const where = `UPPER(MUN_NAME) LIKE '%${municipality.toUpperCase()}%' AND BLOCK = '${block}' AND LOT = '${lot}'`;
    const params = new URLSearchParams({
      where,
      outFields: "*",
      returnGeometry: "true",
      f: "json",
      resultRecordCount: "1",
    });

    const res = await fetch(`${ARCGIS_BASE}?${params.toString()}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.features || json.features.length === 0) return null;
    return parseNJFeature(json.features[0]);
  } catch (err) {
    console.error("NJ parcel lookup error:", err);
    return null;
  }
}

export async function searchNJAddresses(query: string, county?: string): Promise<{ address: string; municipality: string; county: string; block: string; lot: string }[]> {
  try {
    if (!query || query.length < 3) return [];
    const conditions: string[] = [
      `UPPER(PROP_LOC) LIKE '%${query.toUpperCase()}%'`,
    ];
    if (county) {
      conditions.push(`UPPER(COUNTY) = '${county.toUpperCase()}'`);
    }
    const where = conditions.join(" AND ");

    const params = new URLSearchParams({
      where,
      outFields: "PROP_LOC,MUN_NAME,COUNTY,BLOCK,LOT",
      returnGeometry: "false",
      f: "json",
      resultRecordCount: "10",
    });

    const res = await fetch(`${ARCGIS_BASE}?${params.toString()}`);
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.features) return [];

    return json.features.map((f: any) => ({
      address: f.attributes.PROP_LOC || "",
      municipality: f.attributes.MUN_NAME || "",
      county: f.attributes.COUNTY || "",
      block: f.attributes.BLOCK || "",
      lot: f.attributes.LOT || "",
    }));
  } catch {
    return [];
  }
}

export async function searchNJComps(params: {
  county: string;
  municipality?: string;
  minUnits?: number;
  maxUnits?: number;
  yearsBack?: number;
  limit?: number;
}): Promise<NJPropertyResult[]> {
  try {
    const conditions: string[] = [
      `PROP_CLASS IN ('2','4A','4C')`,
      `UPPER(COUNTY) = '${params.county.toUpperCase()}'`,
      "SALE_PRICE > 100000",
    ];

    if (params.municipality) {
      conditions.push(`UPPER(MUN_NAME) LIKE '%${params.municipality.toUpperCase()}%'`);
    }

    const where = conditions.join(" AND ");
    const limit = params.limit || 50;

    const urlParams = new URLSearchParams({
      where,
      outFields: "MUN_NAME,COUNTY,BLOCK,LOT,PROP_LOC,OWNER_NAME,PROP_CLASS,DWELL_UNITS,NET_VALUE,YR_BUILT,SALE_PRICE,SALE_DATE,BLDG_SF,NO_OF_STORIES,ADDR_HOUSE_NO,ADDR_STREET",
      returnGeometry: "false",
      f: "json",
      resultRecordCount: String(limit),
      orderByFields: "SALE_DATE DESC",
    });

    const res = await fetch(`${ARCGIS_BASE}?${urlParams.toString()}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.features) return [];

    let results = json.features.map(parseNJFeature);

    if (params.minUnits) results = results.filter((r: NJPropertyResult) => r.units >= params.minUnits!);
    if (params.maxUnits) results = results.filter((r: NJPropertyResult) => r.units <= params.maxUnits!);

    return results;
  } catch (err) {
    console.error("NJ comps error:", err);
    return [];
  }
}

export async function fetchNJDealPrefill(municipality: string, block: string, lot: string): Promise<NJDealPrefill | null> {
  const prop = await getNJPropertyByParcel(municipality, block, lot);
  if (!prop) return null;
  return {
    address: prop.address,
    municipality: prop.municipality,
    county: prop.county,
    block: prop.block,
    lot: prop.lot,
    ownerName: prop.ownerName,
    units: prop.units,
    yearBuilt: prop.yearBuilt,
    assessedTotal: prop.assessedTotal,
    lastSalePrice: prop.lastSalePrice,
    lastSaleDate: prop.lastSaleDate,
    bldgSqft: prop.bldgSqft,
    numStories: prop.numStories,
  };
}
