import prisma from "@/lib/prisma";
import { getValidToken } from "@/lib/gmail";

const GMAIL_API = "https://www.googleapis.com/gmail/v1/users/me";

export interface Attachment {
  filename: string;
  mimeType: string;
  base64Content: string;
}

interface SendEmailOptions {
  gmailAccountId: string;
  orgId: string;
  to: string;
  subject: string;
  bodyHtml: string;
  replyToMessageId?: string;
  contactId?: string;
  attachments?: Attachment[];
}

function buildRawEmail(
  from: string,
  to: string,
  subject: string,
  bodyHtml: string,
  replyToMessageId?: string,
  attachments?: Attachment[],
): string {
  const hasAttachments = attachments && attachments.length > 0;
  const altBoundary = "boundary_alt_" + Date.now();
  const mixedBoundary = "boundary_mixed_" + Date.now();

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
  ];

  if (replyToMessageId) {
    headers.push(`In-Reply-To: ${replyToMessageId}`);
    headers.push(`References: ${replyToMessageId}`);
  }

  // Strip HTML for plain text version
  const plainText = bodyHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

  // Build the text/html alternative part
  const altPart = [
    `--${altBoundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    plainText,
    `--${altBoundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    ``,
    bodyHtml,
    `--${altBoundary}--`,
  ].join("\r\n");

  if (!hasAttachments) {
    // No attachments — simple multipart/alternative (backward compatible)
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    const raw = headers.join("\r\n") + "\r\n\r\n" + altPart;
    return Buffer.from(raw).toString("base64url");
  }

  // With attachments — wrap in multipart/mixed
  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

  const parts = [
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    ``,
    altPart,
  ];

  for (const att of attachments) {
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${att.mimeType}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      att.base64Content,
    );
  }

  parts.push(`--${mixedBoundary}--`);

  const raw = headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
  return Buffer.from(raw).toString("base64url");
}

/** Apply template variables to a string */
export function applyTemplateVars(
  text: string,
  vars: Record<string, string>,
): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

/** Send an email via Gmail API */
export async function sendEmail(options: SendEmailOptions) {
  const { gmailAccountId, orgId, to, subject, bodyHtml, replyToMessageId, contactId, attachments } = options;

  const account = await prisma.gmailAccount.findUnique({ where: { id: gmailAccountId } });
  if (!account) throw new Error("Gmail account not found");

  const token = await getValidToken(gmailAccountId);
  const raw = buildRawEmail(account.email, to, subject, bodyHtml, replyToMessageId, attachments);

  const sendBody: Record<string, string> = { raw };
  if (replyToMessageId) {
    // Look up the threadId for reply
    const original = await prisma.emailMessage.findFirst({
      where: { orgId, gmailMessageId: replyToMessageId },
    });
    if (original?.threadId) sendBody.threadId = original.threadId;
  }

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sendBody),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error("Gmail send failed: " + err);
  }

  const sentData = await res.json();

  // Store the outbound email
  const emailMsg = await prisma.emailMessage.create({
    data: {
      orgId,
      gmailMessageId: sentData.id,
      threadId: sentData.threadId || null,
      contactId: contactId || null,
      direction: "outbound",
      fromEmail: account.email,
      fromName: null,
      toEmails: [to],
      subject,
      bodyHtml: bodyHtml,
      bodyText: bodyHtml.replace(/<[^>]+>/g, "").trim(),
      snippet: bodyHtml.replace(/<[^>]+>/g, "").trim().slice(0, 200),
      isRead: true,
      receivedAt: new Date(),
    },
  });

  console.log("Email sent:", sentData.id, "to:", to);
  return emailMsg;
}
