"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  LayoutGrid,
  List,
  Filter,
  Plus,
  MoreHorizontal,
  TrendingUp,
  BarChart3,
  DollarSign,
  Activity,
  Copy,
  Trash2,
  ExternalLink,
  FileBarChart,
  ChevronDown,
} from "lucide-react";
import { getDeals, getDealStats, updateDealStatus, duplicateDeal, deleteDeal } from "./actions";

// ── Types ───────────────────────────────────────────────────

interface DealItem {
  id: string;
  name: string | null;
  address: string | null;
  borough: string | null;
  bbl: string | null;
  status: string;
  dealType: string;
  dealSource: string;
  structure: string | null;
  inputs: any;
  outputs: any;
  loiSent: boolean;
  loiSentDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DealStats {
  activeDeals: number;
  screenedThisMonth: number;
  avgCapRate: number;
  totalDealVolume: number;
}

// ── Constants ───────────────────────────────────────────────

const STAGES = [
  { key: "analyzing", label: "Screening", color: "#3B82F6", bg: "bg-blue-50", text: "text-blue-700", icon: "🔍" },
  { key: "prospecting", label: "Underwriting", color: "#8B5CF6", bg: "bg-violet-50", text: "text-violet-700", icon: "🎯" },
  { key: "loi_sent", label: "LOI Sent", color: "#F59E0B", bg: "bg-amber-50", text: "text-amber-700", icon: "📨" },
  { key: "under_contract", label: "Under Contract", color: "#10B981", bg: "bg-emerald-50", text: "text-emerald-700", icon: "📝" },
  { key: "closed", label: "Closed", color: "#059669", bg: "bg-green-50", text: "text-green-700", icon: "✅" },
  { key: "dead", label: "Dead", color: "#6B7280", bg: "bg-slate-100", text: "text-slate-500", icon: "💀" },
];

const STRUCTURES: Record<string, string> = {
  all_cash: "All Cash",
  conventional: "Conventional",
  bridge_refi: "Bridge → Refi",
  assumable: "Assumable",
  syndication: "Syndication",
};

const BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

const DEAL_TYPES: Record<string, string> = {
  acquisition: "Acquisition",
  value_add: "Value-Add",
  new_development: "New Dev",
  mixed_use: "Mixed Use",
  ground_up: "Ground Up",
};

// ── Formatters ──────────────────────────────────────────────

const fmt = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

// ── Component ───────────────────────────────────────────────

export default function PipelinePage() {
  const router = useRouter();

  // Data state
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [stats, setStats] = useState<DealStats>({ activeDeals: 0, screenedThisMonth: 0, avgCapRate: 0, totalDealVolume: 0 });
  const [loading, setLoading] = useState(true);

  // Filter state
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [structureFilter, setStructureFilter] = useState<string | null>(null);
  const [boroughFilter, setBoroughFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // UI state
  const [movingDeal, setMovingDeal] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const dragItem = useRef<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  // ── Fetch ───────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    const filters: any = {};
    if (statusFilter) filters.status = statusFilter;
    if (structureFilter) filters.structure = structureFilter;
    if (boroughFilter) filters.borough = boroughFilter;
    if (search.trim()) filters.search = search.trim();

    const [d, s] = await Promise.all([getDeals(filters), getDealStats()]);
    setDeals(d as DealItem[]);
    setStats(s);
    setLoading(false);
  }, [statusFilter, structureFilter, boroughFilter, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Debounced search
  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchData(), 300);
  };

  // ── Actions ─────────────────────────────────────────────

  const handleMove = async (dealId: string, newStatus: string) => {
    setUpdating(true);
    try {
      await updateDealStatus(dealId, newStatus);
      setMovingDeal(null);
      fetchData();
    } finally { setUpdating(false); }
  };

  const handleDuplicate = async (dealId: string) => {
    const newId = await duplicateDeal(dealId);
    router.push(`/deals/new?id=${newId}`);
  };

  const handleDelete = async (dealId: string) => {
    if (!confirm("Delete this deal analysis? This cannot be undone.")) return;
    await deleteDeal(dealId);
    fetchData();
  };

  // ── Drag & Drop ─────────────────────────────────────────

