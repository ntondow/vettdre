import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { embedSignatureInPdf, addAuditFooter, embedFieldValues } from "@/lib/onboarding-signing";
import { sendOnboardingCompleteNotification } from "@/lib/onboarding-notifications";
import { dispatchAutomationSafe } from "@/lib/automation-dispatcher";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const body = await req.json();
    const { documentId, signatureImage, signerName, signerEmail, fieldValues } = body as {
      documentId?: string;
      signatureImage?: string;
      signerName?: string;
      signerEmail?: string;
      fieldValues?: Record<string, string>;
    };

    if (!documentId || !signerName || !signerEmail) {
      return NextResponse.json({ error: "Missing required fields: documentId, signerName, signerEmail" }, { status: 400 });
    }

    // ── Validate token ──────────────────────────────────────

    const onboarding = await prisma.clientOnboarding.findUnique({
      where: { token },
      include: {
        documents: { orderBy: { sortOrder: "asc" }, include: { template: { select: { fields: true } } } },
        agent: { select: { firstName: true, lastName: true } },
        organization: { select: { name: true } },
      },
    });

    if (!onboarding) {
      return NextResponse.json({ error: "Onboarding not found" }, { status: 404 });
    }
    if (onboarding.status === "voided") {
      return NextResponse.json({ error: "This signing request has been cancelled" }, { status: 410 });
    }
    if (onboarding.status === "completed") {
      return NextResponse.json({ error: "All documents have already been signed" }, { status: 410 });
    }
    if (onboarding.expiresAt && new Date(onboarding.expiresAt) < new Date()) {
      await prisma.clientOnboarding.update({
        where: { id: onboarding.id },
        data: { status: "expired" },
      });
      return NextResponse.json({ error: "This signing link has expired" }, { status: 410 });
    }

    // ── Validate document ───────────────────────────────────

    const doc = onboarding.documents.find((d) => d.id === documentId);
    if (!doc) {
      return NextResponse.json({ error: "Document does not belong to this onboarding" }, { status: 400 });
    }
    if (doc.status === "signed") {
      return NextResponse.json({ error: "This document has already been signed" }, { status: 409 });
    }

    // Enforce sequential signing — all prior documents must be signed
    for (const prev of onboarding.documents) {
      if (prev.sortOrder >= doc.sortOrder) break;
      if (prev.status !== "signed") {
        return NextResponse.json(
          { error: `Please sign "${prev.title}" first` },
          { status: 400 },
        );
      }
    }

    // ── Collect metadata ────────────────────────────────────

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";
    const signDate = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // ── Process PDF ─────────────────────────────────────────

    let signedPdfUrl: string | null = null;

    if (doc.pdfUrl) {
      try {
        // Fetch the template PDF
        const supabase = await createClient();
        let pdfBytes: Uint8Array;

        // Try to download from Supabase Storage
        if (doc.pdfUrl.includes("supabase")) {
          // Extract storage path from URL
          const pathMatch = doc.pdfUrl.match(/\/storage\/v1\/object\/public\/bms-files\/(.+)/);
          const storagePath = pathMatch?.[1] ?? doc.pdfUrl;

          const { data: fileData, error: dlError } = await supabase.storage
            .from("bms-files")
            .download(storagePath);

          if (dlError || !fileData) {
            console.error("PDF download error:", dlError);
            pdfBytes = new Uint8Array(0);
          } else {
            pdfBytes = new Uint8Array(await fileData.arrayBuffer());
          }
        } else {
          // External URL — fetch directly
          const resp = await fetch(doc.pdfUrl);
          pdfBytes = new Uint8Array(await resp.arrayBuffer());
        }

        if (pdfBytes.length > 0) {
          let modifiedPdf = pdfBytes;

          // Check if this document has template fields
          const templateFields = Array.isArray((doc as Record<string, unknown>).template?.fields)
            ? ((doc as Record<string, unknown>).template as { fields: import("@/lib/onboarding-types").TemplateFieldDefinition[] }).fields
            : [];

          if (templateFields.length > 0 && fieldValues) {
            // Template-based: embed all field values (text, date, checkbox, signature, initials)
            modifiedPdf = await embedFieldValues(modifiedPdf, templateFields, fieldValues);
          } else if (signatureImage) {
            // Legacy: embed signature at fixed position
            modifiedPdf = await embedSignatureInPdf({
              pdfBytes: modifiedPdf,
              signatureImageBase64: signatureImage,
              signerName,
              signDate,
              signatureType: "tenant",
            });
          }

          // Add audit footer
          const auditText = `Signed electronically on ${signDate} at ${ip} — Signer: ${signerName} (${signerEmail}) — Document: ${doc.title} — Audit ID: ${doc.id}`;
          modifiedPdf = await addAuditFooter({
            pdfBytes: modifiedPdf,
            auditText,
          });

          // Upload signed PDF
          const signedPath = `onboarding/${onboarding.id}/signed/${doc.docType}.pdf`;
          const { error: uploadError } = await supabase.storage
            .from("bms-files")
            .upload(signedPath, modifiedPdf, {
              contentType: "application/pdf",
              upsert: true,
            });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from("bms-files").getPublicUrl(signedPath);
            signedPdfUrl = urlData?.publicUrl ?? null;
          } else {
            console.error("Signed PDF upload error:", uploadError);
          }
        }
      } catch (pdfErr) {
        console.error("PDF processing error:", pdfErr);
        // Continue — the signing status update is more important than the PDF
      }
    }

    // ── Update database ─────────────────────────────────────

    await prisma.$transaction(async (tx) => {
      // Update document
      await tx.onboardingDocument.update({
        where: { id: documentId },
        data: {
          status: "signed",
          signedAt: new Date(),
          signedIp: ip,
          signatureData: signatureImage.slice(0, 100) + "...", // store truncated reference, not full base64
          pdfUrl: signedPdfUrl || doc.pdfUrl,
        },
      });

      // Create audit log
      await tx.signingAuditLog.create({
        data: {
          onboardingId: onboarding.id,
          documentId,
          action: "signed",
          actorType: "client",
          actorName: signerName,
          ipAddress: ip,
          userAgent,
          metadata: {
            signerEmail,
            docType: doc.docType,
            signedPdfUrl,
            documentTitle: doc.title,
            templateId: (doc as Record<string, unknown>).templateId ?? null,
            fieldValues: fieldValues ? Object.fromEntries(Object.entries(fieldValues).filter(([, v]) => v && !v.startsWith("data:image"))) : null,
          },
        },
      });

      // Check if all documents are now signed
      const allDocs = await tx.onboardingDocument.findMany({
        where: { onboardingId: onboarding.id },
        select: { status: true },
      });
      const allSigned = allDocs.every((d) => d.status === "signed");
      const anySigned = allDocs.some((d) => d.status === "signed");

      if (allSigned) {
        await tx.clientOnboarding.update({
          where: { id: onboarding.id },
          data: {
            status: "completed",
            completedAt: new Date(),
            allDocsSigned: true,
          },
        });
        await tx.signingAuditLog.create({
          data: {
            onboardingId: onboarding.id,
            action: "completed",
            actorType: "system",
            actorName: "System",
            metadata: { trigger: "all_documents_signed" },
          },
        });
      } else if (anySigned) {
        await tx.clientOnboarding.update({
          where: { id: onboarding.id },
          data: { status: "partially_signed" },
        });
      }
    });

    // Check final state for response
    const updatedOnboarding = await prisma.clientOnboarding.findUnique({
      where: { id: onboarding.id },
      select: { status: true, allDocsSigned: true, orgId: true, agentId: true, clientFirstName: true, clientLastName: true, clientEmail: true, clientPhone: true },
    });

    const allComplete = updatedOnboarding?.allDocsSigned ?? false;

    // ── Post-completion workflow (fire-and-forget) ───────────
    if (allComplete && updatedOnboarding) {
      runPostCompletionWorkflow(onboarding.id, updatedOnboarding).catch((err) =>
        console.error("Post-completion workflow error:", err),
      );
    }

    return NextResponse.json({
      success: true,
      documentId,
      allComplete,
      onboardingStatus: updatedOnboarding?.status ?? "partially_signed",
    });
  } catch (error) {
    console.error("Onboarding sign error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Post-Completion Workflow ─────────────────────────────────

async function runPostCompletionWorkflow(
  onboardingId: string,
  data: {
    orgId: string;
    agentId: string;
    clientFirstName: string;
    clientLastName: string;
    clientEmail: string;
    clientPhone: string | null;
  },
) {
  const clientFullName = `${data.clientFirstName} ${data.clientLastName}`;

  // 1. Get agent's userId for contact assignment
  const agent = await prisma.brokerAgent.findUnique({
    where: { id: data.agentId },
    select: { userId: true, firstName: true, lastName: true, email: true },
  });

  // 2. Create CRM Contact
  const contact = await prisma.contact.create({
    data: {
      orgId: data.orgId,
      assignedTo: agent?.userId || null,
      firstName: data.clientFirstName,
      lastName: data.clientLastName,
      email: data.clientEmail,
      phone: data.clientPhone || null,
      contactType: "renter",
      status: "lead",
      source: "client_onboarding",
      sourceDetail: onboardingId,
      tags: ["onboarded", "tenant-rep-signed"],
    },
  });

  // 3. Attach signed documents as FileAttachments on the contact
  const signedDocs = await prisma.onboardingDocument.findMany({
    where: { onboardingId, status: "signed" },
    select: { title: true, pdfUrl: true },
  });

  for (const doc of signedDocs) {
    if (doc.pdfUrl) {
      await prisma.fileAttachment.create({
        data: {
          orgId: data.orgId,
          entityType: "contact",
          entityId: contact.id,
          fileName: `${doc.title}.pdf`,
          fileType: "application/pdf",
          fileSize: 0,
          storagePath: doc.pdfUrl,
        },
      });
    }
  }

  // 4. Create Activity on the contact
  await prisma.activity.create({
    data: {
      orgId: data.orgId,
      contactId: contact.id,
      type: "note",
      direction: "internal",
      subject: "Client onboarding completed",
      body: "Signed tenant representation agreement, NY State disclosure, and fair housing notice.",
      isAiGenerated: false,
    },
  });

  // 5. Link contact to onboarding
  await prisma.clientOnboarding.update({
    where: { id: onboardingId },
    data: { contactId: contact.id },
  });

  // 6. Notify the agent
  if (agent?.email) {
    sendOnboardingCompleteNotification({
      agentEmail: agent.email,
      agentFirstName: agent.firstName,
      clientFullName,
      onboardingId,
    }).catch((err) => console.error("Agent notification failed:", err));
  }

  // 7. Trigger automations
  dispatchAutomationSafe(
    data.orgId,
    "new_lead",
    {
      contactId: contact.id,
      contactName: clientFullName,
      contactEmail: data.clientEmail,
      source: "client_onboarding",
    },
    contact.id,
  ).catch((err) => console.error("Automation dispatch failed:", err));

  console.log(`[Onboarding] Post-completion workflow done: contact ${contact.id} created for onboarding ${onboardingId}`);
}
