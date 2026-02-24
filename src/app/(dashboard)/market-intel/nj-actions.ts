"use server";

// ============================================================
// NJ Property Search — ArcGIS REST API (Parcels & MOD-IV Composite)
// Service: Parcels_Composite_NJ_WM (replaced Parcels_and_MODIV_Composite)
// ============================================================

const ARCGIS_BASE = "https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query";

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
const NJ_MULTIFAMILY_CLASSES = ["2", "4A", "4C"];

// Standard outFields for property queries
const PROPERTY_OUT_FIELDS = "MUN_NAME,COUNTY,PCLBLOCK,PCLLOT,PCLQCODE,PROP_LOC,OWNER_NAME,PROP_CLASS,NET_VALUE,DWELL,YR_CONSTR,SALE_PRICE,DEED_DATE,BLDG_DESC,LAND_VAL,IMPRVT_VAL,ST_ADDRESS,CALC_ACRE";

function parseNJFeature(f: any): NJPropertyResult {
  const a = f.attributes || f;
  return {
    municipality: a.MUN_NAME || "",
    county: a.COUNTY || "",
    block: a.PCLBLOCK || "",
    lot: a.PCLLOT || "",
    qualifier: a.PCLQCODE || "",
    address: a.PROP_LOC || a.ST_ADDRESS || "",
    ownerName: a.OWNER_NAME || "",
    propertyClass: a.PROP_CLASS || "",
    propertyClassDesc: a.BLDG_DESC || getClassDesc(a.PROP_CLASS || ""),
    units: parseInt(a.DWELL || "0") || 0,
    assessedLand: parseFloat(a.LAND_VAL || "0") || 0,
    assessedImprove: parseFloat(a.IMPRVT_VAL || "0") || 0,
    assessedTotal: parseFloat(a.NET_VALUE || "0") || 0,
    yearBuilt: parseInt(a.YR_CONSTR || "0") || 0,
    lastSalePrice: parseFloat(a.SALE_PRICE || "0") || 0,
    lastSaleDate: a.DEED_DATE || "",
    bldgSqft: 0, // Not available in this dataset
    lotSqft: a.CALC_ACRE ? Math.round(parseFloat(a.CALC_ACRE) * 43560) : 0,
    numStories: 0, // Not available in this dataset
    lat: f.geometry?.y || 0,
    lng: f.geometry?.x || 0,
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
      conditions.push(`PROP_CLASS IN (${NJ_MULTIFAMILY_CLASSES.map(c => `'${c}'`).join(",")})`);
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
      outFields: PROPERTY_OUT_FIELDS,
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
    if (json.error) {
      console.error("NJ ArcGIS query error:", json.error);
      return { properties: [] };
    }
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
    const where = `UPPER(MUN_NAME) LIKE '%${municipality.toUpperCase()}%' AND PCLBLOCK = '${block}' AND PCLLOT = '${lot}'`;
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
      outFields: "PROP_LOC,MUN_NAME,COUNTY,PCLBLOCK,PCLLOT",
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
      block: f.attributes.PCLBLOCK || "",
      lot: f.attributes.PCLLOT || "",
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
      outFields: PROPERTY_OUT_FIELDS,
      returnGeometry: "false",
      f: "json",
      resultRecordCount: String(limit),
      orderByFields: "SALE_PRICE DESC",
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
