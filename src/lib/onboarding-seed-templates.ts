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
// Positions are percentages — calibrated to match the generated PDFs

const TENANT_REP_FIELDS: TemplateFieldDefinition[] = [
  { id: "tr_tenant_name", label: "Tenant Printed Name", type: "text", page: 1, x: 18, y: 69, width: 50, height: 4, prefillKey: "clientName", required: true },
  { id: "tr_tenant_sig", label: "Tenant Signature", type: "signature", page: 1, x: 18, y: 75, width: 40, height: 7, required: true },
  { id: "tr_tenant_date", label: "Tenant Date", type: "date", page: 1, x: 18, y: 83, width: 25, height: 4, prefillKey: "date", required: true },
];

const NYS_DISCLOSURE_FIELDS: TemplateFieldDefinition[] = [
  { id: "nys_client_name", label: "Client Printed Name", type: "text", page: 1, x: 18, y: 62, width: 50, height: 4, prefillKey: "clientName", required: true },
  { id: "nys_client_sig", label: "Client Signature", type: "signature", page: 1, x: 18, y: 68, width: 40, height: 7, required: true },
  { id: "nys_client_date", label: "Date", type: "date", page: 1, x: 18, y: 76, width: 25, height: 4, prefillKey: "date", required: true },
];

const FAIR_HOUSING_FIELDS: TemplateFieldDefinition[] = [
  { id: "fh_client_sig", label: "Client Signature", type: "signature", page: 0, x: 18, y: 85, width: 40, height: 7, required: true },
  { id: "fh_client_date", label: "Date", type: "date", page: 0, x: 18, y: 93, width: 25, height: 4, prefillKey: "date", required: true },
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
