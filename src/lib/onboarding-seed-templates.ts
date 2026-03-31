// ============================================================
// Seed Default Document Templates for an Organization
// Creates 3 standard templates: Tenant Rep, NYS Disclosure, Fair Housing
// ============================================================

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { generateTenantRepAgreementPdf } from "@/lib/onboarding-pdf";
import { generateNysDisclosurePdf } from "@/lib/onboarding-pdf-nys-disclosure";
import { generateFairHousingPdf } from "@/lib/onboarding-pdf-fair-housing";
import type { TemplateFieldDefinition } from "@/lib/onboarding-types";

// Field definitions for each default template
// Positions are percentages (0-100) — calibrated to match the REAL government PDFs
// (DOS-1735-f and DOS-2156) uploaded to Supabase Storage.
// x/y = top-left corner of field as % of page width/height
// width/height = field dimensions as % of page width/height
// page = 0-indexed page number within the PDF

const TENANT_REP_FIELDS: TemplateFieldDefinition[] = [
  { id: "tr_tenant_name", label: "Tenant Printed Name", type: "text", page: 1, x: 18, y: 69, width: 50, height: 4, prefillKey: "clientName", required: true },
  { id: "tr_tenant_sig", label: "Tenant Signature", type: "signature", page: 1, x: 18, y: 75, width: 40, height: 7, required: true },
  { id: "tr_tenant_date", label: "Tenant Date", type: "date", page: 1, x: 18, y: 83, width: 25, height: 4, prefillKey: "date", required: true },
];

// DOS-1735-f — NYS Agency Disclosure Form for Landlord and Tenant
// All signable fields are on page 2 (index 1)
// Positions mapped from the { } markers on the actual government PDF
const NYS_DISCLOSURE_FIELDS: TemplateFieldDefinition[] = [
  // ── Prefilled by agent (page 2: "This form was provided to me by ___ of ___") ──
  { id: "nys_agent_name",       label: "Agent Name",      type: "text",      page: 1, x: 24, y: 22, width: 30, height: 3,   prefillKey: "agentName",              required: true },
  { id: "nys_brokerage",        label: "Brokerage",       type: "text",      page: 1, x: 62, y: 22, width: 30, height: 3,   prefillKey: "brokerageName",          required: true },
  // ── Auto-checked checkboxes (tenant representation) ──
  { id: "nys_tenant_check",     label: "Tenant as a",     type: "checkbox",  page: 1, x: 55, y: 31, width: 4,  height: 2.5, prefillKey: "tenantCheck",            required: false },
  { id: "nys_tenants_agent_chk", label: "Tenant's Agent", type: "checkbox",  page: 1, x: 62, y: 35, width: 4,  height: 2.5, prefillKey: "tenantsAgentCheck",      required: false },
  // ── Client name on "(I)(We) ___" acknowledgment line ──
  { id: "nys_client_name",      label: "Client Name (I/We)", type: "text",   page: 1, x: 10, y: 72, width: 22, height: 3,   prefillKey: "clientName",             required: true },
  // ── Tenant(s) checkbox near "Signature of □ Landlord(s) and/or ✓ Tenant(s):" ──
  { id: "nys_tenant_sig_chk",   label: "Tenant(s)",       type: "checkbox",  page: 1, x: 28, y: 79, width: 4,  height: 2.5, prefillKey: "tenantSignatureCheck",   required: false },
  // ── Client fills: signature + date ──
  { id: "nys_client_sig",       label: "Client Signature", type: "signature", page: 1, x: 5,  y: 83, width: 42, height: 5,                                        required: true },
  { id: "nys_client_date",      label: "Date",            type: "date",      page: 1, x: 8,  y: 92, width: 22, height: 3,   prefillKey: "date",                   required: true },
];

