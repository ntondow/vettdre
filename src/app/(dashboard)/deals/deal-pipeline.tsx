"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateDealAnalysisStatus, deleteDealAnalysis } from "./actions";

interface DealItem {
  id: string;
  name: string | null;
  address: string | null;
  borough: string | null;
  status: string;
  dealType: string;
  dealSource: string;
  inputs: any;
  outputs: any;
  updatedAt: string;
}

const STATUSES = [
  { key: "analyzing", label: "Analyzing", color: "#3B82F6", icon: "🔍" },
  { key: "prospecting", label: "Prospecting", color: "#8B5CF6", icon: "🎯" },
  { key: "loi_sent", label: "LOI Sent", color: "#F59E0B", icon: "📨" },
  { key: "under_contract", label: "Under Contract", color: "#10B981", icon: "📝" },
  { key: "closed", label: "Closed", color: "#059669", icon: "✅" },
  { key: "dead", label: "Dead", color: "#6B7280", icon: "💀" },
];

const DEAL_TYPES: Record<string, string> = {
  acquisition: "Acquisition",
  value_add: "Value-Add",
  new_development: "New Dev",
  mixed_use: "Mixed Use",
  ground_up: "Ground Up",
};

const fmt = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export default function DealPipeline({ initialDeals }: { initialDeals: DealItem[] }) {
  const router = useRouter();
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [movingDeal, setMovingDeal] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  // Drag state
  const dragItem = useRef<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  const dealsByStatus = STATUSES.reduce((acc: Record<string, DealItem[]>, s) => {
    acc[s.key] = initialDeals.filter(d => d.status === s.key);
    return acc;
  }, {});

  const activeDeals = initialDeals.filter(d => d.status !== "dead" && d.status !== "closed");
  const totalValue = activeDeals.reduce((s, d) => {
    const price = (d.inputs as any)?.purchasePrice || 0;
    return s + price;
  }, 0);

  const handleMove = async (dealId: string, newStatus: string) => {
    setUpdating(true);
    try {
      await updateDealAnalysisStatus(dealId, newStatus);
      setMovingDeal(null);
      router.refresh();
    } catch {}
    finally { setUpdating(false); }
  };

  const handleDelete = async (dealId: string) => {
    if (!confirm("Delete this deal analysis? This cannot be undone.")) return;
    try {
      await deleteDealAnalysis(dealId);
      router.refresh();
    } catch {}
  };

  // Drag handlers
  const onDragStart = (e: React.DragEvent, dealId: string) => {
    dragItem.current = dealId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dealId);
    setTimeout(() => {
      const el = document.getElementById(`da-${dealId}`);
      if (el) el.style.opacity = "0.4";
    }, 0);
  };

  const onDragEnd = (dealId: string) => {
    dragItem.current = null;
    setDragOverStatus(null);
    const el = document.getElementById(`da-${dealId}`);
    if (el) el.style.opacity = "1";
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDragEnter = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDragOverStatus(status);
  };

  const onDragLeave = (e: React.DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      setDragOverStatus(null);
    }
  };

  const onDrop = async (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDragOverStatus(null);
    const dealId = e.dataTransfer.getData("text/plain") || dragItem.current;
    if (dealId) {
      const deal = initialDeals.find(d => d.id === dealId);
      if (deal && deal.status !== status) {
        await handleMove(dealId, status);
      }
    }
    dragItem.current = null;
  };

  function DealCard({ deal, compact }: { deal: DealItem; compact?: boolean }) {
    const outputs = deal.outputs as any;
    const inputs = deal.inputs as any;
    const price = inputs?.purchasePrice || 0;
    const capRate = outputs?.capRate || 0;
    const irr = outputs?.irr || 0;
    const noi = outputs?.noi || 0;

    return (
      <div
        id={`da-${deal.id}`}
        draggable="true"
        onDragStart={e => onDragStart(e, deal.id)}
        onDragEnd={() => onDragEnd(deal.id)}
        className="bg-white border border-slate-200 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all select-none"
      >
        <div className="flex items-start justify-between">
          <Link href={`/deals/new?id=${deal.id}`} className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors line-clamp-1">
            {deal.name}
          </Link>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium whitespace-nowrap ml-1">
            {DEAL_TYPES[deal.dealType] || deal.dealType}
          </span>
        </div>
        {deal.address && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{deal.address}{deal.borough ? `, ${deal.borough}` : ""}</p>}

        {/* Metrics row */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {price > 0 && (
            <span className="text-xs font-semibold text-slate-700">{fmt(price)}</span>
          )}
          {capRate > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${capRate >= 5 ? "bg-green-50 text-green-700" : capRate >= 3 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
              {fmtPct(capRate)} Cap
            </span>
          )}
          {irr > 0 && isFinite(irr) && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${irr >= 15 ? "bg-green-50 text-green-700" : irr >= 8 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
              {fmtPct(irr)} IRR
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-2.5">
          <span className="text-[10px] text-slate-400">{new Date(deal.updatedAt).toLocaleDateString()}</span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={e => { e.stopPropagation(); setMovingDeal(movingDeal === deal.id ? null : deal.id); }}
              className="text-xs text-slate-400 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
              title="Move to stage"
            >
              ↔
            </button>
            <Link href={`/deals/new?id=${deal.id}`} className="text-xs text-slate-400 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors" title="Edit">
              ✎
            </Link>
            <button onClick={() => handleDelete(deal.id)} className="text-xs text-slate-400 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors" title="Delete">
              🗑
            </button>
          </div>
        </div>

        {/* Move dropdown */}
        {movingDeal === deal.id && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-400 mb-1.5">Move to:</p>
            <div className="flex flex-wrap gap-1">
              {STATUSES.filter(s => s.key !== deal.status).map(s => (
                <button key={s.key} onClick={() => handleMove(deal.id, s.key)} disabled={updating}
                  className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors disabled:opacity-50">
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 md:py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-slate-900">Deal Pipeline</h1>
            <div className="flex items-center gap-3 md:gap-6 mt-1 flex-wrap">
              <span className="text-xs md:text-sm text-slate-500">{activeDeals.length} active</span>
              <span className="text-xs md:text-sm text-slate-500">
                Total: <span className="font-semibold text-slate-900">{fmt(totalValue)}</span>
              </span>
              <span className="text-xs md:text-sm text-slate-500">
                {initialDeals.filter(d => d.status === "closed").length} closed
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setView("kanban")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "kanban" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Board
              </button>
              <button
                onClick={() => setView("table")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "table" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Table
              </button>
            </div>
            <Link
              href="/deals/new"
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              + New Deal
            </Link>
          </div>
        </div>
      </div>

      {view === "kanban" ? (
        <>
          {/* Mobile Vertical Stages */}
          <div className="md:hidden px-4 py-4 space-y-3">
            {STATUSES.map(status => {
              const deals = dealsByStatus[status.key] || [];
              const stageValue = deals.reduce((s, d) => s + ((d.inputs as any)?.purchasePrice || 0), 0);
              return (
                <details key={status.key} open={deals.length > 0} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }} />
                    <span className="text-sm font-semibold text-slate-700 flex-1">{status.icon} {status.label}</span>
                    {stageValue > 0 && <span className="text-xs text-slate-400 mr-2">{fmt(stageValue)}</span>}
                    <span className="text-xs font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{deals.length}</span>
                  </summary>
                  <div className="px-3 pb-3 space-y-2 border-t border-slate-100">
                    {deals.map(deal => (
                      <div key={deal.id} className="mt-2">
                        <DealCard deal={deal} compact />
                      </div>
                    ))}
                    {deals.length === 0 && <p className="text-xs text-slate-400 text-center py-4 mt-2">No deals</p>}
                  </div>
                </details>
              );
            })}
          </div>

          {/* Desktop Kanban Board */}
          <div className="hidden md:block px-8 py-6">
            <div className="flex gap-4 overflow-x-auto pb-4">
              {STATUSES.map(status => {
                const deals = dealsByStatus[status.key] || [];
                const stageValue = deals.reduce((s, d) => s + ((d.inputs as any)?.purchasePrice || 0), 0);
                return (
                  <div
                    key={status.key}
                    onDragOver={onDragOver}
                    onDragEnter={e => onDragEnter(e, status.key)}
                    onDragLeave={onDragLeave}
                    onDrop={e => onDrop(e, status.key)}
                    className={`flex-shrink-0 w-72 rounded-xl border transition-all duration-150 ${
                      dragOverStatus === status.key ? "border-blue-400 bg-blue-50/60 shadow-md" : "border-slate-200 bg-white"
                    }`}
                  >
                    {/* Stage Header */}
                    <div className="p-4 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }} />
                        <h3 className="text-sm font-semibold text-slate-700">{status.icon} {status.label}</h3>
                        <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{deals.length}</span>
                      </div>
                      {stageValue > 0 && <p className="text-xs text-slate-400 mt-1">{fmt(stageValue)}</p>}
                    </div>

                    {/* Deal Cards */}
                    <div className="p-3 space-y-2 min-h-[200px]">
                      {deals.map(deal => <DealCard key={deal.id} deal={deal} />)}
                      {deals.length === 0 && (
                        <div className={`text-center py-8 rounded-lg border-2 border-dashed transition-colors ${
                          dragOverStatus === status.key ? "border-blue-300 bg-blue-50/50" : "border-transparent"
                        }`}>
                          <p className="text-xs text-slate-400">{dragOverStatus === status.key ? "Drop here!" : "Drag deals here"}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        /* Table View */
        <div className="px-4 md:px-8 py-6">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500">Name</th>
                    <th className="text-left px-3 py-3 font-semibold text-slate-500">Address</th>
                    <th className="text-center px-3 py-3 font-semibold text-slate-500">Status</th>
                    <th className="text-center px-3 py-3 font-semibold text-slate-500">Type</th>
                    <th className="text-right px-3 py-3 font-semibold text-slate-500">Price</th>
                    <th className="text-right px-3 py-3 font-semibold text-slate-500">Cap Rate</th>
                    <th className="text-right px-3 py-3 font-semibold text-slate-500">IRR</th>
                    <th className="text-right px-3 py-3 font-semibold text-slate-500">NOI</th>
                    <th className="text-center px-3 py-3 font-semibold text-slate-500">Updated</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {initialDeals.map((deal, i) => {
                    const outputs = deal.outputs as any;
                    const inputs = deal.inputs as any;
                    const price = inputs?.purchasePrice || 0;
                    const capRate = outputs?.capRate || 0;
                    const irr = outputs?.irr || 0;
                    const noi = outputs?.noi || 0;
                    const statusInfo = STATUSES.find(s => s.key === deal.status);

                    return (
                      <tr key={deal.id} className={`border-t border-slate-100 hover:bg-slate-50 ${i % 2 === 0 ? "" : "bg-slate-50/50"}`}>
                        <td className="px-4 py-3">
                          <Link href={`/deals/new?id=${deal.id}`} className="font-medium text-slate-900 hover:text-blue-600 transition-colors">
                            {deal.name}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-slate-600 max-w-[200px] truncate">
                          {deal.address || "—"}{deal.borough ? `, ${deal.borough}` : ""}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full" style={{ backgroundColor: `${statusInfo?.color}15`, color: statusInfo?.color }}>
                            {statusInfo?.icon} {statusInfo?.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-slate-500">
                          {DEAL_TYPES[deal.dealType] || deal.dealType}
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-slate-700">
                          {price > 0 ? fmt(price) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {capRate > 0 ? (
                            <span className={capRate >= 5 ? "text-green-700" : capRate >= 3 ? "text-amber-700" : "text-red-700"}>
                              {fmtPct(capRate)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {irr > 0 && isFinite(irr) ? (
                            <span className={irr >= 15 ? "text-green-700" : irr >= 8 ? "text-amber-700" : "text-red-700"}>
                              {fmtPct(irr)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-slate-700">
                          {noi > 0 ? fmt(noi) : "—"}
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-slate-400">
                          {new Date(deal.updatedAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <Link href={`/deals/new?id=${deal.id}`} className="text-xs text-slate-400 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50" title="Edit">
                              ✎
                            </Link>
                            <button onClick={() => handleDelete(deal.id)} className="text-xs text-slate-400 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50" title="Delete">
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {initialDeals.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                        No deal analyses yet. <Link href="/deals/new" className="text-blue-600 hover:underline">Create your first deal</Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {initialDeals.length === 0 && view === "kanban" && (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="text-5xl mb-4">🧮</div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">No Deal Analyses Yet</h2>
          <p className="text-sm text-slate-500 text-center max-w-md mb-6">
            Create deal analyses to model acquisitions, value-add opportunities, and new developments.
            Each deal flows through your pipeline from analysis to close.
          </p>
          <Link href="/deals/new" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors">
            + New Deal Analysis
          </Link>
        </div>
      )}
    </div>
  );
}
