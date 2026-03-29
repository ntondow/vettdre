"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ChevronRight,
  ChevronDown,
  Edit3,
  Save,
  X,
  User,
  Building2,
  Calendar,
  DollarSign,
  MapPin,
  Bed,
  Bath,
  Maximize2,
  Layers,
  FolderOpen,
  UserPlus,
  Hand,
} from "lucide-react";
import {
  getListing,
  updateListing,
  advanceListingStatus,
  revertListingStatus,
  takeOffMarket,
  putBackOnMarket,
  claimListing,
  assignListing,
  createTransactionFromListing,
  getAgentsForDropdown,
} from "../actions";
import {
  LISTING_STATUS_LABELS,
  LISTING_STATUS_COLORS,
  LISTING_STATUS_SEQUENCE,
  LISTING_TYPE_LABELS,
  COMMISSION_TYPE_LABELS,
} from "@/lib/bms-types";
import type { BmsListingRecord, BmsListingStatusType } from "@/lib/bms-types";

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

const toDateInput = (d?: string | null) => {
  if (!d) return "";
  try { return new Date(d).toISOString().split("T")[0]; } catch { return ""; }
};

type AgentOption = { id: string; firstName: string; lastName: string; email: string };

const BEDROOM_OPTIONS = ["Studio", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4+"];
const BATHROOM_OPTIONS = ["1", "1.5", "2", "2.5", "3+"];

// ── Component ────────────────────────────────────────────────

export default function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [listing, setListing] = useState<BmsListingRecord | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Editing
  const [editingDetails, setEditingDetails] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  // Lease-up form (shown when advancing to "leased")
  const [showLeaseForm, setShowLeaseForm] = useState(false);
  const [leaseForm, setLeaseForm] = useState({
    tenantName: "",
    tenantEmail: "",
    tenantPhone: "",
    leaseStartDate: "",
    commissionAmount: "",
  });
  const [leaseLoading, setLeaseLoading] = useState(false);

  // Agent assignment
  const [showAssign, setShowAssign] = useState(false);
  const [assignAgentId, setAssignAgentId] = useState("");

  // Action loading
  const [actionLoading, setActionLoading] = useState(false);

  // ── Data Loading ────────────────────────────────────────────

  async function loadData() {
    try {
      const [l, a] = await Promise.all([
        getListing(id),
        getAgentsForDropdown(),
      ]);
      setListing(l);
      setAgents(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load listing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ─────────────────────────────────────────────────

  async function handleAdvance() {
    if (!listing) return;

    // Check if next status is "leased" — show lease form
    const currentIdx = LISTING_STATUS_SEQUENCE.indexOf(listing.status as BmsListingStatusType);
    if (currentIdx >= 0 && currentIdx < LISTING_STATUS_SEQUENCE.length - 1) {
      const nextStatus = LISTING_STATUS_SEQUENCE[currentIdx + 1];
      if (nextStatus === "leased") {
        setLeaseForm({
          tenantName: listing.tenantName || "",
          tenantEmail: listing.tenantEmail || "",
          tenantPhone: listing.tenantPhone || "",
          leaseStartDate: toDateInput(listing.leaseStartDate),
          commissionAmount: listing.commissionAmount ? String(Number(listing.commissionAmount)) : "",
        });
        setShowLeaseForm(true);
        return;
      }
    }

    setActionLoading(true);
    try {
      const updated = await advanceListingStatus(id);
      setListing(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to advance status");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLeaseUp() {
    if (!leaseForm.tenantName) return;
    setLeaseLoading(true);
    try {
      const result = await createTransactionFromListing(id, {
        tenantName: leaseForm.tenantName,
        tenantEmail: leaseForm.tenantEmail || undefined,
        tenantPhone: leaseForm.tenantPhone || undefined,
        leaseStartDate: leaseForm.leaseStartDate || undefined,
        commissionAmount: leaseForm.commissionAmount ? Number(leaseForm.commissionAmount) : undefined,
      });
      setShowLeaseForm(false);
      // Reload to show leased status + transaction link
      await loadData();
      // Show success
      if (result.transactionId) {
        if (confirm("Listing marked as leased. Transaction created. View transaction?")) {
          router.push(`/brokerage/transactions/${result.transactionId}`);
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create transaction");
    } finally {
      setLeaseLoading(false);
    }
  }

  async function handleRevert() {
    setActionLoading(true);
    try {
      const updated = await revertListingStatus(id);
      setListing(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revert status");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleOffMarket() {
    if (!confirm("Take this listing off market?")) return;
    setActionLoading(true);
    try {
      const updated = await takeOffMarket(id);
      setListing(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBackOnMarket() {
    setActionLoading(true);
    try {
      const updated = await putBackOnMarket(id);
      setListing(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClaim() {
    setActionLoading(true);
    try {
      const updated = await claimListing(id);
      setListing(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to claim listing");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAssign() {
    setActionLoading(true);
    try {
      const updated = await assignListing(id, assignAgentId || null);
      setListing(updated);
      setShowAssign(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setActionLoading(false);
    }
  }

  // ── Save inline edits ──────────────────────────────────────

  async function handleSaveDetails() {
    setSaving(true);
    try {
      const updated = await updateListing(id, editForm as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      setListing(updated);
      setEditingDetails(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function startEditingDetails() {
    if (!listing) return;
    setEditForm({
      rentPrice: listing.rentPrice ? Number(listing.rentPrice) : undefined,
      askingPrice: listing.askingPrice ? Number(listing.askingPrice) : undefined,
      bedrooms: listing.bedrooms || "",
      bathrooms: listing.bathrooms || "",
      sqft: listing.sqft || undefined,
      floor: listing.floor || "",
      availableDate: toDateInput(listing.availableDate),
      description: listing.description || "",
      notes: listing.notes || "",
    });
    setEditingDetails(true);
  }

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-32 bg-slate-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 h-64 bg-slate-200 rounded-xl animate-pulse" />
          <div className="lg:col-span-2 h-64 bg-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="p-6">
        <Link href="/brokerage/listings" className="flex items-center gap-1 text-sm text-blue-600 hover:underline mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Listings
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error || "Listing not found"}
        </div>
      </div>
    );
  }

  const statusIdx = LISTING_STATUS_SEQUENCE.indexOf(listing.status as BmsListingStatusType);
  const isTerminal = listing.status === "leased" || listing.status === "off_market";
  const canAdvance = !isTerminal && statusIdx < LISTING_STATUS_SEQUENCE.length - 1;
  const canRevert = !isTerminal && statusIdx > 0;

  return (
    <div className="min-h-screen bg-slate-50/40">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <Link href="/brokerage/listings" className="flex items-center gap-1 text-sm text-blue-600 hover:underline mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to Listings
        </Link>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              {listing.address}{listing.unit ? ` ${listing.unit}` : ""}
            </h1>
            {listing.property?.name && (
              <p className="text-sm text-slate-500">{listing.property.name}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${LISTING_STATUS_COLORS[listing.status]}`}>
                {LISTING_STATUS_LABELS[listing.status]}
              </span>
              <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
                {LISTING_TYPE_LABELS[listing.type || "rental"]}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {listing.status === "off_market" && (
              <button
                onClick={handleBackOnMarket}
                disabled={actionLoading}
                className="px-3 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50"
              >
                Put Back on Market
              </button>
            )}
            {canRevert && (
              <button
                onClick={handleRevert}
                disabled={actionLoading}
                className="px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Revert Status
              </button>
            )}
            {!isTerminal && (
              <button
                onClick={handleOffMarket}
                disabled={actionLoading}
                className="px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Off Market
              </button>
            )}
            {!listing.agent && !isTerminal && (
              <button
                onClick={handleClaim}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50"
              >
                <Hand className="w-4 h-4" /> Claim
              </button>
            )}
            {canAdvance && (
              <button
                onClick={handleAdvance}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Advance Status <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Pipeline Progress */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1">
          {LISTING_STATUS_SEQUENCE.map((s, i) => {
            const isCurrent = listing.status === s;
            const isPast = statusIdx >= 0 && i < statusIdx;
            const isOffMarket = listing.status === "off_market";
            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && (
                  <div className={`w-8 h-0.5 ${isPast && !isOffMarket ? "bg-blue-400" : "bg-slate-200"}`} />
                )}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      isOffMarket
                        ? "bg-slate-200 text-slate-400"
                        : isPast
                          ? "bg-blue-500 text-white"
                          : isCurrent
                            ? "bg-blue-500 text-white ring-4 ring-blue-100"
                            : "bg-slate-200 text-slate-400"
                    }`}
                  >
                    {isPast && !isOffMarket ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <span className="text-[10px] font-bold">{i + 1}</span>
                    )}
                  </div>
                  <span className={`text-[10px] mt-1 whitespace-nowrap ${
                    isCurrent ? "text-blue-600 font-semibold" : "text-slate-400"
                  }`}>
                    {LISTING_STATUS_LABELS[s]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Leased banner */}
        {listing.status === "leased" && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">
            This listing has been leased{listing.tenantName ? ` to ${listing.tenantName}` : ""}.
          </div>
        )}
        {listing.status === "off_market" && (
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-600">
            This listing is currently off market.
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left — Listing Details */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Listing Details</h3>
              {!editingDetails ? (
                <button onClick={startEditingDetails} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <Edit3 className="w-3 h-3" /> Edit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditingDetails(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                  <button
                    onClick={handleSaveDetails}
                    disabled={saving}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save className="w-3 h-3" /> Save
                  </button>
                </div>
              )}
            </div>
            <div className="px-5 py-4">
              {!editingDetails ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <DetailItem icon={DollarSign} label={listing.type === "sale" ? "Asking Price" : "Monthly Rent"} value={
                    listing.rentPrice ? fmt(Number(listing.rentPrice)) + "/mo" : listing.askingPrice ? fmt(Number(listing.askingPrice)) : "\u2014"
                  } />
                  <DetailItem icon={Bed} label="Bedrooms" value={listing.bedrooms || "\u2014"} />
                  <DetailItem icon={Bath} label="Bathrooms" value={listing.bathrooms || "\u2014"} />
                  <DetailItem icon={Maximize2} label="Square Feet" value={listing.sqft ? `${listing.sqft.toLocaleString()} sqft` : "\u2014"} />
                  <DetailItem icon={Layers} label="Floor" value={listing.floor || "\u2014"} />
                  <DetailItem icon={Calendar} label="Available" value={fmtDate(listing.availableDate)} />
                  <DetailItem icon={DollarSign} label="Commission" value={
                    listing.commissionType
                      ? `${COMMISSION_TYPE_LABELS[listing.commissionType] || listing.commissionType}${listing.commissionAmount ? ` — ${fmt(Number(listing.commissionAmount))}` : ""}`
                      : "\u2014"
                  } />
                  {listing.daysOnMarket != null && (
                    <DetailItem icon={Calendar} label="Days on Market" value={`${listing.daysOnMarket} days`} />
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{listing.type === "sale" ? "Asking Price" : "Rent"}</label>
                    <input
                      type="number"
                      value={listing.type === "sale" ? (editForm.askingPrice as number || "") : (editForm.rentPrice as number || "")}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : undefined;
                        if (listing.type === "sale") {
                          setEditForm({ ...editForm, askingPrice: val });
                        } else {
                          setEditForm({ ...editForm, rentPrice: val });
                        }
                      }}
                      className="w-full px-3 py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Bedrooms</label>
                    <select
                      value={(editForm.bedrooms as string) || ""}
                      onChange={(e) => setEditForm({ ...editForm, bedrooms: e.target.value })}
                      className="w-full px-3 py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg"
                    >
                      <option value="">—</option>
                      {BEDROOM_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Bathrooms</label>
                    <select
                      value={(editForm.bathrooms as string) || ""}
                      onChange={(e) => setEditForm({ ...editForm, bathrooms: e.target.value })}
                      className="w-full px-3 py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg"
                    >
                      <option value="">—</option>
                      {BATHROOM_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Sqft</label>
                    <input
                      type="number"
                      value={(editForm.sqft as number) || ""}
                      onChange={(e) => setEditForm({ ...editForm, sqft: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full px-3 py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Floor</label>
                    <input
                      type="text"
                      value={(editForm.floor as string) || ""}
                      onChange={(e) => setEditForm({ ...editForm, floor: e.target.value })}
                      className="w-full px-3 py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Available Date</label>
                    <input
                      type="date"
                      value={(editForm.availableDate as string) || ""}
                      onChange={(e) => setEditForm({ ...editForm, availableDate: e.target.value })}
                      className="w-full px-3 py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-3">
                    <label className="block text-xs text-slate-500 mb-1">Description</label>
                    <textarea
                      value={(editForm.description as string) || ""}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg resize-none"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-3">
                    <label className="block text-xs text-slate-500 mb-1">Notes</label>
                    <textarea
                      value={(editForm.notes as string) || ""}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Description (read mode) */}
              {!editingDetails && listing.description && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-1">Description</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{listing.description}</p>
                </div>
              )}

              {/* Amenities */}
              {listing.amenities && listing.amenities.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-2">Amenities</p>
                  <div className="flex flex-wrap gap-1.5">
                    {listing.amenities.map((a, i) => (
                      <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes (read mode) */}
              {!editingDetails && listing.notes && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-500 mb-1">Notes</p>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{listing.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Status Timeline */}
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Status Timeline</h3>
            </div>
            <div className="px-5 py-4">
              <div className="space-y-3">
                {[
                  { label: "Listed", date: listing.createdAt, done: true },
                  { label: "Showing Started", date: listing.showingStartedAt, done: !!listing.showingStartedAt },
                  { label: "Application Received", date: listing.applicationAt, done: !!listing.applicationAt },
                  { label: "Approved", date: listing.approvedAt, done: !!listing.approvedAt },
                  { label: "Leased", date: listing.leasedAt, done: !!listing.leasedAt },
                  ...(listing.offMarketAt ? [{ label: "Off Market", date: listing.offMarketAt, done: true }] : []),
                ].map((event, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      event.done ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-400"
                    }`}>
                      {event.done ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${event.done ? "text-slate-800" : "text-slate-400"}`}>
                        {event.label}
                      </p>
                      {event.date && (
                        <p className="text-xs text-slate-400">{fmtDate(event.date as string)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right — Sidebar Cards */}
        <div className="lg:col-span-2 space-y-4">
          {/* Property Card */}
          {listing.property && (
            <div className="bg-white border border-slate-200 rounded-xl">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Property</h3>
              </div>
              <div className="px-5 py-4">
                <Link
                  href={`/brokerage/listings/properties/${listing.property.id}`}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  {listing.property.name}
                </Link>
                {listing.property.landlordName && (
                  <p className="text-xs text-slate-500 mt-1">
                    Landlord: {listing.property.landlordName}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Agent Card */}
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Agent</h3>
              {!isTerminal && (
                <button
                  onClick={() => { setShowAssign(!showAssign); setAssignAgentId(listing.agentId || ""); }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {listing.agent ? "Reassign" : "Assign"}
                </button>
              )}
            </div>
            <div className="px-5 py-4">
              {listing.agent ? (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {listing.agent.firstName} {listing.agent.lastName}
                    </p>
                    <p className="text-xs text-slate-500">{listing.agent.email}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-sm text-amber-600 font-medium">Open Listing</p>
                  <p className="text-xs text-slate-400 mt-1">No agent assigned</p>
                </div>
              )}

              {showAssign && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
                  <select
                    value={assignAgentId}
                    onChange={(e) => setAssignAgentId(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="">Unassign</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAssign}
                    disabled={actionLoading}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Tenant Card (visible at application+ status) */}
          {(statusIdx >= 2 || listing.status === "leased") && (listing.tenantName || listing.tenantEmail) && (
            <div className="bg-white border border-slate-200 rounded-xl">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Tenant</h3>
              </div>
              <div className="px-5 py-4 space-y-2">
                {listing.tenantName && (
                  <div>
                    <p className="text-xs text-slate-500">Name</p>
                    <p className="text-sm font-medium text-slate-800">{listing.tenantName}</p>
                  </div>
                )}
                {listing.tenantEmail && (
                  <div>
                    <p className="text-xs text-slate-500">Email</p>
                    <p className="text-sm text-slate-700">{listing.tenantEmail}</p>
                  </div>
                )}
                {listing.tenantPhone && (
                  <div>
                    <p className="text-xs text-slate-500">Phone</p>
                    <p className="text-sm text-slate-700">{listing.tenantPhone}</p>
                  </div>
                )}
                {listing.leaseStartDate && (
                  <div>
                    <p className="text-xs text-slate-500">Lease Start</p>
                    <p className="text-sm text-slate-700">{fmtDate(listing.leaseStartDate)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transaction Link (visible when leased) */}
          {listing.transaction && (
            <div className="bg-white border border-slate-200 rounded-xl">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Transaction</h3>
              </div>
              <div className="px-5 py-4">
                <Link
                  href={`/brokerage/transactions/${listing.transaction.id}`}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                >
                  <FolderOpen className="w-4 h-4" />
                  View Transaction
                </Link>
                <span className="text-xs text-slate-400 mt-1 block">
                  Stage: {listing.transaction.stage}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lease-up Modal */}
      {showLeaseForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/30 animate-[fade-in_0.15s_ease-out]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 animate-[modal-in_0.2s_ease-out]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">Lease Up — Create Transaction</h2>
              <button onClick={() => setShowLeaseForm(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tenant Name *</label>
                <input
                  type="text"
                  value={leaseForm.tenantName}
                  onChange={(e) => setLeaseForm({ ...leaseForm, tenantName: e.target.value })}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={leaseForm.tenantEmail}
                    onChange={(e) => setLeaseForm({ ...leaseForm, tenantEmail: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={leaseForm.tenantPhone}
                    onChange={(e) => setLeaseForm({ ...leaseForm, tenantPhone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Lease Start Date</label>
                  <input
                    type="date"
                    value={leaseForm.leaseStartDate}
                    onChange={(e) => setLeaseForm({ ...leaseForm, leaseStartDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Commission Amount</label>
                  <input
                    type="number"
                    value={leaseForm.commissionAmount}
                    onChange={(e) => setLeaseForm({ ...leaseForm, commissionAmount: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
              <button
                onClick={() => setShowLeaseForm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleLeaseUp}
                disabled={!leaseForm.tenantName || leaseLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {leaseLoading ? "Creating..." : "Mark as Leased & Create Transaction"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky mobile action bar */}
      {canAdvance && (
        <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-safe md:hidden">
          <button
            onClick={handleAdvance}
            disabled={actionLoading}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl shadow-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Advance Status <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Detail Item ─────────────────────────────────────────────

function DetailItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className="w-3 h-3 text-slate-400" />
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}
