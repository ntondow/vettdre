// ── POST /api/mobile/clients/invite ────────────────────────────
// Create a new client onboarding and send the invite.
// Simplified version of the web createOnboarding action for mobile use.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";
import { hasPermission } from "@/lib/bms-permissions";
import {
  prefillPdfFields,
  buildPrefillValues,
  stampLogoOnPdf,
} from "@/lib/onboarding-prefill";
import {
  sendOnboardingInviteEmail,
  sendOnboardingInviteSms,
  getOrgTwilioNumber,
} from "@/lib/onboarding-notifications";
import type { BrokerageRoleType } from "@/lib/bms-types";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const role = (ctx.brokerageRole || "agent") as BrokerageRoleType;
    if (
      !hasPermission(role, "client_onboarding_create") &&
      !hasPermission(role, "client_onboarding_view_own")
    ) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();
    const {
      clientFirstName,
      clientLastName,
      clientEmail,
      clientPhone,
      dealType,
      propertyAddress,
      templateIds,
      sentVia = "email",
    } = body;

    // Validation
    if (!clientFirstName || !clientLastName) {
      return NextResponse.json(
        { error: "Client name is required" },
        { status: 400 }
      );
    }
    if (sentVia.includes("email") && !clientEmail) {
      return NextResponse.json(
        { error: "Email required for email delivery" },
        { status: 400 }
      );
    }
    if (sentVia.includes("sms") && !clientPhone) {
      return NextResponse.json(
        { error: "Phone required for SMS delivery" },
        { status: 400 }
      );
    }

    // Resolve agent record
    const agent = ctx.agentId
      ? await prisma.brokerAgent.findUnique({
          where: { id: ctx.agentId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            licenseNumber: true,
          },
        })
      : null;

    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { name: true },
    });

    // Get templates (or use org defaults)
    let templates;
    if (templateIds && templateIds.length > 0) {
      templates = await prisma.documentTemplate.findMany({
        where: { id: { in: templateIds }, orgId: ctx.orgId },
        orderBy: { sortOrder: "asc" },
      });
    } else {
      templates = await prisma.documentTemplate.findMany({
        where: { orgId: ctx.orgId, isDefault: true },
        orderBy: { sortOrder: "asc" },
      });
    }

    // Generate signing token
    const token = crypto.randomBytes(32).toString("hex");

    // Create onboarding record
    const onboarding = await prisma.clientOnboarding.create({
      data: {
        orgId: ctx.orgId,
        agentId: ctx.agentId || ctx.userId,
        token,
        clientFirstName,
        clientLastName,
        clientEmail: clientEmail || null,
        clientPhone: clientPhone || null,
        dealType: dealType || null,
        propertyAddress: propertyAddress || null,
        sentVia,
        status: "draft",
        documents: {
          create: templates.map((t, idx) => ({
            templateId: t.id,
            title: t.name || "Document",
            docType: t.category || "custom",
            sortOrder: idx,
            status: "pending",
            pdfUrl: t.templatePdfUrl || null,
          })),
        },
      },
      include: {
        documents: { orderBy: { sortOrder: "asc" } },
      },
    });

    // Prefill PDFs (best-effort — don't block on failure)
    try {
      const prefillValues = buildPrefillValues({
        agentName: agent
          ? `${agent.firstName} ${agent.lastName}`
          : ctx.fullName,
        agentLicense: agent?.licenseNumber || undefined,
        brokerageName: org?.name || "VettdRE",
        clientFirstName,
        clientLastName,
        clientEmail: clientEmail || undefined,
        propertyAddress: propertyAddress || undefined,
      });

      for (const doc of onboarding.documents) {
        if (doc.pdfUrl) {
          try {
            // Download the PDF from storage
            const pdfRes = await fetch(doc.pdfUrl);
            if (!pdfRes.ok) continue;
            const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());

            // Get template field definitions
            const template = templates.find((t) => t.id === doc.templateId);
            const fields = (template?.fields as unknown as import("@/lib/onboarding-types").TemplateFieldDefinition[]) || [];

            // Prefill and re-upload
            const filledBytes = await prefillPdfFields(pdfBytes, fields, prefillValues);
            if (filledBytes) {
              // Convert to base64 data URL for storage (or re-upload to Supabase)
              const base64 = Buffer.from(filledBytes).toString("base64");
              const dataUrl = `data:application/pdf;base64,${base64}`;
              await prisma.onboardingDocument.update({
                where: { id: doc.id },
                data: { pdfUrl: dataUrl },
              });
            }
          } catch (prefillErr) {
            console.warn("[mobile/invite] PDF prefill failed for doc:", doc.id, prefillErr);
          }
        }
      }
    } catch (prefillErr) {
      console.warn("[mobile/invite] PDF prefill stage failed:", prefillErr);
    }

    // Send invite
    const agentName = agent
      ? `${agent.firstName} ${agent.lastName}`
      : ctx.fullName;
    const brokerageName = org?.name || "VettdRE";
    const signingUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.vettdre.com"}/sign/${token}`;
    const channels = sentVia.split("+");

    if (channels.includes("email") && clientEmail) {
      await sendOnboardingInviteEmail({
        clientEmail,
        clientFirstName,
        agentFullName: agentName,
        brokerageName,
        signingUrl,
      });
    }

    if (channels.includes("sms") && clientPhone) {
      const twilioNumber = await getOrgTwilioNumber(ctx.orgId);
      if (twilioNumber) {
        await sendOnboardingInviteSms({
          clientPhone,
          clientFirstName,
          agentFullName: agentName,
          brokerageName,
          signingUrl,
          fromNumber: twilioNumber,
        });
      }
    }

    // Update status to sent
    await prisma.clientOnboarding.update({
      where: { id: onboarding.id },
      data: { status: "pending", sentAt: new Date() },
    });

    // Log audit
    await prisma.signingAuditLog.create({
      data: {
        onboardingId: onboarding.id,
        action: "invite_sent",
        actorType: "agent",
        metadata: { sentVia, agentName, source: "mobile" },
      },
    });

    // Return the created onboarding
    const result = await prisma.clientOnboarding.findUnique({
      where: { id: onboarding.id },
      include: {
        documents: {
          select: { id: true, docType: true, status: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return NextResponse.json(serialize(result), { status: 201 });
  } catch (error: unknown) {
    console.error("[mobile/clients/invite] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create onboarding" },
      { status: 500 }
    );
  }
}
