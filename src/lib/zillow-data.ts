import fs from "fs";
import path from "path";

// NYC ZIP code ranges
const NYC_ZIPS = new Set<string>();
// Manhattan: 10001-10282
for (let i = 10001; i <= 10282; i++) NYC_ZIPS.add(String(i));
// Bronx: 10451-10475
for (let i = 10451; i <= 10475; i++) NYC_ZIPS.add(String(i));
// Brooklyn: 11201-11256
for (let i = 11201; i <= 11256; i++) NYC_ZIPS.add(String(i));
// Queens: 11001-11109, 11351-11697
for (let i = 11001; i <= 11109; i++) NYC_ZIPS.add(String(i));
for (let i = 11351; i <= 11697; i++) NYC_ZIPS.add(String(i));
// Staten Island: 10301-10314
for (let i = 10301; i <= 10314; i++) NYC_ZIPS.add(String(i));

export interface ZillowZipData {
  zip: string;
  currentHomeValue: number | null;
  homeValueChange1Y: number | null;
  homeValueChange5Y: number | null;
  homeValueHistory: { date: string; value: number }[];
  currentRent: number | null;
  rentChange1Y: number | null;
  rentHistory: { date: string; value: number }[];
  forSaleInventory: number | null;
  newListings: number | null;
}

let cache: Map<string, ZillowZipData> | null = null;
let nycAveragesCache: {
  avgHomeValue: number;
  avgRent: number;
  avgInventory: number;
  avgYoYGrowth: number;
} | null = null;

/**
 * Parses a CSV file into rows. Only extracts the RegionName column and date columns
 * for NYC ZIP codes, skipping all other data to minimize memory usage.
 */
function parseCSV(filePath: string): Record<string, string>[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
  const regionIdx = headers.indexOf("RegionName");
  if (regionIdx === -1) return [];

  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = line.split(",").map(v => v.replace(/"/g, "").trim());
    const zip = (values[regionIdx] || "").padStart(5, "0");
    if (!NYC_ZIPS.has(zip)) continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || "";
    }
    rows.push(row);
  }

  return rows;
}

function getLatestValues(row: Record<string, string>, count: number): { date: string; value: number }[] {
  const dateColumns = Object.keys(row)
    .filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort()
    .reverse();

  const results: { date: string; value: number }[] = [];
  for (const col of dateColumns.slice(0, count)) {
    const val = parseFloat(row[col]);
    if (!isNaN(val) && val > 0) {
      results.push({ date: col, value: val });
    }
  }

  return results.reverse(); // chronological
}

function loadZillowData(): Map<string, ZillowZipData> {
  const dataDir = path.join(process.cwd(), "data", "zillow");
  const map = new Map<string, ZillowZipData>();

  // Initialize all NYC zips
  for (const zip of NYC_ZIPS) {
    map.set(zip, {
      zip,
      currentHomeValue: null,
      homeValueChange1Y: null,
      homeValueChange5Y: null,
      homeValueHistory: [],
      currentRent: null,
      rentChange1Y: null,
      rentHistory: [],
      forSaleInventory: null,
      newListings: null,
    });
  }

  // Load ZHVI (home values)
  const zhvi = parseCSV(path.join(dataDir, "zhvi_zip.csv"));
  for (const row of zhvi) {
    const zip = row["RegionName"]?.padStart(5, "0");
    if (!zip || !map.has(zip)) continue;

    const history = getLatestValues(row, 60); // up to 5 years
    const recent12 = history.slice(-12);
    const current = history.length > 0 ? history[history.length - 1].value : null;
    const oneYearAgo = history.length >= 13 ? history[history.length - 13].value : null;
    const fiveYearsAgo = history.length >= 60 ? history[0].value : null;

    const entry = map.get(zip)!;
    entry.currentHomeValue = current;
    entry.homeValueHistory = recent12;
    if (current && oneYearAgo) entry.homeValueChange1Y = ((current - oneYearAgo) / oneYearAgo) * 100;
    if (current && fiveYearsAgo) entry.homeValueChange5Y = ((current - fiveYearsAgo) / fiveYearsAgo) * 100;
  }

  // Load ZORI (rents)
  const zori = parseCSV(path.join(dataDir, "zori_zip.csv"));
  for (const row of zori) {
    const zip = row["RegionName"]?.padStart(5, "0");
    if (!zip || !map.has(zip)) continue;

    const history = getLatestValues(row, 24); // 2 years
    const recent12 = history.slice(-12);
    const current = history.length > 0 ? history[history.length - 1].value : null;
    const yearAgoVal = history.length >= 13 ? history[history.length - 13].value : null;

    const entry = map.get(zip)!;
    entry.currentRent = current;
    entry.rentHistory = recent12;
    if (current && yearAgoVal) entry.rentChange1Y = ((current - yearAgoVal) / yearAgoVal) * 100;
  }

  // Load inventory
  const inventory = parseCSV(path.join(dataDir, "inventory_zip.csv"));
  for (const row of inventory) {
    const zip = row["RegionName"]?.padStart(5, "0");
    if (!zip || !map.has(zip)) continue;
    const latest = getLatestValues(row, 1);
    if (latest.length > 0) map.get(zip)!.forSaleInventory = latest[0].value;
  }

  // Load new listings
  const newListings = parseCSV(path.join(dataDir, "new_listings_zip.csv"));
  for (const row of newListings) {
    const zip = row["RegionName"]?.padStart(5, "0");
    if (!zip || !map.has(zip)) continue;
    const latest = getLatestValues(row, 1);
    if (latest.length > 0) map.get(zip)!.newListings = latest[0].value;
  }

  // Count ZIPs with data
  let withData = 0;
  for (const entry of map.values()) {
    if (entry.currentHomeValue || entry.currentRent) withData++;
  }
  console.log(`[Zillow] Loaded data for ${withData} NYC ZIP codes (${map.size} total ZIPs tracked)`);

  return map;
}

export function getZillowDataForZip(zip: string): ZillowZipData | null {
  if (!cache) cache = loadZillowData();
  return cache.get(zip.padStart(5, "0")) || null;
}

export function getNYCAverages(): {
  avgHomeValue: number;
  avgRent: number;
  avgInventory: number;
  avgYoYGrowth: number;
} {
  if (nycAveragesCache) return nycAveragesCache;
  if (!cache) cache = loadZillowData();

  let homeValues: number[] = [];
  let rents: number[] = [];
  let inventories: number[] = [];
  let growths: number[] = [];

  for (const entry of cache.values()) {
    if (entry.currentHomeValue) homeValues.push(entry.currentHomeValue);
    if (entry.currentRent) rents.push(entry.currentRent);
    if (entry.forSaleInventory) inventories.push(entry.forSaleInventory);
    if (entry.homeValueChange1Y !== null) growths.push(entry.homeValueChange1Y);
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  nycAveragesCache = {
    avgHomeValue: avg(homeValues),
    avgRent: avg(rents),
    avgInventory: avg(inventories),
    avgYoYGrowth: avg(growths),
  };

  return nycAveragesCache;
}
