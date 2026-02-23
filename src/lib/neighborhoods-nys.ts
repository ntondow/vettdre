// ============================================================
// NYS Regions Lookup — Counties & Municipalities for Investment Markets
// Key counties outside NYC for multifamily investment analysis
// ============================================================

export interface NYSMunicipality {
  name: string;
  type: "city" | "town" | "village";
  swisCode: string;
  zipCodes: string[];
  lat: number;
  lng: number;
}

export interface NYSCounty {
  name: string;
  fips: string;
  lat: number;
  lng: number;
  municipalities: NYSMunicipality[];
}

const NYS_COUNTIES: NYSCounty[] = [
  // ============================================================
  // Downstate / Hudson Valley
  // ============================================================
  {
    name: "Westchester",
    fips: "119",
    lat: 41.1220,
    lng: -73.7949,
    municipalities: [
      { name: "Yonkers", type: "city", swisCode: "551800", zipCodes: ["10701","10702","10703","10704","10705","10706","10707","10708","10710"], lat: 40.9312, lng: -73.8988 },
      { name: "New Rochelle", type: "city", swisCode: "551300", zipCodes: ["10801","10802","10803","10804","10805"], lat: 40.9115, lng: -73.7824 },
      { name: "Mount Vernon", type: "city", swisCode: "551100", zipCodes: ["10550","10551","10552","10553"], lat: 40.9126, lng: -73.8371 },
      { name: "White Plains", type: "city", swisCode: "551700", zipCodes: ["10601","10602","10603","10604","10605","10606","10607"], lat: 41.0340, lng: -73.7629 },
      { name: "Peekskill", type: "city", swisCode: "551400", zipCodes: ["10566"], lat: 41.2901, lng: -73.9204 },
      { name: "Rye", type: "city", swisCode: "551500", zipCodes: ["10580"], lat: 40.9807, lng: -73.6835 },
      { name: "Greenburgh", type: "town", swisCode: "552200", zipCodes: ["10502","10523","10530","10533","10583","10591","10603","10607"], lat: 41.0329, lng: -73.8413 },
      { name: "Ossining", type: "town", swisCode: "553400", zipCodes: ["10562"], lat: 41.1626, lng: -73.8616 },
      { name: "Mamaroneck", type: "town", swisCode: "553000", zipCodes: ["10543"], lat: 40.9487, lng: -73.7335 },
      { name: "Eastchester", type: "town", swisCode: "552000", zipCodes: ["10709","10583"], lat: 40.9576, lng: -73.8084 },
      { name: "Harrison", type: "town", swisCode: "552400", zipCodes: ["10528","10577"], lat: 41.0290, lng: -73.7190 },
      { name: "Port Chester", type: "village", swisCode: "553600", zipCodes: ["10573"], lat: 41.0018, lng: -73.6657 },
      { name: "Tarrytown", type: "village", swisCode: "552201", zipCodes: ["10591"], lat: 41.0762, lng: -73.8585 },
      { name: "Dobbs Ferry", type: "village", swisCode: "552203", zipCodes: ["10522"], lat: 41.0145, lng: -73.8716 },
    ],
  },
  {
    name: "Nassau",
    fips: "059",
    lat: 40.7289,
    lng: -73.5894,
    municipalities: [
      { name: "Glen Cove", type: "city", swisCode: "280500", zipCodes: ["11542"], lat: 40.8623, lng: -73.6340 },
      { name: "Long Beach", type: "city", swisCode: "280700", zipCodes: ["11561"], lat: 40.5884, lng: -73.6579 },
      { name: "Hempstead", type: "town", swisCode: "282000", zipCodes: ["11550","11551","11553","11554","11555","11556","11557","11558","11559","11560","11563","11565","11566","11568","11570","11572","11575","11580","11581","11590","11596","11598","11599"], lat: 40.7062, lng: -73.6187 },
      { name: "North Hempstead", type: "town", swisCode: "282400", zipCodes: ["11001","11010","11020","11021","11023","11024","11030","11040","11042","11050","11501","11507","11509","11514","11548","11560","11576","11577"], lat: 40.7838, lng: -73.6818 },
      { name: "Oyster Bay", type: "town", swisCode: "282800", zipCodes: ["11545","11709","11714","11724","11732","11735","11753","11765","11771","11773","11791","11797","11801","11803"], lat: 40.8654, lng: -73.5321 },
      { name: "Freeport", type: "village", swisCode: "282007", zipCodes: ["11520"], lat: 40.6576, lng: -73.5832 },
      { name: "Valley Stream", type: "village", swisCode: "282054", zipCodes: ["11580","11581","11582"], lat: 40.6643, lng: -73.7085 },
      { name: "Garden City", type: "village", swisCode: "282009", zipCodes: ["11530","11531","11599"], lat: 40.7268, lng: -73.6343 },
      { name: "Rockville Centre", type: "village", swisCode: "282040", zipCodes: ["11570","11571"], lat: 40.6588, lng: -73.6413 },
      { name: "Mineola", type: "village", swisCode: "282424", zipCodes: ["11501"], lat: 40.7493, lng: -73.6407 },
      { name: "Great Neck", type: "village", swisCode: "282410", zipCodes: ["11021","11023","11024"], lat: 40.8010, lng: -73.7282 },
    ],
  },
  {
    name: "Suffolk",
    fips: "103",
    lat: 40.9432,
    lng: -72.6824,
    municipalities: [
      { name: "Babylon", type: "town", swisCode: "472000", zipCodes: ["11702","11703","11704","11717","11726","11757","11795","11798"], lat: 40.6954, lng: -73.3257 },
      { name: "Brookhaven", type: "town", swisCode: "472400", zipCodes: ["11719","11720","11727","11738","11741","11742","11745","11763","11764","11766","11772","11776","11777","11778","11779","11780","11784","11786","11789","11790","11794","11961","11967","11980"], lat: 40.7834, lng: -72.9154 },
      { name: "Huntington", type: "town", swisCode: "472800", zipCodes: ["11721","11724","11725","11729","11731","11740","11743","11746","11747","11754","11768"], lat: 40.8682, lng: -73.4257 },
      { name: "Islip", type: "town", swisCode: "473200", zipCodes: ["11706","11716","11717","11718","11722","11730","11749","11751","11752","11769","11782","11788","11793","11796"], lat: 40.7298, lng: -73.2104 },
      { name: "Smithtown", type: "town", swisCode: "474400", zipCodes: ["11725","11755","11767","11780","11787"], lat: 40.8559, lng: -73.2006 },
      { name: "Riverhead", type: "town", swisCode: "474000", zipCodes: ["11792","11901","11933","11949"], lat: 40.9171, lng: -72.6621 },
      { name: "Southampton", type: "town", swisCode: "474800", zipCodes: ["11932","11942","11946","11948","11950","11953","11954","11955","11956","11957","11959","11960","11962","11963","11968","11969","11972","11975","11976","11977","11978"], lat: 40.8843, lng: -72.3896 },
      { name: "Patchogue", type: "village", swisCode: "472404", zipCodes: ["11772"], lat: 40.7654, lng: -73.0154 },
      { name: "Bay Shore", type: "village", swisCode: "473201", zipCodes: ["11706"], lat: 40.7251, lng: -73.2454 },
    ],
  },
  {
    name: "Rockland",
    fips: "087",
    lat: 41.1489,
    lng: -74.0256,
    municipalities: [
      { name: "Haverstraw", type: "town", swisCode: "392200", zipCodes: ["10927","10984","10993"], lat: 41.2057, lng: -73.9660 },
      { name: "Ramapo", type: "town", swisCode: "392600", zipCodes: ["10901","10952","10954","10974","10977"], lat: 41.1412, lng: -74.1135 },
      { name: "Clarkstown", type: "town", swisCode: "392000", zipCodes: ["10920","10956","10960","10989","10994"], lat: 41.1290, lng: -73.9814 },
      { name: "Orangetown", type: "town", swisCode: "392400", zipCodes: ["10913","10962","10964","10965","10968","10983"], lat: 41.0550, lng: -73.9480 },
      { name: "Stony Point", type: "town", swisCode: "392800", zipCodes: ["10980","10986"], lat: 41.2295, lng: -73.9871 },
      { name: "Spring Valley", type: "village", swisCode: "392603", zipCodes: ["10977"], lat: 41.1132, lng: -74.0438 },
      { name: "Suffern", type: "village", swisCode: "392604", zipCodes: ["10901"], lat: 41.1148, lng: -74.1493 },
      { name: "Nyack", type: "village", swisCode: "392401", zipCodes: ["10960"], lat: 41.0907, lng: -73.9174 },
    ],
  },
  {
    name: "Orange",
    fips: "071",
    lat: 41.4012,
    lng: -74.3118,
    municipalities: [
      { name: "Newburgh", type: "city", swisCode: "331300", zipCodes: ["12550","12551"], lat: 41.5034, lng: -74.0104 },
      { name: "Middletown", type: "city", swisCode: "331100", zipCodes: ["10940","10941"], lat: 41.4459, lng: -74.4229 },
      { name: "Port Jervis", type: "city", swisCode: "331500", zipCodes: ["12771"], lat: 41.3748, lng: -74.6930 },
      { name: "Monroe", type: "town", swisCode: "332600", zipCodes: ["10950"], lat: 41.3296, lng: -74.1854 },
      { name: "Wallkill", type: "town", swisCode: "333800", zipCodes: ["10940","10941","12549","12589"], lat: 41.4762, lng: -74.3707 },
      { name: "Warwick", type: "town", swisCode: "334000", zipCodes: ["10921","10925","10969","10990"], lat: 41.2576, lng: -74.3569 },
      { name: "Goshen", type: "town", swisCode: "332000", zipCodes: ["10924"], lat: 41.4021, lng: -74.3243 },
      { name: "Chester", type: "town", swisCode: "331600", zipCodes: ["10918"], lat: 41.3626, lng: -74.2707 },
      { name: "Cornwall", type: "town", swisCode: "331800", zipCodes: ["12518","12520"], lat: 41.4326, lng: -74.0193 },
    ],
  },
  {
    name: "Dutchess",
    fips: "027",
    lat: 41.7650,
    lng: -73.7430,
    municipalities: [
      { name: "Poughkeepsie", type: "city", swisCode: "131300", zipCodes: ["12601","12602","12603"], lat: 41.7004, lng: -73.9209 },
      { name: "Beacon", type: "city", swisCode: "131100", zipCodes: ["12508"], lat: 41.5048, lng: -73.9696 },
      { name: "Poughkeepsie", type: "town", swisCode: "132800", zipCodes: ["12601","12603","12604"], lat: 41.6700, lng: -73.9047 },
      { name: "Fishkill", type: "town", swisCode: "132000", zipCodes: ["12524"], lat: 41.5343, lng: -73.8990 },
      { name: "East Fishkill", type: "town", swisCode: "131800", zipCodes: ["12533","12590"], lat: 41.5670, lng: -73.7850 },
      { name: "Wappinger", type: "town", swisCode: "133400", zipCodes: ["12590"], lat: 41.5968, lng: -73.9104 },
      { name: "Hyde Park", type: "town", swisCode: "132400", zipCodes: ["12538","12580"], lat: 41.7843, lng: -73.9143 },
      { name: "Rhinebeck", type: "town", swisCode: "133000", zipCodes: ["12572"], lat: 41.9268, lng: -73.9118 },
    ],
  },
  // ============================================================
  // Capital District
  // ============================================================
  {
    name: "Albany",
    fips: "001",
    lat: 42.6526,
    lng: -73.7562,
    municipalities: [
      { name: "Albany", type: "city", swisCode: "010100", zipCodes: ["12201","12202","12203","12204","12205","12206","12207","12208","12209","12210","12211","12212"], lat: 42.6526, lng: -73.7562 },
      { name: "Cohoes", type: "city", swisCode: "010300", zipCodes: ["12047"], lat: 42.7743, lng: -73.7076 },
      { name: "Watervliet", type: "city", swisCode: "010500", zipCodes: ["12189"], lat: 42.7301, lng: -73.7026 },
      { name: "Colonie", type: "town", swisCode: "011800", zipCodes: ["12205","12189","12110","12309"], lat: 42.7179, lng: -73.8337 },
      { name: "Guilderland", type: "town", swisCode: "012200", zipCodes: ["12084","12203"], lat: 42.6859, lng: -73.9068 },
      { name: "Bethlehem", type: "town", swisCode: "011200", zipCodes: ["12054","12158","12159"], lat: 42.5918, lng: -73.8168 },
    ],
  },
  // ============================================================
  // Upstate Metro Areas
  // ============================================================
  {
    name: "Erie",
    fips: "029",
    lat: 42.8864,
    lng: -78.8784,
    municipalities: [
      { name: "Buffalo", type: "city", swisCode: "140200", zipCodes: ["14201","14202","14203","14204","14205","14206","14207","14208","14209","14210","14211","14212","14213","14214","14215","14216","14217","14218","14219","14220","14222","14223","14224","14225","14226","14227","14228"], lat: 42.8864, lng: -78.8784 },
      { name: "Lackawanna", type: "city", swisCode: "140700", zipCodes: ["14218"], lat: 42.8254, lng: -78.8237 },
      { name: "Tonawanda", type: "city", swisCode: "141000", zipCodes: ["14150"], lat: 42.9917, lng: -78.8806 },
      { name: "Amherst", type: "town", swisCode: "141200", zipCodes: ["14068","14221","14226","14228"], lat: 42.9811, lng: -78.7985 },
      { name: "Cheektowaga", type: "town", swisCode: "141400", zipCodes: ["14043","14206","14211","14215","14225","14227"], lat: 42.8934, lng: -78.7532 },
      { name: "Hamburg", type: "town", swisCode: "142400", zipCodes: ["14075","14219"], lat: 42.7156, lng: -78.8295 },
      { name: "Tonawanda", type: "town", swisCode: "143600", zipCodes: ["14150","14217","14223"], lat: 43.0204, lng: -78.8706 },
      { name: "West Seneca", type: "town", swisCode: "143800", zipCodes: ["14210","14218","14224"], lat: 42.8415, lng: -78.7698 },
    ],
  },
  {
    name: "Monroe",
    fips: "055",
    lat: 43.1566,
    lng: -77.6088,
    municipalities: [
      { name: "Rochester", type: "city", swisCode: "261300", zipCodes: ["14602","14603","14604","14605","14606","14607","14608","14609","14610","14611","14612","14613","14614","14615","14616","14617","14618","14619","14620","14621","14622","14623","14624","14625","14626"], lat: 43.1566, lng: -77.6088 },
      { name: "Gates", type: "town", swisCode: "262200", zipCodes: ["14606","14624"], lat: 43.1504, lng: -77.7060 },
      { name: "Greece", type: "town", swisCode: "262400", zipCodes: ["14612","14615","14616","14626"], lat: 43.2098, lng: -77.6930 },
      { name: "Irondequoit", type: "town", swisCode: "262600", zipCodes: ["14609","14617","14621","14622"], lat: 43.2134, lng: -77.5789 },
      { name: "Brighton", type: "town", swisCode: "261600", zipCodes: ["14610","14618","14620"], lat: 43.1223, lng: -77.5579 },
      { name: "Henrietta", type: "town", swisCode: "262500", zipCodes: ["14467","14586","14623"], lat: 43.0676, lng: -77.6241 },
      { name: "Penfield", type: "town", swisCode: "263200", zipCodes: ["14526","14625","14450"], lat: 43.1584, lng: -77.4476 },
      { name: "Webster", type: "town", swisCode: "264200", zipCodes: ["14580"], lat: 43.2126, lng: -77.4278 },
    ],
  },
  {
    name: "Onondaga",
    fips: "067",
    lat: 43.0481,
    lng: -76.1474,
    municipalities: [
      { name: "Syracuse", type: "city", swisCode: "311300", zipCodes: ["13201","13202","13203","13204","13205","13206","13207","13208","13209","13210","13211","13212","13214","13215","13219","13224","13290"], lat: 43.0481, lng: -76.1474 },
      { name: "Camillus", type: "town", swisCode: "311600", zipCodes: ["13031","13219"], lat: 43.0401, lng: -76.3040 },
      { name: "Clay", type: "town", swisCode: "311800", zipCodes: ["13041","13088","13090","13212"], lat: 43.1768, lng: -76.1974 },
      { name: "DeWitt", type: "town", swisCode: "312000", zipCodes: ["13057","13078","13214","13224"], lat: 43.0434, lng: -76.0774 },
      { name: "Geddes", type: "town", swisCode: "312200", zipCodes: ["13204","13209","13219"], lat: 43.0651, lng: -76.2174 },
      { name: "Manlius", type: "town", swisCode: "312600", zipCodes: ["13066","13104","13116"], lat: 43.0001, lng: -75.9774 },
      { name: "Salina", type: "town", swisCode: "313000", zipCodes: ["13088","13090","13206","13211","13212"], lat: 43.1001, lng: -76.1274 },
      { name: "Cicero", type: "town", swisCode: "311700", zipCodes: ["13029","13030","13039"], lat: 43.1701, lng: -76.0674 },
    ],
  },
];

