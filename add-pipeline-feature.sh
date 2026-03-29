#!/bin/bash
# Run from inside your vettdre directory:
#   bash add-pipeline-feature.sh

set -e
echo "🏗️  Building Pipeline & Deals..."

# ============================================================
# 1. PIPELINE SERVER ACTIONS
# ============================================================
mkdir -p "src/app/(dashboard)/pipeline"

echo "⚡ Writing pipeline actions..."
cat > "src/app/(dashboard)/pipeline/actions.ts" << 'ACTEOF'
"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return user;
}

const DEFAULT_STAGES = [
  { id: "new_lead", name: "New Lead", order: 0, color: "#3B82F6" },
  { id: "contacted", name: "Contacted", order: 1, color: "#8B5CF6" },
  { id: "showing", name: "Showing", order: 2, color: "#F59E0B" },
  { id: "offer", name: "Offer", order: 3, color: "#F97316" },
  { id: "under_contract", name: "Under Contract", order: 4, color: "#06B6D4" },
  { id: "closed", name: "Closed", order: 5, color: "#10B981" },
];

export async function getOrCreatePipeline() {
  const user = await getAuthUser();

  let pipeline = await prisma.pipeline.findFirst({
    where: { orgId: user.orgId, isDefault: true },
  });

  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: {
        orgId: user.orgId,
        name: "Sales Pipeline",
        pipelineType: "sales",
        isDefault: true,
        stages: DEFAULT_STAGES,
      },
    });
  }

  const deals = await prisma.deal.findMany({
    where: { orgId: user.orgId, pipelineId: pipeline.id },
    orderBy: { createdAt: "desc" },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true, qualificationScore: true } },
      property: { select: { id: true, address: true, city: true, state: true } },
      assignedAgent: { select: { fullName: true } },
    },
  });

  return { pipeline, deals, stages: (pipeline.stages as any[]) || DEFAULT_STAGES };
}

export async function getContacts() {
  const user = await getAuthUser();
  return prisma.contact.findMany({
    where: { orgId: user.orgId },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
}

export async function getProperties() {
  const user = await getAuthUser();
  return prisma.property.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    select: { id: true, address: true, city: true, state: true, price: true },
  });
}

export async function createDeal(formData: FormData) {
  const user = await getAuthUser();

  const pipeline = await prisma.pipeline.findFirst({
    where: { orgId: user.orgId, isDefault: true },
  });
  if (!pipeline) throw new Error("No pipeline found");

  const contactId = formData.get("contactId") as string;
  const name = formData.get("name") as string;
  const dealValue = formData.get("dealValue") as string;
  const propertyId = formData.get("propertyId") as string;
  const stageId = formData.get("stageId") as string || "new_lead";

  if (!contactId) throw new Error("Contact is required");

  await prisma.deal.create({
    data: {
      orgId: user.orgId,
      contactId,
      pipelineId: pipeline.id,
      stageId,
      assignedTo: user.id,
      name: name?.trim() || null,
      dealValue: dealValue ? parseFloat(dealValue) : null,
      propertyId: propertyId || null,
      status: "open",
    },
  });

  revalidatePath("/pipeline");
  return { success: true };
}

export async function moveDeal(dealId: string, newStageId: string) {
  const user = await getAuthUser();

  const isClosedStage = newStageId === "closed";

  await prisma.deal.updateMany({
    where: { id: dealId, orgId: user.orgId },
    data: {
      stageId: newStageId,
      stageEnteredAt: new Date(),
      status: isClosedStage ? "won" : "open",
      closedAt: isClosedStage ? new Date() : null,
    },
  });

  revalidatePath("/pipeline");
  return { success: true };
}

export async function updateDealStatus(dealId: string, status: string, lostReason?: string) {
  const user = await getAuthUser();

  await prisma.deal.updateMany({
    where: { id: dealId, orgId: user.orgId },
    data: {
      status: status as any,
      lostReason: lostReason || null,
      closedAt: status !== "open" ? new Date() : null,
    },
  });

  revalidatePath("/pipeline");
  return { success: true };
}

export async function deleteDeal(dealId: string) {
  const user = await getAuthUser();
  await prisma.deal.deleteMany({ where: { id: dealId, orgId: user.orgId } });
  revalidatePath("/pipeline");
  return { success: true };
}
ACTEOF

