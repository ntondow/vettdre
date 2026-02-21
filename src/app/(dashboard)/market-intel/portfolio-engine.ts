"use server";

import prisma from "@/lib/prisma";

const NYC = "https://data.cityofnewyork.us/resource";
const PLUTO = "64uk-42ks";
const HPD_REG = "tesw-yqqr";
const HPD_CONTACTS = "feu5-w2e2";

interface BuildingData {
  bbl: string;
  boroCode: string;
  block: string;
  lot: string;
  address: string;
  borough: string;
  units: number;
  floors: number;
  yearBuilt: number;
  assessedValue: number;
  ownerName: string;
  buildingClass: string;
  zoning: string;
}

interface ContactData {
  bbl: string;
  type: string;
  name: string;
  corporateName: string;
  businessAddress: string;
}

// ============================================================
// Main clustering job
// ============================================================
export async function runPortfolioClustering(
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  minUnits: number = 20
) {
  console.log("=== PORTFOLIO CLUSTERING JOB ===");
  console.log("Bounds:", bounds, "Min units:", minUnits);

  // Step 1: Fetch all buildings in area
  const buildings = await fetchBuildings(bounds, minUnits);
  console.log("Found", buildings.length, "buildings with", minUnits, "+ units");

  if (buildings.length === 0) return { portfolios: 0, buildings: 0 };

  // Step 2: Fetch HPD contacts for all buildings
  const contacts = await fetchAllContacts(buildings);
  console.log("Found", contacts.length, "HPD contacts");

  // Step 3: Build connection graph
  const graph = buildConnectionGraph(buildings, contacts);
  console.log("Built graph with", Object.keys(graph.nodes).length, "nodes");

  // Step 4: Find connected components (portfolios)
  const components = findConnectedComponents(graph);
  const multiBuilding = components.filter(c => c.buildings.length >= 2);
  console.log("Found", multiBuilding.length, "portfolios with 2+ buildings");

  // Step 5: Save to database
  let saved = 0;
  for (const component of multiBuilding) {
    try {
      await savePortfolio(component, buildings, contacts);
      saved++;
    } catch (err) {
      console.error("Error saving portfolio:", err);
    }
  }

  console.log("=== CLUSTERING COMPLETE ===", saved, "portfolios saved");
  return { portfolios: saved, buildings: buildings.length, contacts: contacts.length };
}

// ============================================================
// Fetch buildings from PLUTO
// ============================================================
async function fetchBuildings(bounds: any, minUnits: number): Promise<BuildingData[]> {
  const all: BuildingData[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const url = new URL(NYC + "/" + PLUTO + ".json");
    url.searchParams.set("$where",
      `latitude >= ${bounds.minLat} AND latitude <= ${bounds.maxLat} AND longitude >= ${bounds.minLng} AND longitude <= ${bounds.maxLng} AND unitsres >= ${minUnits}`
    );
    url.searchParams.set("$select", "borocode,block,lot,address,borough,unitsres,numfloors,yearbuilt,assesstot,ownername,bldgclass,zonedist1,bbl");
    url.searchParams.set("$limit", limit.toString());
    url.searchParams.set("$offset", offset.toString());
    url.searchParams.set("$order", "unitsres DESC");

    const res = await fetch(url.toString());
    if (!res.ok) break;
    const data = await res.json();
    if (data.length === 0) break;

    data.forEach((d: any) => {
      all.push({
        bbl: d.bbl || (d.borocode + d.block?.padStart(5, "0") + d.lot?.padStart(4, "0")),
        boroCode: d.borocode || "",
        block: d.block || "",
        lot: d.lot || "",
        address: d.address || "",
        borough: d.borough || "",
        units: parseInt(d.unitsres) || 0,
        floors: parseInt(d.numfloors) || 0,
        yearBuilt: parseInt(d.yearbuilt) || 0,
        assessedValue: parseFloat(d.assesstot) || 0,
        ownerName: d.ownername || "",
        buildingClass: d.bldgclass || "",
        zoning: d.zonedist1 || "",
      });
    });

    offset += limit;
    if (data.length < limit) break;
  }

  return all;
}

