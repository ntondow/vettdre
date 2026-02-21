"use server";

import prisma from "@/lib/prisma";
import {
  apolloEnrichPerson,
  apolloEnrichOrganization,
  deduplicateEmails,
  deduplicatePhones,
  type ApolloPersonResult,
  type ApolloOrgResult,
} from "@/lib/apollo";

const PDL_BASE = "https://api.peopledatalabs.com/v5";
const NYC = "https://data.cityofnewyork.us/resource";

export async function enrichContact(contactId: string) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return { error: "Contact not found" };

  console.log("=== ENRICHING CONTACT ===", contact.firstName, contact.lastName);

  const results: any = {
    pdl: null,
    pdlRetry: false,
    apollo: null as ApolloPersonResult | null,
    apolloOrg: null as ApolloOrgResult | null,
    nycProperties: [],
    score: 0,
    grade: "F",
    signals: [],
    merged: null as any,
  };

  // ============================================================
  // Step 1: PDL Enrichment
  // ============================================================
  const pdlKey = process.env.PDL_API_KEY;
  if (pdlKey) {
    try {
      const params = new URLSearchParams();
      if (contact.email) params.set("email", contact.email);
      if (contact.phone) params.set("phone", contact.phone.replace(/[^0-9+]/g, ""));
      if (!contact.email && !contact.phone) {
        params.set("first_name", contact.firstName);
        params.set("last_name", contact.lastName);
        if (contact.city) params.set("locality", contact.city);
        if (contact.state) params.set("region", contact.state);
        if (contact.address) params.set("street_address", contact.address);
        if (contact.zip) params.set("postal_code", contact.zip);
      }
      params.set("min_likelihood", "3");

      const pdlRes = await fetch(PDL_BASE + "/person/enrich?" + params.toString(), {
        headers: { "X-Api-Key": pdlKey },
      });

      if (pdlRes.status === 200) {
        const pdlData = await pdlRes.json();
        const d = pdlData.data;
        const phoneList = Array.isArray(d?.phone_numbers) ? d.phone_numbers : [];
        const emailList = Array.isArray(d?.personal_emails) ? d.personal_emails : [];
        results.pdl = {
          likelihood: pdlData.likelihood,
          fullName: d?.full_name,
          phones: [d?.mobile_phone, ...phoneList].filter(Boolean),
          emails: [d?.work_email, ...emailList].filter(Boolean),
          jobTitle: d?.job_title,
          jobCompany: d?.job_company_name,
          industry: d?.industry,
          linkedin: d?.linkedin_url,
          facebook: d?.facebook_url,
          twitter: d?.twitter_url,
          address: [d?.street_address, d?.locality, d?.region, d?.postal_code].filter(Boolean).join(", "),
          sex: d?.sex,
          birthYear: d?.birth_year,
        };
        console.log("  PDL match:", d?.full_name, "likelihood:", pdlData.likelihood, "title:", d?.job_title, "company:", d?.job_company_name, "linkedin:", d?.linkedin_url, "phone:", d?.mobile_phone);
      } else {
        console.log("  PDL: no match (" + pdlRes.status + ")");
      }
    } catch (err) {
      console.error("  PDL error:", err);
    }
  }

  // ============================================================
  // Step 2: PDL Retry (two-pass strategy)
  // ============================================================
  if (pdlKey && results.pdl) {
    const isLimited = !results.pdl.phones?.length && !results.pdl.jobTitle && !results.pdl.linkedin;
    const usedDirectId = !!(contact.email || contact.phone);

    if (isLimited) {
      try {
        const retryParams = new URLSearchParams();
        retryParams.set("first_name", contact.firstName);
        retryParams.set("last_name", contact.lastName);
        if (contact.city) retryParams.set("locality", contact.city);
        if (contact.state) retryParams.set("region", contact.state);
        if (contact.address) retryParams.set("street_address", contact.address);
        if (contact.zip) retryParams.set("postal_code", contact.zip);
        retryParams.set("min_likelihood", usedDirectId ? "3" : "2");

        console.log("  PDL retry (" + (usedDirectId ? "name+address" : "lower likelihood") + ")...");

        const retryRes = await fetch(PDL_BASE + "/person/enrich?" + retryParams.toString(), {
          headers: { "X-Api-Key": pdlKey },
        });

        if (retryRes.status === 200) {
          const retryData = await retryRes.json();
          const r = retryData.data;
          const retryPhones = Array.isArray(r?.phone_numbers) ? r.phone_numbers : [];
          const retryEmails = Array.isArray(r?.personal_emails) ? r.personal_emails : [];
          const retryResult = {
            likelihood: retryData.likelihood,
            fullName: r?.full_name,
            phones: [r?.mobile_phone, ...retryPhones].filter(Boolean),
            emails: [r?.work_email, ...retryEmails].filter(Boolean),
            jobTitle: r?.job_title,
            jobCompany: r?.job_company_name,
            industry: r?.industry,
            linkedin: r?.linkedin_url,
            facebook: r?.facebook_url,
            twitter: r?.twitter_url,
            address: [r?.street_address, r?.locality, r?.region, r?.postal_code].filter(Boolean).join(", "),
            sex: r?.sex,
            birthYear: r?.birth_year,
          };

          const base = (retryResult.likelihood || 0) > (results.pdl.likelihood || 0) ? retryResult : results.pdl;
          const fill = base === retryResult ? results.pdl : retryResult;

          results.pdl = {
            ...base,
            phones: base.phones?.length ? base.phones : fill.phones,
            emails: base.emails?.length ? base.emails : fill.emails,
            jobTitle: base.jobTitle || fill.jobTitle,
            jobCompany: base.jobCompany || fill.jobCompany,
            industry: base.industry || fill.industry,
            linkedin: base.linkedin || fill.linkedin,
            facebook: base.facebook || fill.facebook,
            twitter: base.twitter || fill.twitter,
          };
          results.pdlRetry = true;

          console.log("  PDL retry match:", r?.full_name, "likelihood:", retryData.likelihood, "title:", r?.job_title, "phone:", r?.mobile_phone);
        } else {
          console.log("  PDL retry: no match (" + retryRes.status + ")");
        }
      } catch (err) {
        console.error("  PDL retry error:", err);
      }
    }
  } else if (pdlKey && !results.pdl) {
    try {
      const retryParams = new URLSearchParams();
      retryParams.set("first_name", contact.firstName);
      retryParams.set("last_name", contact.lastName);
      if (contact.city) retryParams.set("locality", contact.city);
      if (contact.state) retryParams.set("region", contact.state);
      if (contact.address) retryParams.set("street_address", contact.address);
      if (contact.zip) retryParams.set("postal_code", contact.zip);
      retryParams.set("min_likelihood", "2");

      console.log("  PDL retry (no initial match, broad search)...");

      const retryRes = await fetch(PDL_BASE + "/person/enrich?" + retryParams.toString(), {
        headers: { "X-Api-Key": pdlKey },
      });

      if (retryRes.status === 200) {
        const retryData = await retryRes.json();
        const r = retryData.data;
        const retryPhones = Array.isArray(r?.phone_numbers) ? r.phone_numbers : [];
        const retryEmails = Array.isArray(r?.personal_emails) ? r.personal_emails : [];
        results.pdl = {
          likelihood: retryData.likelihood,
          fullName: r?.full_name,
          phones: [r?.mobile_phone, ...retryPhones].filter(Boolean),
          emails: [r?.work_email, ...retryEmails].filter(Boolean),
          jobTitle: r?.job_title,
          jobCompany: r?.job_company_name,
          industry: r?.industry,
          linkedin: r?.linkedin_url,
          facebook: r?.facebook_url,
          twitter: r?.twitter_url,
          address: [r?.street_address, r?.locality, r?.region, r?.postal_code].filter(Boolean).join(", "),
          sex: r?.sex,
          birthYear: r?.birth_year,
        };
        results.pdlRetry = true;
        console.log("  PDL retry match:", r?.full_name, "likelihood:", retryData.likelihood);
      } else {
        console.log("  PDL retry: no match (" + retryRes.status + ")");
      }
    } catch (err) {
      console.error("  PDL retry error:", err);
    }
  }

  // ============================================================
  // Step 2.5: Apollo Enrichment (parallel: person + org)
  // ============================================================
  try {
    const fullName = (contact.firstName + " " + contact.lastName).trim();
    const companyFromPDL = results.pdl?.jobCompany || undefined;
    const emailFromPDL = results.pdl?.emails?.[0] || contact.email || undefined;

    const apolloPromises: Promise<void>[] = [];

    // Apollo People Enrichment (costs 1 credit)
    if (fullName.includes(" ")) {
      apolloPromises.push((async () => {
        console.log("  [APOLLO] Enriching person:", fullName);
        results.apollo = await apolloEnrichPerson(
          fullName,
          contact.city || undefined,
          companyFromPDL,
          emailFromPDL,
        );
      })());
    }

    // Apollo Organization Enrichment (costs 1 credit) — if we know the company
    const companyName = companyFromPDL || contact.notes?.match(/company:\s*(.+)/i)?.[1];
    if (companyName) {
      apolloPromises.push((async () => {
        console.log("  [APOLLO] Enriching org:", companyName);
        results.apolloOrg = await apolloEnrichOrganization(companyName);
      })());
    }

    if (apolloPromises.length > 0) {
      await Promise.all(apolloPromises);
      console.log("  [APOLLO] Complete. Person:", !!results.apollo, "Org:", !!results.apolloOrg);
    }
  } catch (err) {
    console.error("  [APOLLO] Error:", err);
  }

  // ============================================================
  // Step 2.6: Merge PDL + Apollo data
  // ============================================================
  const allEmails = await deduplicateEmails([
    ...(results.pdl?.emails || []),
    results.apollo?.email,
    ...(results.apollo?.personalEmails || []),
  ]);
  const allPhones = await deduplicatePhones([
    ...(results.pdl?.phones || []),
    ...(results.apollo?.phones || []),
    results.apolloOrg?.phone,
  ]);

  // Track which sources found each piece of data
  const phoneSources: Record<string, string[]> = {};
  for (const ph of (results.pdl?.phones || [])) {
    const clean = ph.replace(/\D/g, "").slice(-10);
    if (!phoneSources[clean]) phoneSources[clean] = [];
    phoneSources[clean].push("PDL");
  }
  for (const ph of (results.apollo?.phones || [])) {
    const clean = ph.replace(/\D/g, "").slice(-10);
    if (!phoneSources[clean]) phoneSources[clean] = [];
    if (!phoneSources[clean].includes("Apollo")) phoneSources[clean].push("Apollo");
  }

  const emailSources: Record<string, string[]> = {};
  for (const em of (results.pdl?.emails || [])) {
    const lower = em.toLowerCase();
    if (!emailSources[lower]) emailSources[lower] = [];
    emailSources[lower].push("PDL");
  }
  if (results.apollo?.email) {
    const lower = results.apollo.email.toLowerCase();
    if (!emailSources[lower]) emailSources[lower] = [];
    if (!emailSources[lower].includes("Apollo")) emailSources[lower].push("Apollo");
  }
  for (const em of (results.apollo?.personalEmails || [])) {
    const lower = em.toLowerCase();
    if (!emailSources[lower]) emailSources[lower] = [];
    if (!emailSources[lower].includes("Apollo")) emailSources[lower].push("Apollo");
  }

  results.merged = {
    emails: allEmails,
    phones: allPhones,
    emailSources,
    phoneSources,
    title: results.apollo?.title || results.pdl?.jobTitle || null,
    company: results.apollo?.company || results.pdl?.jobCompany || null,
    linkedinUrl: results.apollo?.linkedinUrl || results.pdl?.linkedin || null,
    photoUrl: results.apollo?.photoUrl || null,
    seniority: results.apollo?.seniority || null,
    companyIndustry: results.apolloOrg?.industry || results.apollo?.companyIndustry || results.pdl?.industry || null,
    companySize: results.apolloOrg?.employeeCount || results.apollo?.companySize || null,
    companyRevenue: results.apolloOrg?.revenue || results.apollo?.companyRevenue || null,
    companyWebsite: results.apolloOrg?.website || results.apollo?.companyWebsite || null,
    companyPhone: results.apolloOrg?.phone || results.apollo?.companyPhone || null,
    companyLogo: results.apolloOrg?.logoUrl || null,
    companyDescription: results.apolloOrg?.shortDescription || null,
    companyFoundedYear: results.apolloOrg?.foundedYear || null,
    dataSources: [
      results.pdl ? "PDL" : null,
      results.pdlRetry ? "PDL_RETRY" : null,
      results.apollo ? "Apollo" : null,
      results.apolloOrg ? "Apollo_Org" : null,
    ].filter(Boolean),
  };

  // ============================================================
  // Step 3: NYC Property Records
  // ============================================================
  try {
    const name = (contact.firstName + " " + contact.lastName).toUpperCase();
    const plutoUrl = new URL(NYC + "/64uk-42ks.json");
    plutoUrl.searchParams.set("$where", "upper(ownername) LIKE '%" + name.replace(/'/g, "''") + "%'");
    plutoUrl.searchParams.set("$select", "address,borough,unitsres,numfloors,assesstot,ownername,bbl");
    plutoUrl.searchParams.set("$limit", "10");
    plutoUrl.searchParams.set("$order", "unitsres DESC");

    const plutoRes = await fetch(plutoUrl.toString());
    if (plutoRes.ok) {
      const props = await plutoRes.json();
      results.nycProperties = props.map((p: any) => ({
        address: p.address,
        borough: p.borough,
        units: parseInt(p.unitsres) || 0,
        value: parseFloat(p.assesstot) || 0,
        ownerName: p.ownername,
        bbl: p.bbl,
      }));
      if (props.length > 0) {
        console.log("  NYC properties:", props.length);
      }
    }
  } catch (err) {
    console.error("  NYC error:", err);
  }

  // ============================================================
  // Step 4: Calculate Lead Score (PDL + Apollo + NYC)
  // ============================================================
  let score = 0;
  const signals: { label: string; points: number; detail: string }[] = [];

  if (results.pdl) {
    signals.push({ label: "Identity Verified", points: 15, detail: "PDL match (likelihood: " + (results.pdl.likelihood || "?") + ")" });
    score += 15;
  }
  if (results.pdlRetry) {
    signals.push({ label: "Deep Search Match", points: 5, detail: "PDL retry found more data" });
    score += 5;
  }

  // Apollo signals
  if (results.apollo) {
    signals.push({ label: "Apollo Match", points: 10, detail: "Person found in Apollo database" });
    score += 10;
  }
  if (results.apollo?.email) {
    signals.push({ label: "Apollo Email", points: 5, detail: "Verified email via Apollo" });
    score += 5;
  }
  if (results.apolloOrg) {
    signals.push({ label: "Company Intel", points: 5, detail: results.apolloOrg.name + (results.apolloOrg.industry ? " (" + results.apolloOrg.industry + ")" : "") });
    score += 5;
  }

  // Check for multi-source phone/email confirmation
  const hasMultiSourcePhone = Object.values(phoneSources).some(s => s.length > 1);
  const hasMultiSourceEmail = Object.values(emailSources).some(s => s.length > 1);
  if (hasMultiSourcePhone) {
    signals.push({ label: "Phone Verified", points: 8, detail: "Confirmed across PDL + Apollo" });
    score += 8;
  }
  if (hasMultiSourceEmail) {
    signals.push({ label: "Email Verified", points: 5, detail: "Confirmed across PDL + Apollo" });
    score += 5;
  }

  const hasPhone = allPhones.length > 0 || !!contact.phone;
  const hasEmail = allEmails.length > 0 || !!contact.email;
  if (hasPhone && !hasMultiSourcePhone) {
    signals.push({ label: "Phone Available", points: 8, detail: "Direct phone" });
    score += 8;
  }
  if (hasEmail && !hasMultiSourceEmail) {
    signals.push({ label: "Email Available", points: 7, detail: "Email address" });
    score += 7;
  }
  if (results.merged.linkedinUrl) {
    signals.push({ label: "LinkedIn Found", points: 5, detail: "Professional profile" });
    score += 5;
  }

  const title = results.merged.title || "";
  if (title.match(/owner|president|ceo|director|vp|partner|principal|founder/i)) {
    signals.push({ label: "Decision Maker", points: 10, detail: title });
    score += 10;
  } else if (title.match(/manager|head|lead|senior|executive/i)) {
    signals.push({ label: "Senior Role", points: 7, detail: title });
    score += 7;
  }

  const industry = results.merged.companyIndustry || results.pdl?.industry || "";
  if (industry.toLowerCase().includes("real estate")) {
    signals.push({ label: "RE Industry", points: 5, detail: industry });
    score += 5;
  }

  if (results.nycProperties.length > 0) {
    const totalUnits = results.nycProperties.reduce((s: number, p: any) => s + p.units, 0);
    signals.push({ label: "Property Owner", points: 15, detail: results.nycProperties.length + " properties, " + totalUnits + " units" });
    score += 15;
    if (totalUnits > 50) {
      signals.push({ label: "Major Portfolio", points: 10, detail: totalUnits + " units" });
      score += 10;
    }
  }

  if (contact.totalActivities > 5) {
    signals.push({ label: "High Engagement", points: 8, detail: contact.totalActivities + " interactions" });
    score += 8;
  } else if (contact.totalActivities > 0) {
    signals.push({ label: "Some Engagement", points: 3, detail: contact.totalActivities + " interactions" });
    score += 3;
  }

  score = Math.min(100, score);
  const grade = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : score >= 20 ? "D" : "F";
  signals.sort((a, b) => b.points - a.points);
  results.score = score;
  results.grade = grade;
  results.signals = signals;

  // ============================================================
  // Step 5: Save to database
  // ============================================================
  try {
    const updates: any = {};
    // Prefer Apollo phone/email, fall back to PDL
    const bestPhone = allPhones[0] || null;
    const bestEmail = allEmails[0] || null;
    if (!contact.phone && bestPhone) updates.phone = bestPhone;
    if (!contact.email && bestEmail) updates.email = bestEmail;
    updates.qualificationScore = score;
    updates.scoreUpdatedAt = new Date();
    updates.enrichmentStatus = "enriched";

    await prisma.contact.update({ where: { id: contactId }, data: updates });

    const summaryParts: string[] = [];
    const bestTitle = results.merged.title;
    const bestCompany = results.merged.company;
    if (bestTitle && bestCompany) {
      summaryParts.push(contact.firstName + " " + contact.lastName + " works as " + bestTitle + " at " + bestCompany + ".");
    }
    if (results.apolloOrg) {
      const org = results.apolloOrg;
      summaryParts.push((org.name || bestCompany) + ": " + [org.industry, org.employeeCount ? org.employeeCount + " employees" : null, org.revenue].filter(Boolean).join(", ") + ".");
    }
    if (results.nycProperties.length > 0) {
      summaryParts.push("Owns " + results.nycProperties.length + " NYC properties with " + results.nycProperties.reduce((s: number, p: any) => s + p.units, 0) + " total units.");
    }
    if (grade === "A") summaryParts.push("High-value lead.");
    else if (grade === "B") summaryParts.push("Strong lead.");

    const dataSources = results.merged.dataSources.concat(results.nycProperties.length > 0 ? ["NYC_PLUTO"] : []);

    await prisma.enrichmentProfile.upsert({
      where: { id: contact.id + "-v1" },
      create: {
        id: contact.id + "-v1",
        contactId: contact.id,
        version: 1,
        employer: bestCompany || null,
        jobTitle: bestTitle || null,
        industry: results.merged.companyIndustry || null,
        companySize: null,
        linkedinUrl: results.merged.linkedinUrl || null,
        facebookUrl: results.pdl?.facebook || null,
        twitterUrl: results.pdl?.twitter || null,
        profilePhotoUrl: results.merged.photoUrl || null,
        ownsProperty: results.nycProperties.length > 0,
        propertyValueEst: results.nycProperties.reduce((s: number, p: any) => s + p.value, 0) || null,
        confidenceLevel: score >= 60 ? "high" : score >= 30 ? "medium" : "low",
        dataSources,
        rawData: JSON.parse(JSON.stringify(results)),
        aiSummary: summaryParts.join(" ") || "Limited data. Add more contact details for better enrichment.",
        aiInsights: signals.slice(0, 5),
      },
      update: {
        employer: bestCompany || null,
        jobTitle: bestTitle || null,
        industry: results.merged.companyIndustry || null,
        linkedinUrl: results.merged.linkedinUrl || null,
        profilePhotoUrl: results.merged.photoUrl || null,
        ownsProperty: results.nycProperties.length > 0,
        confidenceLevel: score >= 60 ? "high" : score >= 30 ? "medium" : "low",
        dataSources,
        rawData: JSON.parse(JSON.stringify(results)),
        aiSummary: summaryParts.join(" ") || "Limited data.",
        aiInsights: signals.slice(0, 5),
        enrichedAt: new Date(),
      },
    });

    console.log("  Saved enrichment. Score:", score, grade, "Sources:", dataSources.join(", "));
  } catch (err) {
    console.error("  Save error:", err);
  }

  return results;
}