  const onDragStart = (e: React.DragEvent, dealId: string) => {
    dragItem.current = dealId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dealId);
    setTimeout(() => {
      const el = document.getElementById(`deal-${dealId}`);
      if (el) el.style.opacity = "0.4";
    }, 0);
  };

  const onDragEnd = (dealId: string) => {
    dragItem.current = null;
    setDragOverStatus(null);
    const el = document.getElementById(`deal-${dealId}`);
    if (el) el.style.opacity = "1";
  };

  const onDrop = async (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDragOverStatus(null);
    const dealId = e.dataTransfer.getData("text/plain") || dragItem.current;
    if (dealId) {
      const deal = deals.find(d => d.id === dealId);
      if (deal && deal.status !== status) await handleMove(dealId, status);
    }
    dragItem.current = null;
  };

  // ── Derived ─────────────────────────────────────────────

  const dealsByStatus = STAGES.reduce((acc: Record<string, DealItem[]>, s) => {
    acc[s.key] = deals.filter(d => d.status === s.key);
    return acc;
  }, {});

  // ── Render ──────────────────────────────────────────────

  return (
    <div className="min-h-full bg-slate-50">
      {/* Stats Cards */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Activity className="w-4 h-4 text-blue-600" />} label="Active Deals" value={String(stats.activeDeals)} />
          <StatCard icon={<BarChart3 className="w-4 h-4 text-violet-600" />} label="Screened This Mo" value={String(stats.screenedThisMonth)} />
          <StatCard icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} label="Avg Cap Rate" value={stats.avgCapRate > 0 ? fmtPct(stats.avgCapRate) : "—"} />
          <StatCard icon={<DollarSign className="w-4 h-4 text-amber-600" />} label="Deal Volume" value={stats.totalDealVolume > 0 ? fmt(stats.totalDealVolume) : "—"} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search deals..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status pills */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setStatusFilter(null)}
                className={`text-xs px-2.5 py-1.5 rounded-full font-medium transition-colors ${
                  !statusFilter ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All
              </button>
              {STAGES.filter(s => s.key !== "dead").map(s => (
                <button
                  key={s.key}
                  onClick={() => setStatusFilter(statusFilter === s.key ? null : s.key)}
                  className={`text-xs px-2.5 py-1.5 rounded-full font-medium transition-colors ${
                    statusFilter === s.key ? "text-white" : `${s.bg} ${s.text} hover:opacity-80`
                  }`}
                  style={statusFilter === s.key ? { backgroundColor: s.color } : undefined}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Structure dropdown */}
            <div className="relative">
              <select
                value={structureFilter || ""}
                onChange={e => setStructureFilter(e.target.value || null)}
                className="text-xs pl-2.5 pr-7 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">All Structures</option>
                {Object.entries(STRUCTURES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            {/* Borough dropdown */}
            <div className="relative">
              <select
                value={boroughFilter || ""}
                onChange={e => setBoroughFilter(e.target.value || null)}
                className="text-xs pl-2.5 pr-7 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">All Boroughs</option>
                {BOROUGHS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Right: view toggle + new deal */}
          <div className="flex items-center gap-2 md:ml-auto">
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setView("kanban")}
                className={`p-1.5 rounded-md transition-colors ${view === "kanban" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                title="Board view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView("table")}
                className={`p-1.5 rounded-md transition-colors ${view === "table" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                title="Table view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            <Link
              href="/deals/new"
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Deal</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : view === "kanban" ? (
        <>
          {/* ── Mobile: Vertical collapsible stages ── */}
          <div className="md:hidden px-4 py-4 space-y-3">
            {STAGES.map(stage => {
              const stageDeals = dealsByStatus[stage.key] || [];
              const stageValue = stageDeals.reduce((s, d) => s + ((d.inputs as any)?.purchasePrice || 0), 0);
              return (
                <details key={stage.key} open={stageDeals.length > 0} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                    <span className="text-sm font-semibold text-slate-700 flex-1">{stage.icon} {stage.label}</span>
                    {stageValue > 0 && <span className="text-xs text-slate-400 mr-2">{fmt(stageValue)}</span>}
                    <span className="text-xs font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{stageDeals.length}</span>
                  </summary>
                  <div className="px-3 pb-3 space-y-2 border-t border-slate-100">
                    {stageDeals.map(deal => (
                      <div key={deal.id} className="mt-2">
                        <DealCard deal={deal} onMove={handleMove} onDuplicate={handleDuplicate} onDelete={handleDelete}
                          movingDeal={movingDeal} setMovingDeal={setMovingDeal} updating={updating}
                          onDragStart={onDragStart} onDragEnd={onDragEnd} />
                      </div>
                    ))}
                    {stageDeals.length === 0 && <p className="text-xs text-slate-400 text-center py-4 mt-2">No deals</p>}
                  </div>
                </details>
              );
            })}
          </div>

          {/* ── Desktop: Kanban Board ── */}
          <div className="hidden md:block px-6 py-5">
            <div className="flex gap-4 overflow-x-auto pb-4">
              {STAGES.map(stage => {
                const stageDeals = dealsByStatus[stage.key] || [];
                const stageValue = stageDeals.reduce((s, d) => s + ((d.inputs as any)?.purchasePrice || 0), 0);
                return (
                  <div
                    key={stage.key}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDragEnter={e => { e.preventDefault(); setDragOverStatus(stage.key); }}
                    onDragLeave={e => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const { clientX, clientY } = e;
                      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) setDragOverStatus(null);
                    }}
                    onDrop={e => onDrop(e, stage.key)}
                    className={`flex-shrink-0 w-72 rounded-xl border transition-all duration-150 ${
                      dragOverStatus === stage.key ? "border-blue-400 bg-blue-50/60 shadow-md" : "border-slate-200 bg-white"
                    }`}
                  >
                    {/* Stage header */}
                    <div className="p-4 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                        <h3 className="text-sm font-semibold text-slate-700">{stage.icon} {stage.label}</h3>
                        <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{stageDeals.length}</span>
                      </div>
                      {stageValue > 0 && <p className="text-xs text-slate-400 mt-1">{fmt(stageValue)}</p>}
                    </div>

                    {/* Deal cards */}
                    <div className="p-3 space-y-2 min-h-[200px]">
                      {stageDeals.map(deal => (
                        <DealCard key={deal.id} deal={deal} onMove={handleMove} onDuplicate={handleDuplicate} onDelete={handleDelete}
                          movingDeal={movingDeal} setMovingDeal={setMovingDeal} updating={updating}
                          onDragStart={onDragStart} onDragEnd={onDragEnd} />
                      ))}
                      {stageDeals.length === 0 && (
                        <div className={`text-center py-8 rounded-lg border-2 border-dashed transition-colors ${
                          dragOverStatus === stage.key ? "border-blue-300 bg-blue-50/50" : "border-transparent"
                        }`}>
                          <p className="text-xs text-slate-400">{dragOverStatus === stage.key ? "Drop here!" : "Drag deals here"}</p>
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
        /* ── Table View ── */
        <div className="px-4 md:px-6 py-5">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500">Name</th>
                    <th className="text-left px-3 py-3 font-semibold text-slate-500">Address</th>
                    <th className="text-center px-3 py-3 font-semibold text-slate-500">Stage</th>
                    <th className="text-center px-3 py-3 font-semibold text-slate-500">Structure</th>
                    <th className="text-right px-3 py-3 font-semibold text-slate-500">Price</th>
                    <th className="text-right px-3 py-3 font-semibold text-slate-500">Cap Rate</th>
                    <th className="text-right px-3 py-3 font-semibold text-slate-500">IRR</th>
                    <th className="text-right px-3 py-3 font-semibold text-slate-500">NOI</th>
                    <th className="text-center px-3 py-3 font-semibold text-slate-500">Updated</th>
                    <th className="w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((deal, i) => {
                    const outputs = deal.outputs as any;
                    const inputs = deal.inputs as any;
                    const price = inputs?.purchasePrice || 0;
                    const capRate = outputs?.capRate || 0;
                    const irr = outputs?.irr || 0;
                    const noi = outputs?.noi || 0;
                    const stageInfo = STAGES.find(s => s.key === deal.status);

                    return (
                      <tr key={deal.id} className={`border-t border-slate-100 hover:bg-slate-50 ${i % 2 === 0 ? "" : "bg-slate-50/50"}`}>
                        <td className="px-4 py-3">
                          <Link href={`/deals/new?id=${deal.id}`} className="font-medium text-slate-900 hover:text-blue-600 transition-colors">
                            {deal.name || "Untitled"}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-slate-600 max-w-[200px] truncate">
                          {deal.address || "—"}{deal.borough ? `, ${deal.borough}` : ""}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {stageInfo && (
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${stageInfo.bg} ${stageInfo.text}`}>
                              {stageInfo.icon} {stageInfo.label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-slate-500">
                          {deal.structure ? (STRUCTURES[deal.structure] || deal.structure) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-slate-700">{price > 0 ? fmt(price) : "—"}</td>
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
                        <td className="px-3 py-3 text-right font-medium text-slate-700">{noi > 0 ? fmt(noi) : "—"}</td>
                        <td className="px-3 py-3 text-center text-xs text-slate-400">{new Date(deal.updatedAt).toLocaleDateString()}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <Link href={`/deals/new?id=${deal.id}`} className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors" title="Edit">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                            <button onClick={() => handleDuplicate(deal.id)} className="p-1 text-slate-400 hover:text-violet-600 rounded hover:bg-violet-50 transition-colors" title="Duplicate">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(deal.id)} className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {deals.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                        No deal analyses found. <Link href="/deals/new" className="text-blue-600 hover:underline">Create your first deal</Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty state — kanban only, no deals */}
      {!loading && deals.length === 0 && view === "kanban" && (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="text-5xl mb-4">🧮</div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">No Deal Analyses Yet</h2>
          <p className="text-sm text-slate-500 text-center max-w-md mb-6">
            Create deal analyses to model acquisitions, value-add opportunities, and new developments.
            Each deal flows through your pipeline from screening to close.
          </p>
          <Link href="/deals/new" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors">
            <Plus className="w-4 h-4" />
            New Deal Analysis
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────────

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <p className="text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

// ── Deal Card ───────────────────────────────────────────────

function DealCard({ deal, onMove, onDuplicate, onDelete, movingDeal, setMovingDeal, updating, onDragStart, onDragEnd }: {
  deal: DealItem;
  onMove: (id: string, status: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  movingDeal: string | null;
  setMovingDeal: (id: string | null) => void;
  updating: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: (id: string) => void;
}) {
  const inputs = deal.inputs as any;
  const outputs = deal.outputs as any;
  const price = inputs?.purchasePrice || 0;
  const capRate = outputs?.capRate || 0;
  const irr = outputs?.irr || 0;

  return (
    <div
      id={`deal-${deal.id}`}
      draggable="true"
      onDragStart={e => onDragStart(e, deal.id)}
      onDragEnd={() => onDragEnd(deal.id)}
      className="bg-white border border-slate-200 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all select-none"
    >
      <div className="flex items-start justify-between">
        <Link href={`/deals/new?id=${deal.id}`} className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors line-clamp-1">
          {deal.name || "Untitled"}
        </Link>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium whitespace-nowrap ml-1">
          {DEAL_TYPES[deal.dealType] || deal.dealType}
        </span>
      </div>
      {deal.address && (
        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{deal.address}{deal.borough ? `, ${deal.borough}` : ""}</p>
      )}

      {/* Metrics */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {price > 0 && <span className="text-xs font-semibold text-slate-700">{fmt(price)}</span>}
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

      {/* LOI badge */}
      {deal.loiSent && deal.loiSentDate && (
        <div className="mt-2">
          {daysAgo(deal.loiSentDate) > 5 && deal.status === "loi_sent" ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700">
              Follow up — LOI sent {daysAgo(deal.loiSentDate)}d ago
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
              LOI sent {new Date(deal.loiSentDate).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* Actions row */}
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
          <button
            onClick={e => { e.stopPropagation(); onDuplicate(deal.id); }}
            className="p-1 text-slate-400 hover:text-violet-600 rounded hover:bg-violet-50 transition-colors"
            title="Duplicate"
          >
            <Copy className="w-3 h-3" />
          </button>
          <Link href={`/deals/new?id=${deal.id}`} className="text-xs text-slate-400 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors" title="Edit">
            ✎
          </Link>
          <button onClick={() => onDelete(deal.id)} className="text-xs text-slate-400 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors" title="Delete">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Move dropdown */}
      {movingDeal === deal.id && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-400 mb-1.5">Move to:</p>
          <div className="flex flex-wrap gap-1">
            {STAGES.filter(s => s.key !== deal.status).map(s => (
              <button key={s.key} onClick={() => onMove(deal.id, s.key)} disabled={updating}
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
