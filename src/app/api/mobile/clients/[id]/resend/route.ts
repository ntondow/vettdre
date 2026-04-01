// ── POST /api/mobile/clients/[id]/resend ──────────────────────
// Resend onboarding invite email/SMS to the client.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized } from "@/lib/mobile-auth";
import {
  sendOnboardingInviteEmail,
  sendOnboardingInviteSms,
  getOrgTwilioNumber,
} from "@/lib/onboarding-notifications";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const { id } = await params;

    // Scope to org, and to the agent's own onboardings unless admin
    const onboarding = await prisma.clientOnboarding.findFirst({
      where: {
        id,
        orgId: ctx.orgId,
        ...(ctx.isAdmin ? {} : { agentId: ctx.agentId || "__none__" }),
      },
      include: {
        agent: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!onboarding) {
      return NextResponse.json(
        { error: "Onboarding not found" },
        { status: 404 }
      );
    }

    if (onboarding.status === "completed" || onboarding.status === "voided") {
      return NextResponse.json(
        { error: "Cannot resend to completed or voided onboarding" },
        { status: 400 }
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { name: true },
    });

    const agentName = onboarding.agent
      ? `${onboarding.agent.firstName} ${onboarding.agent.lastName}`
      : ctx.fullName;
    const brokerageName = org?.name || "VettdRE";

    // Determine channels from sentVia
    const channels = (onboarding.sentVia || "email").split("+");

    if (channels.includes("email") && onboarding.clientEmail) {
      await sendOnboardingInviteEmail({
        clientEmail: onboarding.clientEmail,
        clientFirstName: onboarding.clientFirstName,
        agentFullName: agentName,
        brokerageName,
        signingUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.vettdre.com"}/sign/${onboarding.token}`,
      });
    }

    if (channels.includes("sms") && onboarding.clientPhone) {
      const twilioNumber = await getOrgTwilioNumber(ctx.orgId);
      if (twilioNumber) {
        await sendOnboardingInviteSms({
          clientPhone: onboarding.clientPhone,
          clientFirstName: onboarding.clientFirstName,
          agentFullName: agentName,
          brokerageName,
          signingUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.vettdre.com"}/sign/${onboarding.token}`,
          fromNumber: twilioNumber,
        });
      }
    }

    // Update sentAt timestamp
    await prisma.clientOnboarding.update({
      where: { id },
      data: { sentAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[mobile/clients/[id]/resend] POST error:", error);
    return NextResponse.json(
      { error: "Failed to resend invite" },
      { status: 500 }
    );
  }
}