# ============================================================
# 2. PIPELINE PAGE
# ============================================================
echo "📄 Writing pipeline page..."
cat > "src/app/(dashboard)/pipeline/page.tsx" << 'PGEOF'
import { getOrCreatePipeline, getContacts, getProperties } from "./actions";
import PipelineBoard from "./pipeline-board";

export default async function PipelinePage() {
  const { pipeline, deals, stages } = await getOrCreatePipeline();
  const contacts = await getContacts();
  const properties = await getProperties();

  return <PipelineBoard pipeline={pipeline} deals={deals} stages={stages} contacts={contacts} properties={properties} />;
}
PGEOF

# ============================================================
# 3. PIPELINE BOARD COMPONENT
# ============================================================
echo "📋 Writing Kanban board..."
cat > "src/app/(dashboard)/pipeline/pipeline-board.tsx" << 'BOARDEOF'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createDeal, moveDeal, updateDealStatus, deleteDeal } from "./actions";

interface Deal {
  id: string; name: string | null; dealValue: any; status: string; stageId: string;
  contact: { id: string; firstName: string; lastName: string; email: string | null; qualificationScore: number | null };
  property: { id: string; address: string; city: string; state: string } | null;
  assignedAgent: { fullName: string } | null;
}
interface Stage { id: string; name: string; order: number; color: string }
interface Contact { id: string; firstName: string; lastName: string; email: string | null }
interface Property { id: string; address: string; city: string; state: string; price: any }

