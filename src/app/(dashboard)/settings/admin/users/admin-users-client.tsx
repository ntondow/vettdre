"use client";

import { useEffect, useState, useCallback } from "react";
import { getUsers, updateUserApproval, updateUserActive, updateUserPlan, deleteUser } from "../admin-actions";

interface UserRow {
  id: string;
  fullName: string;
  email: string;
  plan: string;
  isApproved: boolean;
  isActive: boolean;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
  orgId: string;
  orgName: string;
}

export default function AdminUsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [approvedFilter, setApprovedFilter] = useState("all");
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUsers(
        search || undefined,
        planFilter !== "all" ? planFilter : undefined,
        approvedFilter !== "all" ? approvedFilter : undefined,
      );
      setUsers(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [search, planFilter, approvedFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleToggleApproval = async (userId: string, currentlyApproved: boolean) => {
    setUpdating(userId);
    try {
      await updateUserApproval(userId, !currentlyApproved);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isApproved: !currentlyApproved } : u));
      setToast(`User ${!currentlyApproved ? "approved" : "unapproved"}`);
    } catch (e: any) {
      setToast("Error: " + e.message);
    }
    setUpdating(null);
  };

  const handleToggleActive = async (userId: string, currentlyActive: boolean) => {
    setUpdating(userId);
    try {
      await updateUserActive(userId, !currentlyActive);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: !currentlyActive } : u));
      setToast(`User ${!currentlyActive ? "activated" : "deactivated"}`);
    } catch (e: any) {
      setToast("Error: " + e.message);
    }
    setUpdating(null);
  };

  const handlePlanChange = async (userId: string, plan: string) => {
    setUpdating(userId);
    try {
      await updateUserPlan(userId, plan);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan } : u));
      setToast(`Plan updated to ${plan}`);
    } catch (e: any) {
      setToast("Error: " + e.message);
    }
    setUpdating(null);
  };

  const handleDelete = async (userId: string) => {
    setUpdating(userId);
    try {
      await deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      setToast("User deleted");
      setConfirmDelete(null);
    } catch (e: any) {
      setToast("Error: " + e.message);
    }
    setUpdating(null);
  };

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete User</h3>
            <p className="text-sm text-slate-500 mb-4">
              Are you sure? This will permanently delete the user and cannot be undone.
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
                disabled={!!updating}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {updating === confirmDelete ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold text-slate-900 mb-1">User Management</h1>
      <p className="text-sm text-slate-500 mb-6">Manage user accounts, plans, and approval status.</p>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="all">All Plans</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="team">Team</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <select
            value={approvedFilter}
            onChange={(e) => setApprovedFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="all">All Status</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent mb-2" />
            <p className="text-sm text-slate-500">Loading users...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-slate-500">No users found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Plan</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Approved</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Active</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Created</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Last Login</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">{user.fullName}</p>
                      <p className="text-xs text-slate-400">{user.orgName}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={user.plan}
                        onChange={(e) => handlePlanChange(user.id, e.target.value)}
                        disabled={updating === user.id}
                        className={`text-xs font-medium px-2 py-1 rounded-lg border ${
                          user.plan === "free" ? "bg-slate-50 border-slate-200 text-slate-600" :
                          user.plan === "pro" ? "bg-blue-50 border-blue-200 text-blue-700" :
                          user.plan === "team" ? "bg-violet-50 border-violet-200 text-violet-700" :
                          "bg-amber-50 border-amber-200 text-amber-700"
                        }`}
                      >
                        <option value="free">Free</option>
                        <option value="pro">Pro</option>
                        <option value="team">Team</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleApproval(user.id, user.isApproved)}
                        disabled={updating === user.id}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                          user.isApproved
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        }`}
                      >
                        {user.isApproved ? "Approved" : "Pending"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(user.id, user.isActive)}
                        disabled={updating === user.id}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                          user.isActive
                            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{fmtDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{fmtDate(user.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setConfirmDelete(user.id)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && users.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
            <p className="text-xs text-slate-500">{users.length} user{users.length !== 1 ? "s" : ""}</p>
          </div>
        )}
      </div>
    </div>
  );
}
