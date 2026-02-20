import prisma from "@/lib/prisma";
import { getValidToken } from "@/lib/gmail";
import { parseEmailWithAI } from "@/lib/email-parser";
import { categorizeEmail } from "@/lib/email-categorizer";

const GMAIL_API = "https://www.googleapis.com/gmail/v1/users/me";

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType: string;
  body: { data?: string; size: number };
  parts?: GmailMessagePart[];
  headers?: GmailHeader[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  payload: GmailMessagePart & { headers: GmailHeader[] };
}

function getHeader(headers: GmailHeader[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function parseEmailAddress(raw: string): { email: string; name: string | null } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].replace(/"/g, "").trim(), email: match[2].trim().toLowerCase() };
  return { name: null, email: raw.trim().toLowerCase() };
}

function parseEmailList(raw: string): string[] {
  if (!raw) return [];
  return raw.split(",").map(e => parseEmailAddress(e.trim()).email).filter(Boolean);
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function extractBody(payload: GmailMessagePart): { text: string | null; html: string | null } {
  let text: string | null = null;
  let html: string | null = null;

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    text = decodeBase64Url(payload.body.data);
  } else if (payload.mimeType === "text/html" && payload.body?.data) {
    html = decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result.text && !text) text = result.text;
      if (result.html && !html) html = result.html;
    }
  }

  return { text, html };
}

/** Fetch a single Gmail message by ID */
async function fetchMessage(token: string, messageId: string): Promise<GmailMessage> {
  const res = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail fetch message ${messageId}: ${res.status}`);
  return res.json();
}

/** Process a Gmail message and store it */
async function processMessage(
  msg: GmailMessage,
  orgId: string,
  userEmail: string,
  skipAI = false,
) {
  const headers = msg.payload.headers;
  const fromRaw = getHeader(headers, "From");
  const { email: fromEmail, name: fromName } = parseEmailAddress(fromRaw);
  const toEmails = parseEmailList(getHeader(headers, "To"));
  const ccEmails = parseEmailList(getHeader(headers, "Cc"));
  const subject = getHeader(headers, "Subject") || null;
  const receivedAt = new Date(parseInt(msg.internalDate));
  const { text, html } = extractBody(msg.payload);

  const direction = fromEmail === userEmail.toLowerCase() ? "outbound" : "inbound";
  const hasAttachments = checkAttachments(msg.payload);

  // Match contact by email
  const contactEmail = direction === "inbound" ? fromEmail : toEmails[0];
  let contactId: string | null = null;

  if (contactEmail) {
    const contact = await prisma.contact.findFirst({
      where: { orgId, email: { equals: contactEmail, mode: "insensitive" } },
    });
    if (contact) {
      contactId = contact.id;
    }
  }

  // Categorize email
  const category = categorizeEmail({
    fromEmail,
    subject,
    bodyText: text,
    labelIds: msg.labelIds || [],
    contactId,
  });

  // Upsert email message
  const emailMsg = await prisma.emailMessage.upsert({
    where: { orgId_gmailMessageId: { orgId, gmailMessageId: msg.id } },
    create: {
      orgId,
      gmailMessageId: msg.id,
      threadId: msg.threadId,
      contactId,
      direction,
      fromEmail,
      fromName,
      toEmails,
      ccEmails,
      subject,
      bodyText: text,
      bodyHtml: html,
      snippet: msg.snippet,
      labelIds: msg.labelIds || [],
      isRead: !(msg.labelIds || []).includes("UNREAD"),
      isStarred: (msg.labelIds || []).includes("STARRED"),
      hasAttachments,
      receivedAt,
      category,
    },
    update: {
      labelIds: msg.labelIds || [],
      isRead: !(msg.labelIds || []).includes("UNREAD"),
      isStarred: (msg.labelIds || []).includes("STARRED"),
      contactId: contactId || undefined,
      // Don't overwrite category on update — allow manual categorization to persist
    },
  });

  // AI parse inbound emails that haven't been parsed yet
  if (!skipAI && direction === "inbound" && !emailMsg.aiParsed && text) {
    try {
      await parseEmailWithAI(emailMsg.id, {
        fromName: fromName || fromEmail,
        fromEmail,
        subject: subject || "",
        bodyText: text,
      });
    } catch (err) {
      console.error("  AI parse error for", msg.id, err);
    }
  }

  return emailMsg;
}

function checkAttachments(part: GmailMessagePart): boolean {
  if (part.body?.size > 0 && part.mimeType && !part.mimeType.startsWith("text/") && !part.mimeType.startsWith("multipart/")) {
    return true;
  }
  if (part.parts) {
    return part.parts.some(p => checkAttachments(p));
  }
  return false;
}

/** Initial sync: fetch the last N emails */
export async function initialSync(gmailAccountId: string, maxResults = 500) {
  const account = await prisma.gmailAccount.findUnique({
    where: { id: gmailAccountId },
    include: { user: true },
  });
  if (!account) throw new Error("Gmail account not found");

  const token = await getValidToken(gmailAccountId);

  console.log("=== GMAIL INITIAL SYNC ===", account.email);
  console.log("  Token:", token ? token.slice(0, 10) + "..." : "NO TOKEN");

  // List recent messages
  const listUrl = `${GMAIL_API}/messages?maxResults=${maxResults}`;
  console.log("  Gmail API URL:", listUrl);
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("  Gmail API response:", listRes.status, listRes.statusText);
  if (!listRes.ok) {
    const errText = await listRes.text();
    console.error("  Gmail list error body:", errText.slice(0, 500));
    throw new Error("Gmail list messages failed: " + listRes.status);
  }
  const listData = await listRes.json();
  const messageIds: { id: string }[] = listData.messages || [];
  console.log("  Messages returned:", messageIds.length);

  console.log("  Found", messageIds.length, "messages to sync");

  let synced = 0;
  const BATCH = 10;
  for (let i = 0; i < messageIds.length; i += BATCH) {
    const batch = messageIds.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async ({ id }) => {
        const msg = await fetchMessage(token, id);
        await processMessage(msg, account.user.orgId, account.email, true);
      })
    );
    synced += results.filter(r => r.status === "fulfilled").length;
    if ((i + BATCH) % 50 === 0 || i + BATCH >= messageIds.length) {
      console.log("  Progress:", synced, "/", messageIds.length);
    }
  }

  // Get current historyId for incremental sync
  const profileRes = await fetch(`${GMAIL_API}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (profileRes.ok) {
    const profile = await profileRes.json();
    await prisma.gmailAccount.update({
      where: { id: gmailAccountId },
      data: { historyId: profile.historyId, syncedAt: new Date() },
    });
  }

  console.log("  Synced", synced, "of", messageIds.length, "messages");
  return { synced, total: messageIds.length };
}

