# VettdRE — Zillow Neighborhood Data Integration Spec

Read CLAUDE.md for project context. Integrate free Zillow Research CSV data to add neighborhood context to building profiles and the map view.

---

## Overview

Zillow publishes free CSV datasets monthly at https://www.zillow.com/research/data/ with ZIP-code and neighborhood-level data. We'll download the NYC-relevant data, store it locally, and display it on building profiles as a "Neighborhood Intelligence" card.

---

## 1. Data to Download

Download these CSVs from https://www.zillow.com/research/data/ (filter by ZIP code or Metro where possible):

### Home Values
- **ZHVI All Homes (ZIP)**: `Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`
  - Typical home value by ZIP code, monthly time series
  - Key fields: RegionName (ZIP), State, Metro, value columns by date

### Rentals  
- **ZORI All Homes (ZIP)**: `Zip_zori_uc_sfrcondomfr_sm_month.csv`
  - Zillow Observed Rent Index — typical rent by ZIP, monthly
  - Key fields: RegionName (ZIP), value columns by date

### Inventory
- **For-Sale Inventory (ZIP)**: `Zip_for_sale_inventory_sm.csv`
  - Number of active listings by ZIP
  
- **New Listings (ZIP)**: `Zip_new_listings_sm.csv`
  - New listings per month by ZIP

### Market Health
- **Days on Market (ZIP)**: `Zip_mean_days_to_close_sm.csv` or similar
  - Average days properties stay on market

- **Sale-to-List Price Ratio (ZIP)**: `Zip_mean_sale_to_list_sm.csv`
  - Are homes selling above or below asking?

### Download Script
Create `scripts/download-zillow-data.sh`:
```bash
#!/bin/bash
mkdir -p data/zillow

# ZHVI - Home Values by ZIP
curl -o data/zillow/zhvi_zip.csv "https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"

# ZORI - Rent Index by ZIP
curl -o data/zillow/zori_zip.csv "https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv"

# For Sale Inventory
curl -o data/zillow/inventory_zip.csv "https://files.zillowstatic.com/research/public_csvs/invt_fs/Zip_invt_fs_uc_sfrcondo_sm_month.csv"

# New Listings
curl -o data/zillow/new_listings_zip.csv "https://files.zillowstatic.com/research/public_csvs/new_listings/Zip_new_listings_uc_sfrcondo_sm_month.csv"

echo "Zillow data downloaded to data/zillow/"
```

NOTE: The exact CSV URLs may change. If any URL 404s, go to https://www.zillow.com/research/data/ and find the correct download link for that metric. The file naming pattern is usually at files.zillowstatic.com/research/public_csvs/[metric]/[filename].csv

---

## 2. Data Processing + Storage

### Option A (Recommended): Load CSVs into memory at server start
Since we're only using NYC ZIP codes (~200 ZIPs), we can parse the CSVs and filter to NYC on server startup, keeping data in a module-level cache.

