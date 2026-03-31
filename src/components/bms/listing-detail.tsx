"use client";

import { useState } from "react";
import { X, Edit2, Save, AlertCircle } from "lucide-react";
import {
  LISTING_STATUS_LABELS,
  LISTING_STATUS_COLORS,
  LISTING_STATUS_SEQUENCE,
  COMMISSION_TYPE_LABELS,
} from "@/lib/bms-types";
import type { BmsListingRecord, BmsListingStatusType, BmsCommissionTypeAlias } from "@/lib/bms-types";

const fmt = (n?: number) => {
  if (!n) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(n);
};

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

const BEDROOM_OPTIONS = ["Studio", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4+"];
const BATHROOM_OPTIONS = ["1", "1.5", "2", "2.5", "3+"];

interface ListingDetailProps {
  listing: BmsListingRecord;
  agents: Array<{ id: string; firstName: string; lastName: string }>;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<BmsListingRecord>) => Promise<void>;
  onStatusChange: (id: string, newStatus: BmsListingStatusType) => Promise<void>;
}

export default function ListingDetail({
  listing,
  agents,
  onClose,
  onUpdate,
  onStatusChange,
}: ListingDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [formData, setFormData] = useState({
    rentPrice: listing.rentPrice,
    askingPrice: listing.askingPrice,
    status: listing.status,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    sqft: listing.sqft,
    description: listing.description,
    availableDate: listing.availableDate,
    commissionType: listing.commissionType,
    commissionPct: listing.commissionPct,
    agentId: listing.agentId,
    notes: listing.notes,
  });

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      // Check if status changed
      if (formData.status !== listing.status) {
        await onStatusChange(listing.id, formData.status as BmsListingStatusType);
      }

      // Update other fields
      const updateData = {
        rentPrice: formData.rentPrice,
        askingPrice: formData.askingPrice,
        bedrooms: formData.bedrooms,
        bathrooms: formData.bathrooms,
        sqft: formData.sqft,
        description: formData.description,
        availableDate: formData.availableDate,
        commissionType: formData.commissionType as BmsCommissionTypeAlias,
        commissionPct: formData.commissionPct,
        agentId: formData.agentId,
        notes: formData.notes,
      };

      await onUpdate(listing.id, updateData);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save listing");
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    setFormData({
      rentPrice: listing.rentPrice,
      askingPrice: listing.askingPrice,
      status: listing.status,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      sqft: listing.sqft,
      description: listing.description,
      availableDate: listing.availableDate,
      commissionType: listing.commissionType,
      commissionPct: listing.commissionPct,
      agentId: listing.agentId,
      notes: listing.notes,
    });
    setIsEditing(false);
    setError(null);
  }

  // Status progress dots
  const statusIdx = LISTING_STATUS_SEQUENCE.indexOf(listing.status);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 animate-[fade-in_0.15s_ease-out]"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 z-50 h-screen w-full max-w-2xl bg-white shadow-2xl overflow-y-auto animate-[slide-in-right_0.3s_ease-out] md:animate-[slide-in_0.3s_ease-out]">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="flex items-start justify-between p-5">
            <div className="flex-1 pr-4">
              <h2 className="text-xl font-semibold text-slate-800">
                {listing.address}
                {listing.unit && <span className="font-normal text-slate-500"> {listing.unit}</span>}
              </h2>
              {listing.property?.name && (
                <p className="text-sm text-slate-500 mt-1">{listing.property.name}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Status Pipeline */}
          <div className="px-5 pb-4 flex items-center gap-2">
            {LISTING_STATUS_SEQUENCE.map((s, i) => (
              <div
                key={s}
                className="flex flex-col items-center gap-1 flex-1"
              >
                <div
                  className={`w-3 h-3 rounded-full transition-all ${
                    listing.status === "off_market"
                      ? "bg-slate-300"
                      : i < statusIdx
                        ? "bg-blue-500"
                        : i === statusIdx
                          ? "bg-blue-500 ring-2 ring-blue-200"
                          : "bg-slate-200"
                  }`}
                  title={LISTING_STATUS_LABELS[s]}
                />
                <span className="text-[10px] text-slate-500 text-center leading-tight">
                  {LISTING_STATUS_LABELS[s]}
                </span>
              </div>
            ))}
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className={`w-3 h-3 rounded-full ${
                listing.status === "off_market"
                  ? "bg-slate-400 ring-2 ring-slate-200"
                  : "bg-slate-200"
              }`} />
              <span className="text-[10px] text-slate-500 text-center leading-tight">
                {LISTING_STATUS_LABELS.off_market}
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6">
          {/* Error message */}
          {error && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* View Mode */}
          {!isEditing ? (
            <>
              {/* Status Badge */}
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Status</p>
                <span
                  className={`inline-flex px-3 py-1.5 text-sm font-medium rounded-full ${
                    LISTING_STATUS_COLORS[listing.status]
                  }`}
                >
                  {LISTING_STATUS_LABELS[listing.status]}
                </span>
              </div>

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">
                    {listing.type === "rental" ? "Monthly Rent" : "Asking Price"}
                  </p>
                  <p className="text-lg font-bold text-slate-800">
                    {listing.type === "rental" ? fmt(listing.rentPrice) : fmt(listing.askingPrice)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Available Date</p>
                  <p className="text-base text-slate-800">{fmtDate(listing.availableDate)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Bedrooms</p>
                  <p className="text-base text-slate-800">
                    {listing.bedrooms === "Studio" ? "Studio" : listing.bedrooms || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Bathrooms</p>
                  <p className="text-base text-slate-800">{listing.bathrooms || "—"}</p>
                </div>
              </div>

              {/* Size & Floor */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Square Feet</p>
                  <p className="text-base text-slate-800">
                    {listing.sqft ? listing.sqft.toLocaleString() : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Floor</p>
                  <p className="text-base text-slate-800">{listing.floor || "—"}</p>
                </div>
              </div>

              {/* Commission Info */}
              <div className="border-t border-slate-100 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">Commission Type</p>
                    <p className="text-sm text-slate-800">
                      {listing.commissionType
                        ? COMMISSION_TYPE_LABELS[listing.commissionType]
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">Commission %</p>
                    <p className="text-sm text-slate-800">{listing.commissionPct || "—"}%</p>
                  </div>
                </div>
              </div>

              {/* Agent Assignment */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 mb-2">Assigned Agent</p>
                {listing.agent ? (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-sm font-medium text-slate-800">
                      {listing.agent.firstName} {listing.agent.lastName}
                    </p>
                    <p className="text-xs text-slate-500">{listing.agent.email}</p>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-amber-700">Open — No Agent Assigned</p>
                  </div>
                )}
              </div>

              {/* Description */}
              {listing.description && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Description</p>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {listing.description}
                  </p>
                </div>
              )}

              {/* Notes */}
              {listing.notes && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Notes</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{listing.notes}</p>
                </div>
              )}

              {/* Timestamps */}
              <div className="border-t border-slate-100 pt-4 space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-xs text-slate-500">Created</p>
                  <p className="text-xs text-slate-600">{fmtDate(listing.createdAt)}</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-xs text-slate-500">Last Updated</p>
                  <p className="text-xs text-slate-600">{fmtDate(listing.updatedAt)}</p>
                </div>
              </div>
            </>
          ) : (
            /* Edit Mode */
            <>
              {/* Status Select */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as BmsListingStatusType })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {LISTING_STATUS_SEQUENCE.map((s) => (
                    <option key={s} value={s}>
                      {LISTING_STATUS_LABELS[s]}
                    </option>
                  ))}
                  <option value="off_market">{LISTING_STATUS_LABELS.off_market}</option>
                </select>
              </div>

              {/* Price */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  {listing.type === "rental" ? "Monthly Rent" : "Asking Price"}
                </label>
                <input
                  type="number"
                  value={listing.type === "rental" ? formData.rentPrice || "" : formData.askingPrice || ""}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : undefined;
                    if (listing.type === "rental") {
                      setFormData({ ...formData, rentPrice: val });
                    } else {
                      setFormData({ ...formData, askingPrice: val });
                    }
                  }}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              {/* Beds / Baths */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">Bedrooms</label>
                  <select
                    value={formData.bedrooms || ""}
                    onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value || undefined })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="">—</option>
                    {BEDROOM_OPTIONS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">Bathrooms</label>
                  <select
                    value={formData.bathrooms || ""}
                    onChange={(e) => setFormData({ ...formData, bathrooms: e.target.value || undefined })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="">—</option>
                    {BATHROOM_OPTIONS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Square Feet */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Square Feet</label>
                <input
                  type="number"
                  value={formData.sqft || ""}
                  onChange={(e) => setFormData({ ...formData, sqft: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              {/* Available Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Available Date</label>
                <input
                  type="date"
                  value={formData.availableDate || ""}
                  onChange={(e) => setFormData({ ...formData, availableDate: e.target.value || undefined })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Description</label>
                <textarea
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value || undefined })}
                  placeholder="Unit description, amenities, etc."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none"
                />
              </div>

              {/* Commission */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">Commission Type</label>
                  <select
                    value={formData.commissionType || ""}
                    onChange={(e) => setFormData({ ...formData, commissionType: e.target.value as BmsCommissionTypeAlias | undefined })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="">—</option>
                    <option value="one_month">{COMMISSION_TYPE_LABELS.one_month}</option>
                    <option value="percentage">{COMMISSION_TYPE_LABELS.percentage}</option>
                    <option value="flat">{COMMISSION_TYPE_LABELS.flat}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">Commission %</label>
                  <input
                    type="number"
                    value={formData.commissionPct || ""}
                    onChange={(e) => setFormData({ ...formData, commissionPct: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Agent Assignment */}
              <div className="border-t border-slate-100 pt-4">
                <label className="block text-xs font-semibold text-slate-600 mb-2">Assigned Agent</label>
                <select
                  value={formData.agentId || ""}
                  onChange={(e) => setFormData({ ...formData, agentId: e.target.value || undefined })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                >
                  <option value="">Unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.firstName} {a.lastName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div className="border-t border-slate-100 pt-4">
                <label className="block text-xs font-semibold text-slate-600 mb-2">Notes</label>
                <textarea
                  value={formData.notes || ""}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value || undefined })}
                  placeholder="Internal notes..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none"
                />
              </div>
            </>
          )}

          {/* Footer Actions */}
          <div className="border-t border-slate-100 pt-4 flex gap-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            ) : (
              <>
                <button
                  onClick={handleCancel}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
