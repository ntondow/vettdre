// ============================================================
// NJ Counties & Municipalities — Investment Markets
// 8 target counties with key multifamily municipalities
// ============================================================

export interface NJMunicipality {
  name: string;
  type: "city" | "town" | "township" | "borough" | "village";
  zipCodes: string[];
  lat: number;
  lng: number;
}

export interface NJCounty {
  name: string;
  municipalities: NJMunicipality[];
  centerLat: number;
  centerLng: number;
}

const NJ_COUNTIES: NJCounty[] = [
  {
    name: "Hudson",
    centerLat: 40.7282,
    centerLng: -74.0776,
    municipalities: [
      { name: "Jersey City", type: "city", zipCodes: ["07302", "07304", "07305", "07306", "07307", "07310", "07311"], lat: 40.7282, lng: -74.0776 },
      { name: "Hoboken", type: "city", zipCodes: ["07030"], lat: 40.7440, lng: -74.0324 },
      { name: "Union City", type: "city", zipCodes: ["07087"], lat: 40.7676, lng: -74.0324 },
      { name: "North Bergen", type: "township", zipCodes: ["07047"], lat: 40.8043, lng: -74.0121 },
      { name: "Bayonne", type: "city", zipCodes: ["07002"], lat: 40.6687, lng: -74.1143 },
      { name: "Weehawken", type: "township", zipCodes: ["07086"], lat: 40.7696, lng: -74.0210 },
      { name: "Secaucus", type: "town", zipCodes: ["07094"], lat: 40.7895, lng: -74.0565 },
    ],
  },
  {
    name: "Essex",
    centerLat: 40.7870,
    centerLng: -74.2286,
    municipalities: [
      { name: "Newark", type: "city", zipCodes: ["07102", "07103", "07104", "07105", "07106", "07107", "07108", "07112", "07114"], lat: 40.7357, lng: -74.1724 },
      { name: "East Orange", type: "city", zipCodes: ["07017", "07018", "07019"], lat: 40.7673, lng: -74.2049 },
      { name: "Irvington", type: "township", zipCodes: ["07111"], lat: 40.7232, lng: -74.2346 },
      { name: "Montclair", type: "township", zipCodes: ["07042", "07043"], lat: 40.8259, lng: -74.2090 },
      { name: "Bloomfield", type: "township", zipCodes: ["07003"], lat: 40.8068, lng: -74.1854 },
    ],
  },
  {
    name: "Bergen",
    centerLat: 40.9576,
    centerLng: -74.0703,
    municipalities: [
      { name: "Hackensack", type: "city", zipCodes: ["07601"], lat: 40.8859, lng: -74.0435 },
      { name: "Fort Lee", type: "borough", zipCodes: ["07024"], lat: 40.8509, lng: -73.9712 },
      { name: "Englewood", type: "city", zipCodes: ["07631"], lat: 40.8929, lng: -73.9726 },
    ],
  },
  {
    name: "Passaic",
    centerLat: 40.9168,
    centerLng: -74.1723,
    municipalities: [
      { name: "Paterson", type: "city", zipCodes: ["07501", "07502", "07503", "07504", "07505", "07513", "07514", "07522"], lat: 40.9168, lng: -74.1723 },
      { name: "Clifton", type: "city", zipCodes: ["07011", "07012", "07013", "07014"], lat: 40.8584, lng: -74.1638 },
      { name: "Passaic", type: "city", zipCodes: ["07055"], lat: 40.8568, lng: -74.1285 },
    ],
  },
  {
    name: "Middlesex",
    centerLat: 40.4862,
    centerLng: -74.4518,
    municipalities: [
      { name: "New Brunswick", type: "city", zipCodes: ["08901", "08903"], lat: 40.4862, lng: -74.4518 },
      { name: "Edison", type: "township", zipCodes: ["08817", "08818", "08820", "08837"], lat: 40.5187, lng: -74.4121 },
      { name: "Perth Amboy", type: "city", zipCodes: ["08861"], lat: 40.5068, lng: -74.2654 },
    ],
  },
  {
    name: "Union",
    centerLat: 40.6640,
    centerLng: -74.2107,
    municipalities: [
      { name: "Elizabeth", type: "city", zipCodes: ["07201", "07202", "07206", "07208"], lat: 40.6640, lng: -74.2107 },
      { name: "Plainfield", type: "city", zipCodes: ["07060", "07062", "07063"], lat: 40.6337, lng: -74.4074 },
    ],
  },
  {
    name: "Monmouth",
    centerLat: 40.2221,
    centerLng: -74.0121,
    municipalities: [
      { name: "Asbury Park", type: "city", zipCodes: ["07712"], lat: 40.2204, lng: -74.0121 },
      { name: "Long Branch", type: "city", zipCodes: ["07740"], lat: 40.3043, lng: -73.9924 },
      { name: "Red Bank", type: "borough", zipCodes: ["07701"], lat: 40.3471, lng: -74.0643 },
    ],
  },
  {
    name: "Ocean",
    centerLat: 39.9537,
    centerLng: -74.1979,
    municipalities: [
      { name: "Lakewood", type: "township", zipCodes: ["08701"], lat: 40.0968, lng: -74.2179 },
      { name: "Toms River", type: "township", zipCodes: ["08753", "08755", "08757"], lat: 39.9537, lng: -74.1979 },
    ],
  },
];

export function getNJCounties(): string[] {
  return NJ_COUNTIES.map(c => c.name);
}

export function getNJMunicipalitiesByCounty(county: string): NJMunicipality[] {
  const c = NJ_COUNTIES.find(c => c.name.toLowerCase() === county.toLowerCase());
  return c ? c.municipalities : [];
}

export function getNJCountyByName(name: string): NJCounty | undefined {
  return NJ_COUNTIES.find(c => c.name.toLowerCase() === name.toLowerCase());
}

export function getNJZipCodesForCounty(county: string): string[] {
  const c = NJ_COUNTIES.find(c => c.name.toLowerCase() === county.toLowerCase());
  if (!c) return [];
  return c.municipalities.flatMap(m => m.zipCodes);
}

export function getNJCountyCenter(county: string): { lat: number; lng: number } | undefined {
  const c = NJ_COUNTIES.find(c => c.name.toLowerCase() === county.toLowerCase());
  return c ? { lat: c.centerLat, lng: c.centerLng } : undefined;
}
