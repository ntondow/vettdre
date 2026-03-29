"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  return prisma.user.findUnique({ where: { authProviderId: authUser.id } });
}

// ============================================================
// Profile
// ============================================================

export async function getProfile() {
  const user = await getAuthUser();
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    title: user.title,
    licenseNumber: user.licenseNumber,
    brokerage: user.brokerage,
    avatarUrl: user.avatarUrl,
    role: user.role,
    orgId: user.orgId,
  };
}

export async function updateProfile(data: {
  fullName?: string;
  phone?: string;
  title?: string;
  licenseNumber?: string;
  brokerage?: string;
  avatarUrl?: string;
}) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  await prisma.user.update({ where: { id: user.id }, data });
  return { success: true };
}

// ============================================================
// Email Signature
// ============================================================

export async function getSignature() {
  const user = await getAuthUser();
  if (!user) return null;
  const sig = await prisma.emailSignature.findUnique({ where: { userId: user.id } });
  return sig ? JSON.parse(JSON.stringify(sig)) : null;
}

export async function saveSignature(data: {
  template: string;
  html: string;
  logoUrl?: string | null;
  accentColor: string;
  linkedinUrl?: string | null;
  websiteUrl?: string | null;
}) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  await prisma.emailSignature.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data, logoUrl: data.logoUrl || null, linkedinUrl: data.linkedinUrl || null, websiteUrl: data.websiteUrl || null },
    update: { ...data, logoUrl: data.logoUrl || null, linkedinUrl: data.linkedinUrl || null, websiteUrl: data.websiteUrl || null },
  });
  return { success: true };
}

// ============================================================
// Notification Preferences
// ============================================================

export async function getNotificationPreferences() {
  const user = await getAuthUser();
  if (!user) return null;
  const prefs = await prisma.notificationPreferences.findUnique({ where: { userId: user.id } });
  return prefs ? JSON.parse(JSON.stringify(prefs)) : null;
}

export async function updateNotificationPref(field: string, value: boolean) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  await prisma.notificationPreferences.upsert({
    where: { userId: user.id },
    create: { userId: user.id, [field]: value },
    update: { [field]: value },
  });
  return { success: true };
}

// ============================================================
// Working Hours
// ============================================================

export async function getWorkingHours() {
  const user = await getAuthUser();
  if (!user) return null;
  const wh = await prisma.workingHours.findUnique({ where: { userId: user.id } });
  return wh ? JSON.parse(JSON.stringify(wh)) : null;
}

export async function saveWorkingHours(data: { timezone: string; schedule: any }) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  await prisma.workingHours.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  return { success: true };
}

// ============================================================
// Team Members
// ============================================================

export async function getTeamMembers() {
  const user = await getAuthUser();
  if (!user) return [];
  const members = await prisma.user.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "asc" },
  });
  return members.map(m => ({
    id: m.id,
    fullName: m.fullName,
    email: m.email,
    role: m.role,
    isActive: m.isActive,
    lastLoginAt: m.lastLoginAt?.toISOString() || null,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function inviteTeamMember(data: { email: string; fullName: string; role: string }) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  if (user.role !== "owner" && user.role !== "admin") return { error: "Not authorized" };
  try {
    const member = await prisma.user.create({
      data: {
        orgId: user.orgId,
        email: data.email,
        fullName: data.fullName,
        role: data.role as any,
        invitedBy: user.id,
      },
    });
    return { success: true, id: member.id };
  } catch (e: any) {
    if (e.code === "P2002") return { error: "A user with this email already exists in your organization" };
    return { error: e.message };
  }
}

export async function updateTeamMember(memberId: string, data: { role?: string; isActive?: boolean }) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  if (user.role !== "owner" && user.role !== "admin") return { error: "Not authorized" };
  await prisma.user.updateMany({
    where: { id: memberId, orgId: user.orgId },
    data: data as any,
  });
  return { success: true };
}

export async function removeTeamMember(memberId: string) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  if (user.role !== "owner" && user.role !== "admin") return { error: "Not authorized" };
  if (memberId === user.id) return { error: "Cannot remove yourself" };
  await prisma.user.updateMany({
    where: { id: memberId, orgId: user.orgId },
    data: { isActive: false },
  });
  return { success: true };
}

