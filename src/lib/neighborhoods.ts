export interface Neighborhood {
  name: string;
  borough: string;
  ntaCode: string;
  zipCodes: string[];
  lat: number;
  lng: number;
}

// Comprehensive NYC neighborhoods dataset — major neighborhoods per borough
// with zip code mappings and approximate center coordinates
export const NYC_NEIGHBORHOODS: Neighborhood[] = [
  // ===== MANHATTAN =====
  { name: "Financial District", borough: "Manhattan", ntaCode: "MN25", zipCodes: ["10004", "10005", "10006", "10007", "10038", "10280"], lat: 40.7075, lng: -74.0089 },
  { name: "Battery Park City", borough: "Manhattan", ntaCode: "MN27", zipCodes: ["10280", "10282"], lat: 40.7117, lng: -74.0154 },
  { name: "Tribeca", borough: "Manhattan", ntaCode: "MN24", zipCodes: ["10007", "10013"], lat: 40.7163, lng: -74.0086 },
  { name: "Chinatown", borough: "Manhattan", ntaCode: "MN27", zipCodes: ["10002", "10013"], lat: 40.7158, lng: -73.9970 },
  { name: "Lower East Side", borough: "Manhattan", ntaCode: "MN04", zipCodes: ["10002", "10003"], lat: 40.7150, lng: -73.9843 },
  { name: "SoHo", borough: "Manhattan", ntaCode: "MN24", zipCodes: ["10012", "10013"], lat: 40.7233, lng: -74.0030 },
  { name: "NoHo", borough: "Manhattan", ntaCode: "MN24", zipCodes: ["10003", "10012"], lat: 40.7264, lng: -73.9927 },
  { name: "Greenwich Village", borough: "Manhattan", ntaCode: "MN22", zipCodes: ["10003", "10011", "10012", "10014"], lat: 40.7336, lng: -74.0027 },
  { name: "West Village", borough: "Manhattan", ntaCode: "MN22", zipCodes: ["10011", "10014"], lat: 40.7358, lng: -74.0036 },
  { name: "East Village", borough: "Manhattan", ntaCode: "MN22", zipCodes: ["10003", "10009"], lat: 40.7265, lng: -73.9815 },
  { name: "Chelsea", borough: "Manhattan", ntaCode: "MN21", zipCodes: ["10001", "10011"], lat: 40.7465, lng: -74.0014 },
  { name: "Flatiron", borough: "Manhattan", ntaCode: "MN21", zipCodes: ["10010", "10016"], lat: 40.7411, lng: -73.9897 },
  { name: "Gramercy", borough: "Manhattan", ntaCode: "MN20", zipCodes: ["10003", "10010", "10016"], lat: 40.7368, lng: -73.9845 },
  { name: "Stuyvesant Town", borough: "Manhattan", ntaCode: "MN20", zipCodes: ["10009", "10010"], lat: 40.7315, lng: -73.9780 },
  { name: "Kips Bay", borough: "Manhattan", ntaCode: "MN20", zipCodes: ["10016"], lat: 40.7422, lng: -73.9794 },
  { name: "Murray Hill", borough: "Manhattan", ntaCode: "MN19", zipCodes: ["10016", "10017"], lat: 40.7479, lng: -73.9757 },
  { name: "Midtown", borough: "Manhattan", ntaCode: "MN17", zipCodes: ["10017", "10018", "10019", "10020", "10036"], lat: 40.7549, lng: -73.9840 },
  { name: "Midtown South", borough: "Manhattan", ntaCode: "MN18", zipCodes: ["10001", "10018", "10036"], lat: 40.7500, lng: -73.9900 },
  { name: "Hell's Kitchen", borough: "Manhattan", ntaCode: "MN15", zipCodes: ["10019", "10036"], lat: 40.7638, lng: -73.9918 },
  { name: "Times Square", borough: "Manhattan", ntaCode: "MN17", zipCodes: ["10036"], lat: 40.7580, lng: -73.9855 },
  { name: "Turtle Bay", borough: "Manhattan", ntaCode: "MN19", zipCodes: ["10017", "10022"], lat: 40.7527, lng: -73.9688 },
  { name: "Sutton Place", borough: "Manhattan", ntaCode: "MN19", zipCodes: ["10022"], lat: 40.7587, lng: -73.9621 },
  { name: "Upper East Side", borough: "Manhattan", ntaCode: "MN31", zipCodes: ["10021", "10028", "10065", "10075", "10128"], lat: 40.7736, lng: -73.9566 },
  { name: "Yorkville", borough: "Manhattan", ntaCode: "MN32", zipCodes: ["10028", "10128"], lat: 40.7763, lng: -73.9493 },
  { name: "Carnegie Hill", borough: "Manhattan", ntaCode: "MN31", zipCodes: ["10028", "10128"], lat: 40.7847, lng: -73.9549 },
  { name: "Upper West Side", borough: "Manhattan", ntaCode: "MN07", zipCodes: ["10023", "10024", "10025"], lat: 40.7870, lng: -73.9754 },
  { name: "Lincoln Square", borough: "Manhattan", ntaCode: "MN07", zipCodes: ["10023"], lat: 40.7741, lng: -73.9845 },
  { name: "Morningside Heights", borough: "Manhattan", ntaCode: "MN09", zipCodes: ["10025", "10027"], lat: 40.8099, lng: -73.9625 },
  { name: "Harlem", borough: "Manhattan", ntaCode: "MN11", zipCodes: ["10026", "10027", "10029", "10030", "10035", "10037", "10039"], lat: 40.8116, lng: -73.9465 },
  { name: "East Harlem", borough: "Manhattan", ntaCode: "MN11", zipCodes: ["10029", "10035"], lat: 40.7957, lng: -73.9425 },
  { name: "Hamilton Heights", borough: "Manhattan", ntaCode: "MN09", zipCodes: ["10031", "10032"], lat: 40.8230, lng: -73.9494 },
  { name: "Washington Heights", borough: "Manhattan", ntaCode: "MN35", zipCodes: ["10032", "10033", "10040"], lat: 40.8417, lng: -73.9393 },
  { name: "Inwood", borough: "Manhattan", ntaCode: "MN36", zipCodes: ["10034", "10040"], lat: 40.8677, lng: -73.9212 },

  // ===== BROOKLYN =====
  { name: "Williamsburg", borough: "Brooklyn", ntaCode: "BK09", zipCodes: ["11206", "11211", "11249"], lat: 40.7081, lng: -73.9571 },
  { name: "Greenpoint", borough: "Brooklyn", ntaCode: "BK76", zipCodes: ["11222"], lat: 40.7282, lng: -73.9510 },
  { name: "DUMBO", borough: "Brooklyn", ntaCode: "BK09", zipCodes: ["11201"], lat: 40.7033, lng: -73.9883 },
  { name: "Brooklyn Heights", borough: "Brooklyn", ntaCode: "BK09", zipCodes: ["11201"], lat: 40.6960, lng: -73.9936 },
  { name: "Downtown Brooklyn", borough: "Brooklyn", ntaCode: "BK09", zipCodes: ["11201", "11217"], lat: 40.6914, lng: -73.9847 },
  { name: "Boerum Hill", borough: "Brooklyn", ntaCode: "BK33", zipCodes: ["11201", "11217"], lat: 40.6858, lng: -73.9836 },
  { name: "Cobble Hill", borough: "Brooklyn", ntaCode: "BK33", zipCodes: ["11201"], lat: 40.6862, lng: -73.9955 },
  { name: "Carroll Gardens", borough: "Brooklyn", ntaCode: "BK33", zipCodes: ["11231"], lat: 40.6796, lng: -73.9998 },
  { name: "Red Hook", borough: "Brooklyn", ntaCode: "BK33", zipCodes: ["11231"], lat: 40.6734, lng: -74.0088 },
  { name: "Park Slope", borough: "Brooklyn", ntaCode: "BK37", zipCodes: ["11215", "11217"], lat: 40.6710, lng: -73.9814 },
  { name: "Prospect Heights", borough: "Brooklyn", ntaCode: "BK35", zipCodes: ["11217", "11238"], lat: 40.6770, lng: -73.9690 },
  { name: "Crown Heights", borough: "Brooklyn", ntaCode: "BK35", zipCodes: ["11213", "11216", "11225", "11238"], lat: 40.6690, lng: -73.9465 },
  { name: "Fort Greene", borough: "Brooklyn", ntaCode: "BK38", zipCodes: ["11205", "11217"], lat: 40.6886, lng: -73.9764 },
  { name: "Clinton Hill", borough: "Brooklyn", ntaCode: "BK38", zipCodes: ["11205", "11238"], lat: 40.6899, lng: -73.9664 },
  { name: "Bed-Stuy", borough: "Brooklyn", ntaCode: "BK68", zipCodes: ["11205", "11206", "11216", "11221", "11233"], lat: 40.6834, lng: -73.9434 },
  { name: "Bushwick", borough: "Brooklyn", ntaCode: "BK69", zipCodes: ["11206", "11207", "11221", "11237"], lat: 40.6942, lng: -73.9214 },
  { name: "Sunset Park", borough: "Brooklyn", ntaCode: "BK42", zipCodes: ["11220", "11232"], lat: 40.6465, lng: -74.0100 },
  { name: "Bay Ridge", borough: "Brooklyn", ntaCode: "BK44", zipCodes: ["11209", "11220"], lat: 40.6340, lng: -74.0236 },
  { name: "Bensonhurst", borough: "Brooklyn", ntaCode: "BK45", zipCodes: ["11204", "11214", "11228"], lat: 40.6017, lng: -73.9946 },
  { name: "Borough Park", borough: "Brooklyn", ntaCode: "BK43", zipCodes: ["11204", "11218", "11219"], lat: 40.6341, lng: -73.9916 },
  { name: "Flatbush", borough: "Brooklyn", ntaCode: "BK40", zipCodes: ["11210", "11226", "11230"], lat: 40.6414, lng: -73.9610 },
  { name: "East Flatbush", borough: "Brooklyn", ntaCode: "BK41", zipCodes: ["11203", "11210", "11212", "11236"], lat: 40.6485, lng: -73.9307 },
  { name: "Midwood", borough: "Brooklyn", ntaCode: "BK40", zipCodes: ["11210", "11230"], lat: 40.6215, lng: -73.9614 },
  { name: "Sheepshead Bay", borough: "Brooklyn", ntaCode: "BK46", zipCodes: ["11229", "11235"], lat: 40.5902, lng: -73.9440 },
  { name: "Brighton Beach", borough: "Brooklyn", ntaCode: "BK47", zipCodes: ["11235"], lat: 40.5784, lng: -73.9618 },
  { name: "Coney Island", borough: "Brooklyn", ntaCode: "BK47", zipCodes: ["11224"], lat: 40.5755, lng: -73.9707 },
  { name: "Gravesend", borough: "Brooklyn", ntaCode: "BK46", zipCodes: ["11223", "11229"], lat: 40.5961, lng: -73.9671 },
  { name: "Dyker Heights", borough: "Brooklyn", ntaCode: "BK44", zipCodes: ["11209", "11228"], lat: 40.6215, lng: -74.0093 },
  { name: "Canarsie", borough: "Brooklyn", ntaCode: "BK50", zipCodes: ["11236"], lat: 40.6389, lng: -73.9016 },
  { name: "Brownsville", borough: "Brooklyn", ntaCode: "BK69", zipCodes: ["11212", "11233"], lat: 40.6622, lng: -73.9098 },
  { name: "East New York", borough: "Brooklyn", ntaCode: "BK73", zipCodes: ["11207", "11208", "11239"], lat: 40.6590, lng: -73.8818 },
  { name: "Prospect Lefferts Gardens", borough: "Brooklyn", ntaCode: "BK40", zipCodes: ["11225"], lat: 40.6589, lng: -73.9539 },
  { name: "Kensington", borough: "Brooklyn", ntaCode: "BK43", zipCodes: ["11218"], lat: 40.6399, lng: -73.9729 },
  { name: "Windsor Terrace", borough: "Brooklyn", ntaCode: "BK37", zipCodes: ["11215", "11218"], lat: 40.6534, lng: -73.9752 },
  { name: "Gowanus", borough: "Brooklyn", ntaCode: "BK37", zipCodes: ["11215", "11217"], lat: 40.6730, lng: -73.9893 },
  { name: "Marine Park", borough: "Brooklyn", ntaCode: "BK50", zipCodes: ["11234"], lat: 40.6080, lng: -73.9260 },
  { name: "Mill Basin", borough: "Brooklyn", ntaCode: "BK50", zipCodes: ["11234"], lat: 40.6105, lng: -73.9106 },

  // ===== QUEENS =====
  { name: "Astoria", borough: "Queens", ntaCode: "QN70", zipCodes: ["11102", "11103", "11105", "11106"], lat: 40.7723, lng: -73.9303 },
  { name: "Long Island City", borough: "Queens", ntaCode: "QN68", zipCodes: ["11101", "11109"], lat: 40.7447, lng: -73.9485 },
  { name: "Sunnyside", borough: "Queens", ntaCode: "QN31", zipCodes: ["11104"], lat: 40.7433, lng: -73.9131 },
  { name: "Woodside", borough: "Queens", ntaCode: "QN31", zipCodes: ["11377"], lat: 40.7453, lng: -73.9026 },
  { name: "Jackson Heights", borough: "Queens", ntaCode: "QN57", zipCodes: ["11372", "11373"], lat: 40.7496, lng: -73.8832 },
  { name: "Elmhurst", borough: "Queens", ntaCode: "QN56", zipCodes: ["11373"], lat: 40.7360, lng: -73.8779 },
  { name: "Corona", borough: "Queens", ntaCode: "QN55", zipCodes: ["11368"], lat: 40.7470, lng: -73.8616 },
  { name: "Flushing", borough: "Queens", ntaCode: "QN48", zipCodes: ["11354", "11355", "11358"], lat: 40.7674, lng: -73.8330 },
  { name: "Bayside", borough: "Queens", ntaCode: "QN46", zipCodes: ["11359", "11360", "11361"], lat: 40.7717, lng: -73.7694 },
  { name: "Forest Hills", borough: "Queens", ntaCode: "QN17", zipCodes: ["11375"], lat: 40.7197, lng: -73.8449 },
  { name: "Rego Park", borough: "Queens", ntaCode: "QN17", zipCodes: ["11374"], lat: 40.7263, lng: -73.8625 },
  { name: "Kew Gardens", borough: "Queens", ntaCode: "QN17", zipCodes: ["11415", "11418"], lat: 40.7095, lng: -73.8310 },
  { name: "Jamaica", borough: "Queens", ntaCode: "QN07", zipCodes: ["11430", "11432", "11433", "11434", "11435", "11436"], lat: 40.7024, lng: -73.7890 },
  { name: "South Jamaica", borough: "Queens", ntaCode: "QN07", zipCodes: ["11434", "11436"], lat: 40.6876, lng: -73.7893 },
  { name: "Richmond Hill", borough: "Queens", ntaCode: "QN05", zipCodes: ["11418", "11419"], lat: 40.6976, lng: -73.8272 },
  { name: "Ozone Park", borough: "Queens", ntaCode: "QN05", zipCodes: ["11416", "11417"], lat: 40.6851, lng: -73.8440 },
  { name: "Howard Beach", borough: "Queens", ntaCode: "QN03", zipCodes: ["11414"], lat: 40.6578, lng: -73.8410 },
  { name: "Woodhaven", borough: "Queens", ntaCode: "QN05", zipCodes: ["11421"], lat: 40.6887, lng: -73.8564 },
  { name: "Ridgewood", borough: "Queens", ntaCode: "QN25", zipCodes: ["11385"], lat: 40.7043, lng: -73.9056 },
  { name: "Maspeth", borough: "Queens", ntaCode: "QN25", zipCodes: ["11378"], lat: 40.7234, lng: -73.9122 },
  { name: "Middle Village", borough: "Queens", ntaCode: "QN25", zipCodes: ["11379"], lat: 40.7165, lng: -73.8811 },
  { name: "Glendale", borough: "Queens", ntaCode: "QN25", zipCodes: ["11385"], lat: 40.7023, lng: -73.8818 },
  { name: "Fresh Meadows", borough: "Queens", ntaCode: "QN44", zipCodes: ["11365", "11366"], lat: 40.7353, lng: -73.7836 },
  { name: "Whitestone", borough: "Queens", ntaCode: "QN49", zipCodes: ["11357"], lat: 40.7926, lng: -73.8099 },
  { name: "College Point", borough: "Queens", ntaCode: "QN50", zipCodes: ["11356"], lat: 40.7868, lng: -73.8439 },
  { name: "Far Rockaway", borough: "Queens", ntaCode: "QN01", zipCodes: ["11690", "11691", "11692", "11693"], lat: 40.5999, lng: -73.7535 },
  { name: "Rockaway Beach", borough: "Queens", ntaCode: "QN01", zipCodes: ["11693", "11694"], lat: 40.5840, lng: -73.8145 },
  { name: "Little Neck", borough: "Queens", ntaCode: "QN46", zipCodes: ["11362", "11363"], lat: 40.7629, lng: -73.7322 },
  { name: "Briarwood", borough: "Queens", ntaCode: "QN12", zipCodes: ["11435"], lat: 40.7098, lng: -73.8151 },
  { name: "Hollis", borough: "Queens", ntaCode: "QN07", zipCodes: ["11423"], lat: 40.7132, lng: -73.7621 },
  { name: "St. Albans", borough: "Queens", ntaCode: "QN10", zipCodes: ["11412", "11434"], lat: 40.6896, lng: -73.7644 },
  { name: "Laurelton", borough: "Queens", ntaCode: "QN10", zipCodes: ["11413"], lat: 40.6742, lng: -73.7487 },

  // ===== BRONX =====
  { name: "Mott Haven", borough: "Bronx", ntaCode: "BX01", zipCodes: ["10451", "10454", "10455"], lat: 40.8090, lng: -73.9214 },
  { name: "Hunts Point", borough: "Bronx", ntaCode: "BX02", zipCodes: ["10459", "10474"], lat: 40.8094, lng: -73.8803 },
  { name: "Melrose", borough: "Bronx", ntaCode: "BX01", zipCodes: ["10451", "10455", "10456"], lat: 40.8215, lng: -73.9137 },
  { name: "Morrisania", borough: "Bronx", ntaCode: "BX05", zipCodes: ["10456"], lat: 40.8290, lng: -73.9069 },
  { name: "Highbridge", borough: "Bronx", ntaCode: "BX09", zipCodes: ["10452"], lat: 40.8382, lng: -73.9267 },
  { name: "Concourse", borough: "Bronx", ntaCode: "BX09", zipCodes: ["10451", "10452", "10456"], lat: 40.8278, lng: -73.9233 },
  { name: "Fordham", borough: "Bronx", ntaCode: "BX06", zipCodes: ["10458", "10468"], lat: 40.8614, lng: -73.8987 },
  { name: "University Heights", borough: "Bronx", ntaCode: "BX06", zipCodes: ["10453", "10468"], lat: 40.8548, lng: -73.9137 },
  { name: "Tremont", borough: "Bronx", ntaCode: "BX06", zipCodes: ["10453", "10457"], lat: 40.8468, lng: -73.9048 },
  { name: "Belmont", borough: "Bronx", ntaCode: "BX06", zipCodes: ["10458"], lat: 40.8534, lng: -73.8899 },
  { name: "Kingsbridge", borough: "Bronx", ntaCode: "BX10", zipCodes: ["10463", "10468"], lat: 40.8827, lng: -73.9022 },
  { name: "Riverdale", borough: "Bronx", ntaCode: "BX13", zipCodes: ["10463", "10471"], lat: 40.8999, lng: -73.9110 },
  { name: "Norwood", borough: "Bronx", ntaCode: "BX10", zipCodes: ["10467", "10468"], lat: 40.8781, lng: -73.8808 },
  { name: "Pelham Bay", borough: "Bronx", ntaCode: "BX22", zipCodes: ["10461", "10464", "10465"], lat: 40.8512, lng: -73.8370 },
  { name: "Throgs Neck", borough: "Bronx", ntaCode: "BX22", zipCodes: ["10461", "10465"], lat: 40.8206, lng: -73.8198 },
  { name: "Morris Park", borough: "Bronx", ntaCode: "BX22", zipCodes: ["10461", "10462"], lat: 40.8507, lng: -73.8545 },
  { name: "Parkchester", borough: "Bronx", ntaCode: "BX17", zipCodes: ["10462"], lat: 40.8393, lng: -73.8601 },
  { name: "Soundview", borough: "Bronx", ntaCode: "BX03", zipCodes: ["10472", "10473"], lat: 40.8256, lng: -73.8665 },
  { name: "Castle Hill", borough: "Bronx", ntaCode: "BX22", zipCodes: ["10473"], lat: 40.8178, lng: -73.8510 },
  { name: "Westchester Square", borough: "Bronx", ntaCode: "BX22", zipCodes: ["10461"], lat: 40.8413, lng: -73.8442 },
  { name: "Co-op City", borough: "Bronx", ntaCode: "BX26", zipCodes: ["10475"], lat: 40.8741, lng: -73.8271 },
  { name: "Wakefield", borough: "Bronx", ntaCode: "BX26", zipCodes: ["10466"], lat: 40.8952, lng: -73.8555 },
  { name: "Williamsbridge", borough: "Bronx", ntaCode: "BX26", zipCodes: ["10467", "10469"], lat: 40.8826, lng: -73.8577 },
  { name: "Eastchester", borough: "Bronx", ntaCode: "BX26", zipCodes: ["10469"], lat: 40.8858, lng: -73.8339 },
  { name: "City Island", borough: "Bronx", ntaCode: "BX22", zipCodes: ["10464"], lat: 40.8468, lng: -73.7872 },
  { name: "South Bronx", borough: "Bronx", ntaCode: "BX01", zipCodes: ["10451", "10454", "10455"], lat: 40.8176, lng: -73.9194 },
  { name: "Longwood", borough: "Bronx", ntaCode: "BX03", zipCodes: ["10459", "10460"], lat: 40.8262, lng: -73.8963 },
  { name: "Claremont", borough: "Bronx", ntaCode: "BX05", zipCodes: ["10456", "10457"], lat: 40.8399, lng: -73.9047 },
  { name: "Mount Hope", borough: "Bronx", ntaCode: "BX06", zipCodes: ["10453", "10457"], lat: 40.8497, lng: -73.9087 },
  { name: "Bedford Park", borough: "Bronx", ntaCode: "BX10", zipCodes: ["10458", "10468"], lat: 40.8700, lng: -73.8886 },

  // ===== STATEN ISLAND =====
  { name: "St. George", borough: "Staten Island", ntaCode: "SI01", zipCodes: ["10301"], lat: 40.6434, lng: -74.0764 },
  { name: "Stapleton", borough: "Staten Island", ntaCode: "SI01", zipCodes: ["10301", "10304"], lat: 40.6266, lng: -74.0753 },
  { name: "Tompkinsville", borough: "Staten Island", ntaCode: "SI01", zipCodes: ["10301", "10304"], lat: 40.6369, lng: -74.0781 },
  { name: "New Brighton", borough: "Staten Island", ntaCode: "SI01", zipCodes: ["10301", "10310"], lat: 40.6431, lng: -74.0908 },
  { name: "Port Richmond", borough: "Staten Island", ntaCode: "SI07", zipCodes: ["10302", "10303"], lat: 40.6348, lng: -74.1357 },
  { name: "West New Brighton", borough: "Staten Island", ntaCode: "SI07", zipCodes: ["10310"], lat: 40.6358, lng: -74.1159 },
  { name: "Mariners Harbor", borough: "Staten Island", ntaCode: "SI07", zipCodes: ["10303"], lat: 40.6389, lng: -74.1570 },
  { name: "Grasmere", borough: "Staten Island", ntaCode: "SI11", zipCodes: ["10305"], lat: 40.6052, lng: -74.0787 },
  { name: "South Beach", borough: "Staten Island", ntaCode: "SI11", zipCodes: ["10305"], lat: 40.5839, lng: -74.0721 },
  { name: "Midland Beach", borough: "Staten Island", ntaCode: "SI11", zipCodes: ["10306"], lat: 40.5737, lng: -74.0864 },
  { name: "New Dorp", borough: "Staten Island", ntaCode: "SI11", zipCodes: ["10306"], lat: 40.5730, lng: -74.1141 },
  { name: "Dongan Hills", borough: "Staten Island", ntaCode: "SI11", zipCodes: ["10305"], lat: 40.5892, lng: -74.0957 },
  { name: "Grant City", borough: "Staten Island", ntaCode: "SI11", zipCodes: ["10306"], lat: 40.5816, lng: -74.1044 },
  { name: "Great Kills", borough: "Staten Island", ntaCode: "SI24", zipCodes: ["10308"], lat: 40.5534, lng: -74.1518 },
  { name: "Eltingville", borough: "Staten Island", ntaCode: "SI24", zipCodes: ["10312"], lat: 40.5447, lng: -74.1640 },
  { name: "Tottenville", borough: "Staten Island", ntaCode: "SI25", zipCodes: ["10307"], lat: 40.5083, lng: -74.2359 },
  { name: "Huguenot", borough: "Staten Island", ntaCode: "SI25", zipCodes: ["10312"], lat: 40.5360, lng: -74.1874 },
  { name: "Annadale", borough: "Staten Island", ntaCode: "SI24", zipCodes: ["10312"], lat: 40.5404, lng: -74.1780 },
  { name: "Woodrow", borough: "Staten Island", ntaCode: "SI25", zipCodes: ["10309"], lat: 40.5314, lng: -74.1977 },
  { name: "Rossville", borough: "Staten Island", ntaCode: "SI25", zipCodes: ["10309"], lat: 40.5497, lng: -74.2132 },
  { name: "Travis", borough: "Staten Island", ntaCode: "SI07", zipCodes: ["10314"], lat: 40.5909, lng: -74.1836 },
  { name: "Todt Hill", borough: "Staten Island", ntaCode: "SI11", zipCodes: ["10314"], lat: 40.5990, lng: -74.1117 },
  { name: "Willowbrook", borough: "Staten Island", ntaCode: "SI07", zipCodes: ["10314"], lat: 40.6035, lng: -74.1387 },
  { name: "Bulls Head", borough: "Staten Island", ntaCode: "SI07", zipCodes: ["10314"], lat: 40.5996, lng: -74.1536 },
  { name: "Westerleigh", borough: "Staten Island", ntaCode: "SI07", zipCodes: ["10314"], lat: 40.6213, lng: -74.1340 },
];

