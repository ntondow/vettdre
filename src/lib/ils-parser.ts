// ============================================================
// ILS Email Parser — StreetEasy, Apartments.com, Zillow
//
// Plain-text, line-based parsing only. No HTML parsers.
// All functions are safe — return null/empty on parse failure.
// ============================================================

export type IlsSource = "streeteasy" | "apartments_com" | "zillow";

export interface IlsLead {
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  moveInDate: string | null;
  bedrooms: number | null;
  listingRef: string | null;
  source: IlsSource;
}

// ── Source Detection ──────────────────────────────────────────

export function detectIlsSource(
  from: string,
  subject: string,
): IlsSource | null {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  // StreetEasy
  if (
    fromLower.includes("streeteasy.com") ||
    /new\s+(inquiry|lead|message)\s+(for|about|on)/i.test(subject)
  ) {
    return "streeteasy";
  }

  // Apartments.com
  if (
    fromLower.includes("apartments.com") ||
    (fromLower.includes("leads@") && /lead\s+(for|from)/i.test(subject))
  ) {
    return "apartments_com";
  }

  // Zillow
  if (fromLower.includes("zillow.com")) {
    return "zillow";
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────

function extractLabelValue(lines: string[], label: RegExp): string | null {
  for (const line of lines) {
    const match = line.match(label);
    if (match) {
      return match[1]?.trim() || null;
    }
  }
  return null;
}

function extractEmail(text: string): string | null {
  const match = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return match ? match[0] : null;
}

function extractPhone(text: string): string | null {
  // Match common phone patterns: (555) 123-4567, 555-123-4567, 5551234567, +15551234567
  const match = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  return match ? match[0].trim() : null;
}

function parseBedrooms(text: string): number | null {
  const match = text.match(/(\d+)\s*(?:bed(?:room)?s?|br)\b/i);
  if (match) return parseInt(match[1], 10);
  if (/studio/i.test(text)) return 0;
  return null;
}

// ── StreetEasy Parser ─────────────────────────────────────────

export function parseStreetEasyLead(
  subject: string,
  body: string,
): IlsLead {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Name: from subject "New inquiry from [Name]" or "New lead from [Name]"
  let name: string | null = null;
  const subjectNameMatch = subject.match(/(?:inquiry|lead|message)\s+from\s+(.+)/i);
  if (subjectNameMatch) {
    name = subjectNameMatch[1].trim();
  }
  // Fallback: first line sometimes has the name
  if (!name) {
    const bodyNameMatch = lines[0]?.match(/^(?:from|name)[:\s]+(.+)/i);
    if (bodyNameMatch) name = bodyNameMatch[1].trim();
  }

  // Email
  const email = extractLabelValue(lines, /^email[:\s]+(.+)/i) || extractEmail(body);

  // Phone
  const phoneLine = extractLabelValue(lines, /^phone[:\s]+(.+)/i);
  const phone = phoneLine ? (extractPhone(phoneLine) || phoneLine) : null;

  // Message
  let message: string | null = null;
  const msgIdx = lines.findIndex((l) => /^message[:\s]/i.test(l));
  if (msgIdx !== -1) {
    // Message may span multiple lines until next label
    const msgParts: string[] = [];
    const firstPart = lines[msgIdx].replace(/^message[:\s]+/i, "").trim();
    if (firstPart) msgParts.push(firstPart);
    for (let i = msgIdx + 1; i < lines.length; i++) {
      if (/^(?:listing|move-?in|property|phone|email|bedrooms?|rent)[:\s]/i.test(lines[i])) break;
      msgParts.push(lines[i]);
    }
    message = msgParts.join(" ").trim() || null;
  }

  // Move-in date
  const moveInDate = extractLabelValue(lines, /^move-?in[:\s]+(.+)/i);

  // Listing reference
  const listingRef =
    extractLabelValue(lines, /^listing[:\s]+(.+)/i) ||
    extractLabelValue(lines, /^property[:\s]+(.+)/i);

  // Bedrooms (from message or listing ref)
  const bedrooms = parseBedrooms(body);

  return {
    name,
    email,
    phone,
    message: message || extractFallbackMessage(body),
    moveInDate,
    bedrooms,
    listingRef,
    source: "streeteasy",
  };
}

// ── Apartments.com Parser ─────────────────────────────────────

export function parseApartmentsComLead(
  subject: string,
  body: string,
): IlsLead {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Name: from subject "You have a new lead from [Name]" or "New lead: [Name]"
  let name: string | null = null;
  const subjectNameMatch = subject.match(/(?:new\s+lead?)\s+(?:from\s+)?[:\s]*(.+)/i);
  if (subjectNameMatch) {
    name = subjectNameMatch[1].trim();
  }
  // Fallback: look for name line in body
  if (!name) {
    for (const line of lines) {
      const m = line.match(/^(?:name|from)[:\s]+(.+)/i);
      if (m) { name = m[1].trim(); break; }
    }
  }

  // Contact line: "Contact: email | phone" or "Contact: email / phone"
  let email: string | null = null;
  let phone: string | null = null;

  const contactLine = extractLabelValue(lines, /^contact[:\s]+(.+)/i);
  if (contactLine) {
    const parts = contactLine.split(/[|/]/).map((p) => p.trim());
    for (const part of parts) {
      const foundEmail = extractEmail(part);
      if (foundEmail && !email) { email = foundEmail; continue; }
      const foundPhone = extractPhone(part);
      if (foundPhone && !phone) phone = foundPhone;
    }
  }

  // Fallback: separate email/phone lines
  if (!email) email = extractLabelValue(lines, /^email[:\s]+(.+)/i) ? extractEmail(extractLabelValue(lines, /^email[:\s]+(.+)/i)!) : extractEmail(body);
  if (!phone) {
    const phoneLine = extractLabelValue(lines, /^phone[:\s]+(.+)/i);
    phone = phoneLine ? extractPhone(phoneLine) : null;
  }

  // Message
  let message: string | null = null;
  const msgIdx = lines.findIndex((l) => /^message[:\s]/i.test(l));
  if (msgIdx !== -1) {
    const msgParts: string[] = [];
    const firstPart = lines[msgIdx].replace(/^message[:\s]+/i, "").trim();
    if (firstPart) msgParts.push(firstPart);
    for (let i = msgIdx + 1; i < lines.length; i++) {
      if (/^(?:property|desired|move-?in|bedrooms?|rent|contact|phone|email)[:\s]/i.test(lines[i])) break;
      msgParts.push(lines[i]);
    }
    message = msgParts.join(" ").trim() || null;
  }

  // Move-in date
  const moveInDate =
    extractLabelValue(lines, /^desired\s+move-?in[:\s]+(.+)/i) ||
    extractLabelValue(lines, /^move-?in[:\s]+(.+)/i);

  // Bedrooms
  const bedroomsLine = extractLabelValue(lines, /^bedrooms?[:\s]+(.+)/i);
  let bedrooms: number | null = null;
  if (bedroomsLine) {
    const num = parseInt(bedroomsLine, 10);
    if (!isNaN(num)) bedrooms = num;
    else if (/studio/i.test(bedroomsLine)) bedrooms = 0;
  }
  if (bedrooms === null) bedrooms = parseBedrooms(body);

  // Property / listing ref
  const listingRef = extractLabelValue(lines, /^property[:\s]+(.+)/i);

  return {
    name,
    email,
    phone,
    message: message || extractFallbackMessage(body),
    moveInDate,
    bedrooms,
    listingRef,
    source: "apartments_com",
  };
}

// ── Zillow Parser ─────────────────────────────────────────────

export function parseZillowLead(
  subject: string,
  body: string,
): IlsLead {
  // Zillow format varies — best-effort extraction
  const email = extractEmail(body);

  // Name from subject: "New lead from [Name]" or "[Name] is interested..."
  let name: string | null = null;
  const subjectNameMatch = subject.match(/(?:from|^)\s*([A-Z][a-z]+ [A-Z][a-z]+)/);
  if (subjectNameMatch) {
    name = subjectNameMatch[1].trim();
  }
  if (!name) {
    const altMatch = subject.match(/^(.+?)\s+(?:is interested|sent|has)/i);
    if (altMatch) name = altMatch[1].trim();
  }

  const phone = extractPhone(body);

  // Try to find a message
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let message: string | null = null;
  const msgIdx = lines.findIndex((l) => /^message[:\s]/i.test(l));
  if (msgIdx !== -1) {
    message = lines[msgIdx].replace(/^message[:\s]+/i, "").trim() || null;
  }

  const moveInDate = extractLabelValue(lines, /^move-?in[:\s]+(.+)/i);
  const bedrooms = parseBedrooms(body);

  return {
    name,
    email,
    phone,
    message: message || extractFallbackMessage(body),
    moveInDate,
    bedrooms,
    listingRef: null,
    source: "zillow",
  };
}

// ── Fallback message extraction ───────────────────────────────

function extractFallbackMessage(body: string): string | null {
  // If we couldn't find a labeled "Message:" field, use the first
  // substantial line that isn't a label
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^(?:from|email|phone|contact|listing|property|move-?in|bedrooms?|rent|name|desired|subject)[:\s]/i.test(line)) continue;
    if (line.length > 15) return line;
  }
  return null;
}

// ── Unified parser ────────────────────────────────────────────

export function parseIlsEmail(
  source: IlsSource,
  subject: string,
  body: string,
): IlsLead {
  switch (source) {
    case "streeteasy":
      return parseStreetEasyLead(subject, body);
    case "apartments_com":
      return parseApartmentsComLead(subject, body);
    case "zillow":
      return parseZillowLead(subject, body);
  }
}
