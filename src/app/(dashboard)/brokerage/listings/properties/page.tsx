"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  X,
  BarChart3,
  Home,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import {
  getPropertySummaries,
  createProperty,
} from "../actions";
import type { PropertySummary, BmsPropertyInput } from "@/lib/bms-types";

// ── Helpers ──────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(n);

// ── Component ────────────────────────────────────────────────

export default function PropertiesPage() {
  const router = useRouter();
  const [summaries, setSummaries] = useState<PropertySummary[]>([]);
  const [loading, setLoading] = useState(true);

  // New property modal
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<BmsPropertyInput>({ name: "" });
  const [creating, setCreating] = useState(false);

  async function loadData() {
    try {
      const data = await getPropertySummaries();
      setSummaries(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Computed stats
  const totalProperties = summaries.length;
  const totalUnits = summaries.reduce((acc, p) => acc + p.listingCount, 0);
  const totalAvailable = summaries.reduce((acc, p) => acc + p.availableCount, 0);
  const avgOccupancy = totalUnits > 0
    ? Math.round(summaries.reduce((acc, p) => acc + p.leasedCount, 0) / totalUnits * 100)
    : 0;

  async function handleCreate() {
    if (!newForm.name) return;
    setCreating(true);
    try {
      await createProperty(newForm);
      setShowNew(false);
      setNewForm({ name: "" });
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create property");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/40">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Properties</h1>
          <p className="text-sm text-slate-500">Vacancy dashboard and property management</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Property
        </button>
      </div>

      {/* Stats */}
      <div className="px-6 pb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Building2} label="Total Properties" value={totalProperties} color="text-blue-600" />
          <StatCard icon={Home} label="Total Units" value={totalUnits} color="text-slate-600" />
          <StatCard icon={CheckCircle2} label="Available Units" value={totalAvailable} color="text-green-600" />
          <StatCard icon={TrendingUp} label="Occupancy Rate" value={`${avgOccupancy}%`} color="text-emerald-600" />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Property Cards */}
      {!loading && (
        <div className="px-6 pb-6">
          {summaries.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600">No properties yet</p>
              <p className="text-xs text-slate-400 mt-1">Add a property to start tracking your inventory</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {summaries.map((p) => (
                <div
                  key={p.id}
                  className="bg-white border border-slate-200 rounded-xl hover:shadow-md hover:border-slate-300 transition-all"
                >
                  <div className="px-5 py-4">
                    <h3 className="text-sm font-semibold text-slate-800 mb-0.5">{p.name}</h3>
                    {p.address && (
                      <p className="text-xs text-slate-500 mb-1">{p.address}</p>
                    )}
                    {p.landlordName && (
                      <p className="text-xs text-slate-400">Landlord: {p.landlordName}</p>
                    )}

                    {/* Occupancy Bar */}
                    <div className="mt-3 mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-600">
                          {p.occupancyRate}% occupied
                        </span>
                        <span className="text-xs text-slate-400">
                          {p.listingCount} total
                        </span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                        {p.listingCount > 0 && (
                          <>
                            <div
                              className="bg-emerald-500 h-full"
                              style={{ width: `${(p.leasedCount / p.listingCount) * 100}%` }}
                            />
                            <div
                              className="bg-blue-400 h-full"
                              style={{ width: `${(p.inProgressCount / p.listingCount) * 100}%` }}
                            />
                            <div
                              className="bg-slate-200 h-full"
                              style={{ width: `${(p.availableCount / p.listingCount) * 100}%` }}
                            />
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          {p.leasedCount} leased
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-400" />
                          {p.inProgressCount} in progress
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-slate-200" />
                          {p.availableCount} avail
                        </span>
                      </div>
                    </div>

                    {/* Rent Range */}
                    {p.rentRange && (
                      <p className="text-xs text-slate-500 mt-2">
                        Rent: {fmt(p.rentRange.min)}{p.rentRange.max !== p.rentRange.min ? ` — ${fmt(p.rentRange.max)}` : ""}
                      </p>
                    )}
                  </div>

                  <div className="flex border-t border-slate-100">
                    <Link
                      href={`/brokerage/listings?propertyId=${p.id}`}
                      className="flex-1 px-4 py-2.5 text-xs font-medium text-blue-600 text-center hover:bg-blue-50 transition-colors"
                    >
                      View Listings
                    </Link>
                    <Link
                      href={`/brokerage/listings/properties/${p.id}`}
                      className="flex-1 px-4 py-2.5 text-xs font-medium text-slate-600 text-center hover:bg-slate-50 transition-colors border-l border-slate-100"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Property Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/30 animate-[fade-in_0.15s_ease-out]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 animate-[modal-in_0.2s_ease-out]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">Add Property</h2>
              <button onClick={() => setShowNew(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Property Name *</label>
                <input
                  type="text"
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  placeholder="e.g., Shore Haven Apartments"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Address</label>
                <input
                  type="text"
                  value={newForm.address || ""}
                  onChange={(e) => setNewForm({ ...newForm, address: e.target.value })}
                  placeholder="123 Main Street"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                  <input
                    type="text"
                    value={newForm.city || ""}
                    onChange={(e) => setNewForm({ ...newForm, city: e.target.value })}
                    placeholder="New York"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
                  <input
                    type="text"
                    value={newForm.state || ""}
                    onChange={(e) => setNewForm({ ...newForm, state: e.target.value })}
                    placeholder="NY"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Total Units</label>
                  <input
                    type="number"
                    value={newForm.totalUnits || ""}
                    onChange={(e) => setNewForm({ ...newForm, totalUnits: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Landlord Name</label>
                <input
                  type="text"
                  value={newForm.landlordName || ""}
                  onChange={(e) => setNewForm({ ...newForm, landlordName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Landlord Email</label>
                  <input
                    type="email"
                    value={newForm.landlordEmail || ""}
                    onChange={(e) => setNewForm({ ...newForm, landlordEmail: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Landlord Phone</label>
                  <input
                    type="tel"
                    value={newForm.landlordPhone || ""}
                    onChange={(e) => setNewForm({ ...newForm, landlordPhone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
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
                disabled={!newForm.name || creating}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Property"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  );
}
