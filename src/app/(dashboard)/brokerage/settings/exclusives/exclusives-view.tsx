"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import Link from "next/link";
import type { BmsPropertyInput } from "@/lib/bms-types";
import {
  getExclusiveBuildings,
  createExclusiveBuilding,
  updateExclusiveBuilding,
  deleteExclusiveBuilding,
  toggleExclusiveFlag,
} from "./actions";

// ── Types ────────────────────────────────────────────────────

interface ExclusiveBuilding {
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
  billingEntityName?: string | null;
  billingEntityAddress?: string | null;
  billingEntityEmail?: string | null;
  billingEntityPhone?: string | null;
  totalUnits?: number | null;
  notes?: string | null;
  isExclusive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: {
    listings: number;
    dealSubmissions: number;
  };
}

interface PageData {
  data: ExclusiveBuilding[];
  total: number;
  page: number;
  totalPages: number;
}

// ── Component ────────────────────────────────────────────────

export default function ExclusivesView({
  initialData,
}: {
  initialData: PageData;
}) {
  const [buildings, setBuildings] = useState<ExclusiveBuilding[]>(
    initialData.data,
  );
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const [totalPages, setTotalPages] = useState(initialData.totalPages);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingBuilding, setEditingBuilding] =
    useState<ExclusiveBuilding | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<ExclusiveBuilding | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch Data ──────────────────────────────────────────────

  const fetchData = useCallback(
    async (searchVal: string, pageVal: number) => {
      setLoading(true);
      setError(null);
      try {
        const result = await getExclusiveBuildings({
          search: searchVal || undefined,
          page: pageVal,
          limit: 25,
        });
        setBuildings(result.data);
        setTotal(result.total);
        setPage(result.page);
        setTotalPages(result.totalPages);
      } catch {
        setError("Failed to load exclusive buildings");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // ── Search Debounce ─────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchData(search, 1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, fetchData]);

  // ── Modal Handlers ──────────────────────────────────────────

  function openAddModal() {
    setEditingBuilding(null);
    setShowModal(true);
  }

  function openEditModal(building: ExclusiveBuilding) {
    setEditingBuilding(building);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingBuilding(null);
  }

  async function handleSave(input: BmsPropertyInput) {
    setSaving(true);
    setError(null);
    try {
      const result = editingBuilding
        ? await updateExclusiveBuilding(editingBuilding.id, input)
        : await createExclusiveBuilding(input);

      if (!result.success) {
        setError(result.error || "Save failed");
        setSaving(false);
        return;
      }
      closeModal();
      await fetchData(search, page);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete Handlers ─────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteExclusiveBuilding(deleteTarget.id);
      if (!result.success) {
        // If it has submissions, the modal will show alternative
        if (result.hasSubmissions) {
          setDeleting(false);
          return;
        }
        setError(result.error || "Delete failed");
        setDeleting(false);
        return;
      }
      setDeleteTarget(null);
      await fetchData(search, page);
    } catch {
      setError("Failed to delete building");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRemoveExclusiveFlag() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await toggleExclusiveFlag(deleteTarget.id, false);
      if (!result.success) {
        setError(result.error || "Failed to remove exclusive flag");
        setDeleting(false);
        return;
      }
      setDeleteTarget(null);
      await fetchData(search, page);
    } catch {
      setError("Failed to update building");
    } finally {
      setDeleting(false);
    }
  }

  // ── Pagination ──────────────────────────────────────────────

  function goToPage(p: number) {
    if (p < 1 || p > totalPages) return;
    fetchData(search, p);
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/brokerage/settings"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">
                Exclusive Buildings
              </h1>
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                {total}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              Manage buildings with exclusive brokerage agreements
            </p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Building
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, address, landlord, or billing entity..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-shimmer rounded-lg bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 bg-[length:200%_100%]"
            />
          ))}
        </div>
      )}

      {/* Table */}
      {!loading && buildings.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-medium text-slate-600">
                    Building Name
                  </th>
                  <th className="hidden px-4 py-3 font-medium text-slate-600 md:table-cell">
                    Address
                  </th>
                  <th className="hidden px-4 py-3 font-medium text-slate-600 md:table-cell">
                    Landlord
                  </th>
                  <th className="hidden px-4 py-3 font-medium text-slate-600 lg:table-cell">
                    Billing Entity
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">
                    Units
                  </th>
                  <th className="hidden px-4 py-3 text-right font-medium text-slate-600 sm:table-cell">
                    Deals
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {buildings.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {b.name}
                      </div>
                      <div className="text-xs text-slate-500 md:hidden">
                        {b.address}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                      <div>{b.address}</div>
                      {(b.city || b.state || b.zipCode) && (
                        <div className="text-xs text-slate-400">
                          {[b.city, b.state, b.zipCode]
                            .filter(Boolean)
                            .join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                      {b.landlordName || (
                        <span className="text-slate-300">--</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">
                      {b.billingEntityName || (
                        <span className="text-slate-300">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {b.totalUnits ?? "--"}
                    </td>
                    <td className="hidden px-4 py-3 text-right text-slate-600 sm:table-cell">
                      {b._count.dealSubmissions}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(b)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                          title="Edit building"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(b)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Delete building"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && buildings.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white py-16">
          <Building2 className="h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-base font-medium text-slate-900">
            No exclusive buildings
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {search
              ? "No buildings match your search criteria."
              : "Add your first exclusive building to get started."}
          </p>
          {!search && (
            <button
              onClick={openAddModal}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Building
            </button>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Showing {(page - 1) * 25 + 1}--
            {Math.min(page * 25, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <span className="px-2 text-sm text-slate-500">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <BuildingModal
          building={editingBuilding}
          saving={saving}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          building={deleteTarget}
          deleting={deleting}
          onDelete={handleDelete}
          onRemoveFlag={handleRemoveExclusiveFlag}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Building Form Modal ──────────────────────────────────────

function BuildingModal({
  building,
  saving,
  onSave,
  onClose,
}: {
  building: ExclusiveBuilding | null;
  saving: boolean;
  onSave: (input: BmsPropertyInput) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<BmsPropertyInput>({
    name: building?.name || "",
    address: building?.address || "",
    city: building?.city || "New York",
    state: building?.state || "NY",
    zipCode: building?.zipCode || "",
    landlordName: building?.landlordName || "",
    landlordEmail: building?.landlordEmail || "",
    landlordPhone: building?.landlordPhone || "",
    managementCo: building?.managementCo || "",
    billingEntityName: building?.billingEntityName || "",
    billingEntityAddress: building?.billingEntityAddress || "",
    billingEntityEmail: building?.billingEntityEmail || "",
    billingEntityPhone: building?.billingEntityPhone || "",
    totalUnits: building?.totalUnits ?? undefined,
    notes: building?.notes || "",
  });

  function update(field: keyof BmsPropertyInput, value: string | number | undefined) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl animate-[modal-in_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {building ? "Edit Building" : "Add Exclusive Building"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Section 1: Building Info */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-700">
              Building Information
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Building Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="e.g. The Wellington"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.address || ""}
                  onChange={(e) => update("address", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="123 Main St"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  City
                </label>
                <input
                  type="text"
                  value={form.city || ""}
                  onChange={(e) => update("city", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    State
                  </label>
                  <input
                    type="text"
                    value={form.state || ""}
                    onChange={(e) => update("state", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    ZIP
                  </label>
                  <input
                    type="text"
                    value={form.zipCode || ""}
                    onChange={(e) => update("zipCode", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Total Units
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.totalUnits ?? ""}
                  onChange={(e) =>
                    update(
                      "totalUnits",
                      e.target.value ? parseInt(e.target.value, 10) : undefined,
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </fieldset>

          {/* Section 2: Landlord / Management */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-700">
              Landlord / Management
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Landlord Name
                </label>
                <input
                  type="text"
                  value={form.landlordName || ""}
                  onChange={(e) => update("landlordName", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Management Company
                </label>
                <input
                  type="text"
                  value={form.managementCo || ""}
                  onChange={(e) => update("managementCo", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Landlord Email
                </label>
                <input
                  type="email"
                  value={form.landlordEmail || ""}
                  onChange={(e) => update("landlordEmail", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Landlord Phone
                </label>
                <input
                  type="tel"
                  value={form.landlordPhone || ""}
                  onChange={(e) => update("landlordPhone", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </fieldset>

          {/* Section 3: Billing Entity */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-700">
              Billing Entity (for invoicing)
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Entity Name
                </label>
                <input
                  type="text"
                  value={form.billingEntityName || ""}
                  onChange={(e) => update("billingEntityName", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Entity Email
                </label>
                <input
                  type="email"
                  value={form.billingEntityEmail || ""}
                  onChange={(e) => update("billingEntityEmail", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Entity Address
                </label>
                <input
                  type="text"
                  value={form.billingEntityAddress || ""}
                  onChange={(e) =>
                    update("billingEntityAddress", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Entity Phone
                </label>
                <input
                  type="tel"
                  value={form.billingEntityPhone || ""}
                  onChange={(e) =>
                    update("billingEntityPhone", e.target.value)
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </fieldset>

          {/* Section 4: Notes */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-700">
              Notes
            </legend>
            <textarea
              rows={3}
              value={form.notes || ""}
              onChange={(e) => update("notes", e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Internal notes about this exclusive agreement..."
            />
          </fieldset>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {building ? "Save Changes" : "Add Building"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirmation Modal ────────────────────────────────

function DeleteConfirmModal({
  building,
  deleting,
  onDelete,
  onRemoveFlag,
  onClose,
}: {
  building: ExclusiveBuilding;
  deleting: boolean;
  onDelete: () => void;
  onRemoveFlag: () => void;
  onClose: () => void;
}) {
  const hasSubmissions = building._count.dealSubmissions > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl animate-[modal-in_0.2s_ease-out]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {hasSubmissions ? "Cannot Delete Building" : "Delete Building"}
            </h3>
            {hasSubmissions ? (
              <p className="mt-2 text-sm text-slate-600">
                <strong>{building.name}</strong> has{" "}
                {building._count.dealSubmissions} deal submission
                {building._count.dealSubmissions === 1 ? "" : "s"} and cannot be
                deleted. You can remove the exclusive flag instead, which will
                keep the building record but remove it from this list.
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                Are you sure you want to permanently delete{" "}
                <strong>{building.name}</strong>? This action cannot be undone.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          {hasSubmissions ? (
            <button
              onClick={onRemoveFlag}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Remove Exclusive Flag
            </button>
          ) : (
            <button
              onClick={onDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete Building
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