/** Incremental sync: fetch only new messages since last sync */
export async function incrementalSync(gmailAccountId: string) {
  const account = await prisma.gmailAccount.findUnique({
    where: { id: gmailAccountId },
    include: { user: true },
  });
  if (!account) throw new Error("Gmail account not found");

  const token = await getValidToken(gmailAccountId);

  // If no historyId, fall back to initial sync
  if (!account.historyId) {
    return initialSync(gmailAccountId, 50);
  }

  console.log("=== GMAIL INCREMENTAL SYNC ===", account.email, "from historyId:", account.historyId);

  const historyRes = await fetch(
    `${GMAIL_API}/history?startHistoryId=${account.historyId}&historyTypes=messageAdded`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (historyRes.status === 404) {
    // historyId too old — do a fresh sync
    console.log("  History expired, doing initial sync");
    return initialSync(gmailAccountId, 50);
  }

  if (!historyRes.ok) throw new Error("Gmail history failed: " + historyRes.status);
  const historyData = await historyRes.json();
  const history = historyData.history || [];

  // Collect unique new message IDs
  const newMessageIds = new Set<string>();
  for (const h of history) {
    for (const added of h.messagesAdded || []) {
      newMessageIds.add(added.message.id);
    }
  }

  console.log("  Found", newMessageIds.size, "new messages");

  let synced = 0;
  for (const id of newMessageIds) {
    try {
      const msg = await fetchMessage(token, id);
      await processMessage(msg, account.user.orgId, account.email);
      synced++;
    } catch (err) {
      console.error("  Error syncing message", id, err);
    }
  }

  // Update historyId
  if (historyData.historyId) {
    await prisma.gmailAccount.update({
      where: { id: gmailAccountId },
      data: { historyId: historyData.historyId, syncedAt: new Date() },
    });
  }

  console.log("  Synced", synced, "new messages");
  return { synced, total: newMessageIds.size };
}
