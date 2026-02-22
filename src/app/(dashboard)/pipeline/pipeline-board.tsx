"use client";

import { useState, useRef } from "react";
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
  const [movingDeal, setMovingDeal] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  // Drag state
  const dragItem = useRef<string | null>(null);
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

  const handleMoveDeal = async (dealId: string, newStageId: string) => {
    setMoving(true);
    try { await moveDeal(dealId, newStageId); setMovingDeal(null); router.refresh(); }
    catch {} finally { setMoving(false); }
  };

  // Drag handlers
  const onDragStart = (e: React.DragEvent, dealId: string) => {
    dragItem.current = dealId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dealId);
    // Make the dragged element semi-transparent
    setTimeout(() => {
      const el = document.getElementById(`deal-${dealId}`);
      if (el) el.style.opacity = "0.4";
    }, 0);
  };

  const onDragEnd = (dealId: string) => {
    dragItem.current = null;
    setDragOverStage(null);
    const el = document.getElementById(`deal-${dealId}`);
    if (el) el.style.opacity = "1";
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDragEnter = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDragOverStage(stageId);
  };

  const onDragLeave = (e: React.DragEvent, stageId: string) => {
    // Only clear if we're leaving the stage container, not entering a child
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      setDragOverStage(null);
    }
  };

  const onDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDragOverStage(null);
    const dealId = e.dataTransfer.getData("text/plain") || dragItem.current;
    if (dealId) {
      const deal = deals.find(d => d.id === dealId);
      if (deal && deal.stageId !== stageId) {
        await moveDeal(dealId, stageId);
        router.refresh();
      }
    }
    dragItem.current = null;
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
      <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 md:py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-slate-900">Pipeline</h1>
            <div className="flex items-center gap-3 md:gap-6 mt-1 flex-wrap">
              <span className="text-xs md:text-sm text-slate-500">{openDeals} open</span>
              <span className="text-xs md:text-sm text-slate-500">Value: <span className="font-semibold text-slate-900">${totalValue.toLocaleString()}</span></span>
              <span className="text-xs md:text-sm text-slate-500">{wonDeals} won</span>
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

      {/* Mobile Vertical Stages */}
      <div className="md:hidden px-4 py-4 space-y-3">
        {stages.map(stage => {
          const stageDeals = dealsByStage[stage.id] || [];
          const stageValue = stageDeals.reduce((s, d) => s + (Number(d.dealValue) || 0), 0);
          return (
            <details key={stage.id} open={stageDeals.length > 0} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="text-sm font-semibold text-slate-700 flex-1">{stage.name}</span>
                {stageValue > 0 && <span className="text-xs text-slate-400 mr-2">${stageValue.toLocaleString()}</span>}
                <span className="text-xs font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{stageDeals.length}</span>
              </summary>
              <div className="px-3 pb-3 space-y-2 border-t border-slate-100">
                {stageDeals.map(deal => (
                  <div key={deal.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 mt-2">
                    <div className="flex items-start justify-between">
                      <Link href={`/contacts/${deal.contact.id}`} className="text-sm font-medium text-slate-900">
                        {deal.contact.firstName} {deal.contact.lastName}
                      </Link>
                      {deal.dealValue && <span className="text-xs font-semibold text-slate-700">${Number(deal.dealValue).toLocaleString()}</span>}
                    </div>
                    {deal.name && <p className="text-xs text-slate-500 mt-1">{deal.name}</p>}
                    {deal.property && <p className="text-xs text-slate-400 mt-0.5">🏠 {deal.property.address}</p>}
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {stages.filter(s => s.id !== deal.stageId).map(s => (
                        <button key={s.id} onClick={() => handleMoveDeal(deal.id, s.id)} disabled={moving}
                          className="text-[10px] px-2 py-1 rounded-md border border-slate-200 text-slate-600 active:bg-blue-50 active:text-blue-700 active:border-blue-200 transition-colors disabled:opacity-50">
                          → {s.name}
                        </button>
                      ))}
                      <button onClick={() => handleMarkLost(deal.id)} className="text-[10px] px-2 py-1 rounded-md border border-red-200 text-red-500 active:bg-red-50 ml-auto">Lost</button>
                    </div>
                  </div>
                ))}
                {stageDeals.length === 0 && <p className="text-xs text-slate-400 text-center py-4 mt-2">No deals in this stage</p>}
              </div>
            </details>
          );
        })}
      </div>

      {/* Desktop Kanban Board */}
      <div className="hidden md:block px-8 py-6">
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map(stage => {
            const stageDeals = dealsByStage[stage.id] || [];
            const stageValue = stageDeals.reduce((s, d) => s + (Number(d.dealValue) || 0), 0);
            return (
              <div key={stage.id}
                onDragOver={onDragOver}
                onDragEnter={(e) => onDragEnter(e, stage.id)}
                onDragLeave={(e) => onDragLeave(e, stage.id)}
                onDrop={(e) => onDrop(e, stage.id)}
                className={`flex-shrink-0 w-72 rounded-xl border transition-all duration-150 ${dragOverStage === stage.id ? "border-blue-400 bg-blue-50/60 shadow-md" : "border-slate-200 bg-white"}`}>
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
                    <div key={deal.id} id={`deal-${deal.id}`}
                      draggable="true"
                      onDragStart={(e) => onDragStart(e, deal.id)}
                      onDragEnd={() => onDragEnd(deal.id)}
                      className="bg-white border border-slate-200 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all select-none">
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
                        <div className="flex items-center gap-0.5">
                          {/* Move button */}
                          <button onClick={(e) => { e.stopPropagation(); setMovingDeal(movingDeal === deal.id ? null : deal.id); }} className="text-xs text-slate-400 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors" title="Move to stage">
                            ↔
                          </button>
                          <button onClick={() => handleMarkLost(deal.id)} className="text-xs text-slate-400 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors" title="Mark as lost">✕</button>
                          <button onClick={() => handleDelete(deal.id)} className="text-xs text-slate-400 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors" title="Delete">🗑</button>
                        </div>
                      </div>
                      {/* Move dropdown */}
                      {movingDeal === deal.id && (
                        <div className="mt-2 pt-2 border-t border-slate-100">
                          <p className="text-xs text-slate-400 mb-1.5">Move to:</p>
                          <div className="flex flex-wrap gap-1">
                            {stages.filter(s => s.id !== deal.stageId).map(s => (
                              <button key={s.id} onClick={() => handleMoveDeal(deal.id, s.id)} disabled={moving}
                                className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors disabled:opacity-50">
                                {s.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {stageDeals.length === 0 && (
                    <div className={`text-center py-8 rounded-lg border-2 border-dashed transition-colors ${dragOverStage === stage.id ? "border-blue-300 bg-blue-50/50" : "border-transparent"}`}>
                      <p className="text-xs text-slate-400">{dragOverStage === stage.id ? "Drop here!" : "Drag deals here"}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lost Deals Section */}
      {deals.filter(d => d.status === "lost").length > 0 && (
        <div className="px-4 md:px-8 pb-8">
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
