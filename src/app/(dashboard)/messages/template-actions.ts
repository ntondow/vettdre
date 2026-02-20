"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

async function getUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  return prisma.user.findUnique({ where: { authProviderId: authUser.id } });
}

export interface TemplateData {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  category: string | null;
  mergeFields: string[];
  timesUsed: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_TEMPLATES = [
  {
    name: "Quick Follow Up",
    category: "follow_up",
    subject: "Following up — {{property_address}}",
    body: "Hi {{first_name}},<br><br>Just following up on your inquiry. Are you still interested? I'm happy to answer any questions or schedule a showing at your convenience.<br><br>Best,<br>{{agent_name}}<br>{{agent_phone}}",
    mergeFields: ["first_name", "property_address", "agent_name", "agent_phone"],
  },
  {
    name: "Schedule Showing",
    category: "showing",
    subject: "Let's schedule a showing — {{property_address}}",
    body: "Hi {{first_name}},<br><br>I'd love to show you this property. What times work best for you this week? I have availability:<br><br>• [Day/Time 1]<br>• [Day/Time 2]<br>• [Day/Time 3]<br><br>Looking forward to it!<br>{{agent_name}}",
    mergeFields: ["first_name", "property_address", "agent_name"],
  },
  {
    name: "Send Application",
    category: "application",
    subject: "Rental Application — {{property_address}}",
    body: "Hi {{first_name}},<br><br>Great news! I'd like to move forward with your application for {{property_address}}.<br><br>Please complete the attached rental application and return it along with:<br>• Government-issued photo ID<br>• Last 2 pay stubs or proof of income<br>• Most recent bank statement<br><br>Let me know if you have any questions.<br><br>Best,<br>{{agent_name}}",
    mergeFields: ["first_name", "property_address", "agent_name"],
  },
  {
    name: "Unit Not Available",
    category: "follow_up",
    subject: "Re: {{property_address}}",
    body: "Hi {{first_name}},<br><br>Thank you for your interest! Unfortunately, this unit is no longer available.<br><br>However, I have similar listings in the area that might be a great fit. Would you like me to send some options?<br><br>Best,<br>{{agent_name}}",
    mergeFields: ["first_name", "property_address", "agent_name"],
  },
  {
    name: "New Listing Alert",
    category: "nurture",
    subject: "New listing you might love — {{property_address}}",
    body: "Hi {{first_name}},<br><br>I just listed a property I think you'll love:<br><br>📍 {{property_address}}<br>💰 {{price}}<br><br>Want to see it? I can arrange a private showing at your convenience.<br><br>{{agent_name}}<br>{{agent_phone}}",
    mergeFields: ["first_name", "property_address", "price", "agent_name", "agent_phone"],
  },
  {
    name: "Thank You After Showing",
    category: "showing",
    subject: "Thanks for visiting {{property_address}}",
    body: "Hi {{first_name}},<br><br>It was great meeting you today! I hope you enjoyed seeing {{property_address}}.<br><br>A few things to keep in mind:<br>• [Key selling point 1]<br>• [Key selling point 2]<br><br>If you'd like to move forward or have any questions, don't hesitate to reach out.<br><br>Best,<br>{{agent_name}}",
    mergeFields: ["first_name", "property_address", "agent_name"],
  },
  {
    name: "Cold Outreach — Owner",
    category: "cold_outreach",
    subject: "Interested in your property at {{property_address}}",
    body: "Hi {{first_name}},<br><br>My name is {{agent_name}} and I work with property owners in your area. I noticed your building at {{property_address}} and wanted to reach out.<br><br>I have qualified tenants actively looking in your neighborhood. Would you be open to a brief conversation about your property?<br><br>Best,<br>{{agent_name}}<br>{{agent_phone}}",
    mergeFields: ["first_name", "property_address", "agent_name", "agent_phone"],
  },
];

// ============================================================
// Template CRUD
// ============================================================

export async function getTemplates(): Promise<TemplateData[]> {
  const user = await getUser();
  if (!user) return [];

  const templates = await prisma.emailTemplate.findMany({
    where: { orgId: user.orgId },
    orderBy: { timesUsed: "desc" },
  });

  return templates.map(t => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    category: t.category,
    mergeFields: t.mergeFields,
    timesUsed: t.timesUsed,
    lastUsedAt: t.lastUsedAt?.toISOString() || null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}

export async function createTemplate(data: {
  name: string;
  subject: string;
  body: string;
  category: string;
  mergeFields?: string[];
}) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    const template = await prisma.emailTemplate.create({
      data: {
        orgId: user.orgId,
        createdBy: user.id,
        name: data.name,
        subject: data.subject,
        body: data.body,
        category: data.category,
        mergeFields: data.mergeFields || [],
        channel: "email",
      },
    });
    return { success: true, id: template.id };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function updateTemplate(id: string, data: {
  name?: string;
  subject?: string;
  body?: string;
  category?: string;
  mergeFields?: string[];
}) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    await prisma.emailTemplate.updateMany({
      where: { id, orgId: user.orgId },
      data,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function deleteTemplate(id: string) {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  // Hard delete since EmailTemplate has no isActive field
  await prisma.emailTemplate.deleteMany({
    where: { id, orgId: user.orgId },
  });
  return { success: true };
}

export async function incrementTemplateUsage(id: string) {
  const user = await getUser();
  if (!user) return;

  await prisma.emailTemplate.updateMany({
    where: { id, orgId: user.orgId },
    data: {
      timesUsed: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
}

// ============================================================
// Seed Defaults
// ============================================================

export async function seedDefaultTemplates(): Promise<void> {
  const user = await getUser();
  if (!user) return;

  const count = await prisma.emailTemplate.count({ where: { orgId: user.orgId } });
  if (count > 0) return;

  await prisma.emailTemplate.createMany({
    data: DEFAULT_TEMPLATES.map(t => ({
      orgId: user.orgId,
      createdBy: user.id,
      name: t.name,
      subject: t.subject,
      body: t.body,
      category: t.category,
      mergeFields: t.mergeFields,
      channel: "email" as const,
    })),
  });
}