// ============================================================
// Lead Assignment Rules
// ============================================================

export async function getLeadAssignmentRule() {
  const user = await getAuthUser();
  if (!user) return null;
  const rule = await prisma.leadAssignmentRule.findUnique({ where: { orgId: user.orgId } });
  return rule ? JSON.parse(JSON.stringify(rule)) : null;
}

export async function saveLeadAssignmentRule(data: { method: string; rules?: any; agentOrder?: any }) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  await prisma.leadAssignmentRule.upsert({
    where: { orgId: user.orgId },
    create: { orgId: user.orgId, ...data },
    update: data,
  });
  return { success: true };
}

// ============================================================
// Pipeline Settings
// ============================================================

export async function getPipelines() {
  const user = await getAuthUser();
  if (!user) return [];
  const pipelines = await prisma.pipeline.findMany({
    where: { orgId: user.orgId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  return JSON.parse(JSON.stringify(pipelines));
}

export async function updatePipelineStages(pipelineId: string, stages: any) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  await prisma.pipeline.updateMany({
    where: { id: pipelineId, orgId: user.orgId },
    data: { stages },
  });
  return { success: true };
}

// ============================================================
// AI Settings
// ============================================================

export async function getAiSettings() {
  const user = await getAuthUser();
  if (!user) return null;
  const settings = await prisma.aiSettings.findUnique({ where: { orgId: user.orgId } });
  return settings ? JSON.parse(JSON.stringify(settings)) : null;
}

export async function saveAiSettings(data: {
  autoResponseEnabled?: boolean;
  autoResponseMode?: string;
  responseDelay?: number;
  responseTone?: string;
  customInstructions?: string | null;
  autoParseEmails?: boolean;
  autoCategorize?: boolean;
  parseModel?: string;
}) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  await prisma.aiSettings.upsert({
    where: { orgId: user.orgId },
    create: { orgId: user.orgId, ...data },
    update: data,
  });
  return { success: true };
}

// ============================================================
// Branding
// ============================================================

export async function getBrandSettings() {
  const user = await getAuthUser();
  if (!user) return null;
  const settings = await prisma.brandSettings.findUnique({ where: { orgId: user.orgId } });
  return settings ? JSON.parse(JSON.stringify(settings)) : null;
}

export async function saveBrandSettings(data: {
  logoUrl?: string | null;
  primaryColor?: string;
  companyName?: string | null;
  tagline?: string | null;
  websiteUrl?: string | null;
}) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  await prisma.brandSettings.upsert({
    where: { orgId: user.orgId },
    create: { orgId: user.orgId, ...data },
    update: data,
  });
  return { success: true };
}

// ============================================================
// Gmail Connection
// ============================================================

export async function getGmailAccount() {
  const user = await getAuthUser();
  if (!user) return null;
  const account = await prisma.gmailAccount.findFirst({
    where: { userId: user.id, isActive: true },
  });
  return account ? {
    id: account.id,
    email: account.email,
    syncedAt: account.syncedAt?.toISOString() || null,
    tokenExpiry: account.tokenExpiry.toISOString(),
    isActive: account.isActive,
  } : null;
}

export async function disconnectGmail(gmailAccountId: string) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  await prisma.gmailAccount.update({
    where: { id: gmailAccountId },
    data: { isActive: false },
  });
  return { success: true };
}

// ============================================================
// Sync Settings
// ============================================================

export async function getSyncSettings() {
  const user = await getAuthUser();
  if (!user) return null;
  const settings = await prisma.syncSettings.findUnique({ where: { userId: user.id } });
  return settings ? JSON.parse(JSON.stringify(settings)) : null;
}

