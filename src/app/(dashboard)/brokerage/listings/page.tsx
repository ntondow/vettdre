"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  X,
  Home,
  LayoutGrid,
  Table2,
  Columns3,
  TrendingUp,
  CheckCircle2,
  Eye,
  FileText,
  Upload,
  Calendar,
  ChevronDown,
} from "lucide-react";
import {
  getListings,
  getListingStats,
  getProperties,
  getAgentsForDropdown,
  createListing,
  createProperty,
} from "./actions";
import {
  LISTING_STATUS_LABELS,
  LISTING_STATUS_COLORS,
  LISTING_STATUS_SEQUENCE,
  LISTING_TYPE_LABELS,
  COMMISSION_TYPE_LABELS,
} from "@/lib/bms-types";
import type {
  BmsListingRecord,
  ListingStats,
  BmsPropertyRecord,
  BmsListingInput,
  BmsListingStatusType,
  BmsCommissionTypeAlias,
} from "@/lib/bms-types";

// ── Helpers ──────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(n);

const fmtDate = (d?: string | null) => {
  if (!d) return "\u2014";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "\u2014";
  }
};

type AgentOption = { id: string; firstName: string; lastName: string; email: string };
type ViewMode = "pipeline" | "table" | "grid";

const BEDROOM_OPTIONS = ["Studio", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4+"];
const BATHROOM_OPTIONS = ["1", "1.5", "2", "2.5", "3+"];

// ── Status Pipeline Dots ────────────────────────────────────

function StatusDots({ status }: { status: string }) {
  const idx = LISTING_STATUS_SEQUENCE.indexOf(status as BmsListingStatusType);
  return (
    <div className="flex items-center gap-1">
      {LISTING_STATUS_SEQUENCE.map((s, i) => (
        <div
          key={s}
          className={`w-2 h-2 rounded-full ${
            status === "off_market"
              ? "bg-slate-300"
              : i < idx
                ? "bg-blue-500"
                : i === idx
                  ? "bg-blue-500 ring-2 ring-blue-200"
                  : "bg-slate-200"
          }`}
          title={LISTING_STATUS_LABELS[s]}
        />
      ))}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────

export default function ListingsPage() {
  const router = useRouter();
  const [listings, setListings] = useState<BmsListingRecord[]>([]);
  const [stats, setStats] = useState<ListingStats | null>(null);
  const [properties, setProperties] = useState<BmsPropertyRecord[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [viewMode, setViewMode] = useState<ViewMode>("pipeline");
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterProperty, setFilterProperty] = useState<string>("");
  const [filterAgent, setFilterAgent] = useState<string>("");
  const [filterBedrooms, setFilterBedrooms] = useState<string>("");
  const [search, setSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // New listing modal
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<BmsListingInput>({
    address: "",
    type: "rental",
  });
  const [showNewProperty, setShowNewProperty] = useState(false);
  const [newPropertyName, setNewPropertyName] = useState("");
  const [newPropertyLandlord, setNewPropertyLandlord] = useState("");
  const [creating, setCreating] = useState(false);

  // ── Data Loading ────────────────────────────────────────────

  async function loadData() {
    try {
      const filters: Record<string, unknown> = {};
      if (filterType) filters.type = filterType;
      if (filterStatus) filters.status = filterStatus;
      if (filterProperty) filters.propertyId = filterProperty;
      if (filterAgent === "open") {
        filters.unassigned = true;
      } else if (filterAgent) {
        filters.agentId = filterAgent;
      }
      if (filterBedrooms) filters.bedrooms = filterBedrooms;
      if (search) filters.search = search;

      const [l, s, p, a] = await Promise.all([
        getListings(filters as any), // eslint-disable-line @typescript-eslint/no-explicit-any
        getListingStats(),
        getProperties(),
        getAgentsForDropdown(),
      ]);
      setListings(l);
      setStats(s);
      setProperties(p);
      setAgents(a);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [filterType, filterStatus, filterProperty, filterAgent, filterBedrooms]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadData(), 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Create Listing ──────────────────────────────────────────

  async function handleCreate() {
    if (!newForm.address) return;
    setCreating(true);
    try {
      let propertyId = newForm.propertyId;

      // Create new property if needed
      if (showNewProperty && newPropertyName) {
        const prop = await createProperty({
          name: newPropertyName,
          landlordName: newPropertyLandlord || undefined,
        });
        propertyId = prop.id;
      }

      // Calculate commission
      let commissionAmount = newForm.commissionAmount;
      if (newForm.commissionType === "one_month" && newForm.rentPrice) {
        commissionAmount = newForm.rentPrice;
      } else if (newForm.commissionType === "percentage" && newForm.rentPrice && newForm.commissionPct) {
        commissionAmount = newForm.rentPrice * newForm.commissionPct / 100;
      }

      await createListing({
        ...newForm,
        propertyId,
        commissionAmount,
      });

      setShowNew(false);
      setNewForm({ address: "", type: "rental" });
      setShowNewProperty(false);
      setNewPropertyName("");
      setNewPropertyLandlord("");
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create listing");
    } finally {
      setCreating(false);
    }
  }

  // ── Pipeline View ─────────────────────────────────────────

  function PipelineView() {
    const columns = LISTING_STATUS_SEQUENCE;
    const grouped: Record<string, BmsListingRecord[]> = {};
    for (const s of columns) grouped[s] = [];
    for (const l of listings) {
      if (grouped[l.status]) grouped[l.status].push(l);
    }

    // Shared card renderer
    const ListingCard = ({ l }: { l: BmsListingRecord }) => (
      <Link
        key={l.id}
        href={`/brokerage/listings/${l.id}`}
        className="block bg-white border border-slate-200 rounded-lg p-3 hover:shadow-sm hover:border-slate-300 transition-all"
      >
        {l.property?.name && (
          <p className="text-[11px] text-slate-400 font-medium mb-0.5 truncate">
            {l.property.name}
          </p>
        )}
        <p className="text-sm font-semibold text-slate-800 truncate">
          {l.address}{l.unit ? ` ${l.unit}` : ""}
        </p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm font-bold text-blue-600">
            {l.rentPrice ? fmt(Number(l.rentPrice)) : l.askingPrice ? fmt(Number(l.askingPrice)) : "\u2014"}
          </span>
          {l.bedrooms && (
            <span className="text-xs text-slate-500">
              {l.bedrooms === "Studio" ? "Studio" : `${l.bedrooms}BR`}
              {l.bathrooms ? `/${l.bathrooms}BA` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          {l.agent ? (
            <span className="text-xs text-slate-500 truncate">
              {l.agent.firstName} {l.agent.lastName}
            </span>
          ) : (
            <span className="text-xs text-amber-600 font-medium">Open — Claim</span>
          )}
          {l.availableDate && (
            <span className="text-[11px] text-slate-400">
              {fmtDate(l.availableDate)}
            </span>
          )}
        </div>
      </Link>
    );

    return (
      <>
        {/* Desktop: horizontal Kanban columns */}
        <div className="hidden md:flex gap-4 overflow-x-auto pb-4 px-6">
          {columns.map((status) => (
            <div key={status} className="flex-shrink-0 w-72">
              <div className="flex items-center justify-between mb-3">
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${LISTING_STATUS_COLORS[status]}`}>
                  {LISTING_STATUS_LABELS[status]}
                </span>
                <span className="text-xs text-slate-400 font-medium">{grouped[status].length}</span>
              </div>
              <div className="space-y-2">
                {grouped[status].length === 0 && (
                  <div className="border border-dashed border-slate-200 rounded-lg p-4 text-center text-xs text-slate-400">
                    No listings
                  </div>
                )}
                {grouped[status].map((l) => <ListingCard key={l.id} l={l} />)}
              </div>
            </div>
          ))}
        </div>

        {/* Mobile: vertical grouped collapsible list */}
        <div className="md:hidden px-4 space-y-3">
          {columns.filter((s) => grouped[s].length > 0).map((status) => (
            <details key={status} open={status === "available" || status === "showing"}>
              <summary className="flex items-center justify-between cursor-pointer py-2">
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${LISTING_STATUS_COLORS[status]}`}>
                  {LISTING_STATUS_LABELS[status]}
                </span>
                <span className="text-xs text-slate-400 font-medium">{grouped[status].length}</span>
              </summary>
              <div className="space-y-2 mt-2 pb-1">
                {grouped[status].map((l) => <ListingCard key={l.id} l={l} />)}
              </div>
            </details>
          ))}
        </div>
      </>
    );
  }

  // ── Table View ────────────────────────────────────────────

  function TableView() {
    return (
      <div className="px-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">Address</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 hidden md:table-cell">Property</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">Rent</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 hidden lg:table-cell">Beds/Baths</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 hidden md:table-cell">Agent</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 hidden lg:table-cell">Available</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => router.push(`/brokerage/listings/${l.id}`)}
                    className="border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-800">
                        {l.address}{l.unit ? ` ${l.unit}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-slate-500 truncate">
                        {l.property?.name || "\u2014"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${LISTING_STATUS_COLORS[l.status]}`}>
                        {LISTING_STATUS_LABELS[l.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-slate-700">
                        {l.rentPrice ? fmt(Number(l.rentPrice)) : l.askingPrice ? fmt(Number(l.askingPrice)) : "\u2014"}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-sm text-slate-500">
                        {l.bedrooms ? (l.bedrooms === "Studio" ? "Studio" : `${l.bedrooms}BR`) : "\u2014"}
                        {l.bathrooms ? ` / ${l.bathrooms}BA` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {l.agent ? (
                        <span className="text-sm text-slate-500">
                          {l.agent.firstName} {l.agent.lastName}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full font-medium">
                          Open
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-sm text-slate-500">{fmtDate(l.availableDate)}</span>
                    </td>
                  </tr>
                ))}
                {listings.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                      No listings found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── Grid View ─────────────────────────────────────────────

  function GridView() {
    return (
      <div className="px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map((l) => (
            <Link
              key={l.id}
              href={`/brokerage/listings/${l.id}`}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-slate-300 transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${LISTING_STATUS_COLORS[l.status]}`}>
                  {LISTING_STATUS_LABELS[l.status]}
                </span>
                <StatusDots status={l.status} />
              </div>
              {l.property?.name && (
                <p className="text-[11px] text-slate-400 font-medium mb-0.5">{l.property.name}</p>
              )}
              <p className="text-sm font-semibold text-slate-800 mb-1">
                {l.address}{l.unit ? ` ${l.unit}` : ""}
              </p>
              <p className="text-lg font-bold text-blue-600 mb-2">
                {l.rentPrice ? fmt(Number(l.rentPrice)) : l.askingPrice ? fmt(Number(l.askingPrice)) : "\u2014"}
                {l.rentPrice ? <span className="text-xs font-normal text-slate-400">/mo</span> : null}
              </p>
              <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                {l.bedrooms && <span>{l.bedrooms === "Studio" ? "Studio" : `${l.bedrooms} Bed`}</span>}
                {l.bathrooms && <span>{l.bathrooms} Bath</span>}
                {l.sqft && <span>{l.sqft.toLocaleString()} sqft</span>}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                {l.agent ? (
                  <span className="text-xs text-slate-500">
                    {l.agent.firstName} {l.agent.lastName}
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 font-medium">Open — Claim</span>
                )}
                <span className="text-[11px] text-slate-400">
                  {l.availableDate ? `Avail ${fmtDate(l.availableDate)}` : ""}
                </span>
              </div>
            </Link>
          ))}
          {listings.length === 0 && !loading && (
            <div className="col-span-full py-12 text-center text-sm text-slate-400">
              No listings found
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50/40">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Listings</h1>
          <p className="text-sm text-slate-500">Manage your brokerage inventory</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/brokerage/listings/bulk"
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Bulk Upload
          </Link>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Listing
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-6 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Available", value: stats.available, icon: Home, color: "text-green-600" },
              { label: "Showing", value: stats.showing, icon: Eye, color: "text-blue-600" },
              { label: "Application", value: stats.application, icon: FileText, color: "text-amber-600" },
              { label: "Approved", value: stats.approved, icon: CheckCircle2, color: "text-purple-600" },
              { label: "Leased This Month", value: stats.leasedThisMonth, icon: TrendingUp, color: "text-emerald-600" },
              { label: "Total Inventory", value: stats.total, icon: Columns3, color: "text-slate-600" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-xs text-slate-500">{label}</span>
                </div>
                <p className="text-xl font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View toggle + Filters */}
      <div className="px-6 pb-4 flex flex-col md:flex-row gap-3">
        {/* View toggle */}
        <div className="flex bg-white border border-slate-200 rounded-lg p-0.5">
          {([
            { mode: "pipeline" as const, icon: Columns3, label: "Pipeline" },
            { mode: "table" as const, icon: Table2, label: "Table" },
            { mode: "grid" as const, icon: LayoutGrid, label: "Grid" },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === mode
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-1 flex-wrap gap-2">
          <select
            value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600"
          >
            <option value="">All Properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600"
          >
            <option value="">All Statuses</option>
            {Object.entries(LISTING_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600"
          >
            <option value="">All Agents</option>
            <option value="open">Open / Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600"
          >
            <option value="">All Types</option>
            <option value="rental">Rental</option>
            <option value="sale">Sale</option>
          </select>

          <select
            value={filterBedrooms}
            onChange={(e) => setFilterBedrooms(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600"
          >
            <option value="">All Beds</option>
            {BEDROOM_OPTIONS.map((b) => (
              <option key={b} value={b}>{b === "Studio" ? "Studio" : `${b} BR`}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search listings..."
              className="w-full pl-8 pr-3 py-1.5 text-base sm:text-xs border border-slate-200 rounded-lg bg-white placeholder:text-slate-400"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="px-6 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Views */}
      {!loading && viewMode === "pipeline" && <PipelineView />}
      {!loading && viewMode === "table" && <TableView />}
      {!loading && viewMode === "grid" && <GridView />}

      {/* New Listing Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-center sm:pt-[10vh] bg-black/30 animate-[fade-in_0.15s_ease-out]">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg sm:mx-4 max-h-[90vh] sm:max-h-[80vh] overflow-y-auto animate-[slide-up_0.2s_ease-out] sm:animate-[modal-in_0.2s_ease-out]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">New Listing</h2>
              <button onClick={() => setShowNew(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Property */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Property</label>
                {!showNewProperty ? (
                  <div className="flex gap-2">
                    <select
                      value={newForm.propertyId || ""}
                      onChange={(e) => setNewForm({ ...newForm, propertyId: e.target.value || undefined })}
                      className="flex-1 px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                    >
                      <option value="">None / Standalone</option>
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowNewProperty(true)}
                      className="px-3 py-2 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                    >
                      + New
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
                    <input
                      type="text"
                      value={newPropertyName}
                      onChange={(e) => setNewPropertyName(e.target.value)}
                      placeholder="Property/Complex Name *"
                      className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                    />
                    <input
                      type="text"
                      value={newPropertyLandlord}
                      onChange={(e) => setNewPropertyLandlord(e.target.value)}
                      placeholder="Landlord Name (optional)"
                      className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                    />
                    <button
                      onClick={() => { setShowNewProperty(false); setNewPropertyName(""); setNewPropertyLandlord(""); }}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Address + Unit */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Address *</label>
                  <input
                    type="text"
                    value={newForm.address}
                    onChange={(e) => setNewForm({ ...newForm, address: e.target.value })}
                    placeholder="123 Main Street"
                    className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Unit</label>
                  <input
                    type="text"
                    value={newForm.unit || ""}
                    onChange={(e) => setNewForm({ ...newForm, unit: e.target.value })}
                    placeholder="4A"
                    className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                <div className="flex gap-2">
                  {(["rental", "sale"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setNewForm({ ...newForm, type: t })}
                      className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        newForm.type === t
                          ? "bg-blue-50 border-blue-200 text-blue-700"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {LISTING_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {newForm.type === "rental" ? "Monthly Rent" : "Asking Price"}
                </label>
                <input
                  type="number"
                  value={newForm.type === "rental" ? (newForm.rentPrice || "") : (newForm.askingPrice || "")}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : undefined;
                    if (newForm.type === "rental") {
                      setNewForm({ ...newForm, rentPrice: val });
                    } else {
                      setNewForm({ ...newForm, askingPrice: val });
                    }
                  }}
                  placeholder="0"
                  className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>

              {/* Beds / Baths / Sqft / Floor */}
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Beds</label>
                  <select
                    value={newForm.bedrooms || ""}
                    onChange={(e) => setNewForm({ ...newForm, bedrooms: e.target.value || undefined })}
                    className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="">—</option>
                    {BEDROOM_OPTIONS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Baths</label>
                  <select
                    value={newForm.bathrooms || ""}
                    onChange={(e) => setNewForm({ ...newForm, bathrooms: e.target.value || undefined })}
                    className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="">—</option>
                    {BATHROOM_OPTIONS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Sqft</label>
                  <input
                    type="number"
                    value={newForm.sqft || ""}
                    onChange={(e) => setNewForm({ ...newForm, sqft: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Floor</label>
                  <input
                    type="text"
                    value={newForm.floor || ""}
                    onChange={(e) => setNewForm({ ...newForm, floor: e.target.value || undefined })}
                    className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Available Date */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Available Date</label>
                <input
                  type="date"
                  value={newForm.availableDate || ""}
                  onChange={(e) => setNewForm({ ...newForm, availableDate: e.target.value || undefined })}
                  className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>

              {/* Commission */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Commission Type</label>
                  <select
                    value={newForm.commissionType || ""}
                    onChange={(e) => setNewForm({ ...newForm, commissionType: (e.target.value || undefined) as BmsCommissionTypeAlias | undefined })}
                    className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="">Select</option>
                    {Object.entries(COMMISSION_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {newForm.commissionType === "percentage" ? "Commission %" : "Commission Amount"}
                  </label>
                  <input
                    type="number"
                    value={
                      newForm.commissionType === "percentage"
                        ? (newForm.commissionPct || "")
                        : newForm.commissionType === "one_month"
                          ? (newForm.rentPrice || "")
                          : (newForm.commissionAmount || "")
                    }
                    disabled={newForm.commissionType === "one_month"}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : undefined;
                      if (newForm.commissionType === "percentage") {
                        setNewForm({ ...newForm, commissionPct: val });
                      } else {
                        setNewForm({ ...newForm, commissionAmount: val });
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
              </div>

              {/* Agent */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Assignment</label>
                <select
                  value={newForm.agentId || ""}
                  onChange={(e) => setNewForm({ ...newForm, agentId: e.target.value || undefined })}
                  className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                >
                  <option value="">Open (any agent can claim)</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
                  ))}
                </select>
              </div>

              {/* Description / Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                <textarea
                  value={newForm.description || ""}
                  onChange={(e) => setNewForm({ ...newForm, description: e.target.value || undefined })}
                  rows={2}
                  placeholder="Optional listing description..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
              <button
                onClick={() => setShowNew(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newForm.address || creating}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating..." : "Create Listing"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
