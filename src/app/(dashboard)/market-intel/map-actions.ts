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
    url.searchParams.set("$select", "address,ownername,unitsres,unitstotal,yearbuilt,numfloors,assesstot,bldgclass,zonedist1,borocode,block,lot,latitude,longitude,bldgarea,lotarea");
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
    })).filter((p: any) => p.lat !== 0 && p.lng !== 0)
      .filter((p: any) => filters?.excludePublic ? !checkPublicOwner(p.ownerName) : true);

    const total = properties.length;

    return { properties, total };
  } catch (err) {
    console.error("Map fetch error:", err);
    return { properties: [], total: 0 };
  }
}
