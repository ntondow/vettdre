"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Edit3,
  Save,
  Plus,
  Building2,
  User,
  Mail,
  Phone,
} from "lucide-react";
import {
  getProperty,
  updateProperty,
  getListings,
} from "../../actions";
import {
  LISTING_STATUS_LABELS,
  LISTING_STATUS_COLORS,
} from "@/lib/bms-types";
import type { BmsPropertyRecord, BmsListingRecord } from "@/lib/bms-types";

// ── Helpers ──────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(n);

// ── Component ────────────────────────────────────────────────

export default function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [property, setProperty] = useState<BmsPropertyRecord | null>(null);
  const [listings, setListings] = useState<BmsListingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Editing
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      const [p, l] = await Promise.all([
        getProperty(id),
        getListings({ propertyId: id }),
      ]);
      setProperty(p);
      setListings(l);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Property not found");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEditing() {
    if (!property) return;
    setEditForm({
      name: property.name,
      address: property.address || "",
      city: property.city || "",
      state: property.state || "",
      zipCode: property.zipCode || "",
      landlordName: property.landlordName || "",
      landlordEmail: property.landlordEmail || "",
      landlordPhone: property.landlordPhone || "",
      managementCo: property.managementCo || "",
      totalUnits: property.totalUnits || "",
      notes: property.notes || "",
    });
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateProperty(id, editForm as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      setProperty(updated);
      setEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-40 bg-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="p-6">
        <Link href="/brokerage/listings/properties" className="flex items-center gap-1 text-sm text-blue-600 hover:underline mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Properties
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error || "Property not found"}
        </div>
      </div>
    );
  }

  // Computed stats
  const available = listings.filter((l) => l.status === "available").length;
  const leased = listings.filter((l) => l.status === "leased").length;
  const inProgress = listings.filter((l) => ["showing", "application", "approved"].includes(l.status)).length;
  const occupancy = listings.length > 0 ? Math.round((leased / listings.length) * 100) : 0;

  // Rent summary by bedroom
  const rentByBedroom: Record<string, number[]> = {};
  for (const l of listings) {
    if (l.rentPrice) {
      const key = l.bedrooms || "Unknown";
      if (!rentByBedroom[key]) rentByBedroom[key] = [];
      rentByBedroom[key].push(Number(l.rentPrice));
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/40">
      <div className="px-6 pt-6 pb-4">
        <Link href="/brokerage/listings/properties" className="flex items-center gap-1 text-sm text-blue-600 hover:underline mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to Properties
        </Link>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{property.name}</h1>
            {property.address && <p className="text-sm text-slate-500">{property.address}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/brokerage/listings?propertyId=${property.id}`}
              className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
            >
              View All Listings
            </Link>
            {!editing ? (
              <button onClick={startEditing} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                <Edit3 className="w-4 h-4" /> Edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => setEditing(false)} className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  <Save className="w-4 h-4" /> Save
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Info + Listings */}
        <div className="lg:col-span-2 space-y-4">
          {/* Property Info */}
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Property Info</h3>
            </div>
            <div className="px-5 py-4">
              {!editing ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <InfoItem icon={Building2} label="Name" value={property.name} />
                  <InfoItem icon={Building2} label="Address" value={property.address || "\u2014"} />
                  <InfoItem icon={Building2} label="Total Units" value={property.totalUnits?.toString() || "\u2014"} />
                  <InfoItem icon={User} label="Landlord" value={property.landlordName || "\u2014"} />
                  <InfoItem icon={Mail} label="Landlord Email" value={property.landlordEmail || "\u2014"} />
                  <InfoItem icon={Phone} label="Landlord Phone" value={property.landlordPhone || "\u2014"} />
                  {property.managementCo && (
                    <InfoItem icon={Building2} label="Management Co." value={property.managementCo} />
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {([
                    { key: "name", label: "Name" },
                    { key: "address", label: "Address" },
                    { key: "city", label: "City" },
                    { key: "state", label: "State" },
                    { key: "zipCode", label: "Zip" },
                    { key: "totalUnits", label: "Total Units", type: "number" },
                    { key: "landlordName", label: "Landlord Name" },
                    { key: "landlordEmail", label: "Landlord Email" },
                    { key: "landlordPhone", label: "Landlord Phone" },
                    { key: "managementCo", label: "Management Co." },
                  ] as const).map(({ key, label, ...rest }) => (
                    <div key={key}>
                      <label className="block text-xs text-slate-500 mb-1">{label}</label>
                      <input
                        type={(rest as any).type || "text"} // eslint-disable-line @typescript-eslint/no-explicit-any
                        value={String(editForm[key] || "")}
                        onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                        className="w-full px-3 py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                  ))}
                  <div className="col-span-2 md:col-span-3">
                    <label className="block text-xs text-slate-500 mb-1">Notes</label>
                    <textarea
                      value={String(editForm.notes || "")}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Listings Table */}
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">
                Listings ({listings.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100">
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Address</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Status</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-500">Rent</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 hidden md:table-cell">Beds</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 hidden md:table-cell">Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => (
                    <tr
                      key={l.id}
                      onClick={() => router.push(`/brokerage/listings/${l.id}`)}
                      className="border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer"
                    >
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-800">
                        {l.address}{l.unit ? ` ${l.unit}` : ""}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${LISTING_STATUS_COLORS[l.status]}`}>
                          {LISTING_STATUS_LABELS[l.status]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-700">
                        {l.rentPrice ? fmt(Number(l.rentPrice)) : "\u2014"}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-500 hidden md:table-cell">
                        {l.bedrooms || "\u2014"}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-500 hidden md:table-cell">
                        {l.agent ? `${l.agent.firstName} ${l.agent.lastName}` : (
                          <span className="text-xs text-amber-600 font-medium">Open</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {listings.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                        No listings for this property
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right — Summary */}
        <div className="space-y-4">
          {/* Vacancy Summary */}
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Vacancy Summary</h3>
            </div>
            <div className="px-5 py-4">
              <div className="text-center mb-3">
                <p className="text-3xl font-bold text-slate-800">{occupancy}%</p>
                <p className="text-xs text-slate-500">Occupancy Rate</p>
              </div>

              <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex mb-3">
                {listings.length > 0 && (
                  <>
                    <div className="bg-emerald-500 h-full" style={{ width: `${(leased / listings.length) * 100}%` }} />
                    <div className="bg-blue-400 h-full" style={{ width: `${(inProgress / listings.length) * 100}%` }} />
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                <SummaryRow color="bg-emerald-500" label="Leased" value={leased} />
                <SummaryRow color="bg-blue-400" label="In Progress" value={inProgress} />
                <SummaryRow color="bg-slate-200" label="Available" value={available} />
                <div className="pt-1.5 mt-1.5 border-t border-slate-100">
                  <SummaryRow color="" label="Total" value={listings.length} bold />
                </div>
              </div>
            </div>
          </div>

          {/* Rent Summary */}
          {Object.keys(rentByBedroom).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Rent by Bedroom</h3>
              </div>
              <div className="px-5 py-4 space-y-2">
                {Object.entries(rentByBedroom)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([bed, rents]) => {
                    const min = Math.min(...rents);
                    const max = Math.max(...rents);
                    const avg = Math.round(rents.reduce((a, b) => a + b, 0) / rents.length);
                    return (
                      <div key={bed} className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">
                          {bed === "Studio" ? "Studio" : `${bed} BR`}
                        </span>
                        <span className="text-sm font-medium text-slate-800">
                          {min === max ? fmt(min) : `${fmt(min)} — ${fmt(max)}`}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) { // eslint-disable-line @typescript-eslint/no-explicit-any
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

function SummaryRow({ color, label, value, bold }: { color: string; label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {color && <span className={`w-2.5 h-2.5 rounded-full ${color}`} />}
        <span className={`text-sm ${bold ? "font-semibold text-slate-800" : "text-slate-600"}`}>{label}</span>
      </div>
      <span className={`text-sm ${bold ? "font-semibold text-slate-800" : "text-slate-700"}`}>{value}</span>
    </div>
  );
}
