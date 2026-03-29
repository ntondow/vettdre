"use server";

const NYC = "https://data.cityofnewyork.us/resource";
const HPD_CONTACTS = "feu5-w2e2";
const HPD_REG = "tesw-yqqr";

type NodeType = "person" | "entity" | "address" | "property";

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  data?: any;
}

interface GraphEdge {
  from: string;
  to: string;
  source: string;
  role: string;
}

export interface PortfolioProperty {
  bbl: string;
  address: string;
  borough: string;
  boroCode: string;
  block: string;
  lot: string;
  units: number;
  yearBuilt: number;
  assessedValue: number;
  numFloors: number;
  bldgArea: number;
  zoning: string;
  ownerName: string;
  connectedVia: string[];
}

export interface PortfolioResult {
  properties: PortfolioProperty[];
  people: { name: string; roles: string[]; addresses: string[]; propertyCount: number }[];
  entities: { name: string; roles: string[]; addresses: string[]; propertyCount: number }[];
  commonAddresses: { address: string; count: number }[];
  graph: { nodes: number; edges: number; depth: number };
}

function normalizeNode(name: string): string {
  return name.toUpperCase().replace(/[,.'"\u2019]/g, "").replace(/\s+/g, " ").trim();
}

function isEntity(name: string): boolean {
  return /\b(LLC|INC|CORP|CORPORATION|COMPANY|CO|LTD|LP|PARTNERSHIP|TRUST|ASSOC|ASSOCIATES|REALTY|PROPERTIES|MANAGEMENT|HOLDINGS|GROUP|ENTERPRISES)\b/i.test(name);
}

function normalizeAddress(addr: string): string {
  return addr.toUpperCase().replace(/[,.'"\u2019#]/g, "").replace(/\bAPT\b.*$/i, "").replace(/\bSUITE\b.*$/i, "").replace(/\s+/g, " ").trim();
}

function makeNodeId(type: NodeType, label: string): string {
  return type + ":" + normalizeNode(label);
}

export async function buildOwnershipGraph(
  startBlock: string, startLot: string, startBoro: string, maxDepth: number = 2
): Promise<PortfolioResult> {
  console.log("=== GRAPH ENGINE START ===", startBoro, startBlock, startLot);

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const visitedRegistrations = new Set<string>();
  const visitedProperties = new Set<string>();
  const visitedNames = new Set<string>();
  const startBBL = startBoro + "-" + startBlock + "-" + startLot;
  visitedProperties.add(startBBL);

  type QueueItem = { type: "property" | "name"; key: string; boro?: string; block?: string; lot?: string; name?: string };
  let currentQueue: QueueItem[] = [
    { type: "property", key: startBBL, boro: startBoro, block: startBlock, lot: startLot }
  ];

  let depth = 0;

  while (currentQueue.length > 0 && depth < maxDepth) {
    depth++;
    console.log("Graph depth", depth, "queue:", currentQueue.length);
    const nextQueue: QueueItem[] = [];

    // Process properties: find names via HPD
    const propertyItems = currentQueue.filter(q => q.type === "property");
    await Promise.all(propertyItems.slice(0, 8).map(async (prop) => {
      try {
        const regUrl = new URL(NYC + "/" + HPD_REG + ".json");
        regUrl.searchParams.set("$where", "boroid='" + prop.boro + "' AND block='" + prop.block + "' AND lot='" + prop.lot + "'");
        regUrl.searchParams.set("$limit", "5");
        regUrl.searchParams.set("$order", "registrationenddate DESC");
        const regRes = await fetch(regUrl.toString());
        if (!regRes.ok) return;
        const regs = await regRes.json();

        for (const reg of regs) {
          if (visitedRegistrations.has(reg.registrationid)) continue;
          visitedRegistrations.add(reg.registrationid);

          const conUrl = new URL(NYC + "/" + HPD_CONTACTS + ".json");
          conUrl.searchParams.set("$where", "registrationid='" + reg.registrationid + "'");
          conUrl.searchParams.set("$limit", "20");
          const conRes = await fetch(conUrl.toString());
          if (!conRes.ok) return;
          const contacts = await conRes.json();

          for (const c of contacts) {
            const contactType = c.type || c.contactdescription || "";
            if (contactType.toLowerCase().includes("site manager")) continue;

            const cName = c.corporationname || [c.firstname, c.lastname].filter(Boolean).join(" ").trim();
            if (!cName || cName.length < 3) continue;

            const nameId = makeNodeId(isEntity(cName) ? "entity" : "person", cName);
            const propId = makeNodeId("property", prop.key);

            if (!nodes.has(nameId)) nodes.set(nameId, { id: nameId, type: isEntity(cName) ? "entity" : "person", label: normalizeNode(cName) });
            if (!nodes.has(propId)) nodes.set(propId, { id: propId, type: "property", label: prop.key });
            edges.push({ from: nameId, to: propId, source: "HPD", role: contactType });

            const bizAddr = [c.businesshousenumber, c.businessstreetname, c.businessapartment].filter(Boolean).join(" ").trim();
            const fullAddr = bizAddr ? normalizeAddress(bizAddr + " " + (c.businesscity || "") + " " + (c.businessstate || "") + " " + (c.businesszip || "")) : "";
            if (fullAddr.length > 10) {
              const addrId = makeNodeId("address", fullAddr);
              if (!nodes.has(addrId)) nodes.set(addrId, { id: addrId, type: "address", label: fullAddr });
              edges.push({ from: nameId, to: addrId, source: "HPD", role: "business_address" });
            }

            if (!visitedNames.has(normalizeNode(cName))) {
              visitedNames.add(normalizeNode(cName));
              nextQueue.push({ type: "name", key: normalizeNode(cName), name: normalizeNode(cName) });
            }
          }
        }
      } catch (err) { console.error("Graph HPD prop error:", err); }
    }));

    // Process names: find properties via HPD
    const nameItems = currentQueue.filter(q => q.type === "name");
    await Promise.all(nameItems.slice(0, 5).map(async (nameItem) => {
      const nm = nameItem.name!;
      try {
        const nameIsEnt = isEntity(nm);
        const field = nameIsEnt ? "corporationname" : "lastname";
        const searchTerm = nameIsEnt ? nm : nm.split(" ").pop() || nm;

        const conUrl = new URL(NYC + "/" + HPD_CONTACTS + ".json");
        conUrl.searchParams.set("$where", "upper(" + field + ") like '%" + searchTerm + "%'");
        conUrl.searchParams.set("$limit", "30");
        const conRes = await fetch(conUrl.toString());
        if (!conRes.ok) return;
        const contacts = await conRes.json();

        const regIds = Array.from(new Set(contacts.map((cc: any) => cc.registrationid))) as string[];
        const newRegIds = regIds.filter(id => !visitedRegistrations.has(id)).slice(0, 20);

        if (newRegIds.length > 0) {
          // Batch fetch registrations in one query
          const regList = newRegIds.slice(0, 10).map(id => "'" + id + "'").join(",");
          try {
            const regUrl = new URL(NYC + "/" + HPD_REG + ".json");
            regUrl.searchParams.set("$where", "registrationid in(" + regList + ")");
            regUrl.searchParams.set("$limit", "50");
            const regRes = await fetch(regUrl.toString());
            if (regRes.ok) {
              const regs = await regRes.json();
              const nameId = makeNodeId(nameIsEnt ? "entity" : "person", nm);

              for (const reg of regs) {
                visitedRegistrations.add(reg.registrationid);
                const bbl = (reg.boroid || "") + "-" + (reg.block || "") + "-" + (reg.lot || "");
                const propId = makeNodeId("property", bbl);

                if (!nodes.has(propId)) {
                  nodes.set(propId, { id: propId, type: "property", label: bbl, data: {
                    borough: reg.boro || "", boroCode: reg.boroid || "",
                    block: reg.block || "", lot: reg.lot || "",
                    address: reg.housenumber ? reg.housenumber + " " + (reg.streetname || "") : "",
                    zip: reg.zip || "",
                  }});
                }
                edges.push({ from: nameId, to: propId, source: "HPD", role: "registration" });

                if (!visitedProperties.has(bbl)) {
                  visitedProperties.add(bbl);
                  nextQueue.push({ type: "property", key: bbl, boro: reg.boroid, block: reg.block, lot: reg.lot });
                }
              }
            }
          } catch {}
        }

        // Address-based discovery (the JustFix key insight)
        const nameAddresses = new Set<string>();
        contacts.forEach((cc: any) => {
          const ba = [cc.businesshousenumber, cc.businessstreetname].filter(Boolean).join(" ").trim();
          const fa = normalizeAddress(ba + " " + (cc.businesscity || "") + " " + (cc.businesszip || ""));
          if (fa.length > 10) nameAddresses.add(fa);
        });

        for (const addr of Array.from(nameAddresses).slice(0, 1)) {
          const parts = addr.split(" ");
          if (parts.length < 2) continue;
          const streetNum = parts[0];
          const streetName = parts.slice(1, 3).join(" ");

          try {
            const addrUrl = new URL(NYC + "/" + HPD_CONTACTS + ".json");
            addrUrl.searchParams.set("$where", "businesshousenumber='" + streetNum + "' AND upper(businessstreetname) like '%" + streetName + "%'");
            addrUrl.searchParams.set("$limit", "15");
            const addrRes = await fetch(addrUrl.toString());
            if (!addrRes.ok) return;
            const addrContacts = await addrRes.json();

            for (const ac of addrContacts) {
              const acName = ac.corporationname || [ac.firstname, ac.lastname].filter(Boolean).join(" ").trim();
              if (!acName || acName.length < 3) continue;

              const acNameId = makeNodeId(isEntity(acName) ? "entity" : "person", acName);
              const addrId = makeNodeId("address", addr);

              if (!nodes.has(acNameId)) nodes.set(acNameId, { id: acNameId, type: isEntity(acName) ? "entity" : "person", label: normalizeNode(acName) });
              if (!nodes.has(addrId)) nodes.set(addrId, { id: addrId, type: "address", label: addr });
              edges.push({ from: acNameId, to: addrId, source: "HPD", role: "shared_business_address" });

              if (!visitedNames.has(normalizeNode(acName)) && depth < maxDepth - 1) {
                visitedNames.add(normalizeNode(acName));
                nextQueue.push({ type: "name", key: normalizeNode(acName), name: normalizeNode(acName) });
              }
            }
          } catch {}
        }
      } catch (err) { console.error("Graph name error:", err); }
    }));

    currentQueue = nextQueue;
  }

  console.log("Graph:", nodes.size, "nodes,", edges.length, "edges, depth:", depth);

  // Find connected component containing start property
  const adjacency = new Map<string, string[]>();
  edges.forEach(e => {
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    if (!adjacency.has(e.to)) adjacency.set(e.to, []);
    adjacency.get(e.from)!.push(e.to);
    adjacency.get(e.to)!.push(e.from);
  });

  const startPropId = makeNodeId("property", startBBL);
  const component = new Set<string>();
  const bfsQueue = [startPropId];
  component.add(startPropId);

  while (bfsQueue.length > 0) {
    const cur = bfsQueue.shift()!;
    const neighbors = adjacency.get(cur) || [];
    for (let i = 0; i < neighbors.length; i++) {
      if (!component.has(neighbors[i])) {
        component.add(neighbors[i]);
        bfsQueue.push(neighbors[i]);
      }
    }
  }

  const componentArr = Array.from(component);
  const propertyNodes = componentArr.map(id => nodes.get(id)).filter((n): n is GraphNode => !!n && n.type === "property");
  const personNodes = componentArr.map(id => nodes.get(id)).filter((n): n is GraphNode => !!n && n.type === "person");
  const entityNodes = componentArr.map(id => nodes.get(id)).filter((n): n is GraphNode => !!n && n.type === "entity");
  const addressNodes = componentArr.map(id => nodes.get(id)).filter((n): n is GraphNode => !!n && n.type === "address");

  // Enrich with PLUTO
  const properties: PortfolioProperty[] = [];
  const propBBLs = propertyNodes.map(n => {
    const p = n.label.split("-");
    return { bbl: n.label, boroCode: p[0], block: p[1], lot: p[2], data: n.data };
  });

  const boroGroups = new Map<string, typeof propBBLs>();
  propBBLs.forEach(p => {
    if (!boroGroups.has(p.boroCode)) boroGroups.set(p.boroCode, []);
    boroGroups.get(p.boroCode)!.push(p);
  });

  await Promise.all(Array.from(boroGroups.keys()).map(async (boro) => {
    const props = boroGroups.get(boro)!;
    const conds = props.slice(0, 30).map(p => "(block='" + p.block + "' AND lot='" + p.lot + "')").join(" OR ");
    try {
      const url = new URL(NYC + "/64uk-42ks.json");
      url.searchParams.set("$where", "borocode='" + boro + "' AND (" + conds + ")");
      url.searchParams.set("$select", "block,lot,address,ownername,unitsres,yearbuilt,assesstot,numfloors,bldgarea,zonedist1");
      url.searchParams.set("$limit", "50");
      const res = await fetch(url.toString());
      if (res.ok) {
        const plutoData = await res.json();
        plutoData.forEach((pl: any) => {
          const bbl = boro + "-" + pl.block + "-" + pl.lot;
          const prop = props.find(p => p.block === pl.block && p.lot === pl.lot);
          const connNames = edges
            .filter(e => e.to === makeNodeId("property", bbl) || e.from === makeNodeId("property", bbl))
            .map(e => e.from === makeNodeId("property", bbl) ? e.to : e.from)
            .map(id => nodes.get(id)?.label)
            .filter(Boolean) as string[];

          properties.push({
            bbl, address: pl.address || prop?.data?.address || "",
            borough: ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(boro)] || "",
            boroCode: boro, block: pl.block, lot: pl.lot,
            units: parseInt(pl.unitsres || "0"), yearBuilt: parseInt(pl.yearbuilt || "0"),
            assessedValue: parseInt(pl.assesstot || "0"), numFloors: parseInt(pl.numfloors || "0"),
            bldgArea: parseInt(pl.bldgarea || "0"), zoning: pl.zonedist1 || "",
            ownerName: pl.ownername || "",
            connectedVia: Array.from(new Set(connNames)).slice(0, 3),
          });
        });
      }
    } catch {}
  }));

  propBBLs.forEach(p => {
    if (!properties.find(pp => pp.bbl === p.bbl)) {
      properties.push({
        bbl: p.bbl, address: p.data?.address || "",
        borough: ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(p.boroCode)] || "",
        boroCode: p.boroCode, block: p.block, lot: p.lot,
        units: 0, yearBuilt: 0, assessedValue: 0, numFloors: 0, bldgArea: 0, zoning: "",
        ownerName: "", connectedVia: [],
      });
    }
  });

  properties.sort((a, b) => b.assessedValue - a.assessedValue);

  const people = personNodes.map(n => {
    const ne = edges.filter(e => e.from === n.id || e.to === n.id);
    const pc = ne.filter(e => { const o = e.from === n.id ? e.to : e.from; return nodes.get(o)?.type === "property"; }).length;
    const addrs = ne.map(e => { const o = e.from === n.id ? e.to : e.from; return nodes.get(o); })
      .filter((nn): nn is GraphNode => !!nn && nn.type === "address").map(nn => nn.label);
    return { name: n.label, roles: Array.from(new Set(ne.map(e => e.role))), addresses: Array.from(new Set(addrs)), propertyCount: pc };
  }).sort((a, b) => b.propertyCount - a.propertyCount);

  const entities = entityNodes.map(n => {
    const ne = edges.filter(e => e.from === n.id || e.to === n.id);
    const pc = ne.filter(e => { const o = e.from === n.id ? e.to : e.from; return nodes.get(o)?.type === "property"; }).length;
    const addrs = ne.map(e => { const o = e.from === n.id ? e.to : e.from; return nodes.get(o); })
      .filter((nn): nn is GraphNode => !!nn && nn.type === "address").map(nn => nn.label);
    return { name: n.label, roles: Array.from(new Set(ne.map(e => e.role))), addresses: Array.from(new Set(addrs)), propertyCount: pc };
  }).sort((a, b) => b.propertyCount - a.propertyCount);

  const addrCounts = new Map<string, number>();
  addressNodes.forEach(n => {
    addrCounts.set(n.label, edges.filter(e => e.from === n.id || e.to === n.id).length);
  });
  const commonAddresses = Array.from(addrCounts.entries())
    .map(([address, count]) => ({ address, count }))
    .sort((a, b) => b.count - a.count).slice(0, 5);

  console.log("=== GRAPH COMPLETE ===", properties.length, "props,", people.length, "people,", entities.length, "entities");

  return { properties, people, entities, commonAddresses, graph: { nodes: nodes.size, edges: edges.length, depth } };
}