// ============================================================
// Fetch HPD contacts for all buildings (batched)
// ============================================================
async function fetchAllContacts(buildings: BuildingData[]): Promise<ContactData[]> {
  const all: ContactData[] = [];
  const batchSize = 20;

  for (let i = 0; i < buildings.length; i += batchSize) {
    const batch = buildings.slice(i, i + batchSize);
    const promises = batch.map(async (b) => {
      try {
        // Get registration IDs
        const regUrl = new URL(NYC + "/" + HPD_REG + ".json");
        regUrl.searchParams.set("$where", `boroid='${b.boroCode}' AND block='${b.block}' AND lot='${b.lot}'`);
        regUrl.searchParams.set("$select", "registrationid");
        regUrl.searchParams.set("$limit", "5");

        const regRes = await fetch(regUrl.toString());
        if (!regRes.ok) return [];
        const regs = await regRes.json();
        if (regs.length === 0) return [];

        const regIds = regs.map((r: any) => "'" + r.registrationid + "'").join(",");
        const conUrl = new URL(NYC + "/" + HPD_CONTACTS + ".json");
        conUrl.searchParams.set("$where", "registrationid in(" + regIds + ")");
        conUrl.searchParams.set("$limit", "30");

        const conRes = await fetch(conUrl.toString());
        if (!conRes.ok) return [];
        const contacts = await conRes.json();

        return contacts.map((c: any) => ({
          bbl: b.bbl,
          type: c.type || "",
          name: [c.firstname, c.lastname].filter(Boolean).join(" ").trim().toUpperCase(),
          corporateName: (c.corporationname || "").toUpperCase().trim(),
          businessAddress: [c.businesshousenumber, c.businessstreetname, c.businesscity, c.businessstate].filter(Boolean).join(" ").toUpperCase().trim(),
        }));
      } catch {
        return [];
      }
    });

    const results = await Promise.all(promises);
    results.forEach(r => all.push(...r));

    // Rate limiting
    if (i + batchSize < buildings.length) {
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`  Contacts: processed ${Math.min(i + batchSize, buildings.length)}/${buildings.length} buildings`);
  }

  return all;
}

// ============================================================
// Build connection graph
// ============================================================
interface GraphNode {
  type: "building" | "entity";
  id: string;
  connections: Set<string>;
}

interface Graph {
  nodes: Record<string, GraphNode>;
}

function buildConnectionGraph(buildings: BuildingData[], contacts: ContactData[]): Graph {
  const graph: Graph = { nodes: {} };

  // Add building nodes
  buildings.forEach(b => {
    graph.nodes["B:" + b.bbl] = { type: "building", id: b.bbl, connections: new Set() };
  });

  // Connect buildings through shared entities
  const entityToBuildings: Record<string, Set<string>> = {};

  contacts.forEach(c => {
    const entities: string[] = [];

    // Individual names (skip very short/common names)
    if (c.name.length > 4 && c.name.split(" ").length >= 2) {
      entities.push("P:" + c.name);
    }

    // Corporate names
    if (c.corporateName.length > 3) {
      entities.push("C:" + c.corporateName);
    }

    // Business address (normalize)
    if (c.businessAddress.length > 10) {
      const normalized = c.businessAddress.replace(/\s+/g, " ").replace(/,/g, "").trim();
      entities.push("A:" + normalized);
    }

    entities.forEach(entity => {
      if (!entityToBuildings[entity]) entityToBuildings[entity] = new Set();
      entityToBuildings[entity].add(c.bbl);
    });
  });

  // Also connect through PLUTO owner names
  const ownerToBuildings: Record<string, Set<string>> = {};
  buildings.forEach(b => {
    if (b.ownerName.length > 3) {
      const key = "O:" + b.ownerName.toUpperCase().trim();
      if (!ownerToBuildings[key]) ownerToBuildings[key] = new Set();
      ownerToBuildings[key].add(b.bbl);
    }
  });

  // Merge owner connections into entity map
  Object.entries(ownerToBuildings).forEach(([key, bbls]) => {
    if (!entityToBuildings[key]) entityToBuildings[key] = new Set();
    bbls.forEach(bbl => entityToBuildings[key].add(bbl));
  });

  // Create edges: if an entity connects 2+ buildings, link them
  Object.entries(entityToBuildings).forEach(([entity, bbls]) => {
    if (bbls.size < 2) return;
    const bblArr = Array.from(bbls);

    // Add entity node
    graph.nodes[entity] = { type: "entity", id: entity, connections: new Set() };

    // Connect entity to all its buildings
    bblArr.forEach(bbl => {
      const bKey = "B:" + bbl;
      if (graph.nodes[bKey]) {
        graph.nodes[bKey].connections.add(entity);
        graph.nodes[entity].connections.add(bKey);
      }
    });
  });

  return graph;
}

// ============================================================
// Find connected components (Union-Find)
// ============================================================
interface Component {
  buildings: string[]; // BBLs
  entities: string[];  // Entity keys
}