// DOS-2156 — NYS Housing and Anti-Discrimination Disclosure Form
// All signable fields are on page 2 (index 1)
// Positions mapped from the { } markers on the actual government PDF
const FAIR_HOUSING_FIELDS: TemplateFieldDefinition[] = [
  // ── Prefilled by agent (page 2: "This form was provided to me by ___") ──
  { id: "fh_agent_name",   label: "Agent Name",      type: "text",      page: 1, x: 24, y: 25, width: 32, height: 3, prefillKey: "agentName",     required: true },
  // ── "Broker) of ___" line ──
  { id: "fh_brokerage",    label: "Brokerage",       type: "text",      page: 1, x: 14, y: 31, width: 36, height: 3, prefillKey: "brokerageName", required: true },
  // ── "(I)(We) ___" line ──
  { id: "fh_client_name",  label: "Client Name",     type: "text",      page: 1, x: 8,  y: 39, width: 20, height: 3, prefillKey: "clientName",    required: true },
  // ── Client fills: signature + date on first "Buyer/Tenant/Seller/Landlord Signature ___ Date: ___" line ──
  { id: "fh_client_sig",   label: "Client Signature", type: "signature", page: 1, x: 33, y: 53, width: 32, height: 4,                              required: true },
  { id: "fh_client_date",  label: "Date",            type: "date",      page: 1, x: 81, y: 53, width: 14, height: 3, prefillKey: "date",          required: true },
];

interface TemplateConfig {
  name: string;
  description: string;
  docType: string;
  fields: TemplateFieldDefinition[];
  sortOrder: number;
  generatePdf: (brokerageName: string) => Promise<Uint8Array>;
}

export async function seedDefaultTemplates(orgId: string): Promise<void> {
  try {
    // Check if org already has defaults
    const existing = await prisma.documentTemplate.count({
      where: { orgId, isDefault: true },
    });
    if (existing > 0) {
      console.log(`[Seed] Org ${orgId} already has ${existing} default templates, skipping`);
      return;
    }

    // Get org name for PDF generation
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    const brokerageName = org?.name || "Your Brokerage";

    const configs: TemplateConfig[] = [
      {
        name: "Tenant Representation Agreement",
        description: "Standard tenant rep agreement with commission terms and FARE Act compliance",
        docType: "tenant_rep_agreement",
        fields: TENANT_REP_FIELDS,
        sortOrder: 0,
        generatePdf: async (bn) => generateTenantRepAgreementPdf({
          brokerageName: bn,
          agentFullName: "[Agent Name]",
          agentLicense: "[License #]",
          clientFirstName: "[Client",
          clientLastName: "Name]",
          commissionAmount: 0,
          commissionType: "percentage",
          termDays: 30,
        }),
      },
      {
        name: "NYS Agency Disclosure (DOS 1736)",
        description: "Required New York State disclosure form explaining agency relationships",
        docType: "nys_disclosure",
        fields: NYS_DISCLOSURE_FIELDS,
        sortOrder: 1,
        generatePdf: async (bn) => generateNysDisclosurePdf({
          brokerageName: bn,
          agentFullName: "[Agent Name]",
          agentLicense: "[License #]",
          clientFirstName: "[Client",
          clientLastName: "Name]",
        }),
      },
      {
        name: "Fair Housing Notice",
        description: "Federal, NYS, and NYC fair housing protections acknowledgment",
        docType: "fair_housing_notice",
        fields: FAIR_HOUSING_FIELDS,
        sortOrder: 2,
        generatePdf: async (bn) => generateFairHousingPdf({
          brokerageName: bn,
          agentFullName: "[Agent Name]",
        }),
      },
    ];

    const supabase = await createClient();

    for (const config of configs) {
      try {
        // Generate template PDF
        const pdfBytes = await config.generatePdf(brokerageName);

        // Upload to storage
        const storagePath = `document-templates/${orgId}/default-${config.docType}.pdf`;
        const { error: uploadErr } = await supabase.storage
          .from("bms-files")
          .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

        let pdfUrl = storagePath;
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("bms-files").getPublicUrl(storagePath);
          pdfUrl = urlData?.publicUrl ?? storagePath;
        } else {
          console.error(`[Seed] Upload failed for ${config.name}:`, uploadErr);
        }

        // Create template record
        await prisma.documentTemplate.create({
          data: {
            orgId,
            name: config.name,
            description: config.description,
            category: "standard",
            templatePdfUrl: pdfUrl,
            fields: JSON.parse(JSON.stringify(config.fields)),
            isActive: true,
            isDefault: true,
            sortOrder: config.sortOrder,
          },
        });

        console.log(`[Seed] Created default template: ${config.name} for org ${orgId}`);
      } catch (err) {
        console.error(`[Seed] Failed to create ${config.name}:`, err);
        // Continue with other templates
      }
    }

    console.log(`[Seed] Default templates seeded for org ${orgId}`);
  } catch (error) {
    console.error("[Seed] seedDefaultTemplates error:", error);
  }
}
