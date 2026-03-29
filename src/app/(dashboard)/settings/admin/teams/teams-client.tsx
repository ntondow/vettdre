"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getTeams, createTeam, deleteTeam } from "../team-actions";

interface TeamRow {
  id: string;
  name: string;
  slug: string;
  type: string;
  parentTeamId: string | null;
  parentTeamName: string | null;
  description: string | null;
  memberCount: number;
  subTeamCount: number;
  createdAt: string;
}

interface Toast {
  message: string;
  type: "success" | "error";
}

const TEAM_TYPES = [
  { value: "generic", label: "Generic" },
  { value: "brokerage", label: "Brokerage" },
  { value: "firm", label: "Firm" },
  { value: "property_manager", label: "Property Manager" },
  { value: "investment", label: "Investment" },
];

const typeColors: Record<string, string> = {
  generic: "bg-slate-100 text-slate-600",
  brokerage: "bg-blue-50 text-blue-700",
  firm: "bg-violet-50 text-violet-700",
  property_manager: "bg-teal-50 text-teal-700",
  investment: "bg-amber-50 text-amber-700",
};

export default function TeamsClient() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Create form
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("generic");
  const [newDescription, setNewDescription] = useState("");
  const [newParent, setNewParent] = useState("");
  const [creating, setCreating] = useState(false);

  const showToast = (message: string, type: Toast["type"] = "success") => {
    setToast({ message, type });
  };

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTeams();
      setTeams(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const result = await createTeam({
        name: newName,
        type: newType,
        description: newDescription || undefined,
        parentTeamId: newParent || undefined,
      });
      if ("error" in result) {
        showToast(result.error!, "error");
      } else {
        showToast("Team created");
        setNewName("");
        setNewType("generic");
        setNewDescription("");
        setNewParent("");
        setShowCreate(false);
        fetchTeams();
      }
    } catch (e: any) {
      showToast(e.message, "error");
    }
    setCreating(false);
  };

  const handleDelete = async (teamId: string) => {
    setDeleting(true);
    try {
      await deleteTeam(teamId);
      showToast("Team deleted");
      setConfirmDelete(null);
      fetchTeams();
    } catch (e: any) {
      showToast(e.message, "error");
    }
    setDeleting(false);
  };

  // Build hierarchy: top-level teams first, then their children
  const topLevel = teams.filter((t) => !t.parentTeamId);
  const childrenOf = (parentId: string) => teams.filter((t) => t.parentTeamId === parentId);

  const toastColors = { success: "bg-emerald-600", error: "bg-red-600" };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 ${toastColors[toast.type]} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium max-w-md`}>
          {toast.message}
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete Team</h3>
            <p className="text-sm text-slate-500 mb-4">
              This will unassign all members and unlink sub-teams. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Teams</h1>
          <p className="text-sm text-slate-500">Manage teams and organizational hierarchy.</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showCreate ? "Cancel" : "+ New Team"}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Create Team</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Sales Team"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                {TEAM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Parent Team</label>
              <select
                value={newParent}
                onChange={(e) => setNewParent(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="">None (top-level)</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional description..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Team"}
            </button>
          </div>
        </div>
      )}

      {/* Teams List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent mb-2" />
            <p className="text-sm text-slate-500">Loading teams...</p>
          </div>
        ) : teams.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-3xl mb-2">🏢</p>
            <p className="text-sm font-medium text-slate-700 mb-1">No teams yet</p>
            <p className="text-xs text-slate-500">Create your first team to organize members.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {topLevel.map((team) => (
              <TeamRowItem
                key={team.id}
                team={team}
                subTeams={childrenOf(team.id)}
                onDelete={setConfirmDelete}
              />
            ))}
            {/* Orphaned teams (parent deleted but parentTeamId still set to a missing team) */}
            {teams
              .filter((t) => t.parentTeamId && !teams.find((p) => p.id === t.parentTeamId))
              .map((team) => (
                <TeamRowItem key={team.id} team={team} subTeams={[]} onDelete={setConfirmDelete} />
              ))}
          </div>
        )}
        {!loading && teams.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
            <p className="text-xs text-slate-500">{teams.length} team{teams.length !== 1 ? "s" : ""}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamRowItem({
  team,
  subTeams,
  onDelete,
  indent = false,
}: {
  team: TeamRow;
  subTeams: TeamRow[];
  onDelete: (id: string) => void;
  indent?: boolean;
}) {
  const typeLabel = TEAM_TYPES.find((t) => t.value === team.type)?.label ?? team.type;
  const colorClass = typeColors[team.type] ?? typeColors.generic;

  return (
    <>
      <div className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 ${indent ? "pl-10" : ""}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/settings/admin/teams/${team.id}`}
              className="text-sm font-medium text-slate-900 hover:text-blue-600 truncate"
            >
              {indent && <span className="text-slate-300 mr-1">└</span>}
              {team.name}
            </Link>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colorClass}`}>
              {typeLabel}
            </span>
          </div>
          {team.description && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{team.description}</p>
          )}
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <p className="text-sm font-medium text-slate-900">{team.memberCount}</p>
            <p className="text-[10px] text-slate-400">members</p>
          </div>
          {team.subTeamCount > 0 && (
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{team.subTeamCount}</p>
              <p className="text-[10px] text-slate-400">sub-teams</p>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Link
              href={`/settings/admin/teams/${team.id}`}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
            >
              Manage
            </Link>
            <span className="text-slate-200">|</span>
            <button
              onClick={() => onDelete(team.id)}
              className="text-[11px] text-red-500 hover:text-red-700 font-medium"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
      {subTeams.map((child) => (
        <TeamRowItem key={child.id} team={child} subTeams={[]} onDelete={onDelete} indent />
      ))}
    </>
  );
}
