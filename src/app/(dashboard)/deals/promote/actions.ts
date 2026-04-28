"use server";

import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";

async function getUser() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) throw new Error("Not authenticated");
  return { id: ctx.userId, orgId: ctx.orgId };
}

export async function savePromoteModel(data: {
  id?: string;
  dealAnalysisId: string;
  name?: string;
  templateName?: string;
  gpEquityPct: number;
  lpEquityPct: number;
  waterfallTiers: any;
  outputs: any;
}) {
  const user = await getUser();

  // Verify deal ownership
  const deal = await prisma.dealAnalysis.findFirst({
    where: { id: data.dealAnalysisId, orgId: user.orgId },
  });
  if (!deal) throw new Error("Deal not found");

  if (data.id) {
    const existing = await prisma.promoteModel.findFirst({
      where: { id: data.id, dealAnalysis: { orgId: user.orgId } },
    });
    if (!existing) throw new Error("Promote model not found");

    const updated = await prisma.promoteModel.update({
      where: { id: data.id },
      data: {
        name: data.name || null,
        templateName: data.templateName || null,
        gpEquityPct: data.gpEquityPct,
        lpEquityPct: data.lpEquityPct,
        waterfallTiers: data.waterfallTiers,
        outputs: data.outputs,
      },
    });
    return { id: updated.id, saved: true };
  }

  const created = await prisma.promoteModel.create({
    data: {
      dealAnalysisId: data.dealAnalysisId,
      name: data.name || null,
      templateName: data.templateName || null,
      gpEquityPct: data.gpEquityPct,
      lpEquityPct: data.lpEquityPct,
      waterfallTiers: data.waterfallTiers,
      outputs: data.outputs,
    },
  });

  return { id: created.id, saved: true };
}

export async function getPromoteModel(dealAnalysisId: string) {
  const user = await getUser();

  const deal = await prisma.dealAnalysis.findFirst({
    where: { id: dealAnalysisId, orgId: user.orgId },
  });
  if (!deal) throw new Error("Deal not found");

  const promote = await prisma.promoteModel.findFirst({
    where: { dealAnalysisId },
    orderBy: { updatedAt: "desc" },
  });

  if (!promote) return null;

  return {
    ...promote,
    createdAt: promote.createdAt.toISOString(),
    updatedAt: promote.updatedAt.toISOString(),
  };
}

export async function deletePromoteModel(id: string) {
  const user = await getUser();

  const promote = await prisma.promoteModel.findFirst({
    where: { id, dealAnalysis: { orgId: user.orgId } },
  });
  if (!promote) throw new Error("Promote model not found");

  await prisma.promoteModel.delete({ where: { id } });
  return { success: true };
}