export async function saveSyncSettings(data: {
  autoSync?: boolean;
  syncFrequency?: number;
  syncDepth?: string;
  syncLabels?: string[];
}) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  await prisma.syncSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  return { success: true };
}

export async function getSyncStats() {
  const user = await getAuthUser();
  if (!user) return null;
  const [totalEmails, linkedContacts, leadsCreated] = await Promise.all([
    prisma.emailMessage.count({ where: { orgId: user.orgId } }),
    prisma.emailMessage.count({ where: { orgId: user.orgId, contactId: { not: null } } }),
    prisma.contact.count({ where: { orgId: user.orgId, source: "email" } }),
  ]);
  return { totalEmails, linkedContacts, leadsCreated };
}

// ============================================================
// API Keys
// ============================================================

export async function getApiKeyStatus() {
  const user = await getAuthUser();
  if (!user) return null;
  const gmail = await prisma.gmailAccount.findFirst({
    where: { userId: user.id, isActive: true },
  });
  return {
    pdl: { configured: !!process.env.PDL_API_KEY, preview: process.env.PDL_API_KEY ? `****${process.env.PDL_API_KEY.slice(-4)}` : null },
    apollo: { configured: !!process.env.APOLLO_API_KEY, preview: process.env.APOLLO_API_KEY ? `****${process.env.APOLLO_API_KEY.slice(-4)}` : null },
    tracerfy: { configured: !!process.env.TRACERFY_API_KEY, preview: process.env.TRACERFY_API_KEY ? `****${process.env.TRACERFY_API_KEY.slice(-4)}` : null },
    anthropic: { configured: !!process.env.ANTHROPIC_API_KEY, preview: process.env.ANTHROPIC_API_KEY ? `****${process.env.ANTHROPIC_API_KEY.slice(-4)}` : null },
    gmail: { configured: !!gmail, preview: gmail?.email || null },
    fred: { configured: !!process.env.FRED_API_KEY, preview: process.env.FRED_API_KEY ? `****${process.env.FRED_API_KEY.slice(-4)}` : null },
    hud: { configured: !!process.env.HUD_API_TOKEN, preview: process.env.HUD_API_TOKEN ? `****${process.env.HUD_API_TOKEN.slice(-4)}` : null },
    fannie: { configured: !!(process.env.FANNIE_CLIENT_ID && process.env.FANNIE_CLIENT_SECRET), preview: process.env.FANNIE_CLIENT_ID ? `****${process.env.FANNIE_CLIENT_ID.slice(-4)}` : null },
  };
}

