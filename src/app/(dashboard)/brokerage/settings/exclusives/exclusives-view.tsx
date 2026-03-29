"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Building2,
  Plus,
  Search,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import {
  getExclusiveBuildings,
  createExclusiveBuilding,
  updateExclusiveBuilding,
  deleteExclusiveBuilding,
  toggleExclusiveFlag,
} from "./actions";
import type { BmsPropertyInput } from "@/lib/bms-types";

// ── Types ───────────────────────────────────────────────────

interface BuildingRow {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  landlordName?: string | null;
  landlordEmail?: string | null;
  landlordPhone?: string | null;
  managementCo?: string | null;
  totalUnits?: number | null;
  notes?: string | null;
  isExclusive: boolean;
  billingEntityName?: string | null;
  billingEntityAddress?: string | null;
  billingEntityEmail?: string | null;
  billingEntityPhone?: string | null;
  _listingCount?: number;
  _dealSubmissionCount?: number;
}

interface Props {
  initialData: Record<string, unknown>[];
  initialTotal: number;
  initialPage: number;
  initialTotalPages: number;
}

// ── Skeleton ────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-3 p-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 rounded-lg animate-shimmer" />
      ))}
    </div>
  );
}

// ── Component ───────────────────────────────────────────────

export default function ExclusivesView({
  initialData,
  initialTotal,
  initialPage,
  initialTotalPages,
}: Props) {
  const [buildings, setBuildings] = useState<BuildingRow[]>(initialData as unknown as BuildingRow[]);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEntered, setModalEntered] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<BuildingRow | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<BuildingRow | null>(null);
  const [deleteEntered, setDeleteEntered] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data Fetching ───────────────────────────────────────

  const fetchData = useCallback(
    async (p: number, q: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await getExclusiveBuildings({ page: p, limit: 25, search: q || undefined });
        if (result.success) {
          setBuildings((result.data ?? []) as unknown as BuildingRow[]);
          setTotal(result.total ?? 0);
          setPage(result.page ?? 1);
          setTotalPages(result.totalPages ?? 1);
        } else {
          setError(result.error ?? "Failed to load data");
        }
      } catch {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchData(1, value);
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Modal Helpers ───────────────────────────────────────

  const openCreateModal = () => {
    setEditingBuilding(null);
    setModalOpen(true);
    requestAnimationFrame(() => setModalEntered(true));
  };

  const openEditModal = (b: BuildingRow) => {
    setEditingBuilding(b);
    setModalOpen(true);
    requestAnimationFrame(() => setModalEntered(true));
  };

  const closeModal = () => {
    setModalEntered(false);
    setTimeout(() => {
      setModalOpen(false);
      setEditingBuilding(null);
    }, 200);
  };

  const openDeleteConfirm = (b: BuildingRow) => {
    setDeleteTarget(b);
    requestAnimationFrame(() => setDeleteEntered(true));
  };

  const closeDeleteConfirm = () => {
    setDeleteEntered(false);
    setTimeout(() => setDeleteTarget(null), 200);
  };

  // ── Handlers ────────────────────────────────────────────

  const handleSave = async (input: BmsPropertyInput) => {
    if (editingBuilding) {
      const result = await updateExclusiveBuilding(editingBuilding.id, input);
      if (!result.success) throw new Error(result.error);
    } else {
      const result = await createExclusiveBuilding(input);
      if (!result.success) throw new Error(result.error);
    }
    closeModal();
    await fetchData(page, search);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteExclusiveBuilding(deleteTarget.id);
      if (!result.success) {
        setError(result.error ?? "Failed to delete");
        closeDeleteConfirm();
        return;
      }
      closeDeleteConfirm();
      await fetchData(page, search);
    } catch {
      setError("Failed to delete building");
    } finally {
      setDeleting(false);
    }
  };

  const handleRemoveExclusive = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await toggleExclusiveFlag(deleteTarget.id, false);
      if (!result.success) {
        setError(result.error ?? "Failed to update");
        closeDeleteConfirm();
        return;
      }
      closeDeleteConfirm();
      await fetchData(page, search);
    } catch {
      setError("Failed to update building");
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <a
            href="/brokerage/settings"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Brokerage Settings
          </a>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-900">
                Exclusive Buildings
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                {total}
              </span>
            </div>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Building
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, address, landlord, or billing entity..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Content */}
        {loading && buildings.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200">
            <TableSkeleton />
          </div>
        ) : buildings.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-lg border border-slate-200 py-16 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-1">
              No exclusive buildings yet
            </h3>
            <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
              Add your brokerage&apos;s exclusive buildings. They&apos;ll appear
              as options when agents submit deals.
            </p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Building
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {loading && (
                <div className="h-0.5 bg-blue-100 overflow-hidden">
                  <div className="h-full w-1/3 bg-blue-500 animate-pulse" />
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="px-4 py-3 font-medium text-slate-500">Building Name</th>
                    <th className="px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Address</th>
                    <th className="px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Landlord</th>
                    <th className="px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Billing Entity</th>
                    <th className="px-4 py-3 font-medium text-slate-500 hidden md:table-cell text-right">Units</th>
                    <th className="px-4 py-3 font-medium text-slate-500 hidden md:table-cell text-right">Deals</th>
                    <th className="px-4 py-3 font-medium text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {buildings.map((b) => (
                    <tr
                      key={b.id}
                      className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{b.name}</div>
                        {/* Mobile: show address under name */}
                        <div className="text-xs text-slate-500 md:hidden">
                          {b.address}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                        {b.address}
                        {b.city && b.state && (
                          <span className="text-slate-400">
                            , {b.city}, {b.state} {b.zipCode || ""}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">
                        {b.landlordName || <span className="text-slate-300">--</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">
                        {b.billingEntityName || <span className="text-slate-300">--</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell text-right">
                        {b.totalUnits ?? "--"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell text-right">
                        {b._dealSubmissionCount ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(b)}
                            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openDeleteConfirm(b)}
                            className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-sm">
                <p className="text-slate-500">
                  Page {page} of {totalPages} ({total} building{total !== 1 ? "s" : ""})
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchData(page - 1, search)}
                    disabled={page <= 1 || loading}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <button
                    onClick={() => fetchData(page + 1, search)}
                    disabled={page >= totalPages || loading}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <BuildingModal
          building={editingBuilding}
          entered={modalEntered}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <DeleteConfirmModal
          building={deleteTarget}
          entered={deleteEntered}
          deleting={deleting}
          onClose={closeDeleteConfirm}
          onDelete={handleDelete}
          onRemoveExclusive={handleRemoveExclusive}
        />
      )}
    </div>
  );
}

// ── Building Modal ──────────────────────────────────────────

function BuildingModal({
  building,
  entered,
  onClose,
  onSave,
}: {
  building: BuildingRow | null;
  entered: boolean;
  onClose: () => void;
  onSave: (input: BmsPropertyInput) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState(building?.name ?? "");
  const [address, setAddress] = useState(building?.address ?? "");
  const [city, setCity] = useState(building?.city ?? "New York");
  const [state, setState] = useState(building?.state ?? "NY");
  const [zipCode, setZipCode] = useState(building?.zipCode ?? "");
  const [totalUnits, setTotalUnits] = useState(building?.totalUnits?.toString() ?? "");
  const [landlordName, setLandlordName] = useState(building?.landlordName ?? "");
  const [landlordEmail, setLandlordEmail] = useState(building?.landlordEmail ?? "");
  const [landlordPhone, setLandlordPhone] = useState(building?.landlordPhone ?? "");
  const [managementCo, setManagementCo] = useState(building?.managementCo ?? "");
  const [billingEntityName, setBillingEntityName] = useState(building?.billingEntityName ?? "");
  const [billingEntityAddress, setBillingEntityAddress] = useState(building?.billingEntityAddress ?? "");
  const [billingEntityEmail, setBillingEntityEmail] = useState(building?.billingEntityEmail ?? "");
  const [billingEntityPhone, setBillingEntityPhone] = useState(building?.billingEntityPhone ?? "");
  const [notes, setNotes] = useState(building?.notes ?? "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) { setFormError("Building name is required"); return; }
    if (!address.trim()) { setFormError("Address is required"); return; }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        address: address.trim(),
        city: city.trim() || "New York",
        state: state.trim() || "NY",
        zipCode: zipCode.trim() || undefined,
        totalUnits: totalUnits ? parseInt(totalUnits, 10) : undefined,
        landlordName: landlordName.trim() || undefined,
        landlordEmail: landlordEmail.trim() || undefined,
        landlordPhone: landlordPhone.trim() || undefined,
        managementCo: managementCo.trim() || undefined,
        billingEntityName: billingEntityName.trim() || undefined,
        billingEntityAddress: billingEntityAddress.trim() || undefined,
        billingEntityEmail: billingEntityEmail.trim() || undefined,
        billingEntityPhone: billingEntityPhone.trim() || undefined,
        notes: notes.trim() || undefined,
        isExclusive: true,
      });
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 transition-opacity duration-200 ${entered ? "opacity-100" : "opacity-0"}`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div
        className={`relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4 transition-transform duration-200 ${entered ? "scale-100" : "scale-95"}`}
        style={{ animation: entered ? "modal-in 0.2s ease-out" : undefined }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <h2 className="text-lg font-semibold text-slate-900">
            {building ? "Edit Building" : "Add Exclusive Building"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {formError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          {/* Building Info */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700 mb-3">
              Building Info
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Shore Haven"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="2840 Shore Parkway"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">State</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Zip Code</label>
                  <input
                    type="text"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Total Units</label>
                <input
                  type="number"
                  value={totalUnits}
                  onChange={(e) => setTotalUnits(e.target.value)}
                  min="0"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </fieldset>

          {/* Landlord / Management */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700 mb-3">
              Landlord / Management
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Landlord Name</label>
                <input
                  type="text"
                  value={landlordName}
                  onChange={(e) => setLandlordName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Landlord Email</label>
                <input
                  type="email"
                  value={landlordEmail}
                  onChange={(e) => setLandlordEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Landlord Phone</label>
                <input
                  type="tel"
                  value={landlordPhone}
                  onChange={(e) => setLandlordPhone(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Management Company</label>
                <input
                  type="text"
                  value={managementCo}
                  onChange={(e) => setManagementCo(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </fieldset>

          {/* Billing Entity */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700 mb-3">
              Billing Entity <span className="text-xs font-normal text-slate-400">(for invoicing)</span>
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Billing Entity Name
                </label>
                <input
                  type="text"
                  value={billingEntityName}
                  onChange={(e) => setBillingEntityName(e.target.value)}
                  placeholder="Who the invoice is addressed to"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-600 mb-1">Billing Entity Address</label>
                <input
                  type="text"
                  value={billingEntityAddress}
                  onChange={(e) => setBillingEntityAddress(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Billing Entity Email</label>
                <input
                  type="email"
                  value={billingEntityEmail}
                  onChange={(e) => setBillingEntityEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Billing Entity Phone</label>
                <input
                  type="tel"
                  value={billingEntityPhone}
                  onChange={(e) => setBillingEntityPhone(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </fieldset>

          {/* Notes */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700 mb-3">Notes</legend>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </fieldset>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg px-5 py-2 transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {building ? "Save Changes" : "Add Building"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirmation Modal ───────────────────────────────

function DeleteConfirmModal({
  building,
  entered,
  deleting,
  onClose,
  onDelete,
  onRemoveExclusive,
}: {
  building: BuildingRow;
  entered: boolean;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
  onRemoveExclusive: () => void;
}) {
  const hasSubmissions = (building._dealSubmissionCount ?? 0) > 0;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${entered ? "opacity-100" : "opacity-0"}`}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className={`relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 transition-transform duration-200 ${entered ? "scale-100" : "scale-95"}`}
        style={{ animation: entered ? "modal-in 0.2s ease-out" : undefined }}
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900">
              {hasSubmissions ? "Cannot Delete Building" : "Delete Building"}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {hasSubmissions ? (
                <>
                  <strong>{building.name}</strong> has{" "}
                  {building._dealSubmissionCount} deal submission
                  {building._dealSubmissionCount !== 1 ? "s" : ""} linked to it.
                  You can remove the exclusive flag instead.
                </>
              ) : (
                <>
                  Are you sure you want to delete{" "}
                  <strong>{building.name}</strong>? This action cannot be undone.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          {hasSubmissions ? (
            <button
              onClick={onRemoveExclusive}
              disabled={deleting}
              className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
              Remove Exclusive Flag
            </button>
          ) : (
            <button
              onClick={onDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
