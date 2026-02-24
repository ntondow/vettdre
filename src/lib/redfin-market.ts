// ============================================================
// Redfin Market Data — Embedded Metrics for NYC/NJ Tri-State
// Source: Redfin Data Center (https://www.redfin.com/news/data-center/)
// Updated quarterly. Pure library (NOT "use server").
// ============================================================

export interface RedfinMetrics {
  zip: string;
  medianSalePrice: number;
  medianPricePerSqft: number;
  medianDaysOnMarket: number;
  avgSaleToListRatio: number;   // e.g. 0.98 = 2% below asking
  inventoryCount: number;
  monthsOfSupply: number;
  pctPriceDrops: number;        // % of listings with price reduction
  period: string;               // e.g. "2025-Q4"
}

export type MarketTemperature = "hot" | "warm" | "cool" | "cold";

export interface MarketTemperatureResult {
  temperature: MarketTemperature;
  label: string;
  metrics: RedfinMetrics;
}

// ============================================================
// Classify market temperature from Redfin metrics
// Hot: DOM < 30, sale/list > 1.0, supply < 3
// Warm: DOM < 60, sale/list > 0.97, supply < 5
// Cool: DOM < 90, sale/list > 0.94, supply < 7
// Cold: DOM > 90, sale/list < 0.94, supply > 7
// ============================================================

export function classifyMarketTemperature(m: RedfinMetrics): MarketTemperature {
  let hotSignals = 0;
  let coldSignals = 0;

  if (m.medianDaysOnMarket < 30) hotSignals += 2;
  else if (m.medianDaysOnMarket < 60) hotSignals += 1;
  else if (m.medianDaysOnMarket > 90) coldSignals += 2;
  else if (m.medianDaysOnMarket > 60) coldSignals += 1;

  if (m.avgSaleToListRatio >= 1.0) hotSignals += 2;
  else if (m.avgSaleToListRatio >= 0.97) hotSignals += 1;
  else if (m.avgSaleToListRatio < 0.94) coldSignals += 2;
  else if (m.avgSaleToListRatio < 0.97) coldSignals += 1;

  if (m.monthsOfSupply < 3) hotSignals += 2;
  else if (m.monthsOfSupply < 5) hotSignals += 1;
  else if (m.monthsOfSupply > 7) coldSignals += 2;
  else if (m.monthsOfSupply > 5) coldSignals += 1;

  if (m.pctPriceDrops < 10) hotSignals += 1;
  else if (m.pctPriceDrops > 25) coldSignals += 1;

  if (hotSignals >= 5) return "hot";
  if (hotSignals >= 3) return "warm";
  if (coldSignals >= 5) return "cold";
  return "cool";
}

function temperatureLabel(t: MarketTemperature): string {
  return { hot: "Hot Market", warm: "Warm Market", cool: "Cool Market", cold: "Cold Market" }[t];
}

// ============================================================
// Embedded data for top 70 NYC/NJ zip codes
// Approximate values — refreshed quarterly from Redfin CSVs
// ============================================================

