"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { FileAttachment } from "@prisma/client";

// NOTE: The Supabase Storage bucket "bms-files" must be created manually
// in the Supabase dashboard (Storage > New Bucket). Set it to private.

// ── Constants ────────────────────────────────────────────────

const BUCKET = "bms-files";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "jpg", "jpeg", "png", "doc", "docx", "xls", "xlsx",
]);

const EXTENSION_MIME_MAP: Record<string, string[]> = {
  pdf:  ["application/pdf"],
  jpg:  ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png:  ["image/png"],
  doc:  ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls:  ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

// ── Auth Helper ──────────────────────────────────────────────

async function getCurrentUserOrg() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
  });
  if (!user) throw new Error("User not found");

  return { orgId: user.orgId, userId: user.id };
}

// ── Upload File ──────────────────────────────────────────────

export async function uploadFile(
  formData: FormData,
  entityType: string,
  entityId: string,
): Promise<{ attachment?: FileAttachment; error?: string }> {
  try {
    const { orgId, userId } = await getCurrentUserOrg();

    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return { error: "No file provided" };
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return { error: "File exceeds 10 MB limit" };
    }

    // Validate extension
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return { error: `File type .${ext} is not allowed. Accepted: pdf, jpg, jpeg, png, doc, docx, xls, xlsx` };
    }

    // Validate MIME type matches extension
    const allowedMimes = EXTENSION_MIME_MAP[ext];
    if (allowedMimes && !allowedMimes.includes(file.type)) {
      return { error: "File content does not match its extension" };
    }

    // Build storage path: {orgId}/{entityType}/{entityId}/{timestamp}-{filename}
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${orgId}/${entityType}/${entityId}/${timestamp}-${safeName}`;

    // Upload to Supabase Storage
    const supabase = await createClient();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase storage upload error:", uploadError);
      return { error: "Failed to upload file" };
    }

    // Create DB record
    const attachment = await prisma.fileAttachment.create({
      data: {
        orgId,
        entityType,
        entityId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storagePath,
        uploadedBy: userId,
      },
    });

    return { attachment: JSON.parse(JSON.stringify(attachment)) };
  } catch (error) {
    console.error("uploadFile error:", error);
    return { error: "Failed to upload file" };
  }
}

// ── Get Files for Entity ─────────────────────────────────────

export async function getFilesForEntity(
  entityType: string,
  entityId: string,
): Promise<FileAttachment[]> {
  try {
    const { orgId } = await getCurrentUserOrg();

    const files = await prisma.fileAttachment.findMany({
      where: { orgId, entityType, entityId },
      orderBy: { createdAt: "desc" },
    });

    return JSON.parse(JSON.stringify(files));
  } catch (error) {
    console.error("getFilesForEntity error:", error);
    return [];
  }
}

// ── Delete File ──────────────────────────────────────────────

export async function deleteFile(
  attachmentId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { orgId } = await getCurrentUserOrg();

    const attachment = await prisma.fileAttachment.findFirst({
      where: { id: attachmentId, orgId },
    });
    if (!attachment) {
      return { success: false, error: "File not found" };
    }

    // Remove from Supabase Storage
    const supabase = await createClient();
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([attachment.storagePath]);

    if (storageError) {
      console.error("Supabase storage delete error:", storageError);
      return { success: false, error: "Failed to delete file from storage" };
    }

    // Remove DB record
    await prisma.fileAttachment.delete({ where: { id: attachmentId } });

    return { success: true };
  } catch (error) {
    console.error("deleteFile error:", error);
    return { success: false, error: "Failed to delete file" };
  }
}

// ── Get Signed URL ───────────────────────────────────────────

export async function getSignedUrl(
  attachmentId: string,
): Promise<{ url?: string; error?: string }> {
  try {
    const { orgId } = await getCurrentUserOrg();

    const attachment = await prisma.fileAttachment.findFirst({
      where: { id: attachmentId, orgId },
    });
    if (!attachment) {
      return { error: "File not found" };
    }

    const supabase = await createClient();
    const { data, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(attachment.storagePath, 3600); // 1 hour

    if (signError || !data?.signedUrl) {
      console.error("Supabase signed URL error:", signError);
      return { error: "Failed to generate download URL" };
    }

    return { url: data.signedUrl };
  } catch (error) {
    console.error("getSignedUrl error:", error);
    return { error: "Failed to generate download URL" };
  }
}
