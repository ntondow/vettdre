import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import prisma from "@/lib/prisma";
import {
  isRateLimitEnabled,
  checkRateLimit,
  rateLimitHeaders,
  documentUploadLimiter,
} from "@/lib/rate-limit";
import { validateApplicantSession } from "@/lib/screening/session";

const BUCKET_NAME = "screening-documents";
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

function sanitizeFileName(fileName: string): string {
  // Remove special characters but keep extension
  const parts = fileName.split(".");
  const ext = parts.pop() || "";
  const name = parts.join(".").replace(/[^a-zA-Z0-9_-]/g, "_");
  return ext ? `${name}.${ext}` : name;
}

function getStorageClient() {
  return createSupabaseAdmin(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Rate limiting and session validation (soft requirements)
    if (isRateLimitEnabled()) {
      const rl = await checkRateLimit(documentUploadLimiter(), token);
      if (!rl.success) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: rateLimitHeaders(rl) },
        );
      }

      const session = await validateApplicantSession(
        token,
        req.headers.get("cookie"),
      );
      if (!session.valid) {
        return NextResponse.json(
          { error: session.error || "Invalid session" },
          { status: 401 },
        );
      }
    }

    // Look up application by token first
    const application = await prisma.screeningApplication.findUnique({
      where: { accessToken: token },
      include: { applicants: { select: { id: true } } },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 },
      );
    }

    // Reject submissions on finalized applications
    const openStatuses = ["draft", "invited", "in_progress"];
    if (!openStatuses.includes(application.status)) {
      return NextResponse.json(
        { error: "Application is no longer accepting submissions" },
        { status: 410 },
      );
    }

    // Parse multipart form data
    const formData = await req.formData();
    const applicantId = formData.get("applicantId") as string;

    if (!applicantId) {
      return NextResponse.json(
        { error: "Missing applicantId" },
        { status: 400 },
      );
    }

    // Verify applicant belongs to this application
    const applicantExists = application.applicants.some(
      (a: any) => a.id === applicantId,
    );
    if (!applicantExists) {
      return NextResponse.json(
        { error: "Applicant not found in this application" },
        { status: 404 },
      );
    }

    // Validate documentType against allowed enum values
    const validDocTypes = [
      "pay_stub", "w2", "tax_return", "ten99", "bank_statement",
      "employment_letter", "landlord_reference", "government_id", "other",
    ];

    // Extract files and document types from form data
    const fileEntries: Array<{ file: File; documentType: string }> = [];
    const documentTypes = formData.getAll("documentTypes") as string[];
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files uploaded" },
        { status: 400 },
      );
    }

    // Match files with their document types
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const documentType = documentTypes[i];

      if (!documentType || !validDocTypes.includes(documentType)) {
        return NextResponse.json(
          { error: `Invalid document type: ${documentType}` },
          { status: 400 },
        );
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds 20 MB limit` },
          { status: 400 },
        );
      }

      fileEntries.push({ file, documentType });
    }

    // Upload files to Supabase Storage and create records
    const storage = getStorageClient();
    const documentIds: string[] = [];

    for (const { file, documentType } of fileEntries) {
      try {
        // Generate unique file path
        const sanitized = sanitizeFileName(file.name);
        const uuid = crypto.randomUUID();
        const storagePath = `screening-documents/${application.id}/${applicantId}/${uuid}_${sanitized}`;

        // Upload file to Supabase Storage
        const fileBuffer = await file.arrayBuffer();
        const { data: uploadData, error: uploadError } = await storage.storage
          .from(BUCKET_NAME)
          .upload(storagePath, new Uint8Array(fileBuffer), {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          console.error(`Upload error for ${file.name}:`, uploadError);
          return NextResponse.json(
            { error: `Failed to upload file "${file.name}": ${uploadError.message}` },
            { status: 500 },
          );
        }

        // Create document record in database
        const created = await prisma.screeningDocument.create({
          data: {
            applicantId,
            fileName: file.name,
            filePath: storagePath,
            documentType: documentType,
            fileSize: file.size,
            mimeType: file.type,
          },
        });
        documentIds.push(created.id);
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        return NextResponse.json(
          { error: `Failed to process file "${file.name}"` },
          { status: 500 },
        );
      }
    }

    // Update applicant step
    await prisma.screeningApplicant.update({
      where: { id: applicantId },
      data: { currentStep: 5 },
    });

    // Create ScreeningEvent
    await prisma.screeningEvent.create({
      data: {
        applicationId: application.id,
        applicantId,
        eventType: "step_completed",
        eventData: {
          step: "documents",
          documentCount: fileEntries.length,
        },
      },
    });

    return NextResponse.json({ success: true, documentIds });
  } catch (error) {
    console.error("Documents POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
