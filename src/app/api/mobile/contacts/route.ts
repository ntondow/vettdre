// ── GET /api/mobile/contacts ───────────────────────────────────
// Returns CRM contacts for the agent's org with search, filter, and pagination.
// Query params:
//   q=<search>             (optional — searches first/last name, email, phone)
//   status=<ContactStatus> (optional — lead, active, client, past_client, archived)
//   type=<ContactType>     (optional — landlord, buyer, seller, renter)
//   limit=<number>         (optional, default 50, max 100)
//   offset=<number>        (optional, default 0)
//   sort=<field>           (optional — name, recent, score; default: recent)

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["lead", "active", "client", "past_client", "archived"];
const VALID_TYPES = ["landlord", "buyer", "seller", "renter"];

export async function GET(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const { orgId, isAdmin, userId } = ctx;
    const url = new URL(req.url);

    const q = (url.searchParams.get("q") || "").trim();
    const status = url.searchParams.get("status");
    const contactType = url.searchParams.get("type");
    const sort = url.searchParams.get("sort") || "recent";
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

    // Build where clause
    const where: Prisma.ContactWhereInput = {
      orgId,
      // Non-admins only see contacts assigned to them (or unassigned)
      ...(!isAdmin ? { OR: [{ assignedTo: userId }, { assignedTo: null }] } : {}),
    };

    if (status && VALID_STATUSES.includes(status)) {
      where.status = status as any;
    }

    if (contactType && VALID_TYPES.includes(contactType)) {
      where.contactType = contactType as any;
    }

    if (q) {
      const searchTerms = q.split(/\s+/).filter(Boolean);
      where.AND = searchTerms.map((term) => ({
        OR: [
          { firstName: { contains: term, mode: "insensitive" as const } },
          { lastName: { contains: term, mode: "insensitive" as const } },
          { email: { contains: term, mode: "insensitive" as const } },
          { phone: { contains: term } },
          { tags: { has: term.toLowerCase() } },
        ],
      }));
    }

    // Build orderBy
    let orderBy: Prisma.ContactOrderByWithRelationInput;
    switch (sort) {
      case "name":
        orderBy = { firstName: "asc" };
        break;
      case "score":
        orderBy = { qualificationScore: "desc" };
        break;
      case "recent":
      default:
        orderBy = { updatedAt: "desc" };
        break;
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          contactType: true,
          status: true,
          source: true,
          tags: true,
          qualificationScore: true,
          lastContactedAt: true,
          lastActivityAt: true,
          totalActivities: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              deals: true,
              tasks: { where: { status: "pending" } },
            },
          },
        },
        orderBy,
        take: limit,
        skip: offset,
      }),
      prisma.contact.count({ where }),
    ]);

    return NextResponse.json(
      serialize({
        contacts: contacts.map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`.trim(),
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          contactType: c.contactType,
          status: c.status,
          source: c.source,
          tags: c.tags,
          score: c.qualificationScore,
          lastContactedAt: c.lastContactedAt,
          lastActivityAt: c.lastActivityAt,
          totalActivities: c.totalActivities,
          dealCount: c._count.deals,
          pendingTasks: c._count.tasks,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
        total,
        limit,
        offset,
      })
    );
  } catch (error: unknown) {
    console.error("[mobile/contacts] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}