// Build zip-to-neighborhoods lookup for fast access
const _zipMap = new Map<string, Neighborhood[]>();
for (const n of NYC_NEIGHBORHOODS) {
  for (const z of n.zipCodes) {
    const existing = _zipMap.get(z) || [];
    existing.push(n);
    _zipMap.set(z, existing);
  }
}

const _boroughMap = new Map<string, Neighborhood[]>();
for (const n of NYC_NEIGHBORHOODS) {
  const existing = _boroughMap.get(n.borough) || [];
  existing.push(n);
  _boroughMap.set(n.borough, existing);
}

export function getNeighborhoodsByBorough(borough: string): Neighborhood[] {
  return _boroughMap.get(borough) || [];
}

export function getNeighborhoodByZip(zip: string): Neighborhood | null {
  const matches = _zipMap.get(zip);
  return matches?.[0] || null;
}

export function getNeighborhoodNameByZip(zip: string): string | null {
  return getNeighborhoodByZip(zip)?.name || null;
}

export function getZipCodesForNeighborhood(name: string): string[] {
  const n = NYC_NEIGHBORHOODS.find(n => n.name.toLowerCase() === name.toLowerCase());
  return n?.zipCodes || [];
}

export function getZipCodesForNeighborhoods(names: string[]): string[] {
  const zips = new Set<string>();
  for (const name of names) {
    const n = NYC_NEIGHBORHOODS.find(n => n.name.toLowerCase() === name.toLowerCase());
    if (n) n.zipCodes.forEach(z => zips.add(z));
  }
  return Array.from(zips);
}

export function getAllBoroughs(): string[] {
  return ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];
}