Create `src/lib/zillow-data.ts`:
```typescript
import fs from "fs";
import path from "path";

// NYC ZIP code ranges (approximate)
const NYC_ZIPS = new Set<string>();
// Manhattan: 10001-10282
for (let i = 10001; i <= 10282; i++) NYC_ZIPS.add(String(i));
// Bronx: 10451-10475
for (let i = 10451; i <= 10475; i++) NYC_ZIPS.add(String(i));
// Brooklyn: 11201-11256
for (let i = 11201; i <= 11256; i++) NYC_ZIPS.add(String(i));
// Queens: 11001-11697 (some gaps)
for (let i = 11001; i <= 11109; i++) NYC_ZIPS.add(String(i));
for (let i = 11351; i <= 11697; i++) NYC_ZIPS.add(String(i));
// Staten Island: 10301-10314
for (let i = 10301; i <= 10314; i++) NYC_ZIPS.add(String(i));

interface ZillowZipData {
  zip: string;
  // Home values
  currentHomeValue: number | null;       // Latest ZHVI
  homeValueChange1Y: number | null;      // YoY % change
  homeValueChange5Y: number | null;      // 5Y % change
  homeValueHistory: { date: string; value: number }[];  // Last 12 months
  
  // Rents
  currentRent: number | null;            // Latest ZORI
  rentChange1Y: number | null;           // YoY % change
  rentHistory: { date: string; value: number }[];  // Last 12 months
  
  // Market activity
  forSaleInventory: number | null;
  newListings: number | null;
}

let cache: Map<string, ZillowZipData> | null = null;

function parseCSV(filePath: string): Record<string, string>[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
  const rows: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    // Handle CSV with quoted fields
    const values = lines[i].match(/(".*?"|[^,]*)/g)?.map(v => v.replace(/"/g, "").trim()) || [];
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
    rows.push(row);
  }
  
  return rows;
}

function getLatestValues(row: Record<string, string>, count: number): { date: string; value: number }[] {
  // Date columns are like "2024-01-31", "2024-02-29", etc.
  const dateColumns = Object.keys(row).filter(k => k.match(/^\d{4}-\d{2}-\d{2}$/)).sort().reverse();
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
    if (!zip || !NYC_ZIPS.has(zip)) continue;
    
    const history = getLatestValues(row, 60); // 5 years
    const recent12 = history.slice(-12);
    const current = history[history.length - 1]?.value || null;
    const oneYearAgo = history[history.length - 13]?.value || null;
    const fiveYearsAgo = history[0]?.value || null;
    
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
    if (!zip || !NYC_ZIPS.has(zip)) continue;
    
    const history = getLatestValues(row, 12);
    const current = history[history.length - 1]?.value || null;
    const oneYearAgo = getLatestValues(row, 24);
    const yearAgoVal = oneYearAgo.length >= 12 ? oneYearAgo[0]?.value : null;
    
    const entry = map.get(zip)!;
    entry.currentRent = current;
    entry.rentHistory = history;
    if (current && yearAgoVal) entry.rentChange1Y = ((current - yearAgoVal) / yearAgoVal) * 100;
  }
  
  // Load inventory
  const inventory = parseCSV(path.join(dataDir, "inventory_zip.csv"));
  for (const row of inventory) {
    const zip = row["RegionName"]?.padStart(5, "0");
    if (!zip || !NYC_ZIPS.has(zip)) continue;
    const history = getLatestValues(row, 1);
    if (history.length > 0) map.get(zip)!.forSaleInventory = history[0].value;
  }
  
  // Load new listings
  const newListings = parseCSV(path.join(dataDir, "new_listings_zip.csv"));
  for (const row of newListings) {
    const zip = row["RegionName"]?.padStart(5, "0");
    if (!zip || !NYC_ZIPS.has(zip)) continue;
    const history = getLatestValues(row, 1);
    if (history.length > 0) map.get(zip)!.newListings = history[0].value;
  }
  
  console.log(`[ZILLOW] Loaded data for ${map.size} NYC ZIP codes`);
  return map;
}

export function getZillowDataForZip(zip: string): ZillowZipData | null {
  if (!cache) cache = loadZillowData();
  return cache.get(zip.padStart(5, "0")) || null;
}

export function getAllZillowData(): Map<string, ZillowZipData> {
  if (!cache) cache = loadZillowData();
  return cache;
}
```

---

## 3. Integration with Building Profiles

### In `src/app/(dashboard)/market-intel/building-profile-actions.ts`:

After fetching PLUTO data (which includes the ZIP code), call:
```typescript
import { getZillowDataForZip } from "@/lib/zillow-data";

// Inside fetchBuildingProfile, after getting PLUTO data:
const zipCode = plutoData?.zipcode || plutoData?.zip;
const zillowData = zipCode ? getZillowDataForZip(zipCode) : null;

// Add to results
results.neighborhoodData = zillowData;
```

### In `src/app/(dashboard)/market-intel/building-profile.tsx`:

Add a new "Neighborhood Intelligence" card after the existing cards:

