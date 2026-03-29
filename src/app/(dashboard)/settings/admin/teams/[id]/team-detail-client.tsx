"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  getTeamDetail,
  getTeams,
  updateTeam,
  deleteTeam,
  addMemberToTeam,
  removeMemberFromTeam,
  getUnassignedUsers,
  createTeam,
} from "../../team-actions";

interface Member {
  id: string;
  fullName: string;
  email: string;
  role: string;
  plan: string;
}

interface SubTeam {
  id: string;
  name: string;
  slug: string;
  type: string;
  memberCount: number;
}

interface TeamDetail {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string | null;
  parentTeamId: string | null;
  parentTeamName: string | null;
  createdAt: string;
  members: Member[];
  subTeams: SubTeam[];
}

interface TeamOption {
  id: string;
  name: string;
}

interface UnassignedUser {
  id: string;
  fullName: string;
  email: string;
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

export default function TeamDetailClient({ teamId }: { teamId: string }) {
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [allTeams, setAllTeams] = useState<TeamOption[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("generic");
  const [editDescription, setEditDescription] = useState("");
  const [editParent, setEditParent] = useState("");
  const [editing, setEditing] = useState(false);

  // Add member state
  const [selectedUser, setSelectedUser] = useState("");

  // Sub-team create
  const [showSubCreate, setShowSubCreate] = useState(false);
  const [subName, setSubName] = useState("");
  const [subType, setSubType] = useState("generic");
  const [creatingSubTeam, setCreatingSubTeam] = useState(false);

  const showToast = (message: string, type: Toast["type"] = "success") => {
    setToast({ message, type });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, teams, users] = await Promise.all([
        getTeamDetail(teamId),
        getTeams(),
        getUnassignedUsers(),
      ]);
      setTeam(detail);
      setAllTeams(teams.map((t) => ({ id: t.id, name: t.name })));
      setUnassigned(users);
      if (detail) {
        setEditName(detail.name);
        setEditType(detail.type);
        setEditDescription(detail.description ?? "");
        setEditParent(detail.parentTeamId ?? "");
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const result = await updateTeam(teamId, {
        name: editName,
        type: editType,
        description: editDescription,
        parentTeamId: editParent || null,
      });
      if ("error" in result) {
        showToast(result.error!, "error");
      } else {
        showToast("Team updated");
        setEditing(false);
        fetchData();
      }
    } catch (e: any) {
      showToast(e.message, "error");
    }
    setSaving(false);
  };

  const handleAddMember = async () => {
    if (!selectedUser) return;
    try {
      await addMemberToTeam(teamId, selectedUser);
      setSelectedUser("");
      showToast("Member added");
      fetchData();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await removeMemberFromTeam(userId);
      showToast("Member removed");
      fetchData();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  };

  const handleCreateSubTeam = async () => {
    if (!subName.trim()) return;
    setCreatingSubTeam(true);
    try {
      const result = await createTeam({
        name: subName,
        type: subType,
        parentTeamId: teamId,
      });
      if ("error" in result) {
        showToast(result.error!, "error");
      } else {
        showToast("Sub-team created");
        setSubName("");
        setSubType("generic");
        setShowSubCreate(false);
        fetchData();
      }
    } catch (e: any) {
      showToast(e.message, "error");
    }
    setCreatingSubTeam(false);
  };

  const toastColors = { success: "bg-emerald-600", error: "bg-red-600" };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent mb-2" />
        <p className="text-sm text-slate-500">Loading team...</p>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-slate-500">Team not found.</p>
        <Link href="/settings/admin/teams" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
          Back to Teams
        </Link>
      </div>
    );
  }

  const roleColors: Record<string, string> = {
    super_admin: "bg-red-50 text-red-700",
    owner: "bg-amber-50 text-amber-700",
    admin: "bg-purple-50 text-purple-700",
    manager: "bg-blue-50 text-blue-700",
    agent: "bg-slate-50 text-slate-600",
    viewer: "bg-slate-50 text-slate-400",
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 ${toastColors[toast.type]} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium max-w-md`}>
          {toast.message}
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-4">
        <Link href="/settings/admin/teams" className="text-blue-600 hover:underline">Teams</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-700 font-medium">{team.name}</span>
      </div>

      {/* Team Info */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{team.name}</h1>
            {team.description && <p className="text-sm text-slate-500 mt-0.5">{team.description}</p>}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                {TEAM_TYPES.find((t) => t.value === team.type)?.label ?? team.type}
              </span>
              {team.parentTeamName && (
                <span className="text-xs text-slate-400">
                  Parent: <Link href={`/settings/admin/teams/${team.parentTeamId}`} className="text-blue-600 hover:underline">{team.parentTeamName}</Link>
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setEditing(!editing)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>

        {editing && (
          <div className="border-t border-slate-100 pt-3 mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
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
                  value={editParent}
                  onChange={(e) => setEditParent(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="">None (top-level)</option>
                  {allTeams
                    .filter((t) => t.id !== teamId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                <input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Optional..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={!editName.trim() || saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="bg-white rounded-xl border border-slate-200 mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">
            Members ({team.members.length})
          </h2>
        </div>

        {/* Add member */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
          <div className="flex gap-2">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="">Select unassigned user...</option>
              {unassigned.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.email})
                </option>
              ))}
            </select>
            <button
              onClick={handleAddMember}
              disabled={!selectedUser}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {unassigned.length === 0 && (
            <p className="text-xs text-slate-400 mt-1">All users are assigned to a team.</p>
          )}
        </div>

        {team.members.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-slate-500">No members in this team.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {team.members.map((member) => (
              <div key={member.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{member.fullName}</p>
                  <p className="text-xs text-slate-500 truncate">{member.email}</p>
                </div>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${roleColors[member.role] ?? roleColors.agent}`}>
                  {member.role}
                </span>
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  className="text-[11px] text-red-500 hover:text-red-700 font-medium flex-shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sub-teams */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">
            Sub-teams ({team.subTeams.length})
          </h2>
          <button
            onClick={() => setShowSubCreate(!showSubCreate)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            {showSubCreate ? "Cancel" : "+ Add Sub-team"}
          </button>
        </div>

        {showSubCreate && (
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <div className="flex gap-2">
              <input
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="Sub-team name..."
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={subType}
                onChange={(e) => setSubType(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                {TEAM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button
                onClick={handleCreateSubTeam}
                disabled={!subName.trim() || creatingSubTeam}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingSubTeam ? "..." : "Create"}
              </button>
            </div>
          </div>
        )}

        {team.subTeams.length === 0 && !showSubCreate ? (
          <div className="p-6 text-center">
            <p className="text-sm text-slate-500">No sub-teams.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {team.subTeams.map((st) => (
              <div key={st.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/settings/admin/teams/${st.id}`}
                    className="text-sm font-medium text-slate-900 hover:text-blue-600"
                  >
                    {st.name}
                  </Link>
                </div>
                <span className="text-xs text-slate-400">{st.memberCount} members</span>
                <Link
                  href={`/settings/admin/teams/${st.id}`}
                  className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                >
                  Manage
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