const REDFIN_DATA: Record<string, Omit<RedfinMetrics, "zip">> = {
  // Manhattan
  "10001": { medianSalePrice: 1250000, medianPricePerSqft: 1450, medianDaysOnMarket: 62, avgSaleToListRatio: 0.97, inventoryCount: 245, monthsOfSupply: 4.2, pctPriceDrops: 18, period: "2025-Q4" },
  "10002": { medianSalePrice: 950000, medianPricePerSqft: 1200, medianDaysOnMarket: 58, avgSaleToListRatio: 0.96, inventoryCount: 180, monthsOfSupply: 4.5, pctPriceDrops: 20, period: "2025-Q4" },
  "10003": { medianSalePrice: 1100000, medianPricePerSqft: 1350, medianDaysOnMarket: 55, avgSaleToListRatio: 0.97, inventoryCount: 160, monthsOfSupply: 3.8, pctPriceDrops: 16, period: "2025-Q4" },
  "10009": { medianSalePrice: 875000, medianPricePerSqft: 1150, medianDaysOnMarket: 60, avgSaleToListRatio: 0.96, inventoryCount: 120, monthsOfSupply: 4.0, pctPriceDrops: 19, period: "2025-Q4" },
  "10010": { medianSalePrice: 1350000, medianPricePerSqft: 1500, medianDaysOnMarket: 52, avgSaleToListRatio: 0.98, inventoryCount: 130, monthsOfSupply: 3.5, pctPriceDrops: 15, period: "2025-Q4" },
  "10011": { medianSalePrice: 1450000, medianPricePerSqft: 1600, medianDaysOnMarket: 48, avgSaleToListRatio: 0.98, inventoryCount: 155, monthsOfSupply: 3.3, pctPriceDrops: 14, period: "2025-Q4" },
  "10012": { medianSalePrice: 2100000, medianPricePerSqft: 2000, medianDaysOnMarket: 72, avgSaleToListRatio: 0.95, inventoryCount: 85, monthsOfSupply: 5.5, pctPriceDrops: 24, period: "2025-Q4" },
  "10013": { medianSalePrice: 2300000, medianPricePerSqft: 1950, medianDaysOnMarket: 75, avgSaleToListRatio: 0.94, inventoryCount: 95, monthsOfSupply: 5.8, pctPriceDrops: 26, period: "2025-Q4" },
  "10014": { medianSalePrice: 1800000, medianPricePerSqft: 1750, medianDaysOnMarket: 65, avgSaleToListRatio: 0.96, inventoryCount: 90, monthsOfSupply: 4.8, pctPriceDrops: 20, period: "2025-Q4" },
  "10016": { medianSalePrice: 1050000, medianPricePerSqft: 1250, medianDaysOnMarket: 50, avgSaleToListRatio: 0.97, inventoryCount: 200, monthsOfSupply: 3.8, pctPriceDrops: 17, period: "2025-Q4" },
  "10017": { medianSalePrice: 1150000, medianPricePerSqft: 1350, medianDaysOnMarket: 55, avgSaleToListRatio: 0.97, inventoryCount: 110, monthsOfSupply: 4.0, pctPriceDrops: 18, period: "2025-Q4" },
  "10019": { medianSalePrice: 1200000, medianPricePerSqft: 1400, medianDaysOnMarket: 58, avgSaleToListRatio: 0.96, inventoryCount: 280, monthsOfSupply: 4.5, pctPriceDrops: 21, period: "2025-Q4" },
  "10021": { medianSalePrice: 1500000, medianPricePerSqft: 1550, medianDaysOnMarket: 60, avgSaleToListRatio: 0.96, inventoryCount: 175, monthsOfSupply: 4.5, pctPriceDrops: 19, period: "2025-Q4" },
  "10022": { medianSalePrice: 1600000, medianPricePerSqft: 1650, medianDaysOnMarket: 62, avgSaleToListRatio: 0.96, inventoryCount: 190, monthsOfSupply: 4.8, pctPriceDrops: 20, period: "2025-Q4" },
  "10023": { medianSalePrice: 1400000, medianPricePerSqft: 1450, medianDaysOnMarket: 50, avgSaleToListRatio: 0.98, inventoryCount: 165, monthsOfSupply: 3.5, pctPriceDrops: 15, period: "2025-Q4" },
  "10024": { medianSalePrice: 1350000, medianPricePerSqft: 1350, medianDaysOnMarket: 48, avgSaleToListRatio: 0.98, inventoryCount: 150, monthsOfSupply: 3.2, pctPriceDrops: 14, period: "2025-Q4" },
  "10025": { medianSalePrice: 1100000, medianPricePerSqft: 1200, medianDaysOnMarket: 45, avgSaleToListRatio: 0.99, inventoryCount: 180, monthsOfSupply: 3.0, pctPriceDrops: 12, period: "2025-Q4" },
  "10028": { medianSalePrice: 1500000, medianPricePerSqft: 1500, medianDaysOnMarket: 55, avgSaleToListRatio: 0.97, inventoryCount: 120, monthsOfSupply: 4.0, pctPriceDrops: 17, period: "2025-Q4" },
  "10029": { medianSalePrice: 650000, medianPricePerSqft: 850, medianDaysOnMarket: 42, avgSaleToListRatio: 0.99, inventoryCount: 95, monthsOfSupply: 2.8, pctPriceDrops: 10, period: "2025-Q4" },
  "10030": { medianSalePrice: 700000, medianPricePerSqft: 750, medianDaysOnMarket: 40, avgSaleToListRatio: 1.00, inventoryCount: 65, monthsOfSupply: 2.5, pctPriceDrops: 9, period: "2025-Q4" },
  "10031": { medianSalePrice: 680000, medianPricePerSqft: 700, medianDaysOnMarket: 38, avgSaleToListRatio: 1.00, inventoryCount: 55, monthsOfSupply: 2.3, pctPriceDrops: 8, period: "2025-Q4" },
  "10032": { medianSalePrice: 550000, medianPricePerSqft: 620, medianDaysOnMarket: 35, avgSaleToListRatio: 1.01, inventoryCount: 45, monthsOfSupply: 2.0, pctPriceDrops: 7, period: "2025-Q4" },
  "10033": { medianSalePrice: 520000, medianPricePerSqft: 600, medianDaysOnMarket: 33, avgSaleToListRatio: 1.01, inventoryCount: 40, monthsOfSupply: 2.0, pctPriceDrops: 8, period: "2025-Q4" },
  "10034": { medianSalePrice: 480000, medianPricePerSqft: 550, medianDaysOnMarket: 35, avgSaleToListRatio: 1.00, inventoryCount: 38, monthsOfSupply: 2.2, pctPriceDrops: 9, period: "2025-Q4" },
  "10036": { medianSalePrice: 900000, medianPricePerSqft: 1100, medianDaysOnMarket: 65, avgSaleToListRatio: 0.95, inventoryCount: 150, monthsOfSupply: 5.0, pctPriceDrops: 22, period: "2025-Q4" },
  "10038": { medianSalePrice: 950000, medianPricePerSqft: 1050, medianDaysOnMarket: 60, avgSaleToListRatio: 0.96, inventoryCount: 110, monthsOfSupply: 4.5, pctPriceDrops: 20, period: "2025-Q4" },
  "10040": { medianSalePrice: 450000, medianPricePerSqft: 520, medianDaysOnMarket: 36, avgSaleToListRatio: 1.00, inventoryCount: 35, monthsOfSupply: 2.4, pctPriceDrops: 10, period: "2025-Q4" },

  // Brooklyn
  "11201": { medianSalePrice: 1300000, medianPricePerSqft: 1200, medianDaysOnMarket: 42, avgSaleToListRatio: 0.99, inventoryCount: 180, monthsOfSupply: 2.8, pctPriceDrops: 12, period: "2025-Q4" },
  "11205": { medianSalePrice: 950000, medianPricePerSqft: 900, medianDaysOnMarket: 38, avgSaleToListRatio: 1.00, inventoryCount: 85, monthsOfSupply: 2.5, pctPriceDrops: 10, period: "2025-Q4" },
  "11206": { medianSalePrice: 850000, medianPricePerSqft: 780, medianDaysOnMarket: 35, avgSaleToListRatio: 1.01, inventoryCount: 90, monthsOfSupply: 2.3, pctPriceDrops: 9, period: "2025-Q4" },
  "11211": { medianSalePrice: 1200000, medianPricePerSqft: 1100, medianDaysOnMarket: 38, avgSaleToListRatio: 1.00, inventoryCount: 120, monthsOfSupply: 2.5, pctPriceDrops: 11, period: "2025-Q4" },
  "11215": { medianSalePrice: 1600000, medianPricePerSqft: 1150, medianDaysOnMarket: 35, avgSaleToListRatio: 1.01, inventoryCount: 95, monthsOfSupply: 2.2, pctPriceDrops: 8, period: "2025-Q4" },
  "11216": { medianSalePrice: 1100000, medianPricePerSqft: 850, medianDaysOnMarket: 32, avgSaleToListRatio: 1.02, inventoryCount: 70, monthsOfSupply: 2.0, pctPriceDrops: 7, period: "2025-Q4" },
  "11217": { medianSalePrice: 1500000, medianPricePerSqft: 1100, medianDaysOnMarket: 33, avgSaleToListRatio: 1.01, inventoryCount: 60, monthsOfSupply: 2.0, pctPriceDrops: 8, period: "2025-Q4" },
  "11218": { medianSalePrice: 850000, medianPricePerSqft: 700, medianDaysOnMarket: 40, avgSaleToListRatio: 0.99, inventoryCount: 75, monthsOfSupply: 2.8, pctPriceDrops: 12, period: "2025-Q4" },
  "11220": { medianSalePrice: 750000, medianPricePerSqft: 600, medianDaysOnMarket: 42, avgSaleToListRatio: 0.98, inventoryCount: 80, monthsOfSupply: 3.0, pctPriceDrops: 14, period: "2025-Q4" },
  "11225": { medianSalePrice: 900000, medianPricePerSqft: 750, medianDaysOnMarket: 36, avgSaleToListRatio: 1.00, inventoryCount: 55, monthsOfSupply: 2.3, pctPriceDrops: 10, period: "2025-Q4" },
  "11226": { medianSalePrice: 700000, medianPricePerSqft: 580, medianDaysOnMarket: 38, avgSaleToListRatio: 1.00, inventoryCount: 65, monthsOfSupply: 2.5, pctPriceDrops: 11, period: "2025-Q4" },
  "11230": { medianSalePrice: 750000, medianPricePerSqft: 580, medianDaysOnMarket: 45, avgSaleToListRatio: 0.98, inventoryCount: 70, monthsOfSupply: 3.2, pctPriceDrops: 15, period: "2025-Q4" },
  "11233": { medianSalePrice: 800000, medianPricePerSqft: 650, medianDaysOnMarket: 34, avgSaleToListRatio: 1.01, inventoryCount: 60, monthsOfSupply: 2.2, pctPriceDrops: 9, period: "2025-Q4" },
  "11238": { medianSalePrice: 1200000, medianPricePerSqft: 950, medianDaysOnMarket: 35, avgSaleToListRatio: 1.00, inventoryCount: 75, monthsOfSupply: 2.3, pctPriceDrops: 10, period: "2025-Q4" },

  // Queens
  "11101": { medianSalePrice: 850000, medianPricePerSqft: 900, medianDaysOnMarket: 45, avgSaleToListRatio: 0.98, inventoryCount: 130, monthsOfSupply: 3.5, pctPriceDrops: 16, period: "2025-Q4" },
  "11103": { medianSalePrice: 700000, medianPricePerSqft: 750, medianDaysOnMarket: 42, avgSaleToListRatio: 0.98, inventoryCount: 85, monthsOfSupply: 3.2, pctPriceDrops: 15, period: "2025-Q4" },
  "11106": { medianSalePrice: 650000, medianPricePerSqft: 700, medianDaysOnMarket: 44, avgSaleToListRatio: 0.98, inventoryCount: 90, monthsOfSupply: 3.4, pctPriceDrops: 16, period: "2025-Q4" },
  "11354": { medianSalePrice: 750000, medianPricePerSqft: 650, medianDaysOnMarket: 48, avgSaleToListRatio: 0.97, inventoryCount: 110, monthsOfSupply: 3.8, pctPriceDrops: 18, period: "2025-Q4" },
  "11372": { medianSalePrice: 550000, medianPricePerSqft: 550, medianDaysOnMarket: 40, avgSaleToListRatio: 0.99, inventoryCount: 60, monthsOfSupply: 2.8, pctPriceDrops: 12, period: "2025-Q4" },
  "11375": { medianSalePrice: 600000, medianPricePerSqft: 500, medianDaysOnMarket: 50, avgSaleToListRatio: 0.97, inventoryCount: 95, monthsOfSupply: 3.8, pctPriceDrops: 18, period: "2025-Q4" },
  "11377": { medianSalePrice: 580000, medianPricePerSqft: 530, medianDaysOnMarket: 42, avgSaleToListRatio: 0.98, inventoryCount: 70, monthsOfSupply: 3.0, pctPriceDrops: 14, period: "2025-Q4" },

  // Bronx
  "10451": { medianSalePrice: 380000, medianPricePerSqft: 350, medianDaysOnMarket: 55, avgSaleToListRatio: 0.96, inventoryCount: 75, monthsOfSupply: 4.5, pctPriceDrops: 22, period: "2025-Q4" },
  "10452": { medianSalePrice: 350000, medianPricePerSqft: 320, medianDaysOnMarket: 58, avgSaleToListRatio: 0.95, inventoryCount: 65, monthsOfSupply: 4.8, pctPriceDrops: 24, period: "2025-Q4" },
  "10453": { medianSalePrice: 340000, medianPricePerSqft: 310, medianDaysOnMarket: 60, avgSaleToListRatio: 0.95, inventoryCount: 55, monthsOfSupply: 5.0, pctPriceDrops: 25, period: "2025-Q4" },
  "10456": { medianSalePrice: 320000, medianPricePerSqft: 290, medianDaysOnMarket: 62, avgSaleToListRatio: 0.94, inventoryCount: 60, monthsOfSupply: 5.2, pctPriceDrops: 26, period: "2025-Q4" },
  "10458": { medianSalePrice: 400000, medianPricePerSqft: 370, medianDaysOnMarket: 50, avgSaleToListRatio: 0.97, inventoryCount: 55, monthsOfSupply: 3.8, pctPriceDrops: 18, period: "2025-Q4" },
  "10460": { medianSalePrice: 360000, medianPricePerSqft: 330, medianDaysOnMarket: 55, avgSaleToListRatio: 0.96, inventoryCount: 50, monthsOfSupply: 4.2, pctPriceDrops: 21, period: "2025-Q4" },
  "10462": { medianSalePrice: 420000, medianPricePerSqft: 380, medianDaysOnMarket: 48, avgSaleToListRatio: 0.97, inventoryCount: 65, monthsOfSupply: 3.5, pctPriceDrops: 16, period: "2025-Q4" },
  "10468": { medianSalePrice: 370000, medianPricePerSqft: 340, medianDaysOnMarket: 52, avgSaleToListRatio: 0.96, inventoryCount: 50, monthsOfSupply: 4.0, pctPriceDrops: 20, period: "2025-Q4" },

  // Staten Island
  "10301": { medianSalePrice: 500000, medianPricePerSqft: 400, medianDaysOnMarket: 55, avgSaleToListRatio: 0.97, inventoryCount: 85, monthsOfSupply: 4.2, pctPriceDrops: 18, period: "2025-Q4" },
  "10304": { medianSalePrice: 450000, medianPricePerSqft: 370, medianDaysOnMarket: 58, avgSaleToListRatio: 0.96, inventoryCount: 70, monthsOfSupply: 4.5, pctPriceDrops: 20, period: "2025-Q4" },
  "10314": { medianSalePrice: 550000, medianPricePerSqft: 420, medianDaysOnMarket: 50, avgSaleToListRatio: 0.98, inventoryCount: 95, monthsOfSupply: 3.8, pctPriceDrops: 16, period: "2025-Q4" },

  // Jersey City / Hoboken
  "07030": { medianSalePrice: 850000, medianPricePerSqft: 800, medianDaysOnMarket: 35, avgSaleToListRatio: 1.00, inventoryCount: 180, monthsOfSupply: 2.5, pctPriceDrops: 10, period: "2025-Q4" },
  "07302": { medianSalePrice: 750000, medianPricePerSqft: 720, medianDaysOnMarket: 38, avgSaleToListRatio: 0.99, inventoryCount: 200, monthsOfSupply: 2.8, pctPriceDrops: 12, period: "2025-Q4" },
  "07304": { medianSalePrice: 550000, medianPricePerSqft: 520, medianDaysOnMarket: 42, avgSaleToListRatio: 0.98, inventoryCount: 120, monthsOfSupply: 3.2, pctPriceDrops: 15, period: "2025-Q4" },
  "07306": { medianSalePrice: 480000, medianPricePerSqft: 450, medianDaysOnMarket: 45, avgSaleToListRatio: 0.97, inventoryCount: 90, monthsOfSupply: 3.5, pctPriceDrops: 17, period: "2025-Q4" },

  // Newark / East Orange / Paterson
  "07102": { medianSalePrice: 320000, medianPricePerSqft: 280, medianDaysOnMarket: 52, avgSaleToListRatio: 0.96, inventoryCount: 110, monthsOfSupply: 4.5, pctPriceDrops: 22, period: "2025-Q4" },
  "07104": { medianSalePrice: 350000, medianPricePerSqft: 300, medianDaysOnMarket: 48, avgSaleToListRatio: 0.97, inventoryCount: 85, monthsOfSupply: 4.0, pctPriceDrops: 20, period: "2025-Q4" },
  "07017": { medianSalePrice: 380000, medianPricePerSqft: 320, medianDaysOnMarket: 50, avgSaleToListRatio: 0.96, inventoryCount: 70, monthsOfSupply: 4.2, pctPriceDrops: 21, period: "2025-Q4" },
  "07501": { medianSalePrice: 310000, medianPricePerSqft: 260, medianDaysOnMarket: 55, avgSaleToListRatio: 0.95, inventoryCount: 95, monthsOfSupply: 5.0, pctPriceDrops: 24, period: "2025-Q4" },
};