```
┌─────────────────────────────────────────────────────┐
│ 🏘️ Neighborhood Intelligence          ZIP: 11211    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🏠 Typical Home Value    📈 Rent Index              │
│  $892,000                 $3,450/mo                  │
│  ▲ +4.2% YoY              ▲ +2.8% YoY              │
│  ▲ +31.5% 5Y                                       │
│                                                     │
│  📊 Home Value Trend (12 months)                    │
│  [mini sparkline chart]                             │
│                                                     │
│  📋 Market Activity                                 │
│  For Sale: 145 listings                             │
│  New This Month: 32 listings                        │
│                                                     │
│  💡 Market Signal                                   │
│  "Strong appreciation area. Values up 4.2% YoY     │
│   with moderate inventory. Good for sellers."       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Card Design:
- Header: "🏘️ Neighborhood Intelligence" with ZIP code badge
- Two-column stat layout: Home Value | Rent
- Each stat: large number, YoY change with arrow (green ▲ or red ▼)
- Mini sparkline chart for 12-month home value trend (use inline SVG or simple CSS bars)
- Market activity row: inventory + new listings
- AI market signal: one-sentence summary generated from the data

### Market Signal Logic:
```typescript
function generateMarketSignal(data: ZillowZipData): string {
  const signals: string[] = [];
  
  if (data.homeValueChange1Y !== null) {
    if (data.homeValueChange1Y > 5) signals.push("Strong appreciation area");
    else if (data.homeValueChange1Y > 0) signals.push("Moderate growth area");
    else signals.push("Values declining");
    
    signals.push(`Values ${data.homeValueChange1Y > 0 ? "up" : "down"} ${Math.abs(data.homeValueChange1Y).toFixed(1)}% YoY`);
  }
  
  if (data.forSaleInventory !== null) {
    if (data.forSaleInventory > 200) signals.push("high inventory");
    else if (data.forSaleInventory > 100) signals.push("moderate inventory");
    else signals.push("tight inventory");
  }
  
  if (data.rentChange1Y !== null && data.rentChange1Y > 3) {
    signals.push("rents rising fast");
  }
  
  return signals.join(". ") + ".";
}
```

### Sparkline Chart:
Simple inline SVG sparkline (no library needed):
```tsx
function Sparkline({ data, width = 200, height = 40 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
  
  const lastValue = data[data.length - 1];
  const firstValue = data[0];
  const color = lastValue >= firstValue ? "#10B981" : "#EF4444";
  
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
    </svg>
  );
}
```

---

## 4. Integration with Map View

### On map markers tooltip/popup:
When hovering or clicking a building marker, show a quick stat:
- "ZIP 11211 · Home Value: $892K · Rent: $3,450"

### Map Color Overlay (optional enhancement):
Add a toggle: "Show neighborhood values"
- When on, overlay ZIP code boundaries with color gradient
- Red = expensive, Blue = affordable
- Opacity based on data availability

This is a stretch goal — implement only if the basic integration works well first.

---

## 5. Neighborhood Comparison

### In building profile, add a "Compare" element:
"This ZIP vs NYC Average" bar comparison:

```
Home Value:  $892,000  ████████████████░░░░  NYC Avg: $750,000
Rent:        $3,450    ███████████████░░░░░  NYC Avg: $3,100
Inventory:   145       ██████████░░░░░░░░░░  NYC Avg: 200
YoY Growth:  +4.2%     ████████████████████  NYC Avg: +3.1%
```

Calculate NYC averages from all loaded ZIP data.

---

## 6. Data Refresh

### Monthly Update Script:
Add to `package.json` scripts:
```json
{
  "scripts": {
    "update-zillow": "bash scripts/download-zillow-data.sh"
  }
}
```

### Cache Invalidation:
The in-memory cache loads once per server start. To refresh:
- Restart dev server after downloading new data
- Or add a `/api/admin/refresh-zillow` endpoint that clears the cache

### .gitignore:
Add `data/zillow/*.csv` to .gitignore (don't commit large CSVs).
Add `data/zillow/.gitkeep` so the directory exists.

---

## Build Order:
1. Create download script + run it to get CSVs
2. Create `src/lib/zillow-data.ts` with CSV parsing + caching
3. Integrate with building-profile-actions.ts (pass ZIP, get data)
4. Create Neighborhood Intelligence card in building-profile.tsx
5. Create Sparkline component
6. Create market signal generator
7. Add NYC comparison bars
8. Add quick stat to map marker tooltips
9. Test with multiple buildings across different ZIPs

## Important Reminders:
- All exported functions in "use server" files must be async (Next.js 16)
- The CSV files can be large (50MB+) — only parse NYC rows
- Cache the parsed data in a module-level variable (loads once per server start)
- ZIP codes in PLUTO may be in the `zipcode` or `zip` field — check both
- Handle missing data gracefully — many NYC ZIPs won't have all metrics
- Zillow updates data on the 16th of each month
- The download script needs network access — run it manually, not during build
- Don't call the Zillow API — this uses FREE publicly available CSV downloads only
