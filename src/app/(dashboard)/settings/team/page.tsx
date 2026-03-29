"use client";

import { useState, useEffect } from "react";
import { getTeamMembers, inviteTeamMember, updateTeamMember, removeTeamMember } from "../actions";

const roleLabels: Record<string, string> = { owner: "Owner", admin: "Admin", manager: "Manager", agent: "Agent", viewer: "Viewer" };
const roleColors: Record<string, string> = { owner: "bg-purple-100 text-purple-700", admin: "bg-blue-100 text-blue-700", manager: "bg-amber-100 text-amber-700", agent: "bg-emerald-100 text-emerald-700", viewer: "bg-slate-100 text-slate-600" };

export default function TeamPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [saving, setSaving] = useState(false);

  const load = async () => { setMembers(await getTeamMembers()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const handleInvite = async () => {
    if (!inviteEmail || !inviteName) return;
    setSaving(true);
    const result = await inviteTeamMember({ email: inviteEmail, fullName: inviteName, role: inviteRole });
    setSaving(false);
    if ("error" in result) { alert(result.error); return; }
    setShowInvite(false);
    setInviteEmail(""); setInviteName(""); setInviteRole("agent");
    load();
  };

  const handleRoleChange = async (id: string, role: string) => {
    await updateTeamMember(id, { role });
    load();
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from the team? They will be deactivated.`)) return;
    const result = await removeTeamMember(id);
    if ("error" in result) { alert(result.error); return; }
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Team Members</h1>
          <p className="text-sm text-slate-500">Manage your team and their roles</p>
        </div>
        <button onClick={() => setShowInvite(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          Invite Member
        </button>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowInvite(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900">Invite Team Member</h3>
            <div>
              <label className="text-sm font-medium text-slate-700">Full Name</label>
              <input value={inviteName} onChange={e => setInviteName(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Email</label>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="admin">Admin</option>
                <option value="agent">Agent</option>
                <option value="viewer">Viewer</option>
              </select>
              <p className="text-xs text-slate-400 mt-1">Admin: full access. Agent: manage own data. Viewer: read-only.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowInvite(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
              <button onClick={handleInvite} disabled={saving || !inviteEmail || !inviteName}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Inviting..." : "Send Invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Members Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Name</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Email</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Role</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Status</th>
              <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              [1, 2, 3].map(i => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-32" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-40" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-20 ml-auto" /></td>
                </tr>
              ))
            ) : members.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">No team members found</td></tr>
            ) : (
              members.map(m => (
                <tr key={m.id} className={!m.isActive ? "opacity-50" : ""}>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{m.fullName}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{m.email}</td>
                  <td className="px-4 py-3">
                    <select value={m.role} onChange={e => handleRoleChange(m.id, e.target.value)}
                      className="text-xs font-medium px-2 py-1 rounded-lg border border-slate-200" disabled={m.role === "owner"}>
                      {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${m.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                      {m.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.role !== "owner" && m.isActive && (
                      <button onClick={() => handleRemove(m.id, m.fullName)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