export async function testApiConnection(api: string): Promise<{ success: boolean; message: string }> {
  try {
    switch (api) {
      case "anthropic": {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) return { success: false, message: "API key not configured" };
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 5, messages: [{ role: "user", content: "Hi" }] }),
        });
        return res.ok ? { success: true, message: "Connected" } : { success: false, message: `HTTP ${res.status}` };
      }
      case "pdl": {
        const key = process.env.PDL_API_KEY;
        if (!key) return { success: false, message: "API key not configured" };
        const res = await fetch("https://api.peopledatalabs.com/v5/person/enrich?email=test@example.com", {
          headers: { "X-Api-Key": key },
        });
        return (res.status === 200 || res.status === 404) ? { success: true, message: "Connected" } : { success: false, message: `HTTP ${res.status}` };
      }
      case "apollo": {
        const key = process.env.APOLLO_API_KEY;
        if (!key) return { success: false, message: "API key not configured" };
        // Use People Search (FREE endpoint) to test connection
        const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": key },
          body: JSON.stringify({ person_titles: ["CEO"], person_locations: ["New York, New York, United States"], per_page: 1 }),
        });
        if (res.ok) return { success: true, message: "Connected (Organization Plan)" };
        if (res.status === 403) return { success: false, message: "Forbidden — check plan level" };
        if (res.status === 401) return { success: false, message: "Invalid API key" };
        return { success: false, message: `HTTP ${res.status}` };
      }
      case "tracerfy": {
        const key = process.env.TRACERFY_API_KEY;
        if (!key) return { success: false, message: "API key not configured" };
        return { success: true, message: "Key configured (CSV-based)" };
      }
      case "fred": {
        if (!process.env.FRED_API_KEY) return { success: false, message: "FRED_API_KEY not set" };
        const { fetchFredSeries } = await import("@/lib/fred");
        const obs = await fetchFredSeries("MORTGAGE30US", "30-Year Fixed");
        return obs ? { success: true, message: `30yr rate: ${obs.value}% (${obs.date})` } : { success: false, message: "Could not fetch data" };
      }
      case "hud": {
        if (!process.env.HUD_API_TOKEN) return { success: false, message: "HUD_API_TOKEN not set" };
        const { fetchFmrByZip } = await import("@/lib/hud");
        const fmr = await fetchFmrByZip("10001");
        return fmr.source === "api" ? { success: true, message: `2BR FMR (10001): $${fmr.twoBr}` } : { success: false, message: "API returned fallback" };
      }
      case "fannie": {
        if (!process.env.FANNIE_CLIENT_ID || !process.env.FANNIE_CLIENT_SECRET) return { success: false, message: "FANNIE_CLIENT_ID or FANNIE_CLIENT_SECRET not set" };
        const { testConnection } = await import("@/lib/fannie-mae");
        return testConnection();
      }
      default:
        return { success: false, message: "Unknown API" };
    }
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

// ============================================================
// Data Export
// ============================================================

export async function exportContacts(filters?: { status?: string }) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  const where: any = { orgId: user.orgId };
  if (filters?.status) where.status = filters.status;
  const contacts = await prisma.contact.findMany({ where, include: { enrichmentProfiles: { take: 1, orderBy: { enrichedAt: "desc" } } } });
  const header = "First Name,Last Name,Email,Phone,Status,Source,Qualification Score,Job Title,Company,LinkedIn\n";
  const rows = contacts.map(c => {
    const ep = c.enrichmentProfiles[0];
    return [c.firstName, c.lastName, c.email || "", c.phone || "", c.status, c.source || "", c.qualificationScore ?? "", ep?.jobTitle || "", ep?.employer || "", ep?.linkedinUrl || ""].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
  }).join("\n");
  return { csv: header + rows, filename: `contacts_${new Date().toISOString().split("T")[0]}.csv` };
}

export async function exportDeals() {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  const deals = await prisma.deal.findMany({ where: { orgId: user.orgId }, include: { contact: true } });
  const header = "Deal Name,Contact,Value,Stage,Status,Created,Closed\n";
  const rows = deals.map(d => [d.name || "", `${d.contact.firstName} ${d.contact.lastName}`, d.dealValue?.toString() || "", d.stageId, d.status, d.createdAt.toISOString().split("T")[0], d.closedAt?.toISOString().split("T")[0] || ""].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  return { csv: header + rows, filename: `deals_${new Date().toISOString().split("T")[0]}.csv` };
}

export async function exportEmails(filters?: { dateFrom?: string; dateTo?: string }) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };
  const where: any = { orgId: user.orgId };
  if (filters?.dateFrom) where.receivedAt = { ...where.receivedAt, gte: new Date(filters.dateFrom) };
  if (filters?.dateTo) where.receivedAt = { ...where.receivedAt, lte: new Date(filters.dateTo) };
  const emails = await prisma.emailMessage.findMany({ where, orderBy: { receivedAt: "desc" }, take: 10000 });
  const header = "Date,From,To,Subject,Category,Lead Source,Direction\n";
  const rows = emails.map(e => [e.receivedAt.toISOString().split("T")[0], e.fromEmail, e.toEmails.join("; "), e.subject || "", e.category || "", e.leadSource || "", e.direction].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  return { csv: header + rows, filename: `emails_${new Date().toISOString().split("T")[0]}.csv` };
}
