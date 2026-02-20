import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { exchangeCodeForTokens } from "@/lib/gmail";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // userId
  const error = searchParams.get("error");

  if (error) {
    console.error("Gmail OAuth error:", error);
    return NextResponse.redirect(new URL("/settings?gmail=error&reason=" + error, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings?gmail=error&reason=missing_params", request.url));
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Get user's email from Gmail profile
    const profileRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) throw new Error("Failed to fetch Gmail profile");
    const profile = await profileRes.json();
    const gmailEmail = profile.emailAddress;

    // Get the user to find their orgId
    const user = await prisma.user.findUnique({ where: { authProviderId: state } });
    if (!user) throw new Error("User not found");

    // Upsert Gmail account
    await prisma.gmailAccount.upsert({
      where: { userId_email: { userId: user.id, email: gmailEmail } },
      create: {
        userId: user.id,
        email: gmailEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
        historyId: profile.historyId || null,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
        historyId: profile.historyId || null,
        isActive: true,
      },
    });

    console.log("Gmail connected:", gmailEmail, "for user:", user.fullName);

    return NextResponse.redirect(new URL("/settings?gmail=connected", request.url));
  } catch (err) {
    console.error("Gmail callback error:", err);
    return NextResponse.redirect(new URL("/settings?gmail=error&reason=token_exchange", request.url));
  }
}
