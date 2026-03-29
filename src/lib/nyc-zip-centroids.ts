// ============================================================
// NYC Zip Code Centroids + Haversine Distance
// Lat/Lng for all ~200 NYC zip codes
// Used for comp radius searches
// ============================================================

export interface ZipCentroid {
  zip: string;
  lat: number;
  lng: number;
  borough: string;
}

// Haversine distance in miles between two lat/lng points
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Find all zip codes within a given radius (miles) of a subject zip
export function findZipsWithinRadius(subjectZip: string, radiusMiles: number): { zip: string; distance: number; borough: string }[] {
  const subject = NYC_ZIP_CENTROIDS.find(z => z.zip === subjectZip);
  if (!subject) return [];

  return NYC_ZIP_CENTROIDS
    .map(z => ({
      zip: z.zip,
      distance: haversineDistance(subject.lat, subject.lng, z.lat, z.lng),
      borough: z.borough,
    }))
    .filter(z => z.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);
}

// Get centroid for a zip code
export function getZipCentroid(zip: string): ZipCentroid | null {
  return NYC_ZIP_CENTROIDS.find(z => z.zip === zip) || null;
}

// All ~200 NYC zip codes with approximate centroids
export const NYC_ZIP_CENTROIDS: ZipCentroid[] = [
  // Manhattan (10001-10282)
  { zip: "10001", lat: 40.7506, lng: -73.9971, borough: "Manhattan" },
  { zip: "10002", lat: 40.7157, lng: -73.9863, borough: "Manhattan" },
  { zip: "10003", lat: 40.7317, lng: -73.9893, borough: "Manhattan" },
  { zip: "10004", lat: 40.6988, lng: -74.0384, borough: "Manhattan" },
  { zip: "10005", lat: 40.7069, lng: -74.0089, borough: "Manhattan" },
  { zip: "10006", lat: 40.7094, lng: -74.0131, borough: "Manhattan" },
  { zip: "10007", lat: 40.7135, lng: -74.0078, borough: "Manhattan" },
  { zip: "10009", lat: 40.7265, lng: -73.9793, borough: "Manhattan" },
  { zip: "10010", lat: 40.7390, lng: -73.9826, borough: "Manhattan" },
  { zip: "10011", lat: 40.7418, lng: -74.0002, borough: "Manhattan" },
  { zip: "10012", lat: 40.7258, lng: -73.9981, borough: "Manhattan" },
  { zip: "10013", lat: 40.7208, lng: -74.0047, borough: "Manhattan" },
  { zip: "10014", lat: 40.7338, lng: -74.0054, borough: "Manhattan" },
  { zip: "10016", lat: 40.7459, lng: -73.9781, borough: "Manhattan" },
  { zip: "10017", lat: 40.7527, lng: -73.9728, borough: "Manhattan" },
  { zip: "10018", lat: 40.7549, lng: -73.9930, borough: "Manhattan" },
  { zip: "10019", lat: 40.7654, lng: -73.9857, borough: "Manhattan" },
  { zip: "10020", lat: 40.7587, lng: -73.9787, borough: "Manhattan" },
  { zip: "10021", lat: 40.7694, lng: -73.9585, borough: "Manhattan" },
  { zip: "10022", lat: 40.7584, lng: -73.9674, borough: "Manhattan" },
  { zip: "10023", lat: 40.7764, lng: -73.9825, borough: "Manhattan" },
  { zip: "10024", lat: 40.7866, lng: -73.9747, borough: "Manhattan" },
  { zip: "10025", lat: 40.7979, lng: -73.9668, borough: "Manhattan" },
  { zip: "10026", lat: 40.8026, lng: -73.9530, borough: "Manhattan" },
  { zip: "10027", lat: 40.8113, lng: -73.9534, borough: "Manhattan" },
  { zip: "10028", lat: 40.7765, lng: -73.9533, borough: "Manhattan" },
  { zip: "10029", lat: 40.7917, lng: -73.9438, borough: "Manhattan" },
  { zip: "10030", lat: 40.8184, lng: -73.9431, borough: "Manhattan" },
  { zip: "10031", lat: 40.8246, lng: -73.9497, borough: "Manhattan" },
  { zip: "10032", lat: 40.8383, lng: -73.9427, borough: "Manhattan" },
  { zip: "10033", lat: 40.8498, lng: -73.9341, borough: "Manhattan" },
  { zip: "10034", lat: 40.8673, lng: -73.9230, borough: "Manhattan" },
  { zip: "10035", lat: 40.7955, lng: -73.9299, borough: "Manhattan" },
  { zip: "10036", lat: 40.7592, lng: -73.9901, borough: "Manhattan" },
  { zip: "10037", lat: 40.8131, lng: -73.9378, borough: "Manhattan" },
  { zip: "10038", lat: 40.7089, lng: -74.0018, borough: "Manhattan" },
  { zip: "10039", lat: 40.8261, lng: -73.9369, borough: "Manhattan" },
  { zip: "10040", lat: 40.8583, lng: -73.9297, borough: "Manhattan" },
  { zip: "10044", lat: 40.7620, lng: -73.9510, borough: "Manhattan" },
  { zip: "10065", lat: 40.7645, lng: -73.9632, borough: "Manhattan" },
  { zip: "10069", lat: 40.7753, lng: -73.9908, borough: "Manhattan" },
  { zip: "10075", lat: 40.7732, lng: -73.9560, borough: "Manhattan" },
  { zip: "10128", lat: 40.7815, lng: -73.9518, borough: "Manhattan" },
  { zip: "10280", lat: 40.7099, lng: -74.0165, borough: "Manhattan" },
  { zip: "10282", lat: 40.7169, lng: -74.0147, borough: "Manhattan" },

  // Bronx (10451-10475)
  { zip: "10451", lat: 40.8200, lng: -73.9235, borough: "Bronx" },
  { zip: "10452", lat: 40.8377, lng: -73.9237, borough: "Bronx" },
  { zip: "10453", lat: 40.8527, lng: -73.9128, borough: "Bronx" },
  { zip: "10454", lat: 40.8090, lng: -73.9182, borough: "Bronx" },
  { zip: "10455", lat: 40.8148, lng: -73.9083, borough: "Bronx" },
  { zip: "10456", lat: 40.8313, lng: -73.9085, borough: "Bronx" },
  { zip: "10457", lat: 40.8475, lng: -73.8993, borough: "Bronx" },
  { zip: "10458", lat: 40.8618, lng: -73.8886, borough: "Bronx" },
  { zip: "10459", lat: 40.8258, lng: -73.8944, borough: "Bronx" },
  { zip: "10460", lat: 40.8415, lng: -73.8791, borough: "Bronx" },
  { zip: "10461", lat: 40.8450, lng: -73.8470, borough: "Bronx" },
  { zip: "10462", lat: 40.8420, lng: -73.8607, borough: "Bronx" },
  { zip: "10463", lat: 40.8794, lng: -73.9058, borough: "Bronx" },
  { zip: "10464", lat: 40.8676, lng: -73.7997, borough: "Bronx" },
  { zip: "10465", lat: 40.8225, lng: -73.8218, borough: "Bronx" },
  { zip: "10466", lat: 40.8897, lng: -73.8470, borough: "Bronx" },
  { zip: "10467", lat: 40.8711, lng: -73.8714, borough: "Bronx" },
  { zip: "10468", lat: 40.8692, lng: -73.8996, borough: "Bronx" },
  { zip: "10469", lat: 40.8695, lng: -73.8539, borough: "Bronx" },
  { zip: "10470", lat: 40.8952, lng: -73.8668, borough: "Bronx" },
  { zip: "10471", lat: 40.8986, lng: -73.8975, borough: "Bronx" },
  { zip: "10472", lat: 40.8296, lng: -73.8693, borough: "Bronx" },
  { zip: "10473", lat: 40.8194, lng: -73.8588, borough: "Bronx" },
  { zip: "10474", lat: 40.8100, lng: -73.8862, borough: "Bronx" },
  { zip: "10475", lat: 40.8764, lng: -73.8246, borough: "Bronx" },

  // Brooklyn (11201-11256)
  { zip: "11201", lat: 40.6936, lng: -73.9905, borough: "Brooklyn" },
  { zip: "11203", lat: 40.6496, lng: -73.9369, borough: "Brooklyn" },
  { zip: "11204", lat: 40.6193, lng: -73.9846, borough: "Brooklyn" },
  { zip: "11205", lat: 40.6948, lng: -73.9661, borough: "Brooklyn" },
  { zip: "11206", lat: 40.7017, lng: -73.9424, borough: "Brooklyn" },
  { zip: "11207", lat: 40.6710, lng: -73.8949, borough: "Brooklyn" },
  { zip: "11208", lat: 40.6694, lng: -73.8717, borough: "Brooklyn" },
  { zip: "11209", lat: 40.6214, lng: -74.0305, borough: "Brooklyn" },
  { zip: "11210", lat: 40.6289, lng: -73.9467, borough: "Brooklyn" },
  { zip: "11211", lat: 40.7128, lng: -73.9535, borough: "Brooklyn" },
  { zip: "11212", lat: 40.6631, lng: -73.9130, borough: "Brooklyn" },
  { zip: "11213", lat: 40.6710, lng: -73.9350, borough: "Brooklyn" },
  { zip: "11214", lat: 40.5989, lng: -73.9963, borough: "Brooklyn" },
  { zip: "11215", lat: 40.6711, lng: -73.9857, borough: "Brooklyn" },
  { zip: "11216", lat: 40.6810, lng: -73.9494, borough: "Brooklyn" },
  { zip: "11217", lat: 40.6822, lng: -73.9782, borough: "Brooklyn" },
  { zip: "11218", lat: 40.6436, lng: -73.9770, borough: "Brooklyn" },
  { zip: "11219", lat: 40.6311, lng: -73.9967, borough: "Brooklyn" },
  { zip: "11220", lat: 40.6399, lng: -74.0173, borough: "Brooklyn" },
  { zip: "11221", lat: 40.6913, lng: -73.9277, borough: "Brooklyn" },
  { zip: "11222", lat: 40.7272, lng: -73.9484, borough: "Brooklyn" },
  { zip: "11223", lat: 40.5972, lng: -73.9727, borough: "Brooklyn" },
  { zip: "11224", lat: 40.5772, lng: -73.9880, borough: "Brooklyn" },
  { zip: "11225", lat: 40.6631, lng: -73.9545, borough: "Brooklyn" },
  { zip: "11226", lat: 40.6451, lng: -73.9570, borough: "Brooklyn" },
  { zip: "11228", lat: 40.6161, lng: -74.0132, borough: "Brooklyn" },
  { zip: "11229", lat: 40.6017, lng: -73.9443, borough: "Brooklyn" },
  { zip: "11230", lat: 40.6210, lng: -73.9655, borough: "Brooklyn" },
  { zip: "11231", lat: 40.6780, lng: -74.0003, borough: "Brooklyn" },
  { zip: "11232", lat: 40.6554, lng: -74.0036, borough: "Brooklyn" },
  { zip: "11233", lat: 40.6781, lng: -73.9197, borough: "Brooklyn" },
  { zip: "11234", lat: 40.6122, lng: -73.9201, borough: "Brooklyn" },
  { zip: "11235", lat: 40.5843, lng: -73.9486, borough: "Brooklyn" },
  { zip: "11236", lat: 40.6395, lng: -73.9016, borough: "Brooklyn" },
  { zip: "11237", lat: 40.7038, lng: -73.9210, borough: "Brooklyn" },
  { zip: "11238", lat: 40.6819, lng: -73.9631, borough: "Brooklyn" },
  { zip: "11239", lat: 40.6482, lng: -73.8797, borough: "Brooklyn" },
  { zip: "11249", lat: 40.7190, lng: -73.9614, borough: "Brooklyn" },

  // Queens (11004-11697)
  { zip: "11004", lat: 40.7417, lng: -73.7114, borough: "Queens" },
  { zip: "11005", lat: 40.7560, lng: -73.7134, borough: "Queens" },
  { zip: "11101", lat: 40.7477, lng: -73.9401, borough: "Queens" },
  { zip: "11102", lat: 40.7711, lng: -73.9242, borough: "Queens" },
  { zip: "11103", lat: 40.7629, lng: -73.9128, borough: "Queens" },
  { zip: "11104", lat: 40.7443, lng: -73.9207, borough: "Queens" },
  { zip: "11105", lat: 40.7786, lng: -73.9068, borough: "Queens" },
  { zip: "11106", lat: 40.7607, lng: -73.9307, borough: "Queens" },
  { zip: "11354", lat: 40.7682, lng: -73.8275, borough: "Queens" },
  { zip: "11355", lat: 40.7518, lng: -73.8207, borough: "Queens" },
  { zip: "11356", lat: 40.7848, lng: -73.8410, borough: "Queens" },
  { zip: "11357", lat: 40.7867, lng: -73.8108, borough: "Queens" },
  { zip: "11358", lat: 40.7605, lng: -73.7961, borough: "Queens" },
  { zip: "11359", lat: 40.7908, lng: -73.7766, borough: "Queens" },
  { zip: "11360", lat: 40.7818, lng: -73.7810, borough: "Queens" },
  { zip: "11361", lat: 40.7637, lng: -73.7718, borough: "Queens" },
  { zip: "11362", lat: 40.7582, lng: -73.7368, borough: "Queens" },
  { zip: "11363", lat: 40.7729, lng: -73.7466, borough: "Queens" },
  { zip: "11364", lat: 40.7452, lng: -73.7564, borough: "Queens" },
  { zip: "11365", lat: 40.7393, lng: -73.7930, borough: "Queens" },
  { zip: "11366", lat: 40.7273, lng: -73.7836, borough: "Queens" },
  { zip: "11367", lat: 40.7284, lng: -73.8210, borough: "Queens" },
  { zip: "11368", lat: 40.7495, lng: -73.8520, borough: "Queens" },
  { zip: "11369", lat: 40.7630, lng: -73.8759, borough: "Queens" },
  { zip: "11370", lat: 40.7648, lng: -73.8916, borough: "Queens" },
  { zip: "11372", lat: 40.7511, lng: -73.8834, borough: "Queens" },
  { zip: "11373", lat: 40.7388, lng: -73.8786, borough: "Queens" },
  { zip: "11374", lat: 40.7259, lng: -73.8614, borough: "Queens" },
  { zip: "11375", lat: 40.7202, lng: -73.8445, borough: "Queens" },
  { zip: "11377", lat: 40.7445, lng: -73.9057, borough: "Queens" },
  { zip: "11378", lat: 40.7230, lng: -73.9089, borough: "Queens" },
  { zip: "11379", lat: 40.7162, lng: -73.8795, borough: "Queens" },
  { zip: "11385", lat: 40.7003, lng: -73.8895, borough: "Queens" },
  { zip: "11411", lat: 40.6933, lng: -73.7366, borough: "Queens" },
  { zip: "11412", lat: 40.6970, lng: -73.7580, borough: "Queens" },
  { zip: "11413", lat: 40.6723, lng: -73.7512, borough: "Queens" },
  { zip: "11414", lat: 40.6579, lng: -73.8420, borough: "Queens" },
  { zip: "11415", lat: 40.7081, lng: -73.8286, borough: "Queens" },
  { zip: "11416", lat: 40.6841, lng: -73.8490, borough: "Queens" },
  { zip: "11417", lat: 40.6761, lng: -73.8443, borough: "Queens" },
  { zip: "11418", lat: 40.7001, lng: -73.8362, borough: "Queens" },
  { zip: "11419", lat: 40.6884, lng: -73.8227, borough: "Queens" },
  { zip: "11420", lat: 40.6736, lng: -73.8186, borough: "Queens" },
  { zip: "11421", lat: 40.6941, lng: -73.8582, borough: "Queens" },
  { zip: "11422", lat: 40.6604, lng: -73.7358, borough: "Queens" },
  { zip: "11423", lat: 40.7155, lng: -73.7685, borough: "Queens" },
  { zip: "11426", lat: 40.7358, lng: -73.7222, borough: "Queens" },
  { zip: "11427", lat: 40.7293, lng: -73.7447, borough: "Queens" },
  { zip: "11428", lat: 40.7214, lng: -73.7410, borough: "Queens" },
  { zip: "11429", lat: 40.7106, lng: -73.7393, borough: "Queens" },
  { zip: "11430", lat: 40.6452, lng: -73.7863, borough: "Queens" },
  { zip: "11432", lat: 40.7161, lng: -73.7931, borough: "Queens" },
  { zip: "11433", lat: 40.6971, lng: -73.7878, borough: "Queens" },
  { zip: "11434", lat: 40.6765, lng: -73.7756, borough: "Queens" },
  { zip: "11435", lat: 40.7010, lng: -73.8098, borough: "Queens" },
  { zip: "11436", lat: 40.6756, lng: -73.7969, borough: "Queens" },
  { zip: "11691", lat: 40.5987, lng: -73.7581, borough: "Queens" },
  { zip: "11692", lat: 40.5934, lng: -73.7920, borough: "Queens" },
  { zip: "11693", lat: 40.5888, lng: -73.8115, borough: "Queens" },
  { zip: "11694", lat: 40.5763, lng: -73.8450, borough: "Queens" },
  { zip: "11697", lat: 40.5570, lng: -73.8722, borough: "Queens" },

  // Staten Island (10301-10314)
  { zip: "10301", lat: 40.6432, lng: -74.0773, borough: "Staten Island" },
  { zip: "10302", lat: 40.6321, lng: -74.1376, borough: "Staten Island" },
  { zip: "10303", lat: 40.6315, lng: -74.1582, borough: "Staten Island" },
  { zip: "10304", lat: 40.6071, lng: -74.0928, borough: "Staten Island" },
  { zip: "10305", lat: 40.5964, lng: -74.0755, borough: "Staten Island" },
  { zip: "10306", lat: 40.5698, lng: -74.1105, borough: "Staten Island" },
  { zip: "10307", lat: 40.5099, lng: -74.2436, borough: "Staten Island" },
  { zip: "10308", lat: 40.5511, lng: -74.1497, borough: "Staten Island" },
  { zip: "10309", lat: 40.5296, lng: -74.2195, borough: "Staten Island" },
  { zip: "10310", lat: 40.6329, lng: -74.1166, borough: "Staten Island" },
  { zip: "10311", lat: 40.6050, lng: -74.1798, borough: "Staten Island" },
  { zip: "10312", lat: 40.5464, lng: -74.1802, borough: "Staten Island" },
  { zip: "10314", lat: 40.5964, lng: -74.1635, borough: "Staten Island" },
];