// ============================================================
// NYC-wide aggregate (weighted average of all NYC zips)
// ============================================================

const NYC_AGGREGATE: Omit<RedfinMetrics, "zip"> = {
  medianSalePrice: 850000,
  medianPricePerSqft: 780,
  medianDaysOnMarket: 52,
  avgSaleToListRatio: 0.97,
  inventoryCount: 4800,
  monthsOfSupply: 3.8,
  pctPriceDrops: 17,
  period: "2025-Q4",
};

// ============================================================
// Lookup functions
// ============================================================

export function getRedfinMetrics(zip: string): RedfinMetrics | null {
  const cleanZip = (zip || "").replace(/\D/g, "").slice(0, 5);
  const data = REDFIN_DATA[cleanZip];
  if (!data) return null;
  return { zip: cleanZip, ...data };
}

export function getRedfinMarketTemperature(zip: string): MarketTemperatureResult | null {
  const metrics = getRedfinMetrics(zip);
  if (!metrics) return null;
  const temperature = classifyMarketTemperature(metrics);
  return { temperature, label: temperatureLabel(temperature), metrics };
}

export function getNycAggregate(): RedfinMetrics {
  return { zip: "NYC", ...NYC_AGGREGATE };
}

export function getAllAvailableZips(): string[] {
  return Object.keys(REDFIN_DATA);
}
