"use server";
import { skipTrace } from "./tracerfy";
import { verifyLead } from "./lead-verification";
import { getZillowDataForZip, getNYCAverages } from "@/lib/zillow-data";
import { apolloEnrichPerson, apolloEnrichOrganization, apolloFindPeopleAtOrg } from "@/lib/apollo";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const NYC = "https://data.cityofnewyork.us/resource";

// Dataset IDs
const PLUTO = "64uk-42ks";
const HPD_VIOLATIONS = "wvxf-dwi5";
const HPD_COMPLAINTS = "uwyv-629c";
const DOB_PERMITS = "83x8-shf7";
const DOB_JOBS = "ic3t-wcy2";
const HPD_REG = "tesw-yqqr";
const HPD_CONTACTS = "feu5-w2e2";
const HPD_LITIGATION = "59kj-x8nc";
const DOB_ECB = "6bgk-3dad";
const DOB_NOW = "w9ak-ipjd";
const RENT_STAB = "35ss-ekc5";
const SPECULATION = "adax-9x2w";

// Fetch with timeout to prevent hung API calls
async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchBuildingProfile(boroCode: string, block: string, lot: string) {
  console.log("=== BUILDING PROFILE ===", boroCode, block, lot);

  const results: any = {
    pluto: null,
    violations: [],
    violationSummary: { total: 0, open: 0, classA: 0, classB: 0, classC: 0 },
    complaints: [],
    complaintSummary: { total: 0, recent: 0, topTypes: [] as { type: string; count: number }[] },
    permits: [],
    ownerContacts: [] as { name: string; phone: string; address: string; source: string }[],
    rankedContacts: [] as { name: string; phone: string; email: string; role: string; source: string; score: number; address: string }[],
    pdlEnrichment: null as any,
    leadVerification: null as any,
    litigation: [] as any[],
    litigationSummary: { total: 0, open: 0, types: [] as { type: string; count: number }[] },
    ecbViolations: [] as any[],
    ecbSummary: { total: 0, active: 0, totalPenalty: 0 },
    rentStabilized: null as any,
    speculation: null as any,
    distressScore: 0,
    distressSignals: [] as string[],
    hpdContacts: [],
    registrations: [],
    neighborhoodData: null as any,
    phoneRankings: [] as { phone: string; score: number; reason: string; isPrimary: boolean; names: string[]; sources: string[]; filingCount: number }[],
    apolloEnrichment: null as any,
    apolloOrgEnrichment: null as any,
    apolloKeyPeople: [] as any[],
    dobFilings: [] as { jobType: string; filingDate: string; ownerName: string; ownerBusiness: string; ownerPhone: string; permittee: string; permitteePhone: string; units: number; stories: number; status: string; cost: string; description: string; source: string }[],
  };

  // Raw phone entries collected during fetches, scored after all complete
  const rawPhoneEntries: {
    phone: string;
    name: string;
    isOwnerPhone: boolean; // owner phone vs applicant/contractor phone
    filingDate: string;
    source: string;
  }[] = [];

  // Build all fetches in parallel
  const fetches: Promise<void>[] = [];

  // 1. PLUTO building data
  fetches.push((async () => {
    try {
      const url = new URL(NYC + "/" + PLUTO + ".json");
      url.searchParams.set("$where", "borocode='" + boroCode + "' AND block='" + block + "' AND lot='" + lot + "'");
      url.searchParams.set("$limit", "1");
      const res = await fetchWithTimeout(url.toString());
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          const p = data[0];
          results.pluto = {
            address: p.address || "",
            ownerName: p.ownername || "",
            unitsRes: parseInt(p.unitsres || "0"),
            unitsTot: parseInt(p.unitstotal || "0"),
            yearBuilt: parseInt(p.yearbuilt || "0"),
            yearAlter1: parseInt(p.yearalter1 || "0"),
            yearAlter2: parseInt(p.yearalter2 || "0"),
            numFloors: parseInt(p.numfloors || "0"),
            bldgArea: parseInt(p.bldgarea || "0"),
            lotArea: parseInt(p.lotarea || "0"),
            assessTotal: parseInt(p.assesstot || "0"),
            assessLand: parseInt(p.assessland || "0"),
            zoneDist1: p.zonedist1 || "",
            zoneDist2: p.zonedist2 || "",
            bldgClass: p.bldgclass || "",
            landUse: p.landuse || "",
            condoNo: p.condono || "",
            builtFAR: parseFloat(p.builtfar || "0"),
            residFAR: parseFloat(p.residfar || "0"),
            commFAR: parseFloat(p.commfar || "0"),
            facilFAR: parseFloat(p.facilfar || "0"),
            borough: ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(boroCode)] || "",
            block,
            lot,
            boroCode,
          };
        }
      }
    } catch (err) { console.error("PLUTO error:", err); }
  })());

  // 2. HPD Violations
  fetches.push((async () => {
    try {
      const url = new URL(NYC + "/" + HPD_VIOLATIONS + ".json");
      url.searchParams.set("$where", "boroid='" + boroCode + "' AND block='" + block + "' AND lot='" + lot + "'");
      url.searchParams.set("$limit", "200");
      url.searchParams.set("$order", "inspectiondate DESC");
      const res = await fetchWithTimeout(url.toString());
      if (res.ok) {
        const data = await res.json();
        results.violations = data.map((v: any) => ({
          violationId: v.violationid || "",
          class: v.class || "",
          inspectionDate: v.inspectiondate || "",
          approvedDate: v.approveddate || "",
          originalCertifyByDate: v.originalcertifybydate || "",
          status: v.violationstatus || "",
          statusDate: v.statusdate || "",
          orderNumber: v.ordernumber || "",
          novDescription: v.novdescription || "",
          novIssuedDate: v.novissueddate || "",
          currentStatus: v.currentstatus || "",
          currentStatusDate: v.currentstatusdate || "",
        }));

        // Summary
        results.violationSummary.total = data.length;
        results.violationSummary.open = data.filter((v: any) => v.currentstatus === "VIOLATION OPEN" || v.violationstatus === "Open").length;
        results.violationSummary.classA = data.filter((v: any) => v.class === "A").length;
        results.violationSummary.classB = data.filter((v: any) => v.class === "B").length;
        results.violationSummary.classC = data.filter((v: any) => v.class === "C").length;
      }
    } catch (err) { console.error("HPD Violations error:", err); }
  })());

  // 3. HPD Complaints
  fetches.push((async () => {
    try {
      const url = new URL(NYC + "/" + HPD_COMPLAINTS + ".json");
      url.searchParams.set("$where", "boroid='" + boroCode + "' AND block='" + block + "' AND lot='" + lot + "'");
      url.searchParams.set("$limit", "200");
      url.searchParams.set("$order", "receiveddate DESC");
      const res = await fetchWithTimeout(url.toString());
      if (res.ok) {
        const data = await res.json();
        results.complaints = data.map((c: any) => ({
          complaintId: c.complaintid || "",
          status: c.status || "",
          statusDate: c.statusdate || "",
          receivedDate: c.receiveddate || "",
          closedDate: c.closedate || "",
          apartment: c.apartment || "",
          type: c.majorcategory || c.majorcategoryid || "",
          minorCategory: c.minorcategory || c.minorcategoryid || "",
          code: c.code || c.codecid || "",
          statusDescription: c.statusdescription || "",
        }));

        // Summary
        results.complaintSummary.total = data.length;
        const threeYearsAgo = new Date();
        threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
        results.complaintSummary.recent = data.filter((c: any) =>
          c.receiveddate && new Date(c.receiveddate) > threeYearsAgo
        ).length;

        // Top complaint types
        const typeCounts = new Map<string, number>();
        data.forEach((c: any) => {
          const type = c.majorcategory || c.majorcategoryid || "Unknown";
          typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
        });
        results.complaintSummary.topTypes = Array.from(typeCounts.entries())
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
      }
    } catch (err) { console.error("HPD Complaints error:", err); }
  })());

  // 4. DOB Permits (DOB Permit Issuance - has owner phone numbers!)
  fetches.push((async () => {
    try {
      const boroNames = ["", "MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"];
      const permitBorough = boroNames[parseInt(boroCode)] || "";
      const permitBlock = block.padStart(5, "0");
      const permitLot = lot.padStart(5, "0");
      const url = new URL(NYC + "/" + DOB_PERMITS + ".json");
      url.searchParams.set("$where", "borough='" + permitBorough + "' AND block='" + permitBlock + "' AND lot='" + permitLot + "'");
      url.searchParams.set("$select", "owner_s_first_name,owner_s_last_name,owner_s_phone__,owner_s_business_name,permittee_s_first_name,permittee_s_last_name,permittee_s_phone__,permit_type,permit_status,filing_date,job_description");
      url.searchParams.set("$limit", "20");
      url.searchParams.set("$order", "filing_date DESC");
      const res = await fetchWithTimeout(url.toString());
      if (res.ok) {
        const data = await res.json();
        results.permits = data.map((p: any) => ({
          jobNumber: "",
          workType: p.permit_type || "",
          permitType: p.permit_status || "",
          filingDate: p.filing_date || "",
          issuanceDate: p.filing_date || "",
          expirationDate: "",
          jobDescription: p.job_description || "",
          estimatedCost: "",
          ownerName: [p.owner_s_first_name, p.owner_s_last_name].filter(Boolean).join(" ").trim(),
          ownerBusiness: p.owner_s_business_name || "",
        }));

        // Extract owner contacts with phone numbers + raw phone entries for scoring
        const seen = new Set();
        data.forEach((p: any) => {
          const ownerName = [p.owner_s_first_name, p.owner_s_last_name].filter(Boolean).join(" ").trim();
          const ownerPhone = (p.owner_s_phone__ || "").trim();
          const ownerBiz = p.owner_s_business_name || "";
          const filingDate = p.filing_date || "";
          const ownerKey = ownerName + ownerPhone;
          if (ownerKey.length > 3 && !seen.has(ownerKey)) {
            seen.add(ownerKey);
            results.ownerContacts.push({ name: ownerName || ownerBiz, phone: ownerPhone, address: "", source: "DOB Permit" });
          }
          // Track owner phone for ranking
          if (ownerPhone) {
            rawPhoneEntries.push({ phone: ownerPhone, name: ownerName || ownerBiz, isOwnerPhone: true, filingDate, source: "DOB Permit (Owner)" });
          }
          // Track applicant/permittee phone separately (often a contractor)
          const applicantPhone = (p.permittee_s_phone__ || "").trim();
          const applicantName = [p.permittee_s_first_name, p.permittee_s_last_name].filter(Boolean).join(" ").trim();
          if (applicantPhone && applicantPhone !== ownerPhone) {
            rawPhoneEntries.push({ phone: applicantPhone, name: applicantName, isOwnerPhone: false, filingDate, source: "DOB Permit (Applicant)" });
          }
        });
        console.log("  [DOB PERMITS] Found", data.length, "permits,", results.ownerContacts.filter((c: any) => c.source === "DOB Permit" && c.phone).length, "with owner phone");
      }
    } catch (err) { console.error("DOB Permits error:", err); }
  })());

  // 5. HPD Registration + Contacts
  fetches.push((async () => {
    try {
      const regUrl = new URL(NYC + "/" + HPD_REG + ".json");
      regUrl.searchParams.set("$where", "boroid='" + boroCode + "' AND block='" + block + "' AND lot='" + lot + "'");
      regUrl.searchParams.set("$limit", "5");
      regUrl.searchParams.set("$order", "registrationenddate DESC");
      const regRes = await fetchWithTimeout(regUrl.toString());
      if (!regRes.ok) return;
      const regs = await regRes.json();
      results.registrations = regs;

      if (regs.length > 0) {
        const regIds = regs.map((r: any) => "'" + r.registrationid + "'").join(",");
        const conUrl = new URL(NYC + "/" + HPD_CONTACTS + ".json");
        conUrl.searchParams.set("$where", "registrationid in(" + regIds + ")");
        conUrl.searchParams.set("$limit", "30");
        const conRes = await fetchWithTimeout(conUrl.toString());
        if (conRes.ok) {
          const contacts = await conRes.json();
          results.hpdContacts = contacts.map((c: any) => ({
            type: c.type || c.contactdescription || "",
            corporateName: c.corporationname || "",
            firstName: c.firstname || "",
            lastName: c.lastname || "",
            title: c.title || "",
            businessAddress: [c.businesshousenumber, c.businessstreetname].filter(Boolean).join(" "),
            businessCity: c.businesscity || "",
            businessState: c.businessstate || "",
            businessZip: c.businesszip || "",
          }));
          // Also search for management agent phone via SiteManager/Agent contacts
          const agents = contacts.filter((c: any) =>
            c.type === "SiteManager" || c.type === "Agent" || c.type === "ManagingAgent"
          );
          agents.forEach((a: any) => {
            const name = [a.firstname, a.lastname].filter(Boolean).join(" ").trim() || a.corporationname || "";
            const addr = [a.businesshousenumber, a.businessstreetname, a.businesscity, a.businessstate].filter(Boolean).join(" ");
            if (name.length > 2) {
              results.ownerContacts.push({ name, phone: "", address: addr, source: "HPD Agent/Manager" });
            }
          });
        }
      }
    } catch (err) { console.error("HPD Reg error:", err); }
  })());

  // 6. HPD Litigation (lawsuits against owner)
  fetches.push((async () => {
    try {
      const url = new URL(NYC + "/" + HPD_LITIGATION + ".json");
      url.searchParams.set("$where", "boroid='" + boroCode + "' AND block='" + block + "' AND lot='" + lot + "'");
      url.searchParams.set("$limit", "50");
      url.searchParams.set("$order", "caseopendate DESC");
      const res = await fetchWithTimeout(url.toString());
      if (res.ok) {
        const data = await res.json();
        results.litigation = data.map((l: any) => ({
          litigationId: l.litigationid || "",
          caseType: l.casetype || "",
          caseOpenDate: l.caseopendate || "",
          caseStatus: l.casestatus || "",
          statusDate: l.statusdate || "",
          penalty: l.penalty || "",
          respondent: l.respondent || "",
          findingOfHarassment: l.findingofharassment || "",
        }));
        results.litigationSummary.total = data.length;
        results.litigationSummary.open = data.filter((l: any) => l.casestatus === "OPEN" || l.casestatus === "Open").length;
        const typeCounts = new Map();
        data.forEach((l: any) => {
          const t = l.casetype || "Unknown";
          typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
        });
        results.litigationSummary.types = Array.from(typeCounts.entries()).map(([type, count]: [string, number]) => ({ type, count })).sort((a, b) => b.count - a.count);
      }
    } catch (err) { console.error("HPD Litigation error:", err); }
  })());

  // 7. DOB ECB Violations (serious violations with fines)
  fetches.push((async () => {
    try {
      const url = new URL(NYC + "/" + DOB_ECB + ".json");
      const ecbBlock = block.padStart(5, "0");
      const ecbLot = lot.padStart(4, "0");
      url.searchParams.set("$where", "boro='" + boroCode + "' AND block='" + ecbBlock + "' AND lot='" + ecbLot + "'");
      url.searchParams.set("$limit", "50");
      url.searchParams.set("$order", "issueddate DESC");
      const res = await fetchWithTimeout(url.toString());
      if (res.ok) {
        const data = await res.json();
        results.ecbViolations = data.map((e: any) => ({
          ecbNumber: e.ecbviolationnumber || e.isn_dob_bis_extract || "",
          violationType: e.violationtype || "",
          issuedDate: e.issueddate || "",
          violationNumber: e.violationnumber || "",
          status: e.ecbviolationstatus || "",
          penaltyApplied: parseFloat(e.penaltyapplied || "0"),
          penaltyBalance: parseFloat(e.penaltybalancedue || "0"),
          amountPaid: parseFloat(e.amountpaid || "0"),
          amountBalDue: parseFloat(e.amountbaldue || "0"),
          infraction: e.infraction_codes || e.section_of_law || "",
          respondent: e.respondentname || "",
          severity: e.severity || "",
        }));
        results.ecbSummary.total = data.length;
        results.ecbSummary.active = data.filter((e: any) => e.ecbviolationstatus === "RESOLVE" ? false : true).length;
        results.ecbSummary.totalPenalty = data.reduce((sum: number, e: any) => sum + parseFloat(e.penaltybalancedue || "0"), 0);
      }
    } catch (err) { console.error("DOB ECB error:", err); }
  })());

  // 8. Rent Stabilization (check if building is stabilized)
  fetches.push((async () => {
    try {
      const url = new URL(NYC + "/" + RENT_STAB + ".json");
      url.searchParams.set("$where", "boroid='" + boroCode + "' AND block='" + block + "' AND lot='" + lot + "'");
      url.searchParams.set("$limit", "5");
      const res = await fetchWithTimeout(url.toString());
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          const r = data[0];
          results.rentStabilized = {
            status: "Yes",
            uc2007: parseInt(r.uc2007 || "0"),
            uc2008: parseInt(r.uc2008 || "0"),
            uc2009: parseInt(r.uc2009 || "0"),
            uc2010: parseInt(r.uc2010 || "0"),
            uc2011: parseInt(r.uc2011 || "0"),
            uc2012: parseInt(r.uc2012 || "0"),
            uc2013: parseInt(r.uc2013 || "0"),
            uc2014: parseInt(r.uc2014 || "0"),
            uc2015: parseInt(r.uc2015 || "0"),
            uc2016: parseInt(r.uc2016 || "0"),
            uc2017: parseInt(r.uc2017 || "0"),
            uc2018: parseInt(r.uc2018 || "0"),
            uc2019: parseInt(r.uc2019 || "0"),
            uc2020: parseInt(r.uc2020 || "0"),
            uc2021: parseInt(r.uc2021 || "0"),
            uc2022: parseInt(r.uc2022 || "0"),
            uc2023: parseInt(r.uc2023 || "0"),
            uc2024: parseInt(r.uc2024 || "0"),
            buildingId: r.buildingid || "",
          };
        }
      }
    } catch (err) { console.error("Rent Stab error:", err); }
  })());

  // 9. HPD Speculation Watch List
  fetches.push((async () => {
    try {
      const url = new URL(NYC + "/" + SPECULATION + ".json");
      url.searchParams.set("$where", "boroid='" + boroCode + "' AND block='" + block + "' AND lot='" + lot + "'");
      url.searchParams.set("$limit", "5");
      const res = await fetchWithTimeout(url.toString());
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          results.speculation = {
            onWatchList: true,
            deedDate: data[0].deeddate || "",
            salePrice: parseFloat(data[0].saleprice || "0"),
            capRate: data[0].caprate || "",
            boroughMedianCap: data[0].boroughmedian || "",
          };
        }
      }
    } catch (err) { console.error("Speculation error:", err); }
  })());

  // 6. DOB Job Applications (has owner phone numbers!)
  fetches.push((async () => {
    try {
      const boroNames = ["", "MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"];
      const jobBorough = boroNames[parseInt(boroCode)] || "";
      const jobBlock = block.padStart(5, "0");
      const jobLot = lot.padStart(5, "0");
      const url = new URL(NYC + "/" + DOB_JOBS + ".json");
      url.searchParams.set("$where", "borough='" + jobBorough + "' AND block='" + jobBlock + "' AND lot='" + jobLot + "'");
      url.searchParams.set("$select", "owner_s_first_name,owner_s_last_name,owner_sphone__,owner_s_business_name,owner_type,latest_action_date,job_type,house__,street_name");
      url.searchParams.set("$limit", "10");
      url.searchParams.set("$order", "latest_action_date DESC");
      const res = await fetchWithTimeout(url.toString());
      if (res.ok) {
        const data = await res.json();
        console.log("  [DOB JOBS] Found", data.length, "job applications for", jobBorough, "block", jobBlock, "lot", jobLot);
        const seen = new Set();
        data.forEach((d: any) => {
          const name = (d.owner_s_business_name && d.owner_s_business_name !== "N/A")
            ? d.owner_s_business_name
            : [d.owner_s_first_name, d.owner_s_last_name].filter(Boolean).join(" ").trim();
          const phone = (d.owner_sphone__ || "").trim();
          const addr = [d.house__, d.street_name].filter(Boolean).join(" ").trim();
          const filingDate = d.latest_action_date || "";
          const key = name + phone;
          console.log("  [DOB JOBS] Contact:", name, "| phone:", JSON.stringify(phone));
          if (key.length > 3 && !seen.has(key)) {
            seen.add(key);
            results.ownerContacts.push({ name, phone, address: addr, source: "DOB Job Filing" });
          }
          // Store structured filing data for AI analysis
          results.dobFilings.push({
            jobType: d.job_type || "",
            filingDate,
            ownerName: [d.owner_s_first_name, d.owner_s_last_name].filter(Boolean).join(" ").trim(),
            ownerBusiness: d.owner_s_business_name || "",
            ownerPhone: phone,
            permittee: "",
            permitteePhone: "",
            units: 0,
            stories: 0,
            status: "",
            cost: "",
            description: "",
            source: "DOB BIS",
          });
          // Track for phone ranking (DOB Jobs are always owner phones)
          if (phone) {
            rawPhoneEntries.push({ phone, name, isOwnerPhone: true, filingDate, source: "DOB Job Filing" });
          }
        });
      } else {
        console.log("  [DOB JOBS] API returned status:", res.status);
        const errText = await res.text();
        console.log("  [DOB JOBS] Error:", errText.slice(0, 200));
      }
    } catch (err) { console.error("DOB Jobs error:", err); }
  })());

  // 11. DOB NOW: Build – Job Application Filings (w9ak-ipjd — additional owner phones + filing data)
  fetches.push((async () => {
    try {
      const boroMap: Record<string, string> = { "1": "MANHATTAN", "2": "BRONX", "3": "BROOKLYN", "4": "QUEENS", "5": "STATEN ISLAND" };
      const nowBorough = boroMap[boroCode] || "";
      const nowBlock = block.padStart(5, "0");
      const nowLot = lot.padStart(5, "0");
      const url = new URL(NYC + "/" + DOB_NOW + ".json");
      url.searchParams.set("$where", "borough='" + nowBorough + "' AND block='" + nowBlock + "' AND lot='" + nowLot + "'");
      url.searchParams.set("$select", "job_filing_number,job_type,filing_date,filing_status,owner_first_name,owner_last_name,owner_business_name,owner_phone,permittee_first_name,permittee_last_name,permittee_business_name,permittee_phone,proposed_dwelling_units,proposed_no_of_stories,estimated_job_costs,job_description");
      url.searchParams.set("$limit", "15");
      url.searchParams.set("$order", "filing_date DESC");
      const res = await fetchWithTimeout(url.toString());
      if (res.ok) {
        const data = await res.json();
        console.log("  [DOB NOW] Found", data.length, "filings for", nowBorough, "block", nowBlock, "lot", nowLot);
        const seen = new Set();
        data.forEach((d: any) => {
          const ownerName = (d.owner_business_name && d.owner_business_name !== "N/A")
            ? d.owner_business_name
            : [d.owner_first_name, d.owner_last_name].filter(Boolean).join(" ").trim();
          const ownerPhone = (d.owner_phone || "").trim();
          const permittee = (d.permittee_business_name && d.permittee_business_name !== "N/A")
            ? d.permittee_business_name
            : [d.permittee_first_name, d.permittee_last_name].filter(Boolean).join(" ").trim();
          const permitteePhone = (d.permittee_phone || "").trim();
          const filingDate = d.filing_date || "";

          // Store structured filing data for AI analysis
          results.dobFilings.push({
            jobType: d.job_type || "",
            filingDate,
            ownerName,
            ownerBusiness: d.owner_business_name || "",
            ownerPhone,
            permittee,
            permitteePhone,
            units: parseInt(d.proposed_dwelling_units || "0"),
            stories: parseInt(d.proposed_no_of_stories || "0"),
            status: d.filing_status || "",
            cost: d.estimated_job_costs || "",
            description: d.job_description || "",
            source: "DOB NOW",
          });

          // Feed into owner contacts
          const key = ownerName + ownerPhone;
          if (key.length > 3 && !seen.has(key)) {
            seen.add(key);
            results.ownerContacts.push({ name: ownerName, phone: ownerPhone, address: "", source: "DOB NOW Filing" });
          }

          // Feed into phone rankings
          if (ownerPhone) {
            rawPhoneEntries.push({ phone: ownerPhone, name: ownerName, isOwnerPhone: true, filingDate, source: "DOB NOW (Owner)" });
          }
          if (permitteePhone && permitteePhone !== ownerPhone) {
            rawPhoneEntries.push({ phone: permitteePhone, name: permittee, isOwnerPhone: false, filingDate, source: "DOB NOW (Permittee)" });
          }
        });
      }
    } catch (err) { console.error("DOB NOW error:", err); }
  })());

  await Promise.all(fetches);

  // ============================================================
  // Neighborhood Data (Zillow)
  // ============================================================
  try {
    // Extract ZIP code from HPD registrations (the registrations fetch stores raw data)
    const regZip = results.registrations?.[0]?.zip;
    if (regZip) {
      const zillowData = getZillowDataForZip(regZip);
      if (zillowData && (zillowData.currentHomeValue || zillowData.currentRent)) {
        const nycAvg = getNYCAverages();
        results.neighborhoodData = { ...zillowData, nycAverages: nycAvg };
      }
    }
  } catch (err) {
    console.error("Zillow data error:", err);
  }

  // ============================================================
  // Phone Number Ranking — score by likelihood of reaching owner
  // ============================================================
  if (rawPhoneEntries.length > 0) {
    const cleanPhone = (p: string) => p.replace(/\D/g, "").slice(-10);

    // Collect HPD owner names for matching
    const hpdIndividualOwners = (results.hpdContacts || [])
      .filter((c: any) => c.type === "IndividualOwner" || c.type === "HeadOfficer")
      .map((c: any) => ((c.firstName || "") + " " + (c.lastName || "")).trim().toUpperCase())
      .filter((n: string) => n.length > 2);
    const hpdCorpOwners = (results.hpdContacts || [])
      .filter((c: any) => c.type === "CorporateOwner")
      .map((c: any) => (c.corporateName || "").toUpperCase())
      .filter((n: string) => n.length > 2);
    const plutoOwner = (results.pluto?.ownerName || "").toUpperCase();

    // Group entries by cleaned phone number
    const phoneGroups = new Map<string, typeof rawPhoneEntries>();
    for (const entry of rawPhoneEntries) {
      const clean = cleanPhone(entry.phone);
      if (clean.length < 7) continue;
      if (!phoneGroups.has(clean)) phoneGroups.set(clean, []);
      phoneGroups.get(clean)!.push(entry);
    }

    const now = new Date();
    const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
    const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());

    const rankings: typeof results.phoneRankings = [];

    for (const [cleanNum, entries] of phoneGroups) {
      let score = 50; // base score
      const reasons: string[] = [];
      const allNames = [...new Set(entries.map(e => e.name).filter(Boolean))];
      const allSources = [...new Set(entries.map(e => e.source))];

      // 1. Owner phone bonus (+20 if any entry is an owner phone)
      const hasOwnerPhone = entries.some(e => e.isOwnerPhone);
      if (hasOwnerPhone) {
        score += 20;
        reasons.push("Owner phone on filing");
      } else {
        reasons.push("Applicant/contractor phone");
      }

      // 2. Name matches HPD IndividualOwner (+25)
      const nameMatchesIndividual = allNames.some(n =>
        hpdIndividualOwners.some((ho: string) => {
          const nameUp = n.toUpperCase();
          const lastNameHPD = ho.split(" ").pop() || "";
          return nameUp === ho || (lastNameHPD.length > 2 && nameUp.includes(lastNameHPD));
        })
      );
      if (nameMatchesIndividual) {
        score += 25;
        reasons.push("Name matches HPD registered owner");
      }

      // 3. Name matches corporate owner or PLUTO owner (+15)
      if (!nameMatchesIndividual) {
        const nameMatchesCorp = allNames.some(n => {
          const nameUp = n.toUpperCase();
          return hpdCorpOwners.some((co: string) => nameUp.includes(co) || co.includes(nameUp)) ||
            (plutoOwner.length > 3 && (nameUp.includes(plutoOwner) || plutoOwner.includes(nameUp)));
        });
        if (nameMatchesCorp) {
          score += 15;
          reasons.push("Name matches entity owner");
        }
      }

      // 4. Recency bonus
      const dates = entries.map(e => e.filingDate).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
      const mostRecent = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
      if (mostRecent) {
        if (mostRecent >= twoYearsAgo) {
          score += 15;
          reasons.push("Recent filing (last 2 years)");
        } else if (mostRecent >= fiveYearsAgo) {
          score += 10;
          reasons.push("Filing within last 5 years");
        }
      }

      // 5. Multiple appearances bonus (+10 per extra, cap at +30)
      const extraAppearances = Math.min(entries.length - 1, 3);
      if (extraAppearances > 0) {
        score += extraAppearances * 10;
        reasons.push(`Found in ${entries.length} filings`);
      }

      score = Math.min(100, score);

      rankings.push({
        phone: entries[0].phone, // use original formatting
        score,
        reason: reasons.join(", "),
        isPrimary: false,
        names: allNames,
        sources: allSources,
        filingCount: entries.length,
      });
    }

    // Sort by score descending, mark #1 as primary
    rankings.sort((a: { score: number }, b: { score: number }) => b.score - a.score);
    if (rankings.length > 0) {
      rankings[0].isPrimary = true;
    }

    results.phoneRankings = rankings;
    console.log("  [PHONE RANKINGS]", rankings.length, "unique phones scored. Top:", rankings[0]?.phone, "score:", rankings[0]?.score);
  }

  // ============================================================
  // Smart Contact Ranking
  // ============================================================
  console.log("  [CONTACTS] ownerContacts:", results.ownerContacts.length, "(" + results.ownerContacts.filter((c: any) => c.phone).length + " with phone)");

  const ranked: { name: string; phone: string; email: string; role: string; source: string; score: number; address: string }[] = [];
  const seenPhones = new Set<string>();
  const seenNames = new Set<string>();

  // 1. DOB contacts with phones (highest value - verified phone numbers)
  results.ownerContacts.filter((c: any) => c.phone).forEach((c: any) => {
    if (!seenPhones.has(c.phone)) {
      seenPhones.add(c.phone);
      ranked.push({
        name: c.name, phone: c.phone, email: "", role: "Owner/Applicant",
        source: c.source, score: 90, address: c.address
      });
    }
  });

  // 2. HPD Individual Owners and Head Officers
  results.hpdContacts.filter((c: any) =>
    c.type === "IndividualOwner" || c.type === "HeadOfficer"
  ).forEach((c: any) => {
    const name = (c.firstName + " " + c.lastName).trim();
    if (name.length > 2 && !seenNames.has(name.toUpperCase())) {
      seenNames.add(name.toUpperCase());
      const addr = [c.businessAddress, c.businessCity, c.businessState].filter(Boolean).join(", ");
      ranked.push({
        name, phone: "", email: "", role: c.type === "HeadOfficer" ? "Head Officer" : "Individual Owner",
        source: "HPD Registration", score: 75, address: addr
      });
    }
  });

  // 3. HPD Site Managers and Agents (good for reaching management office)
  results.hpdContacts.filter((c: any) =>
    c.type === "SiteManager" || c.type === "Agent" || c.type === "ManagingAgent"
  ).forEach((c: any) => {
    const name = (c.firstName + " " + c.lastName).trim() || c.corporateName;
    if (name && name.length > 2 && !seenNames.has(name.toUpperCase())) {
      seenNames.add(name.toUpperCase());
      const addr = [c.businessAddress, c.businessCity, c.businessState].filter(Boolean).join(", ");
      ranked.push({
        name, phone: "", email: "", role: c.type === "SiteManager" ? "Site Manager" : "Managing Agent",
        source: "HPD Registration", score: 65, address: addr
      });
    }
  });

  // 4. Corporate owners
  results.hpdContacts.filter((c: any) => c.type === "CorporateOwner").forEach((c: any) => {
    const name = c.corporateName;
    if (name && name.length > 2 && !seenNames.has(name.toUpperCase())) {
      seenNames.add(name.toUpperCase());
      const addr = [c.businessAddress, c.businessCity, c.businessState].filter(Boolean).join(", ");
      ranked.push({
        name, phone: "", email: "", role: "Corporate Owner",
        source: "HPD Registration", score: 55, address: addr
      });
    }
  });

  // 5. DOB contacts without phone (still useful for name + address)
  results.ownerContacts.filter((c: any) => !c.phone).forEach((c: any) => {
    if (c.name.length > 2 && !seenNames.has(c.name.toUpperCase())) {
      seenNames.add(c.name.toUpperCase());
      ranked.push({
        name: c.name, phone: "", email: "", role: "Permit Applicant",
        source: c.source, score: 40, address: c.address
      });
    }
  });

  // Sort by score descending
  ranked.sort((a, b) => b.score - a.score);

  console.log("  [RANKED]", ranked.length, "contacts, phones:", ranked.filter(r => r.phone).map(r => r.name).join(", ") || "none");

  // ============================================================
  // PDL + Apollo Enrichment — run in parallel (saves ~1-2s)
  // ============================================================
  const topIndividualForPDL = ranked.find(r =>
    r.role !== "Corporate Owner" && r.role !== "Permit Applicant" &&
    !r.name.toUpperCase().match(/LLC|CORP|INC|L\.P\.|TRUST|REALTY/)
  );
  const topIndividualForApollo = ranked.find(r =>
    !r.name.toUpperCase().match(/LLC|CORP|INC|L\.P\.|TRUST|REALTY/) &&
    r.role !== "Permit Applicant" && r.name.trim().includes(" ")
  );
  const topCorpForApollo = ranked.find(r =>
    r.name.toUpperCase().match(/LLC|CORP|INC/)
  );

  await Promise.all([
    // PDL enrichment — auto-enrich top individual if no phones found
    (async () => {
      const hasAnyPhone = ranked.some(r => r.phone);
      if (!hasAnyPhone && topIndividualForPDL) {
        try {
          console.log("Auto-enriching with PDL:", topIndividualForPDL.name);
          const pdl = await skipTrace(
            topIndividualForPDL.name,
            results.pluto?.address || "",
            results.pluto?.borough || "",
            "NY", ""
          );
          if (pdl && !pdl.error) {
            if (pdl.phones && pdl.phones.length > 0) {
              topIndividualForPDL.phone = pdl.phones[0].number;
              topIndividualForPDL.source += " + PDL";
              topIndividualForPDL.score = 95;
            }
            if (pdl.emails && pdl.emails.length > 0) {
              topIndividualForPDL.email = pdl.emails[0];
            }
            results.pdlEnrichment = pdl;
          }
        } catch (err) {
          console.error("PDL auto-enrich error:", err);
        }
      }
    })(),

    // Apollo enrichment — person + org + key people
    (async () => {
      try {
        const apolloPromises: Promise<void>[] = [];

        if (topIndividualForApollo && topIndividualForApollo.name.length > 3) {
          apolloPromises.push((async () => {
            console.log("[APOLLO] Enriching owner:", topIndividualForApollo.name);
            const apolloPerson = await apolloEnrichPerson(
              topIndividualForApollo.name,
              results.pluto?.borough || undefined,
              topCorpForApollo?.name || undefined,
            );
            if (apolloPerson) {
              results.apolloEnrichment = apolloPerson;
              if (apolloPerson.phone && !topIndividualForApollo.phone) {
                topIndividualForApollo.phone = apolloPerson.phone;
                topIndividualForApollo.source += " + Apollo";
                topIndividualForApollo.score = Math.min(100, topIndividualForApollo.score + 10);
              }
              if (apolloPerson.email && !topIndividualForApollo.email) {
                topIndividualForApollo.email = apolloPerson.email;
              }
            }
          })());
        }

        if (topCorpForApollo && topCorpForApollo.name.length > 3) {
          apolloPromises.push((async () => {
            console.log("[APOLLO] Enriching org:", topCorpForApollo.name);
            const apolloOrg = await apolloEnrichOrganization(topCorpForApollo.name);
            if (apolloOrg) {
              results.apolloOrgEnrichment = apolloOrg;
            }
            const keyPeople = await apolloFindPeopleAtOrg(topCorpForApollo.name);
            if (keyPeople.length > 0) {
              results.apolloKeyPeople = keyPeople;
            }
          })());
        }

        if (apolloPromises.length > 0) {
          await Promise.all(apolloPromises);
          console.log("[APOLLO] Enrichment complete. Person:", !!results.apolloEnrichment, "Org:", !!results.apolloOrgEnrichment, "Key people:", results.apolloKeyPeople.length);
        }
      } catch (err) {
        console.error("[APOLLO] Enrichment error:", err);
      }
    })(),
  ]);

  results.rankedContacts = ranked;

  // ============================================================
  // Lead Verification + Scoring
  // ============================================================
  try {
    const topIndividual = ranked.find(r =>
      !r.name.toUpperCase().match(/LLC|CORP|INC|L\.P\.|TRUST/)
    );
    const topCorp = ranked.find(r =>
      r.name.toUpperCase().match(/LLC|CORP|INC/)
    );
    const ownerName = topIndividual?.name || "";
    const corpName = topCorp?.name || null;

    if (ownerName.length > 3) {
      console.log("Running lead verification for:", ownerName);
      const verification = await verifyLead(
        ownerName,
        corpName,
        results.pluto?.address || "",
        results.pluto?.borough || "",
        { ...results, relatedCount: 0 }
      );
      results.leadVerification = verification;
    }
  } catch (err) {
    console.error("Lead verification error:", err);
  }

  // ============================================================
  // DISTRESS SCORING - signals that owner may be motivated to sell
  // ============================================================
  let distress = 0;
  const signals = [];

  // HPD violations
  if (results.violationSummary.open > 10) { distress += 20; signals.push(results.violationSummary.open + " open HPD violations"); }
  else if (results.violationSummary.open > 5) { distress += 10; signals.push(results.violationSummary.open + " open HPD violations"); }
  if (results.violationSummary.classC > 3) { distress += 15; signals.push(results.violationSummary.classC + " hazardous (Class C) violations"); }

  // HPD litigation
  if (results.litigationSummary.open > 0) { distress += 25; signals.push(results.litigationSummary.open + " open HPD lawsuits"); }
  if (results.litigation.some((l: any) => l.findingOfHarassment === "YES")) { distress += 20; signals.push("Finding of harassment"); }

  // ECB violations with penalties
  if (results.ecbSummary.totalPenalty > 10000) { distress += 20; signals.push("$" + Math.round(results.ecbSummary.totalPenalty).toLocaleString() + " in ECB penalties"); }
  else if (results.ecbSummary.totalPenalty > 1000) { distress += 10; signals.push("$" + Math.round(results.ecbSummary.totalPenalty).toLocaleString() + " in ECB penalties"); }

  // Speculation watch list
  if (results.speculation?.onWatchList) { distress += 15; signals.push("On HPD Speculation Watch List"); }

  // Rent stabilization - losing units indicates potential issues
  if (results.rentStabilized) {
    const latest = results.rentStabilized.uc2024 || results.rentStabilized.uc2023 || results.rentStabilized.uc2022;
    const earliest = results.rentStabilized.uc2007 || results.rentStabilized.uc2008;
    if (earliest > 0 && latest > 0 && latest < earliest * 0.7) {
      distress += 10;
      signals.push("Lost " + Math.round((1 - latest / earliest) * 100) + "% of rent-stabilized units");
    }
  }

  // Many complaints
  if (results.complaintSummary.recent > 15) { distress += 10; signals.push(results.complaintSummary.recent + " complaints in last 3 years"); }

  results.distressScore = Math.min(100, distress);
  results.distressSignals = signals;

  console.log("=== BUILDING PROFILE COMPLETE ===",
    "violations:", results.violations.length,
    "complaints:", results.complaints.length,
    "permits:", results.permits.length,
    "contacts:", results.hpdContacts.length
  );

  return results;
}


