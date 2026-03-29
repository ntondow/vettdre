"use server";

export async function skipTrace(ownerName: string, address: string, city: string, state: string, zip: string) {
  const apiKey = process.env.PDL_API_KEY;
  if (!apiKey) return { error: "PDL_API_KEY not set in .env" };

  console.log("=== PDL SKIP TRACE ===", ownerName, "|", address, city, state);

  // Parse name
  const parts = ownerName.trim().split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ") || "";

  // Skip if clearly an LLC/Corp
  if (ownerName.toUpperCase().match(/LLC|CORP|INC|L\.P\.|ASSOCIATES|PARTNERS|HOLDINGS|TRUST|REALTY|PROPERTIES|MANAGEMENT|GROUP|CAPITAL/)) {
    console.log("PDL: Corporate entity, skipping:", ownerName);
    return { error: "Cannot skip trace corporate entities. Try searching the individual behind the LLC." };
  }

  const params = new URLSearchParams();
  params.set("first_name", firstName);
  params.set("last_name", lastName);
  if (city) params.set("locality", city);
  if (state) params.set("region", state);
  if (zip) params.set("postal_code", zip);
  if (address) params.set("street_address", address);
  params.set("min_likelihood", "4");

  const url = "https://api.peopledatalabs.com/v5/person/enrich?" + params.toString();
  console.log("PDL URL:", url);

  try {
    const res = await fetch(url, {
      headers: { "X-Api-Key": apiKey },
    });

    console.log("PDL status:", res.status);

    if (res.status === 404) {
      return { error: "No match found for " + ownerName };
    }

    if (res.status === 402) {
      return { error: "PDL credits exhausted. Add credits at peopledatalabs.com" };
    }

    const text = await res.text();
    console.log("PDL response:", text.slice(0, 500));

    if (!res.ok) {
      return { error: "PDL error: " + res.status };
    }

    const json = JSON.parse(text);
    const d = json.data;
    const likelihood = json.likelihood || 0;

    // Extract phones
    const phones: { number: string; type: string }[] = [];
    if (d?.mobile_phone) phones.push({ number: d.mobile_phone, type: "Mobile" });
    if (Array.isArray(d?.phone_numbers)) {
      d.phone_numbers.forEach((ph: string) => {
        if (ph && !phones.some(p => p.number === ph)) {
          phones.push({ number: ph, type: "Phone" });
        }
      });
    }

    // Extract emails
    const emails: string[] = [];
    if (d?.work_email) emails.push(d.work_email);
    if (Array.isArray(d?.personal_emails)) emails.push(...d.personal_emails);
    if (d?.emails && Array.isArray(d.emails)) {
      d.emails.forEach((e: any) => {
        const addr = typeof e === "string" ? e : e?.address;
        if (addr && !emails.includes(addr)) emails.push(addr);
      });
    }

    return {
      source: "PDL",
      likelihood,
      phones,
      emails: emails.slice(0, 5),
      mailingAddress: [d?.street_address, d?.locality, d?.region, d?.postal_code].filter(Boolean).join(", "),
      jobTitle: d?.job_title || "",
      jobCompany: d?.job_company_name || "",
      linkedin: d?.linkedin_url || "",
      fullName: d?.full_name || ownerName,
    };
  } catch (err: any) {
    console.error("PDL fetch error:", err);
    return { error: "PDL connection failed: " + err.message };
  }
}
