"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { TemplateFieldDefinition } from "@/lib/onboarding-types";

// ── Auth Helper ─────────────────────────────────────────────

async function getOrgId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    select: { orgId: true },
  });
  return user?.orgId ?? null;
}

function serialize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_key, value) => {
    if (value instanceof Date) return value.toISOString();
    return value;
  }));
}

// ── 1. getDocumentTemplates ─────────────────────────────────

export async function getDocumentTemplates(): Promise<{
  success: boolean;
  data?: Record<string, unknown>[];
  error?: string;
}> {
  try {
    const orgId = await getOrgId();
    if (!orgId) return { success: false, error: "Not authenticated" };

    let templates = await prisma.documentTemplate.findMany({
      where: { orgId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    // Auto-seed defaults if org has no templates
    if (templates.length === 0) {
      try {
        const { seedDefaultTemplates } = await import("@/lib/onboarding-seed-templates");
        await seedDefaultTemplates(orgId);
        templates = await prisma.documentTemplate.findMany({
          where: { orgId, isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        });
      } catch (seedErr) {
        console.error("Auto-seed templates failed:", seedErr);
      }
    }

    return { success: true, data: templates.map((t) => serialize(t) as unknown as Record<string, unknown>) };
  } catch (error) {
    console.error("getDocumentTemplates error:", error);
    return { success: false, error: "Failed to fetch templates" };
  }
}

// ── 2. createDocumentTemplate ───────────────────────────────

export async function createDocumentTemplate(formData: FormData): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const orgId = await getOrgId();
    if (!orgId) return { success: false, error: "Not authenticated" };

    const name = formData.get("name") as string;
    const description = formData.get("description") as string | null;
    const file = formData.get("file") as File | null;

    if (!name?.trim()) return { success: false, error: "Template name is required" };
    if (!file || !(file instanceof File)) return { success: false, error: "PDF file is required" };
    if (file.size > 10 * 1024 * 1024) return { success: false, error: "File exceeds 10 MB limit" };
    if (!file.type.includes("pdf")) return { success: false, error: "Only PDF files are allowed" };

    // Upload to Supabase Storage
    const supabase = await createClient();
    const fileId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const storagePath = `document-templates/${orgId}/${fileId}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("bms-files")
      .upload(storagePath, file, { contentType: "application/pdf", upsert: false });

    if (uploadError) {
      console.error("Template upload error:", uploadError);
      return { success: false, error: "Failed to upload PDF" };
    }

    const { data: urlData } = supabase.storage.from("bms-files").getPublicUrl(storagePath);
    const templatePdfUrl = urlData?.publicUrl ?? storagePath;

    const template = await prisma.documentTemplate.create({
      data: {
        orgId,
        name: name.trim(),
        description: description?.trim() || null,
        category: "custom",
        templatePdfUrl,
        fields: [],
        isActive: true,
        isDefault: false,
      },
    });

    return { success: true, data: serialize(template) as unknown as Record<string, unknown> };
  } catch (error) {
    console.error("createDocumentTemplate error:", error);
    return { success: false, error: "Failed to create template" };
  }
}

// ── 3. updateDocumentTemplate ───────────────────────────────

export async function updateDocumentTemplate(
  id: string,
  input: { name?: string; description?: string; sortOrder?: number; isActive?: boolean },
): Promise<{ success: boolean; error?: string }> {
  try {
    const orgId = await getOrgId();
    if (!orgId) return { success: false, error: "Not authenticated" };

    const existing = await prisma.documentTemplate.findFirst({
      where: { id, orgId },
    });
    if (!existing) return { success: false, error: "Template not found" };

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    await prisma.documentTemplate.update({ where: { id }, data });

    return { success: true };
  } catch (error) {
    console.error("updateDocumentTemplate error:", error);
    return { success: false, error: "Failed to update template" };
  }
}

// ── 4. deleteDocumentTemplate ───────────────────────────────

export async function deleteDocumentTemplate(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const orgId = await getOrgId();
    if (!orgId) return { success: false, error: "Not authenticated" };

    const existing = await prisma.documentTemplate.findFirst({
      where: { id, orgId },
    });
    if (!existing) return { success: false, error: "Template not found" };
    if (existing.isDefault) return { success: false, error: "Cannot delete a default template" };

    await prisma.documentTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    return { success: true };
  } catch (error) {
    console.error("deleteDocumentTemplate error:", error);
    return { success: false, error: "Failed to delete template" };
  }
}

// ── 5. updateTemplateFields ─────────────────────────────────

export async function updateTemplateFields(
  templateId: string,
  fields: TemplateFieldDefinition[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const orgId = await getOrgId();
    if (!orgId) return { success: false, error: "Not authenticated" };

    const existing = await prisma.documentTemplate.findFirst({
      where: { id: templateId, orgId },
    });
    if (!existing) return { success: false, error: "Template not found" };

    await prisma.documentTemplate.update({
      where: { id: templateId },
      data: { fields: JSON.parse(JSON.stringify(fields)) },
    });

    return { success: true };
  } catch (error) {
    console.error("updateTemplateFields error:", error);
    return { success: false, error: "Failed to save fields" };
  }
}