export default function PipelineBoard({ pipeline, deals, stages, contacts, properties }: {
  pipeline: any; deals: Deal[]; stages: Stage[]; contacts: Contact[]; properties: Property[];
}) {
  const router = useRouter();
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const dealsByStage = stages.reduce((acc: Record<string, Deal[]>, stage) => {
    acc[stage.id] = deals.filter(d => d.stageId === stage.id && d.status === "open");
    return acc;
  }, {});

  const totalValue = deals.filter(d => d.status === "open").reduce((sum, d) => sum + (Number(d.dealValue) || 0), 0);
  const openDeals = deals.filter(d => d.status === "open").length;
  const wonDeals = deals.filter(d => d.status === "won").length;

  const handleCreateDeal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setCreating(true);
    try { await createDeal(new FormData(e.currentTarget)); setShowNewDeal(false); router.refresh(); }
    catch {} finally { setCreating(false); }
  };

  const handleDragStart = (dealId: string) => setDraggedDeal(dealId);
  const handleDragOver = (e: React.DragEvent, stageId: string) => { e.preventDefault(); setDragOverStage(stageId); };
  const handleDragLeave = () => setDragOverStage(null);
  const handleDrop = async (stageId: string) => {
    if (draggedDeal) { await moveDeal(draggedDeal, stageId); router.refresh(); }
    setDraggedDeal(null); setDragOverStage(null);
  };

  const handleMarkLost = async (dealId: string) => {
    const reason = prompt("Why was this deal lost? (optional)");
    if (reason !== null) { await updateDealStatus(dealId, "lost", reason); router.refresh(); }
  };

  const handleDelete = async (dealId: string) => {
    if (confirm("Delete this deal? This cannot be undone.")) { await deleteDeal(dealId); router.refresh(); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Pipeline</h1>
            <div className="flex items-center gap-6 mt-1">
              <span className="text-sm text-slate-500">{openDeals} open deal{openDeals !== 1 ? "s" : ""}</span>
              <span className="text-sm text-slate-500">Pipeline value: <span className="font-semibold text-slate-900">${totalValue.toLocaleString()}</span></span>
              <span className="text-sm text-slate-500">{wonDeals} won</span>
            </div>
          </div>
          <button onClick={() => setShowNewDeal(true)} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ New Deal</button>
        </div>
      </div>

      {/* New Deal Modal */}
      {showNewDeal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Create New Deal</h2>
              <button onClick={() => setShowNewDeal(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            <form onSubmit={handleCreateDeal} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact *</label>
                <select name="contactId" required className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select a contact...</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.email ? ` (${c.email})` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Deal name</label>
                <input name="name" placeholder="e.g., Smith - 123 Oak St Purchase" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Deal value ($)</label>
                  <input name="dealValue" type="number" placeholder="500000" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stage</label>
                  <select name="stageId" defaultValue="new_lead" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              {properties.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Property (optional)</label>
                  <select name="propertyId" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">No property linked</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.address}, {p.city}{p.price ? ` — $${Number(p.price).toLocaleString()}` : ""}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowNewDeal(false)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={creating} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm disabled:opacity-50">{creating ? "Creating..." : "Create Deal"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="px-8 py-6">
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map(stage => {
            const stageDeals = dealsByStage[stage.id] || [];
            const stageValue = stageDeals.reduce((s, d) => s + (Number(d.dealValue) || 0), 0);
            return (
              <div key={stage.id}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(stage.id)}
                className={`flex-shrink-0 w-72 rounded-xl border transition-colors ${dragOverStage === stage.id ? "border-blue-400 bg-blue-50/50" : "border-slate-200 bg-white"}`}>
                {/* Stage Header */}
                <div className="p-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    <h3 className="text-sm font-semibold text-slate-700">{stage.name}</h3>
                    <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{stageDeals.length}</span>
                  </div>
                  {stageValue > 0 && <p className="text-xs text-slate-400 mt-1">${stageValue.toLocaleString()}</p>}
                </div>

                {/* Deal Cards */}
                <div className="p-3 space-y-2 min-h-[200px]">
                  {stageDeals.map(deal => (
                    <div key={deal.id}
                      draggable
                      onDragStart={() => handleDragStart(deal.id)}
                      className={`bg-white border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all ${draggedDeal === deal.id ? "opacity-50 border-blue-300" : "border-slate-200"}`}>
                      <div className="flex items-start justify-between">
                        <Link href={`/contacts/${deal.contact.id}`} className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors">
                          {deal.contact.firstName} {deal.contact.lastName}
                        </Link>
                        {deal.contact.qualificationScore !== null && (
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            deal.contact.qualificationScore >= 80 ? "bg-emerald-50 text-emerald-700" :
                            deal.contact.qualificationScore >= 60 ? "bg-amber-50 text-amber-700" :
                            "bg-slate-100 text-slate-500"
                          }`}>{deal.contact.qualificationScore}</span>
                        )}
                      </div>
                      {deal.name && <p className="text-xs text-slate-500 mt-1">{deal.name}</p>}
                      {deal.property && <p className="text-xs text-slate-400 mt-0.5">🏠 {deal.property.address}</p>}
                      <div className="flex items-center justify-between mt-2.5">
                        {deal.dealValue ? (
                          <span className="text-xs font-semibold text-slate-700">${Number(deal.dealValue).toLocaleString()}</span>
                        ) : <span />}
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleMarkLost(deal.id)} className="text-xs text-slate-400 hover:text-red-500 px-1" title="Mark as lost">✕</button>
                          <button onClick={() => handleDelete(deal.id)} className="text-xs text-slate-400 hover:text-red-500 px-1" title="Delete">🗑</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {stageDeals.length === 0 && !dragOverStage && (
                    <p className="text-xs text-slate-400 text-center py-8">Drag deals here</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lost Deals Section */}
      {deals.filter(d => d.status === "lost").length > 0 && (
        <div className="px-8 pb-8">
          <details className="bg-white rounded-xl border border-slate-200">
            <summary className="px-5 py-3 cursor-pointer text-sm font-medium text-slate-500 hover:text-slate-700">
              Lost deals ({deals.filter(d => d.status === "lost").length})
            </summary>
            <div className="px-5 pb-4 space-y-2">
              {deals.filter(d => d.status === "lost").map(d => (
                <div key={d.id} className="flex items-center justify-between py-2 border-t border-slate-100">
                  <div>
                    <span className="text-sm text-slate-600">{d.contact.firstName} {d.contact.lastName}</span>
                    {d.name && <span className="text-sm text-slate-400 ml-2">— {d.name}</span>}
                  </div>
                  {d.dealValue && <span className="text-sm text-slate-400">${Number(d.dealValue).toLocaleString()}</span>}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
BOARDEOF

echo ""
echo "✅ Pipeline & Deals feature added!"
echo ""
echo "Go to http://localhost:3000/pipeline"
echo "Click '+ New Deal' to create your first deal, then drag it between stages!"