// ============================================================
// Lookup Helpers
// ============================================================

export function getCounties(): { name: string; fips: string; lat: number; lng: number }[] {
  return NYS_COUNTIES.map(c => ({ name: c.name, fips: c.fips, lat: c.lat, lng: c.lng }));
}

export function getMunicipalitiesByCounty(countyName: string): NYSMunicipality[] {
  const county = NYS_COUNTIES.find(c => c.name.toLowerCase() === countyName.toLowerCase());
  return county ? county.municipalities : [];
}

export function getMunicipalityBySwis(swisCode: string): (NYSMunicipality & { county: string }) | null {
  for (const county of NYS_COUNTIES) {
    const muni = county.municipalities.find(m => m.swisCode === swisCode);
    if (muni) return { ...muni, county: county.name };
  }
  return null;
}

export function getCountyByName(countyName: string): NYSCounty | null {
  return NYS_COUNTIES.find(c => c.name.toLowerCase() === countyName.toLowerCase()) || null;
}

export function getSwisCodesForCounty(countyName: string): string[] {
  const county = NYS_COUNTIES.find(c => c.name.toLowerCase() === countyName.toLowerCase());
  return county ? county.municipalities.map(m => m.swisCode) : [];
}

export function getZipCodesForMunicipalities(muniNames: string[], countyName: string): string[] {
  const county = NYS_COUNTIES.find(c => c.name.toLowerCase() === countyName.toLowerCase());
  if (!county) return [];
  const zips = new Set<string>();
  for (const muni of county.municipalities) {
    if (muniNames.includes(muni.name)) {
      muni.zipCodes.forEach(z => zips.add(z));
    }
  }
  return Array.from(zips);
}