// ============================================================
// Related Properties - find buildings by same owner/LLC/person
// ============================================================
export async function fetchRelatedProperties(ownerNames: string[], boroCode: string) {
  const NYC_BASE = "https://data.cityofnewyork.us/resource";
  const PLUTO = "64uk-42ks";
  const HPD_REG = "tesw-yqqr";
  const HPD_CON = "feu5-w2e2";

  const related: any[] = [];
  const seenBBLs = new Set<string>();

  // Strategy 1: Search PLUTO by owner name — all names in parallel
  const nameSearches = ownerNames.slice(0, 3).filter(name => name && name.length >= 3);
  await Promise.all(nameSearches.map(async (name) => {
    try {
      const searchName = name.toUpperCase().replace(/'/g, "''");
      const url = new URL(NYC_BASE + "/" + PLUTO + ".json");
      url.searchParams.set("$where", "upper(ownername) LIKE '%" + searchName + "%'");
      url.searchParams.set("$select", "borocode,block,lot,address,borough,unitsres,numfloors,yearbuilt,assesstot,ownername,bbl,zonedist1,bldgclass");
      url.searchParams.set("$limit", "25");
      url.searchParams.set("$order", "unitsres DESC");

      const res = await fetchWithTimeout(url.toString());
      if (res.ok) {
        const data = await res.json();
        data.forEach((d: any) => {
          const bbl = d.bbl || (d.borocode + (d.block || "").padStart(5, "0") + (d.lot || "").padStart(4, "0"));
          if (!seenBBLs.has(bbl)) {
            seenBBLs.add(bbl);
            related.push({
              bbl,
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
              zoning: d.zonedist1 || "",
              buildingClass: d.bldgclass || "",
              matchedVia: name,
            });
          }
        });
      }
    } catch {}
  }));

  // Strategy 2: Search HPD contacts by person/corp name — regIds in parallel batches of 5
  for (const name of ownerNames.slice(0, 2)) {
    if (!name || name.length < 4) continue;
    try {
      const searchName = name.toUpperCase().replace(/'/g, "''");
      const field = name.includes("LLC") || name.includes("CORP") || name.includes("INC")
        ? "upper(corporationname)"
        : "upper(lastname)";
      const searchTerm = name.includes(" ") && !name.includes("LLC")
        ? name.split(" ").pop()?.toUpperCase() || name.toUpperCase()
        : searchName;

      const url = new URL(NYC_BASE + "/" + HPD_CON + ".json");
      url.searchParams.set("$where", field + " LIKE '%" + searchTerm.replace(/'/g, "''") + "%'");
      url.searchParams.set("$select", "registrationid");
      url.searchParams.set("$limit", "30");

      const res = await fetchWithTimeout(url.toString());
      if (!res.ok) continue;
      const contacts = await res.json();
      if (contacts.length === 0) continue;

      const regIds: string[] = [...new Set<string>(contacts.map((c: any) => c.registrationid))].slice(0, 15);

      // Process regIds in parallel batches of 5
      for (let i = 0; i < regIds.length; i += 5) {
        const batch = regIds.slice(i, i + 5);
        await Promise.all(batch.map(async (regId) => {
          try {
            const regUrl = new URL(NYC_BASE + "/" + HPD_REG + ".json");
            regUrl.searchParams.set("$where", "registrationid='" + regId + "'");
            regUrl.searchParams.set("$select", "boroid,block,lot");
            regUrl.searchParams.set("$limit", "1");

            const regRes = await fetchWithTimeout(regUrl.toString());
            if (!regRes.ok) return;
            const regs = await regRes.json();
            if (regs.length === 0) return;

            const r = regs[0];
            const bbl = r.boroid + (r.block || "").padStart(5, "0") + (r.lot || "").padStart(4, "0");
            if (seenBBLs.has(bbl)) return;
            seenBBLs.add(bbl);

            // Get PLUTO data for this building
            const plutoUrl = new URL(NYC_BASE + "/" + PLUTO + ".json");
            plutoUrl.searchParams.set("$where", "borocode='" + r.boroid + "' AND block='" + r.block + "' AND lot='" + r.lot + "'");
            plutoUrl.searchParams.set("$select", "address,borough,unitsres,numfloors,yearbuilt,assesstot,ownername,bbl,zonedist1,bldgclass,borocode,block,lot");
            plutoUrl.searchParams.set("$limit", "1");

            const plutoRes = await fetchWithTimeout(plutoUrl.toString());
            if (!plutoRes.ok) return;
            const plutoData = await plutoRes.json();
            if (plutoData.length === 0) return;

            const d = plutoData[0];
            related.push({
              bbl,
              boroCode: d.borocode || r.boroid,
              block: d.block || r.block,
              lot: d.lot || r.lot,
              address: d.address || "",
              borough: d.borough || "",
              units: parseInt(d.unitsres) || 0,
              floors: parseInt(d.numfloors) || 0,
              yearBuilt: parseInt(d.yearbuilt) || 0,
              assessedValue: parseFloat(d.assesstot) || 0,
              ownerName: d.ownername || "",
              zoning: d.zonedist1 || "",
              buildingClass: d.bldgclass || "",
              matchedVia: name + " (HPD)",
            });
          } catch {}
        }));
      }
    } catch {}
  }

  // Sort by units descending
  related.sort((a, b) => b.units - a.units);
  return related;
}

// ============================================================
// Create Contact from Building Profile + Auto-Enrich
// ============================================================
export async function createContactFromBuilding(
  data: {
    firstName: string;
    lastName: string;
    company?: string;
    phone?: string;
    email?: string;
    address?: string;
    borough?: string;
    boroCode?: string;
    block?: string;
    lot?: string;
  }
) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");

  // Create landlord contact
  const contact = await prisma.contact.create({
    data: {
      orgId: user.orgId,
      assignedTo: user.id,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      city: data.borough || null,
      state: "NY",
      source: "market_intel",
      status: "lead",
      contactType: "landlord",
      typeData: {
        entityName: data.company || null,
        boroCode: data.boroCode || null,
        block: data.block || null,
        lot: data.lot || null,
      },
      notes: `Created from building profile: ${data.address || ""}${data.company ? ` (${data.company})` : ""}`,
    },
  });

  // Auto-enrich with Apollo
  let enriched = false;
  let apolloPerson = null;
  let apolloOrg = null;

  const hasName = data.firstName && data.lastName;
  const enrichPromises: Promise<void>[] = [];

  if (hasName) {
    enrichPromises.push((async () => {
      const result = await apolloEnrichPerson(
        `${data.firstName} ${data.lastName}`,
        data.borough || undefined,
        data.company || undefined,
        data.email || undefined,
      );
      if (result) {
        apolloPerson = result;
        enriched = true;
        // Update contact with enriched data
        const updates: any = {};
        if (result.email && !data.email) updates.email = result.email;
        if (result.phone && !data.phone) updates.phone = result.phone;
        if (Object.keys(updates).length > 0) {
          await prisma.contact.update({ where: { id: contact.id }, data: updates });
        }
        // Save enrichment profile
        await prisma.enrichmentProfile.create({
          data: {
            contactId: contact.id,
            employer: result.company || data.company || null,
            jobTitle: result.title || null,
            industry: result.companyIndustry || null,
            linkedinUrl: result.linkedinUrl || null,
            profilePhotoUrl: result.photoUrl || null,
            rawData: JSON.parse(JSON.stringify({ apolloPerson: result })),
            dataSources: ["apollo"],
            confidenceLevel: result.email && result.phone ? "high" : result.email || result.phone ? "medium" : "low",
          },
        });
      }
    })());
  }

  if (data.company && !data.company.match(/^\d/)) {
    enrichPromises.push((async () => {
      const result = await apolloEnrichOrganization(data.company!);
      if (result) {
        apolloOrg = result;
        enriched = true;
        // Update enrichment profile with org data if it exists
        const existing = await prisma.enrichmentProfile.findFirst({
          where: { contactId: contact.id },
        });
        if (existing) {
          await prisma.enrichmentProfile.update({
            where: { id: existing.id },
            data: {
              rawData: JSON.parse(JSON.stringify({ ...(existing.rawData as any), apolloOrg: result })),
              dataSources: [...(existing.dataSources || []), "apollo_org"],
            },
          });
        } else {
          await prisma.enrichmentProfile.create({
            data: {
              contactId: contact.id,
              employer: data.company || null,
              industry: result.industry || null,
              rawData: JSON.parse(JSON.stringify({ apolloOrg: result })),
              dataSources: ["apollo_org"],
              confidenceLevel: "low",
            },
          });
        }
      }
    })());
  }

  if (enrichPromises.length > 0) {
    await Promise.all(enrichPromises);
  }

  revalidatePath("/contacts");
  return { contactId: contact.id, enriched, apolloPerson, apolloOrg };
}

// ============================================================
// Live Comps — search comparable sales from NYC DOF
// ============================================================
export async function fetchBuildingComps(params: {
  zip: string;
  radiusMiles?: number;
  yearsBack?: number;
  minUnits?: number;
  minPrice?: number;
  limit?: number;
}) {
  const { searchComps } = await import("@/lib/comps-engine");
  return searchComps(params);
}