function findConnectedComponents(graph: Graph): Component[] {
  const visited = new Set<string>();
  const components: Component[] = [];

  Object.keys(graph.nodes).forEach(nodeKey => {
    if (visited.has(nodeKey)) return;

    const component: Component = { buildings: [], entities: [] };
    const queue = [nodeKey];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const node = graph.nodes[current];
      if (!node) continue;

      if (node.type === "building") {
        component.buildings.push(node.id);
      } else {
        component.entities.push(current);
      }

      node.connections.forEach(neighbor => {
        if (!visited.has(neighbor)) queue.push(neighbor);
      });
    }

    if (component.buildings.length > 0) {
      components.push(component);
    }
  });

  return components;
}

// ============================================================
// Save portfolio to database
// ============================================================
async function savePortfolio(component: Component, buildings: BuildingData[], contacts: ContactData[]) {
  const buildingMap = new Map(buildings.map(b => [b.bbl, b]));

  const portfolioBuildings = component.buildings
    .map(bbl => buildingMap.get(bbl))
    .filter(Boolean) as BuildingData[];

  if (portfolioBuildings.length < 2) return;

  // Determine portfolio name (most common corporate owner or individual)
  const entityCounts: Record<string, number> = {};
  component.entities.forEach(e => {
    const name = e.replace(/^[PCOA]:/, "");
    entityCounts[name] = (entityCounts[name] || 0) + 1;
  });

  // Prefer corporate names for portfolio name
  const corpEntities = component.entities.filter(e => e.startsWith("C:") || e.startsWith("O:"));
  const personEntities = component.entities.filter(e => e.startsWith("P:"));

  let portfolioName = "Unknown Portfolio";
  if (corpEntities.length > 0) {
    portfolioName = corpEntities[0].replace(/^[CO]:/, "");
  } else if (personEntities.length > 0) {
    portfolioName = personEntities[0].replace(/^P:/, "");
  }

  const totalUnits = portfolioBuildings.reduce((s, b) => s + b.units, 0);
  const totalValue = portfolioBuildings.reduce((s, b) => s + b.assessedValue, 0);
  const borough = portfolioBuildings[0]?.borough || "";

  const slug = portfolioName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) + "-" + component.buildings.length + "b";

  const entityNames = [...new Set(component.entities.map(e => e.replace(/^[PCOA]:/, "")))];
  const headOfficers = [...new Set(
    contacts
      .filter(c => component.buildings.includes(c.bbl) && (c.type === "HeadOfficer" || c.type === "IndividualOwner"))
      .map(c => c.name)
      .filter(n => n.length > 2)
  )];
  const addresses = [...new Set(
    contacts
      .filter(c => component.buildings.includes(c.bbl) && c.businessAddress.length > 5)
      .map(c => c.businessAddress)
  )].slice(0, 5);

  // Upsert portfolio
  await prisma.portfolio.upsert({
    where: { slug },
    create: {
      name: portfolioName,
      slug,
      totalBuildings: portfolioBuildings.length,
      totalUnits,
      totalValue,
      avgDistress: 0,
      borough,
      entityNames,
      headOfficers,
      addresses,
      buildings: {
        create: portfolioBuildings.map(b => ({
          bbl: b.bbl,
          boroCode: b.boroCode,
          block: b.block,
          lot: b.lot,
          address: b.address,
          borough: b.borough,
          units: b.units,
          floors: b.floors,
          yearBuilt: b.yearBuilt,
          assessedValue: b.assessedValue,
          ownerName: b.ownerName,
          buildingClass: b.buildingClass,
          zoning: b.zoning,
        })),
      },
    },
    update: {
      name: portfolioName,
      totalBuildings: portfolioBuildings.length,
      totalUnits,
      totalValue,
      entityNames,
      headOfficers,
      addresses,
      updatedAt: new Date(),
    },
  });

  console.log(`  Saved portfolio: ${portfolioName} (${portfolioBuildings.length} buildings, ${totalUnits} units)`);
}

// ============================================================
// Get all portfolios (for dashboard)
// ============================================================
export async function getPortfolios(orderBy: string = "totalUnits") {
  return prisma.portfolio.findMany({
    orderBy: { [orderBy]: "desc" },
    include: { buildings: true },
  });
}

// ============================================================
// Get portfolio by slug
// ============================================================
export async function getPortfolioBySlug(slug: string) {
  return prisma.portfolio.findUnique({
    where: { slug },
    include: { buildings: true },
  });
}

// ============================================================
// Find portfolio for a building
// ============================================================
export async function findPortfolioForBuilding(bbl: string) {
  const pb = await prisma.portfolioBuilding.findFirst({
    where: { bbl },
    include: { portfolio: { include: { buildings: true } } },
  });
  return pb?.portfolio || null;
}

// Williamsburg/Greenpoint bounds (default)
export const WILLIAMSBURG_BOUNDS = {
  minLat: 40.700,
  maxLat: 40.730,
  minLng: -73.970,
  maxLng: -73.935,
};
