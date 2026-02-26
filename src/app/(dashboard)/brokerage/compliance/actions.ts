"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { ComplianceDocInput, AgentComplianceSummary } from "@/lib/bms-types";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentOrg() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return { userId: user.id, orgId: user.orgId };
}

// ── Helpers ───────────────────────────────────────────────────

function computeStatus(expiryDate: Date | null): "active" | "expired" | "expiring_soon" {
  if (!expiryDate) return "active";
  const now = new Date();
  if (expiryDate < now) return "expired";
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  if (expiryDate < thirtyDaysFromNow) return "expiring_soon";
  return "active";
}

function dateStatus(d: Date | string | null): "active" | "expired" | "expiring_soon" {
  if (!d) return "active";
  return computeStatus(new Date(d));
}

// ── 1. Compliance Overview ────────────────────────────────────

export async function getComplianceOverview() {
  try {
    const { orgId } = await getCurrentOrg();

    const agents = await prisma.brokerAgent.findMany({
      where: { orgId, status: "active" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        licenseExpiry: true,
        eoInsuranceExpiry: true,
        complianceDocuments: {
          select: { id: true, expiryDate: true, status: true },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const agentSummaries: AgentComplianceSummary[] = [];
    let fullyCompliant = 0;
    let hasExpired = 0;
    let hasExpiringSoon = 0;

    for (const agent of agents) {
      const licenseStatus = dateStatus(agent.licenseExpiry);
      const eoStatus = dateStatus(agent.eoInsuranceExpiry);

      let expiredDocs = 0;
      let expiringSoonDocs = 0;

      // Count doc statuses based on live expiry dates
      for (const doc of agent.complianceDocuments) {
        const s = computeStatus(doc.expiryDate);
        if (s === "expired") expiredDocs++;
        else if (s === "expiring_soon") expiringSoonDocs++;
      }

      // Include license/E&O in expired/expiring counts
      if (licenseStatus === "expired") expiredDocs++;
      else if (licenseStatus === "expiring_soon") expiringSoonDocs++;
      if (eoStatus === "expired") expiredDocs++;
      else if (eoStatus === "expiring_soon") expiringSoonDocs++;

      const isFullyCompliant = expiredDocs === 0;

      if (isFullyCompliant) fullyCompliant++;
      if (expiredDocs > 0) hasExpired++;
      if (expiringSoonDocs > 0) hasExpiringSoon++;

      agentSummaries.push({
        agentId: agent.id,
        agentName: `${agent.firstName} ${agent.lastName}`,
        licenseExpiry: agent.licenseExpiry ? new Date(agent.licenseExpiry).toISOString() : null,
        eoInsuranceExpiry: agent.eoInsuranceExpiry ? new Date(agent.eoInsuranceExpiry).toISOString() : null,
        totalDocs: agent.complianceDocuments.length,
        expiredDocs,
        expiringSoonDocs,
        isFullyCompliant,
      });
    }

    return JSON.parse(JSON.stringify({
      totalAgents: agents.length,
      fullyCompliant,
      hasExpired,
      hasExpiringSoon,
      agentSummaries,
    }));
  } catch (error) {
    console.error("getComplianceOverview error:", error);
    return { totalAgents: 0, fullyCompliant: 0, hasExpired: 0, hasExpiringSoon: 0, agentSummaries: [] };
  }
}

// ── 2. Agent Compliance Docs ──────────────────────────────────

export async function getAgentComplianceDocs(agentId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    const docs = await prisma.complianceDocument.findMany({
      where: { orgId, agentId },
      orderBy: { expiryDate: "asc" },
    });

    // Compute live status for each doc
    const enriched = docs.map((doc) => ({
      ...doc,
      status: computeStatus(doc.expiryDate),
    }));

    return JSON.parse(JSON.stringify(enriched));
  } catch (error) {
    console.error("getAgentComplianceDocs error:", error);
    return [];
  }
}

// ── 3. Create Compliance Doc ──────────────────────────────────

export async function createComplianceDoc(input: ComplianceDocInput) {
  try {
    const { orgId } = await getCurrentOrg();

    // Verify agent belongs to org
    const agent = await prisma.brokerAgent.findFirst({
      where: { id: input.agentId, orgId },
    });
    if (!agent) return { success: false, error: "Agent not found" };

    const expiryDate = input.expiryDate ? new Date(input.expiryDate) : null;
    const status = computeStatus(expiryDate);

    const doc = await prisma.complianceDocument.create({
      data: {
        orgId,
        agentId: input.agentId,
        docType: input.docType,
        title: input.title,
        description: input.description || null,
        issueDate: input.issueDate ? new Date(input.issueDate) : null,
        expiryDate,
        fileUrl: input.fileUrl || null,
        fileName: input.fileName || null,
        fileSize: input.fileSize || null,
        status,
        notes: input.notes || null,
      },
    });

    return JSON.parse(JSON.stringify({ success: true, doc }));
  } catch (error) {
    console.error("createComplianceDoc error:", error);
    return { success: false, error: "Failed to create compliance document" };
  }
}

// ── 4. Update Compliance Doc ──────────────────────────────────

export async function updateComplianceDoc(docId: string, input: Partial<ComplianceDocInput>) {
  try {
    const { orgId } = await getCurrentOrg();

    // Verify doc belongs to org
    const existing = await prisma.complianceDocument.findFirst({
      where: { id: docId, orgId },
    });
    if (!existing) return { success: false, error: "Document not found" };

    const expiryDate = input.expiryDate !== undefined
      ? (input.expiryDate ? new Date(input.expiryDate) : null)
      : existing.expiryDate;
    const status = computeStatus(expiryDate);

    const data: Record<string, unknown> = { status };
    if (input.docType !== undefined) data.docType = input.docType;
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description || null;
    if (input.issueDate !== undefined) data.issueDate = input.issueDate ? new Date(input.issueDate) : null;
    if (input.expiryDate !== undefined) data.expiryDate = expiryDate;
    if (input.fileUrl !== undefined) data.fileUrl = input.fileUrl || null;
    if (input.fileName !== undefined) data.fileName = input.fileName || null;
    if (input.fileSize !== undefined) data.fileSize = input.fileSize || null;
    if (input.notes !== undefined) data.notes = input.notes || null;

    const doc = await prisma.complianceDocument.update({
      where: { id: docId },
      data,
    });

    return JSON.parse(JSON.stringify({ success: true, doc }));
  } catch (error) {
    console.error("updateComplianceDoc error:", error);
    return { success: false, error: "Failed to update compliance document" };
  }
}

// ── 5. Delete Compliance Doc ──────────────────────────────────

export async function deleteComplianceDoc(docId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    const existing = await prisma.complianceDocument.findFirst({
      where: { id: docId, orgId },
    });
    if (!existing) return { success: false, error: "Document not found" };

    await prisma.complianceDocument.delete({ where: { id: docId } });

    return { success: true };
  } catch (error) {
    console.error("deleteComplianceDoc error:", error);
    return { success: false, error: "Failed to delete compliance document" };
  }
}

// ── 6. Get Expiring Items ─────────────────────────────────────

export async function getExpiringItems(daysAhead: number = 30) {
  try {
    const { orgId } = await getCurrentOrg();

    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);

    // Fetch agents with expiring license or E&O
    const agents = await prisma.brokerAgent.findMany({
      where: {
        orgId,
        status: "active",
        OR: [
          { licenseExpiry: { gte: now, lte: cutoff } },
          { eoInsuranceExpiry: { gte: now, lte: cutoff } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        licenseExpiry: true,
        eoInsuranceExpiry: true,
      },
      orderBy: [{ lastName: "asc" }],
    });

    // Fetch expiring compliance documents
    const docs = await prisma.complianceDocument.findMany({
      where: {
        orgId,
        expiryDate: { gte: now, lte: cutoff },
      },
      include: {
        agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { expiryDate: "asc" },
    });

    // Group by agent
    const agentMap = new Map<string, {
      agentId: string;
      agentName: string;
      agentEmail: string;
      items: Array<{ type: string; title: string; expiryDate: string; daysUntilExpiry: number }>;
    }>();

    function ensureAgent(id: string, name: string, email: string) {
      if (!agentMap.has(id)) {
        agentMap.set(id, { agentId: id, agentName: name, agentEmail: email, items: [] });
      }
      return agentMap.get(id)!;
    }

    function daysUntil(d: Date): number {
      return Math.ceil((d.getTime() - now.getTime()) / 86400000);
    }

    for (const agent of agents) {
      const entry = ensureAgent(agent.id, `${agent.firstName} ${agent.lastName}`, agent.email);
      if (agent.licenseExpiry && agent.licenseExpiry >= now && agent.licenseExpiry <= cutoff) {
        entry.items.push({
          type: "license",
          title: "Real Estate License",
          expiryDate: new Date(agent.licenseExpiry).toISOString(),
          daysUntilExpiry: daysUntil(new Date(agent.licenseExpiry)),
        });
      }
      if (agent.eoInsuranceExpiry && agent.eoInsuranceExpiry >= now && agent.eoInsuranceExpiry <= cutoff) {
        entry.items.push({
          type: "eo_insurance",
          title: "E&O Insurance",
          expiryDate: new Date(agent.eoInsuranceExpiry).toISOString(),
          daysUntilExpiry: daysUntil(new Date(agent.eoInsuranceExpiry)),
        });
      }
    }

    for (const doc of docs) {
      if (!doc.agent) continue;
      const entry = ensureAgent(doc.agent.id, `${doc.agent.firstName} ${doc.agent.lastName}`, doc.agent.email);
      entry.items.push({
        type: doc.docType,
        title: doc.title,
        expiryDate: new Date(doc.expiryDate!).toISOString(),
        daysUntilExpiry: daysUntil(new Date(doc.expiryDate!)),
      });
    }

    // Sort items within each agent by days until expiry
    for (const entry of agentMap.values()) {
      entry.items.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    }

    const grouped = Array.from(agentMap.values()).sort((a, b) => {
      const aMin = a.items[0]?.daysUntilExpiry ?? 999;
      const bMin = b.items[0]?.daysUntilExpiry ?? 999;
      return aMin - bMin;
    });

    return JSON.parse(JSON.stringify({ expiringItems: grouped, totalItems: grouped.reduce((s, g) => s + g.items.length, 0) }));
  } catch (error) {
    console.error("getExpiringItems error:", error);
    return { expiringItems: [], totalItems: 0 };
  }
}

// ── 7. Refresh Compliance Statuses ────────────────────────────

export async function refreshComplianceStatuses() {
  try {
    const { orgId } = await getCurrentOrg();

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Batch 1: Mark expired docs (expiryDate < now AND status != 'expired')
    const expiredResult = await prisma.complianceDocument.updateMany({
      where: {
        orgId,
        expiryDate: { lt: now },
        status: { not: "expired" },
      },
      data: { status: "expired" },
    });

    // Batch 2: Mark expiring_soon docs (expiryDate >= now AND < 30d AND status = 'active')
    const expiringSoonResult = await prisma.complianceDocument.updateMany({
      where: {
        orgId,
        expiryDate: { gte: now, lt: thirtyDaysFromNow },
        status: "active",
      },
      data: { status: "expiring_soon" },
    });

    // Batch 3: Revert to active if previously expiring_soon but expiryDate is now > 30d
    // (e.g., if expiryDate was updated to a later date)
    const reactivatedResult = await prisma.complianceDocument.updateMany({
      where: {
        orgId,
        expiryDate: { gte: thirtyDaysFromNow },
        status: { in: ["expired", "expiring_soon"] },
      },
      data: { status: "active" },
    });

    // Batch 4: Docs with no expiryDate should be active
    const noExpiryResult = await prisma.complianceDocument.updateMany({
      where: {
        orgId,
        expiryDate: null,
        status: { not: "active" },
      },
      data: { status: "active" },
    });

    const totalUpdated = expiredResult.count + expiringSoonResult.count +
      reactivatedResult.count + noExpiryResult.count;

    return {
      success: true,
      totalUpdated,
      expired: expiredResult.count,
      expiringSoon: expiringSoonResult.count,
      reactivated: reactivatedResult.count,
      noExpiry: noExpiryResult.count,
    };
  } catch (error) {
    console.error("refreshComplianceStatuses error:", error);
    return { success: false, totalUpdated: 0, expired: 0, expiringSoon: 0, reactivated: 0, noExpiry: 0 };
  }
}
