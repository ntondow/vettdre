/**
 * Rule-based email categorization — runs during sync, no AI needed.
 */

interface CategorizeInput {
  fromEmail: string;
  subject: string | null;
  bodyText: string | null;
  labelIds: string[];
  contactId: string | null;
}

const NEWSLETTER_SENDERS = [
  "noreply@", "no-reply@", "newsletter@", "news@", "updates@",
  "digest@", "notifications@", "marketing@", "info@", "mailer@",
];

const NEWSLETTER_KEYWORDS = [
  "unsubscribe", "view in browser", "email preferences",
  "opt out", "manage subscriptions", "view online",
];

const TRANSACTIONAL_KEYWORDS = [
  "receipt", "invoice", "order confirmation", "payment",
  "your order", "shipping confirmation", "delivery update",
  "account statement", "billing", "subscription renewed",
];

const LEAD_PORTAL_DOMAINS = [
  "streeteasy.com", "zillow.com", "realtor.com", "apartments.com",
  "renthop.com", "trulia.com", "redfin.com", "homes.com",
  "hotpads.com", "compass.com", "corcoran.com",
];

const LEAD_KEYWORDS = [
  "inquiry", "interested in", "schedule a showing", "tour request",
  "viewing request", "available for rent", "is this still available",
  "i am looking", "bedroom", "apartment", "listing",
];

export function categorizeEmail(input: CategorizeInput): string {
  const { fromEmail, subject, bodyText, labelIds, contactId } = input;
  const from = fromEmail.toLowerCase();
  const subj = (subject || "").toLowerCase();
  const body = (bodyText || "").toLowerCase().slice(0, 2000); // only check first 2k chars

  // Gmail label hints
  if (labelIds.includes("CATEGORY_PROMOTIONS") || labelIds.includes("CATEGORY_UPDATES")) {
    return "newsletter";
  }
  if (labelIds.includes("SPAM")) {
    return "spam";
  }

  // Newsletter detection
  const isNewsletterSender = NEWSLETTER_SENDERS.some(s => from.includes(s));
  const hasNewsletterKeywords = NEWSLETTER_KEYWORDS.some(k => body.includes(k));
  if (isNewsletterSender && hasNewsletterKeywords) {
    return "newsletter";
  }

  // Lead portal detection
  const isPortalDomain = LEAD_PORTAL_DOMAINS.some(d => from.endsWith(d) || from.includes(`@${d}`));
  if (isPortalDomain) {
    return "lead";
  }

  // Lead keyword detection
  const hasLeadKeywords = LEAD_KEYWORDS.some(k => subj.includes(k) || body.slice(0, 500).includes(k));
  if (hasLeadKeywords && !isNewsletterSender) {
    return "lead";
  }

  // Transactional detection
  const hasTransactionalKeywords = TRANSACTIONAL_KEYWORDS.some(k => subj.includes(k) || body.slice(0, 500).includes(k));
  if (hasTransactionalKeywords) {
    return "transactional";
  }

  // If linked to a contact, it's personal
  if (contactId) {
    return "personal";
  }

  // Default to personal
  return "personal";
}
