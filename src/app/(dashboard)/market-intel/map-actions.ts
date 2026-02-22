"use server";

const NYC = "https://data.cityofnewyork.us/resource";
const PLUTO = "64uk-42ks";

const PUBLIC_OWNERS = [
  "NYC HOUSING AUTHORITY", "NYCHA", "NEW YORK CITY HOUSING AUTH",
  "DEPT OF HOUSING PRESERV",
  "NYC DEPT OF ED", "NYC DEPARTMENT OF EDUCATION", "BOARD OF EDUCATION",
  "NYC TRANSIT AUTHORITY", "METROPOLITAN TRANS AUTH",
  "NYC HEALTH & HOSPITALS", "HEALTH & HOSP CORP",
  "DEPARTMENT OF PARKS", "PARKS & RECREATION",
  "NYC SCHOOL CONSTRUCTION", "SCHOOL CONSTRUCTION AUTH",
  "FIRE DEPT CITY OF NY", "POLICE DEPT CITY OF NY",
  "DEPT OF CITYWIDE ADMIN",
  "HUDSON RIVER PARK TRUST", "BATTERY PARK CITY AUTH",
  "PORT AUTHORITY OF NY", "DORMITORY AUTHORITY",
  "NYC ECONOMIC DEVELOPMENT",
  "HOUSING DEVELOPMENT CORP",
  "NYC INDUSTRIAL DEV", "DEPT OF SANITATION",
  "DEPT OF TRANSPORTATION",
  "DEPT OF ENVIRONMENTAL PROTECTION",
  "TRIBOROUGH BRIDGE", "ROOSEVELT ISLAND OPERATING",
  "LOWER MANHATTAN DEV", "GOVERNORS ISLAND",
  "NYC LAND DEVELOPMENT", "URBAN DEVELOPMENT CORP",
  "DEPT OF BUILDINGS",
];



function checkPublicOwner(name: string): boolean {
  if (!name) return false;
  const upper = name.toUpperCase().trim();
  if (upper.length < 3) return false;
  return PUBLIC_OWNERS.some(p => upper.includes(p)) ||
    (upper.startsWith("CITY OF ") && upper.includes("NEW YORK")) ||
    (upper.startsWith("STATE OF ") && upper.includes("NEW YORK")) ||
    upper.startsWith("UNITED STATES") ||
    upper.includes("HOUSING AUTHORITY") ||
    upper.includes("CITY UNIVERSITY OF") ||
    upper.includes("STATE UNIVERSITY OF");
}

