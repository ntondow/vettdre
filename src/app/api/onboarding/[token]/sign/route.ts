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
    // Body's signerName/signerEmail are intentionally ignored (#17) — we
    // derive identity from the canonical onboarding record post-lookup so a
    // malicious request can't record a different name on the audit log.
    // The fields are still accepted in the type to keep the existing client
    // a no-op migration; we just don't read them.
    const { documentId, signatureImage, fieldValues } = body as {
      documentId?: string;
      signatureImage?: string;
      signerName?: string;
      signerEmail?: string;
      fieldValues?: Record<string, string>;
    };

    if (!documentId) {
      return NextResponse.json({ error: "Missing required field: documentId" }, { status: 400 });
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
      return NextResponse.json({ error: "This signing link is no longer valid" }, { status: 410 });
    }
    if (onboarding.status === "voided") {
      return NextResponse.json({ error: "This signing request has been cancelled" }, { status: 410 });
    }
    if (onboarding.status === "completed") {
      return NextResponse.json({ error: "All documents have already been signed" }, { status: 410 });
    }
    if (onboarding.expiresAt && new Date(onboarding.expiresAt) < new Date()) {
      // Fire-and-forget the expired-cache update (#14) — same shape as verify.
      if (onboarding.status !== "expired") {
        prisma.clientOnboarding
          .update({ where: { id: onboarding.id }, data: { status: "expired" } })
          .catch((err) => console.error("Onboarding expired-cache update failed:", err));
      }
      return NextResponse.json({ error: "This signing link has expired" }, { status: 410 });
    }

    // Derive signer identity server-side (#17) — never trust the request body.
    const signerName = `${onboarding.clientFirstName} ${onboarding.clientLastName}`;
    const signerEmail = onboarding.clientEmail;

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
    //
    // Fail-fast on PDF processing errors (#12). If a doc has a template URL
    // but we couldn't generate or upload the signed copy, we MUST NOT mark
    // the document signed — the audit record would point at the unsigned
    // template, which is unrecoverable for legal compliance. Instead we
    // bail with 503 and let the client retry. Docs without pdfUrl (legacy
    // path) skip this entire block and continue normally.

    let signedPdfUrl: string | null = null;
    let pdfProcessingFailed = false;

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

        if (pdfBytes.length === 0) {
          pdfProcessingFailed = true;
        } else {
          let modifiedPdf = pdfBytes;

          // Check if this document has template fields
          const templateFields = Array.isArray((doc as Record<string, unknown>).template?.fields)
            ? ((doc as Record<string, unknown>).template as { fields: import("@/lib/onboarding-types").TemplateFieldDefinition[] }).fields
            : [];

          if (templateFields.length > 0 && fieldValues) {
            // Server-side date override (#24) — any field with prefillKey
            // "date" gets stamped with the actual signing time, not the
            // client-side time from when the user opened the link. The
            // client UI is a preview; the embedded PDF is the legal artifact.
            for (const field of templateFields) {
              if (field.prefillKey === "date") {
                fieldValues[field.id] = signDate;
              }
            }
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

          // Upload signed PDF — keyed by doc.id (#22), not docType, so two
          // documents with the same custom docType in one onboarding don't
          // collide (upsert: true would silently overwrite the earlier file).
          // Pre-existing pdfUrl values keep working — they're stored in the
          // document record and continue resolving via download/route.ts.
          const signedPath = `onboarding/${onboarding.id}/signed/${doc.id}.pdf`;
          const { error: uploadError } = await supabase.storage
            .from("bms-files")
            .upload(signedPath, modifiedPdf, {
              contentType: "application/pdf",
              upsert: true,
            });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from("bms-files").getPublicUrl(signedPath);
            signedPdfUrl = urlData?.publicUrl ?? null;
            if (!signedPdfUrl) {
              pdfProcessingFailed = true;
            }
          } else {
            console.error("Signed PDF upload error:", uploadError);
            pdfProcessingFailed = true;
          }
        }
      } catch (pdfErr) {
        console.error("PDF processing error:", pdfErr);
        pdfProcessingFailed = true;
      }
    }

    // Fail-fast (#12): if the doc has a pdfUrl but we couldn't generate the
    // signed copy, bail BEFORE the database transaction. The client retry
    // path will land cleanly because no document state was mutated.
    if (pdfProcessingFailed) {
      return NextResponse.json(
        {
          error: "We couldn't save your signed document. Please try again in a moment.",
        },
        { status: 503 },
      );
    }

    // ── Update database ─────────────────────────────────────
    //
    // Idempotent sign (#10) — two-level atomic CAS prevents the duplicate-
    // contact race when a client double-clicks Sign or has two tabs open:
    //
    //   1. Document-level guard: updateMany with `status: { not: "signed" }`.
    //      The second concurrent transaction's count is 0 and it bails with
    //      `kind: "already_signed"` — no audit log, no further writes.
    //   2. Onboarding-completion CAS: when this transaction's writes leave
    //      every document signed, an updateMany with `allDocsSigned: false`
    //      atomically flips the flag. Only the transaction whose count === 1
    //      "wins the race" and is allowed to fire the post-completion
    //      workflow (Contact creation, FileAttachments, agent email).
    //      Without this, a 2-tab last-doc race would create two Contacts.

    type TxResult =
      | { kind: "already_signed" }
      | { kind: "ok"; completionWonRace: boolean };

    const txResult: TxResult = await prisma.$transaction(async (tx): Promise<TxResult> => {
      // 1. Document-level guard
      const docUpdate = await tx.onboardingDocument.updateMany({
        where: { id: documentId, status: { not: "signed" } },
        data: {
          status: "signed",
          signedAt: new Date(),
          signedIp: ip,
          signatureData: signatureImage ? signatureImage.slice(0, 100) + "..." : null,
          pdfUrl: signedPdfUrl || doc.pdfUrl,
        },
      });
      if (docUpdate.count === 0) {
        return { kind: "already_signed" };
      }

      // Audit log for the signature
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
            // Cap text fieldValues at 500 chars (#15) to bound audit log
            // JSON growth. Image data URLs are filtered above; text values
            // get truncated with an ellipsis suffix so the cap is visible.
            fieldValues: fieldValues
              ? Object.fromEntries(
                  Object.entries(fieldValues)
                    .filter(([, v]) => v && !v.startsWith("data:image"))
                    .map(([k, v]) => [k, v.length > 500 ? v.slice(0, 500) + "…" : v]),
                )
              : null,
          },
        },
      });

      // Recompute completion state inside the transaction so we see our own
      // write plus any concurrent write that committed before us.
      const allDocs = await tx.onboardingDocument.findMany({
        where: { onboardingId: onboarding.id },
        select: { status: true },
      });
      const allSigned = allDocs.every((d) => d.status === "signed");
      const anySigned = allDocs.some((d) => d.status === "signed");

      let completionWonRace = false;
      if (allSigned) {
        // 2. Onboarding-completion CAS — atomic compare-and-swap.
        const cas = await tx.clientOnboarding.updateMany({
          where: { id: onboarding.id, allDocsSigned: false },
          data: {
            status: "completed",
            completedAt: new Date(),
            allDocsSigned: true,
          },
        });
        completionWonRace = cas.count === 1;
        if (completionWonRace) {
          await tx.signingAuditLog.create({
            data: {
              onboardingId: onboarding.id,
              action: "completed",
              actorType: "system",
              actorName: "System",
              metadata: { trigger: "all_documents_signed" },
            },
          });
        }
      } else if (anySigned) {
        // Move to partially_signed only if still in an earlier state. Avoids
        // clobbering a "completed" status set by a concurrent transaction.
        await tx.clientOnboarding.updateMany({
          where: { id: onboarding.id, status: { in: ["draft", "pending"] } },
          data: { status: "partially_signed" },
        });
      }

      return { kind: "ok", completionWonRace };
    });

    // Idempotent retry: second submitter gets a clean 409, not a 500.
    if (txResult.kind === "already_signed") {
      return NextResponse.json(
        { error: "This document has already been signed" },
        { status: 409 },
      );
    }

    // Check final state for response
    const updatedOnboarding = await prisma.clientOnboarding.findUnique({
      where: { id: onboarding.id },
      select: { status: true, allDocsSigned: true, orgId: true, agentId: true, clientFirstName: true, clientLastName: true, clientEmail: true, clientPhone: true },
    });

    const allComplete = updatedOnboarding?.allDocsSigned ?? false;

    // ── Post-completion workflow (fire-and-forget) ───────────
    //
    // Gated on completionWonRace (#10) — only the transaction that flipped
    // allDocsSigned false→true fires the workflow. Without this gate, a
    // double-click on the last document would create two Contacts. Note:
    // .catch (not await) is intentional — the response shouldn't block on
    // background work.
    if (txResult.completionWonRace && allComplete && updatedOnboarding) {
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
