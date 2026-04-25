"use client";

import { useState } from "react";
import { MapPin, Grid3X3, User, Map, Plus, Trash2, X } from "lucide-react";
import { createWatchlist, updateWatchlist, deleteWatchlist } from "../actions";

// ── Types ─────────────────────────────────────────────────────

type WatchType = "bbl" | "block" | "owner" | "nta";

interface Watchlist {
  id: string;
  watchType: WatchType;
  watchValue: string;
  label: string | null;
  notifyTiers: number[];
  isActive: boolean;
  unreadCount: number;
}

interface Props {
  watchlists: Watchlist[];
  onRefresh: () => void;
}

// ── Constants ────────────────────────────────────────────────

const TYPE_CONFIG: Record<WatchType, { icon: typeof MapPin; label: string; placeholder: string }> = {
  bbl: { icon: MapPin, label: "BBL", placeholder: "e.g. 3072650001" },
  block: { icon: Grid3X3, label: "Block", placeholder: "e.g. 307265" },
  owner: { icon: User, label: "Owner", placeholder: "e.g. SMITH LLC" },
  nta: { icon: Map, label: "NTA", placeholder: "e.g. BK09" },
};

// ── Component ────────────────────────────────────────────────

export default function WatchlistManager({ watchlists, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<WatchType>("bbl");
  const [formValue, setFormValue] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!formValue.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createWatchlist({
        watchType: formType,
        watchValue: formValue.trim(),
        label: formLabel.trim() || undefined,
      });
      if (result.success) {
        setFormValue("");
        setFormLabel("");
        setShowForm(false);
        onRefresh();
      } else {
        setError(result.error || "Failed to create");
      }
    } catch {
      setError("Failed to create watchlist");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await updateWatchlist(id, { isActive: !isActive });
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await deleteWatchlist(id);
    setConfirmDelete(null);
    onRefresh();
  };

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[#8B949E]">
          Watchlists
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="p-1 rounded hover:bg-[#21262D] text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
          aria-label={showForm ? "Close form" : "Add watchlist"}
        >
          {showForm ? <X size={12} /> : <Plus size={12} />}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-3 space-y-2">
          {/* Type pills */}
          <div className="flex gap-1">
            {(Object.keys(TYPE_CONFIG) as WatchType[]).map((type) => (
              <button
                key={type}
                onClick={() => setFormType(type)}
                className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors ${
                  formType === type
                    ? "bg-[#0A84FF] text-white"
                    : "bg-[#21262D] text-[#8B949E] hover:bg-[#1C2333]"
                }`}
              >
                {TYPE_CONFIG[type].label}
              </button>
            ))}
          </div>

          {/* Value input */}
          <input
            type="text"
            value={formValue}
            onChange={(e) => setFormValue(e.target.value)}
            placeholder={TYPE_CONFIG[formType].placeholder}
            className="w-full bg-[#0D1117] border border-[#21262D] rounded px-2 py-1.5 text-[11px] text-[#E6EDF3] placeholder:text-[#484F58] focus:border-[#0A84FF] focus:outline-none font-mono"
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          />

          {/* Optional label */}
          <input
            type="text"
            value={formLabel}
            onChange={(e) => setFormLabel(e.target.value)}
            placeholder="Label (optional)"
            className="w-full bg-[#0D1117] border border-[#21262D] rounded px-2 py-1.5 text-[11px] text-[#E6EDF3] placeholder:text-[#484F58] focus:border-[#0A84FF] focus:outline-none"
          />

          {error && (
            <p className="text-[10px] text-[#FF6B6B]">{error}</p>
          )}

          <button
            onClick={handleCreate}
            disabled={creating || !formValue.trim()}
            className="w-full py-1.5 bg-[#0A84FF] hover:bg-[#0A84FF]/80 disabled:opacity-40 text-white text-[11px] font-semibold rounded transition-colors"
          >
            {creating ? "Creating..." : "Create Watch"}
          </button>
        </div>
      )}

      {/* Watchlist items */}
      {watchlists.length === 0 && !showForm && (
        <p className="text-[11px] text-[#484F58] py-3 text-center">
          No watchlists yet
        </p>
      )}

      <div className="space-y-0.5">
        {watchlists.map((w) => {
          const config = TYPE_CONFIG[w.watchType];
          const Icon = config.icon;
          return (
            <div
              key={w.id}
              className={`group flex items-center gap-2 px-2 py-1.5 rounded text-[12px] transition-colors ${
                w.isActive ? "text-[#E6EDF3]" : "text-[#484F58]"
              } hover:bg-[#161B22]`}
            >
              <Icon size={12} className="shrink-0 text-[#8B949E]" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[11px]">
                  {w.label || w.watchValue}
                </div>
                {w.label && (
                  <div className="truncate text-[10px] text-[#484F58] font-mono">
                    {w.watchValue}
                  </div>
                )}
              </div>

              {/* Unread badge */}
              {w.unreadCount > 0 && (
                <span className="shrink-0 bg-[#0A84FF] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {w.unreadCount > 99 ? "99+" : w.unreadCount}
                </span>
              )}

              {/* Toggle / Delete (visible on hover) */}
              <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleToggle(w.id, w.isActive)}
                  className={`w-6 h-3.5 rounded-full transition-colors relative ${
                    w.isActive ? "bg-[#0A84FF]" : "bg-[#21262D]"
                  }`}
                  aria-label={w.isActive ? "Pause watchlist" : "Activate watchlist"}
                >
                  <div
                    className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform ${
                      w.isActive ? "left-3" : "left-0.5"
                    }`}
                  />
                </button>
                {confirmDelete === w.id ? (
                  <button
                    onClick={() => handleDelete(w.id)}
                    className="text-[#FF6B6B] text-[9px] font-bold"
                  >
                    Confirm
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(w.id)}
                    className="text-[#484F58] hover:text-[#FF6B6B] transition-colors"
                    aria-label="Delete watchlist"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
