"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createList,
  deleteList,
  getListItems,
  updateItemStatus,
  removeItem,
  convertToContact,
  createDealFromItem,
  exportListCSV,
  bulkEnrichProspects,
  bulkEnrichProspectContacts,
  getUnenrichedContactCount,
} from "./actions";

interface List {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  _count: { items: number };
  creator: { fullName: string };
}

interface Item {
  id: string;
  address: string;
  borough: string | null;
  zip: string | null;
  block: string | null;
  lot: string | null;
  totalUnits: number | null;
  yearBuilt: number | null;
  numFloors: number | null;
  buildingArea: number | null;
  buildingClass: string | null;
  zoning: string | null;
  assessedValue: number | null;
  ownerName: string | null;
  ownerAddress: string | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  contactId: string | null;
  dealId: string | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  deal: { id: string; name: string; status: string } | null;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-50 text-blue-700",
  contacted: "bg-purple-50 text-purple-700",
  qualified: "bg-amber-50 text-amber-700",
  converted: "bg-emerald-50 text-emerald-700",
  skipped: "bg-slate-100 text-slate-400",
};

const fmtPrice = (n: number | null) => (n && n > 0 ? `$${n.toLocaleString()}` : "—");
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
  } catch {
    return d;
  }
};

export default function ProspectingDashboard({ lists }: { lists: List[] }) {
  const router = useRouter();
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");
  const [convertModal, setConvertModal] = useState<string | null>(null);
  const [dealModal, setDealModal] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<{ total: number; enriched: number } | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [contactEnriching, setContactEnriching] = useState(false);
  const [contactEnrichProgress, setContactEnrichProgress] = useState<{ total: number; completed: number; enriched: number } | null>(null);
  const [unenrichedCount, setUnenrichedCount] = useState<number | null>(null);

  const loadItems = async (listId: string) => {
    setLoadingItems(true);
    try {
      const data = await getListItems(listId);
      setItems(JSON.parse(JSON.stringify(data)));
    } catch {
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    if (selectedList) {
      loadItems(selectedList);
      getUnenrichedContactCount(selectedList).then(setUnenrichedCount).catch(() => setUnenrichedCount(null));
    }
  }, [selectedList]);

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    await createList(newListName.trim(), newListDesc.trim() || undefined);
    setShowNewList(false);
    setNewListName("");
    setNewListDesc("");
    router.refresh();
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm("Delete this list and all its items?")) return;
    await deleteList(listId);
    if (selectedList === listId) {
      setSelectedList(null);
      setItems([]);
    }
    router.refresh();
  };

  const handleStatusChange = async (itemId: string, status: string) => {
    await updateItemStatus(itemId, status);
    if (selectedList) loadItems(selectedList);
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!confirm("Remove this building from the list?")) return;
    await removeItem(itemId);
    if (selectedList) loadItems(selectedList);
    router.refresh();
  };

  const handleConvert = async (e: React.FormEvent<HTMLFormElement>, itemId: string) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await convertToContact(
      itemId,
      fd.get("firstName") as string,
      fd.get("lastName") as string,
      (fd.get("email") as string) || undefined,
      (fd.get("phone") as string) || undefined
    );
    setConvertModal(null);
    if (selectedList) loadItems(selectedList);
  };

  const handleCreateDeal = async (e: React.FormEvent<HTMLFormElement>, itemId: string) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createDealFromItem(
      itemId,
      fd.get("dealName") as string,
      fd.get("dealValue") ? parseFloat(fd.get("dealValue") as string) : undefined
    );
    setDealModal(null);
    if (selectedList) loadItems(selectedList);
  };

  const handleExport = async (listId: string) => {
    const csv = await exportListCSV(listId);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const list = lists.find((l) => l.id === listId);
    a.download = `${list?.name || "prospecting"}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredItems = sourceFilter === "all"
    ? items
    : items.filter((i) => (i.source || "manual") === sourceFilter);

  const selectedListData = lists.find((l) => l.id === selectedList);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Prospecting Lists</h1>
              <p className="text-sm text-slate-500">
                Save buildings from Market Intel, track outreach, convert to contacts & deals
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowNewList(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + New List
          </button>
        </div>
      </div>

      {/* New List Modal */}
      {showNewList && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Create Prospecting List</h2>
              <button onClick={() => setShowNewList(false)} className="text-slate-400 hover:text-slate-600 text-xl">
                &times;
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">List name *</label>
                <input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="e.g., Williamsburg 10+ Units"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input
                  value={newListDesc}
                  onChange={(e) => setNewListDesc(e.target.value)}
                  placeholder="Optional notes about this list"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNewList(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateList}
                  disabled={!newListName.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm disabled:opacity-50"
                >
                  Create List
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Contact Modal */}
      {convertModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Add as Contact</h2>
              <button onClick={() => setConvertModal(null)} className="text-slate-400 hover:text-slate-600 text-xl">
                &times;
              </button>
            </div>
            <form onSubmit={(e) => handleConvert(e, convertModal)} className="p-5 space-y-4">
              {(() => {
                const item = items.find((i) => i.id === convertModal);
                const ownerParts = item?.ownerName?.split(" ") || [];
                return (
                  <>
                    <p className="text-sm text-slate-500">
                      Creating contact from: <strong>{item?.address}</strong>
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">First name *</label>
                        <input
                          name="firstName"
                          required
                          defaultValue={ownerParts[0] || ""}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Last name *</label>
                        <input
                          name="lastName"
                          required
                          defaultValue={ownerParts.slice(1).join(" ") || ""}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                      <input
                        name="email"
                        type="email"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                      <input
                        name="phone"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                );
              })()}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConvertModal(null)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm"
                >
                  Add Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Deal Modal */}
      {dealModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Create Deal</h2>
              <button onClick={() => setDealModal(null)} className="text-slate-400 hover:text-slate-600 text-xl">
                &times;
              </button>
            </div>
            <form onSubmit={(e) => handleCreateDeal(e, dealModal)} className="p-5 space-y-4">
              {(() => {
                const item = items.find((i) => i.id === dealModal);
                return (
                  <>
                    <p className="text-sm text-slate-500">
                      Creating deal for: <strong>{item?.address}</strong>
                    </p>
                    {!item?.contactId && (
                      <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg p-3">
                        Convert to contact first before creating a deal.
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Deal name *</label>
                      <input
                        name="dealName"
                        required
                        defaultValue={`${item?.ownerName || "Owner"} - ${item?.address}`}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Deal value ($)</label>
                      <input
                        name="dealValue"
                        type="number"
                        defaultValue={item?.assessedValue || item?.lastSalePrice || ""}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                );
              })()}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDealModal(null)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!items.find((i) => i.id === dealModal)?.contactId}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm disabled:opacity-50"
                >
                  Create Deal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex h-[calc(100vh-88px)]">
        {/* Left Sidebar - Lists */}
        <div className="w-72 border-r border-slate-200 bg-white overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Your Lists</h2>
            {lists.length > 0 ? (
              <div className="space-y-1">
                {lists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => setSelectedList(list.id)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedList === list.id ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{list.name}</span>
                      <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded ml-2 flex-shrink-0">
                        {list._count.items}
                      </span>
                    </div>
                    {list.description && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{list.description}</p>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">No lists yet</p>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          {selectedList && selectedListData ? (
            <div className="p-6">
              {/* List Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{selectedListData.name}</h2>
                  {selectedListData.description && (
                    <p className="text-sm text-slate-500 mt-0.5">{selectedListData.description}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    {selectedListData._count.items} buildings • Created by {selectedListData.creator.fullName}
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white text-slate-700"
                  >
                    <option value="all">All Sources</option>
                    <option value="market_intel">Market Intel</option>
                    <option value="new_development">New Development</option>
                    <option value="manual">Manual</option>
                  </select>
                  <button
                    onClick={async () => {
                      if (!selectedList) return;
                      setEnriching(true);
                      setEnrichResult(null);
                      try {
                        const result = await bulkEnrichProspects(selectedList);
                        setEnrichResult(result);
                        loadItems(selectedList);
                      } catch (err) { console.error("Bulk enrich error:", err); }
                      setEnriching(false);
                    }}
                    disabled={enriching || items.length === 0}
                    className="px-3 py-1.5 border border-indigo-300 bg-indigo-50 rounded-lg text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  >
                    {enriching ? (
                      <>
                        <span className="animate-spin inline-block w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full"></span>
                        Enriching...
                      </>
                    ) : enrichResult ? (
                      `✓ ${enrichResult.enriched}/${enrichResult.total} enriched`
                    ) : (
                      "🔍 Enrich All"
                    )}
                  </button>
                  <button
                    onClick={async () => {
                      if (!selectedList) return;
                      setContactEnriching(true);
                      setContactEnrichProgress(null);
                      try {
                        let batchIndex = 0;
                        let totalEnriched = 0;
                        while (true) {
                          const result = await bulkEnrichProspectContacts(selectedList, batchIndex);
                          totalEnriched += result.enrichedInBatch;
                          setContactEnrichProgress({
                            total: result.totalContacts,
                            completed: result.batchCompleted * 10,
                            enriched: totalEnriched,
                          });
                          if (result.done) break;
                          batchIndex++;
                        }
                        loadItems(selectedList);
                        getUnenrichedContactCount(selectedList).then(setUnenrichedCount);
                      } catch (err) { console.error("Contact enrich error:", err); }
                      setContactEnriching(false);
                    }}
                    disabled={contactEnriching || !unenrichedCount}
                    className="px-3 py-1.5 border border-violet-300 bg-violet-50 rounded-lg text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  >
                    {contactEnriching ? (
                      <>
                        <span className="animate-spin inline-block w-3 h-3 border-2 border-violet-600 border-t-transparent rounded-full"></span>
                        Enriching Contacts...
                      </>
                    ) : contactEnrichProgress ? (
                      `✓ ${contactEnrichProgress.enriched}/${contactEnrichProgress.total} contacts enriched`
                    ) : unenrichedCount ? (
                      `🧠 Enrich ${unenrichedCount} Contacts`
                    ) : (
                      "🧠 Enrich Contacts"
                    )}
                  </button>
                  <button
                    onClick={() => handleExport(selectedList)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    📥 Export CSV
                  </button>
                  <button
                    onClick={() => handleDeleteList(selectedList)}
                    className="px-3 py-1.5 border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete List
                  </button>
                </div>
              </div>

              {/* Contact Enrichment Progress Bar */}
              {contactEnriching && contactEnrichProgress && (
                <div className="mb-4 bg-white rounded-lg border border-violet-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-violet-600 border-t-transparent rounded-full"></span>
                      <span className="text-sm font-medium text-violet-700">Enriching contacts via Apollo...</span>
                    </div>
                    <span className="text-xs text-slate-500">
                      {Math.min(contactEnrichProgress.completed, contactEnrichProgress.total)}/{contactEnrichProgress.total} processed
                    </span>
                  </div>
                  <div className="w-full bg-violet-100 rounded-full h-2">
                    <div
                      className="bg-violet-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (contactEnrichProgress.completed / Math.max(1, contactEnrichProgress.total)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">
                    {contactEnrichProgress.enriched} contacts enriched with new data so far
                  </p>
                </div>
              )}

              {/* Status Summary */}
              <div className="grid grid-cols-5 gap-3 mb-6">
                {["new", "contacted", "qualified", "converted", "skipped"].map((s) => (
                  <div key={s} className="bg-white rounded-lg border border-slate-200 p-3 text-center">
                    <p className="text-lg font-bold text-slate-900">{items.filter((i) => i.status === s).length}</p>
                    <p className="text-xs text-slate-500 capitalize">{s}</p>
                  </div>
                ))}
              </div>

              {/* Items */}
              {loadingItems ? (
                <p className="text-sm text-slate-400 text-center py-8">Loading...</p>
              ) : filteredItems.length > 0 ? (
                <div className="space-y-3">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className={`bg-white rounded-xl border transition-all ${
                        expandedItem === item.id ? "border-blue-300 shadow-md" : "border-slate-200"
                      }`}
                    >
                      <div
                        className="p-4 cursor-pointer"
                        onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900">{item.address}</h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {item.borough} • ZIP: {item.zip} • Block {item.block}, Lot {item.lot}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.source === "new_development" && (
                              <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                                New Dev
                              </span>
                            )}
                            {item.source === "market_intel" && (
                              <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                                Market Intel
                              </span>
                            )}
                            {item.totalUnits && (
                              <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                {item.totalUnits} units
                              </span>
                            )}
                            <select
                              value={item.status}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleStatusChange(item.id, e.target.value);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className={`text-xs font-medium px-2 py-0.5 rounded border-0 cursor-pointer ${
                                statusColors[item.status] || "bg-slate-100 text-slate-600"
                              }`}
                            >
                              <option value="new">New</option>
                              <option value="contacted">Contacted</option>
                              <option value="qualified">Qualified</option>
                              <option value="converted">Converted</option>
                              <option value="skipped">Skipped</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                          {item.ownerName && <span>Owner: {item.ownerName}</span>}
                          {item.yearBuilt && <span>Built {item.yearBuilt}</span>}
                          {item.assessedValue && <span>Assessed: {fmtPrice(item.assessedValue)}</span>}
                          {item.lastSalePrice && <span>Last sale: {fmtPrice(item.lastSalePrice)}</span>}
                        </div>
                        {/* Linked contact/deal badges */}
                        <div className="flex items-center gap-2 mt-2">
                          {item.contact && (
                            <Link
                              href={`/contacts/${item.contact.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded hover:bg-emerald-100"
                            >
                              👤 {item.contact.firstName} {item.contact.lastName}
                            </Link>
                          )}
                          {item.deal && (
                            <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                              💰 {item.deal.name} ({item.deal.status})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Expanded */}
                      {expandedItem === item.id && (
                        <div className="border-t border-slate-100 p-4 bg-slate-50/50">
                          <div className="grid grid-cols-4 gap-3 mb-4">
                            <div>
                              <p className="text-xs text-slate-400">Units</p>
                              <p className="text-sm font-semibold">{item.totalUnits || "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-400">Floors</p>
                              <p className="text-sm font-semibold">{item.numFloors || "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-400">Building Area</p>
                              <p className="text-sm font-semibold">
                                {item.buildingArea ? `${item.buildingArea.toLocaleString()} sf` : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-400">Zoning</p>
                              <p className="text-sm font-semibold">{item.zoning || "—"}</p>
                            </div>
                          </div>
                          {item.ownerAddress && (
                            <p className="text-sm text-slate-600 mb-3">📍 Owner: {item.ownerAddress}</p>
                          )}
                          <div className="flex gap-2">
                            {!item.contactId && (
                              <button
                                onClick={() => setConvertModal(item.id)}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg"
                              >
                                👤 Add as Contact
                              </button>
                            )}
                            {item.contactId && !item.dealId && (
                              <button
                                onClick={() => setDealModal(item.id)}
                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg"
                              >
                                💰 Create Deal
                              </button>
                            )}
                            {item.contactId && (
                              <Link
                                href={`/contacts/${item.contactId}`}
                                className="px-3 py-1.5 border border-slate-300 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-50"
                              >
                                View Contact
                              </Link>
                            )}
                            <button
                              onClick={() => handleRemoveItem(item.id)}
                              className="px-3 py-1.5 border border-red-200 text-xs font-medium text-red-600 rounded-lg hover:bg-red-50 ml-auto"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                  <p className="text-3xl mb-3">🎯</p>
                  <p className="text-sm text-slate-500">
                    No buildings in this list yet. Go to{" "}
                    <Link href="/market-intel" className="text-blue-600 hover:underline">
                      Market Intel
                    </Link>{" "}
                    to search and save buildings.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-4xl mb-4">🎯</p>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Select a list</h3>
                <p className="text-sm text-slate-500 max-w-sm">
                  Choose a prospecting list from the sidebar, or create a new one. Save buildings from Market
                  Intel to track and convert them into contacts and deals.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
