"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// ── Auth Helper ──────────────────────────────────────────────

async function getUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return user;
}

// ── Document Logging ─────────────────────────────────────────
// Records generated documents as FileAttachment records.
// Actual PDFs are generated client-side; we only store metadata.

export interface DocumentLogParams {
  docType: "investment_summary" | "loi" | "bov" | "deal_pdf" | "comparison";
  propertyAddress: string;
  dealId?: string;
  fileName: string;
  fileType?: string;
  metadata?: Record<string, unknown>;
}

export async function logGeneratedDocument(params: DocumentLogParams) {
  const user = await getUser();

  const doc = await prisma.fileAttachment.create({
    data: {
      orgId: user.orgId,
      entityType: "generated_document",
      entityId: params.dealId || "standalone",
      fileName: params.fileName,
      fileType: params.fileType || "application/pdf",
      fileSize: 0, // client-side generated, no server storage
      storagePath: `generated/${params.docType}/${params.fileName}`,
      uploadedBy: user.id,
    },
  });

  return { id: doc.id, success: true };
}

// ── List Generated Documents ────────────────────────────────

export async function getGeneratedDocuments() {
  const user = await getUser();

  const docs = await prisma.fileAttachment.findMany({
    where: {
      orgId: user.orgId,
      entityType: "generated_document",
    },
    orderBy: { createdAt: "desc" },
  });

  return docs.map((d) => ({
    id: d.id,
    fileName: d.fileName,
    fileType: d.fileType,
    storagePath: d.storagePath,
    entityId: d.entityId,
    createdAt: d.createdAt.toISOString(),
    // Derive docType from storagePath
    docType: d.storagePath.split("/")[1] || "unknown",
  }));
}

// ── Delete Generated Document ───────────────────────────────

export async function deleteGeneratedDocument(id: string) {
  const user = await getUser();

  const doc = await prisma.fileAttachment.findFirst({
    where: { id, orgId: user.orgId, entityType: "generated_document" },
  });
  if (!doc) throw new Error("Document not found");

  await prisma.fileAttachment.delete({ where: { id } });
  return { success: true };
}

// ── Branding for Export ─────────────────────────────────────

export async function getBrandingForExport() {
  const user = await getUser();

  const brand = await prisma.brandSettings.findUnique({
    where: { orgId: user.orgId },
  });

  const org = await prisma.organization.findUnique({
    where: { id: user.orgId },
  });

  return {
    companyName: brand?.companyName || org?.name || "VettdRE",
    primaryColor: brand?.primaryColor || "#1E40AF",
    logoUrl: brand?.logoUrl || null,
    tagline: brand?.tagline || null,
    website: brand?.websiteUrl || null,
  };
}
