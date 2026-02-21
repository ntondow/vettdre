import prisma from "@/lib/prisma";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

export function getGmailAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID!,
    redirect_uri: process.env.GMAIL_REDIRECT_URI!,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      redirect_uri: process.env.GMAIL_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("Token exchange failed: " + err);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }>;
}

export async function refreshAccessToken(gmailAccountId: string) {
  const account = await prisma.gmailAccount.findUnique({ where: { id: gmailAccountId } });
  if (!account) throw new Error("Gmail account not found");

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error("Token refresh failed: " + err);
  }

  const data = await res.json();
  await prisma.gmailAccount.update({
    where: { id: gmailAccountId },
    data: {
      accessToken: data.access_token,
      tokenExpiry: new Date(Date.now() + data.expires_in * 1000),
    },
  });

  return data.access_token as string;
}

/** Get a valid access token, refreshing if expired */
export async function getValidToken(gmailAccountId: string): Promise<string> {
  const account = await prisma.gmailAccount.findUnique({ where: { id: gmailAccountId } });
  if (!account) throw new Error("Gmail account not found");

  // Refresh if token expires within 5 minutes
  if (account.tokenExpiry.getTime() < Date.now() + 5 * 60 * 1000) {
    return refreshAccessToken(gmailAccountId);
  }
  return account.accessToken;
}

/** Get the Gmail account for a user, or null */
export async function getUserGmailAccount(userId: string) {
  return prisma.gmailAccount.findFirst({
    where: { userId, isActive: true },
  });
}
