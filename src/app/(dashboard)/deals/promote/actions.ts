"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

async function getUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return user;
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