export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = encodeURIComponent(query.trim() + ", New York City");
    const res = await fetch(
      "https://nominatim.openstreetmap.org/search?format=json&q=" + q + "&limit=1&countrycodes=us",
      { headers: { "User-Agent": "VettdRE/1.0" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch (err) {
    console.error("Server geocode error:", err);
    return null;
  }
}

export async function fetchPropertiesInBounds(
  swLat: number, swLng: number, neLat: number, neLng: number,
  filters?: {
    minUnits?: number;
    maxUnits?: number;
    minValue?: number;
    maxValue?: number;
    minYearBuilt?: number;
    maxYearBuilt?: number;
    minFloors?: number;
    bldgClass?: string;
    zoneDist?: string;
    excludePublic?: boolean;
  }
) {
  console.log("=== MAP FETCH ===", swLat, swLng, "to", neLat, neLng);

  const conditions: string[] = [
    `latitude > '${swLat}'`,
    `latitude < '${neLat}'`,
    `longitude > '${swLng}'`,
    `longitude < '${neLng}'`,
    `unitsres > '0'`,
  ];

  if (filters?.minUnits) conditions.push(`unitsres >= '${filters.minUnits}'`);
  if (filters?.maxUnits) conditions.push(`unitsres <= '${filters.maxUnits}'`);
  if (filters?.minValue) conditions.push(`assesstot >= '${filters.minValue}'`);
  if (filters?.maxValue) conditions.push(`assesstot <= '${filters.maxValue}'`);
  if (filters?.minYearBuilt) conditions.push(`yearbuilt >= '${filters.minYearBuilt}'`);
  if (filters?.maxYearBuilt) conditions.push(`yearbuilt <= '${filters.maxYearBuilt}'`);
  if (filters?.minFloors) conditions.push(`numfloors >= '${filters.minFloors}'`);
  if (filters?.bldgClass) conditions.push(`bldgclass like '${filters.bldgClass}%'`);
  if (filters?.zoneDist) conditions.push(`zonedist1 like '${filters.zoneDist}%'`);

  try {
    const url = new URL(NYC + "/" + PLUTO + ".json");
    url.searchParams.set("$where", conditions.join(" AND "));
    url.searchParams.set("$select", "address,ownername,unitsres,unitstotal,yearbuilt,numfloors,assesstot,bldgclass,zonedist1,borocode,block,lot,latitude,longitude,bldgarea,lotarea,zipcode");
    url.searchParams.set("$limit", "400");
    url.searchParams.set("$order", "unitsres DESC");

    const res = await fetch(url.toString());
    if (!res.ok) return { properties: [], total: 0 };

    const data = await res.json();

    const properties = data.map((p: any) => ({
      address: p.address || "",
      ownerName: p.ownername || "",
      unitsRes: parseInt(p.unitsres || "0"),
      unitsTot: parseInt(p.unitstotal || "0"),
      yearBuilt: parseInt(p.yearbuilt || "0"),
      numFloors: parseInt(p.numfloors || "0"),
      assessTotal: parseInt(p.assesstot || "0"),
      bldgClass: p.bldgclass || "",
      zoneDist: p.zonedist1 || "",
      boroCode: p.borocode || "",
      block: p.block || "",
      lot: p.lot || "",
      lat: parseFloat(p.latitude || "0"),
      lng: parseFloat(p.longitude || "0"),
      bldgArea: parseInt(p.bldgarea || "0"),
      lotArea: parseInt(p.lotarea || "0"),
      borough: ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(p.borocode)] || "",
      zip: p.zipcode || "",
    })).filter((p: any) => p.lat !== 0 && p.lng !== 0)
      .filter((p: any) => filters?.excludePublic ? !checkPublicOwner(p.ownerName) : true);

    const total = properties.length;

    return { properties, total };
  } catch (err) {
    console.error("Map fetch error:", err);
    return { properties: [], total: 0 };
  }
}

// ============================================================
// New Developments — DOB Job Applications (NB = New Building, A1 = Major Alteration)
// ============================================================
const DOB_JOBS = "ic3t-wcy2";

export interface MapNewDevelopment {
  address: string;
  borough: string;
  units: number;
  stories: number;
  jobType: string;
  jobStatus: string;
  estimatedCost: string;
  ownerName: string;
  filingDate: string;
  lat: number;
  lng: number;
  block: string;
  lot: string;
  boroCode: string;
}

export async function fetchNewDevelopmentsInBounds(
  swLat: number, swLng: number, neLat: number, neLng: number,
): Promise<MapNewDevelopment[]> {
  try {
    const url = new URL(NYC + "/" + DOB_JOBS + ".json");
    url.searchParams.set("$where", [
      `latitude > '${swLat}'`,
      `latitude < '${neLat}'`,
      `longitude > '${swLng}'`,
      `longitude < '${neLng}'`,
      `job_type in('NB','A1')`,
      `existing_dwelling_units IS NOT NULL`,
    ].join(" AND "));
    url.searchParams.set("$select", "house__,street_name,borough,proposed_dwelling_units,existing_dwelling_units,proposed_no_of_stories,job_type,job_status,total_est__fee,owner_s_business_name,owner_s_first_name,owner_s_last_name,latest_action_date,latitude,longitude,block,lot,community___board");
    url.searchParams.set("$limit", "200");
    url.searchParams.set("$order", "latest_action_date DESC");

    const res = await fetch(url.toString());
    if (!res.ok) return [];

    const data = await res.json();
    const boroNames: Record<string, string> = { MANHATTAN: "Manhattan", BRONX: "Bronx", BROOKLYN: "Brooklyn", QUEENS: "Queens", "STATEN ISLAND": "Staten Island" };
    const boroCodeMap: Record<string, string> = { MANHATTAN: "1", BRONX: "2", BROOKLYN: "3", QUEENS: "4", "STATEN ISLAND": "5" };

    return data
      .map((d: any) => {
        const proposed = parseInt(d.proposed_dwelling_units || "0");
        const existing = parseInt(d.existing_dwelling_units || "0");
        const netNewUnits = proposed - existing;
        if (netNewUnits <= 0) return null;

        const ownerBiz = d.owner_s_business_name || "";
        const ownerPerson = [d.owner_s_first_name, d.owner_s_last_name].filter(Boolean).join(" ").trim();

        return {
          address: [d.house__, d.street_name].filter(Boolean).join(" ").trim(),
          borough: boroNames[d.borough] || d.borough || "",
          units: netNewUnits,
          stories: parseInt(d.proposed_no_of_stories || "0"),
          jobType: d.job_type || "",
          jobStatus: d.job_status || "",
          estimatedCost: d.total_est__fee || "",
          ownerName: ownerBiz || ownerPerson || "",
          filingDate: d.latest_action_date || "",
          lat: parseFloat(d.latitude || "0"),
          lng: parseFloat(d.longitude || "0"),
          block: (d.block || "").replace(/^0+/, ""),
          lot: (d.lot || "").replace(/^0+/, ""),
          boroCode: boroCodeMap[d.borough] || "",
        };
      })
      .filter((d: MapNewDevelopment | null): d is MapNewDevelopment => d !== null && d.lat !== 0 && d.lng !== 0);
  } catch (err) {
    console.error("New developments fetch error:", err);
    return [];
  }
}
