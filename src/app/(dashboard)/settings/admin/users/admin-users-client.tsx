"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getUsers,
  updateUserApproval,
  updateUserActive,
  updateUserPlan,
  deleteUser,
  getAuthStatuses,
  adminSendPasswordReset,
  adminSetPassword,
  adminVerifyEmail,
} from "../admin-actions";

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

interface AuthStatus {
  emailConfirmed: boolean;
  authId: string;
}

interface Toast {
  message: string;
  type: "success" | "error" | "info";
}

export default function AdminUsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [approvedFilter, setApprovedFilter] = useState("all");
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  // Auth management state
  const [authStatuses, setAuthStatuses] = useState<Record<string, AuthStatus>>({});
  const [passwordModal, setPasswordModal] = useState<{ email: string; authId?: string } | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [copied, setCopied] = useState(false);
  const [resetLinkModal, setResetLinkModal] = useState<{ email: string; link: string } | null>(null);

  const showToast = (message: string, type: Toast["type"] = "success") => {
    setToast({ message, type });
  };

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

  const fetchAuthStatuses = useCallback(async () => {
    try {
      const statuses = await getAuthStatuses();
      setAuthStatuses(statuses);
    } catch (e) {
      console.error("Failed to fetch auth statuses:", e);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchAuthStatuses();
  }, [fetchUsers, fetchAuthStatuses]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleToggleApproval = async (userId: string, currentlyApproved: boolean) => {
    setUpdating(userId);
    try {
      await updateUserApproval(userId, !currentlyApproved);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isApproved: !currentlyApproved } : u));
      showToast(`User ${!currentlyApproved ? "approved" : "unapproved"}`);
    } catch (e: any) {
      showToast("Error: " + e.message, "error");
    }
    setUpdating(null);
  };

  const handleToggleActive = async (userId: string, currentlyActive: boolean) => {
    setUpdating(userId);
    try {
      await updateUserActive(userId, !currentlyActive);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: !currentlyActive } : u));
      showToast(`User ${!currentlyActive ? "activated" : "deactivated"}`);
    } catch (e: any) {
      showToast("Error: " + e.message, "error");
    }
    setUpdating(null);
  };

  const handlePlanChange = async (userId: string, plan: string) => {
    setUpdating(userId);
    try {
      await updateUserPlan(userId, plan);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan } : u));
      showToast(`Plan updated to ${plan}`);
    } catch (e: any) {
      showToast("Error: " + e.message, "error");
    }
    setUpdating(null);
  };

  const handleDelete = async (userId: string) => {
    setUpdating(userId);
    try {
      await deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      showToast("User deleted");
      setConfirmDelete(null);
    } catch (e: any) {
      showToast("Error: " + e.message, "error");
    }
    setUpdating(null);
  };

  const handleSendReset = async (email: string) => {
    setUpdating(email);
    try {
      const result = await adminSendPasswordReset(email);
      if (result.link) {
        setResetLinkModal({ email, link: result.link });
      }
      showToast(`Recovery link generated for ${email}`);
    } catch (e: any) {
      showToast(e.message, "error");
    }
    setUpdating(null);
  };

  const handleSetPassword = async () => {
    if (!passwordModal || !passwordValue.trim()) return;
    setUpdating(passwordModal.email);
    try {
      await adminSetPassword(passwordModal.email, passwordValue, passwordModal.authId);
      showToast("Password set and account verified");
      // Update local auth status
      setAuthStatuses(prev => ({
        ...prev,
        [passwordModal.email.toLowerCase()]: {
          emailConfirmed: true,
          authId: prev[passwordModal.email.toLowerCase()]?.authId || "new",
        },
      }));
      setPasswordModal(null);
      setPasswordValue("");
      // Refresh auth statuses to get the real authId
      fetchAuthStatuses();
    } catch (e: any) {
      showToast(e.message, "error");
    }
    setUpdating(null);
  };

  const handleVerifyEmail = async (email: string, authId: string) => {
    setUpdating(email);
    try {
      await adminVerifyEmail(authId);
      setAuthStatuses(prev => ({
        ...prev,
        [email.toLowerCase()]: { ...prev[email.toLowerCase()], emailConfirmed: true },
      }));
      showToast("Email verified");
    } catch (e: any) {
      showToast(e.message, "error");
    }
    setUpdating(null);
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getAuthStatus = (email: string): AuthStatus | undefined => {
    return authStatuses[email.toLowerCase()];
  };

  const fmtDate = (d: string | null) => {
    if (!d) return "\u2014";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
  };

  const toastColors = {
    success: "bg-emerald-600",
    error: "bg-red-600",
    info: "bg-slate-900",
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 ${toastColors[toast.type]} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium max-w-md`}>
          {toast.message}
        </div>
      )}

      {/* Delete Confirmation Modal */}
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

      {/* Set Password Modal */}
      {passwordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Set Password</h3>
            <p className="text-sm text-slate-500 mb-4">{passwordModal.email}</p>
            {!passwordModal.authId && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                No Supabase Auth account found. This will create one and auto-verify the email.
              </p>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={passwordValue}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  placeholder="Enter password..."
                  autoComplete="off"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => copyToClipboard(passwordValue)}
                  disabled={!passwordValue}
                  className="px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 disabled:opacity-50 whitespace-nowrap"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setPasswordModal(null); setPasswordValue(""); setCopied(false); }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSetPassword}
                disabled={!passwordValue.trim() || updating === passwordModal.email}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {updating === passwordModal.email ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Link Modal */}
      {resetLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Recovery Link</h3>
            <p className="text-sm text-slate-500 mb-4">
              Generated for {resetLinkModal.email}. Copy and share with the user.
            </p>
            <div className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={resetLinkModal.link}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-slate-50 text-slate-600"
                />
                <button
                  onClick={() => copyToClipboard(resetLinkModal.link)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 whitespace-nowrap"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => { setResetLinkModal(null); setCopied(false); }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Close
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
                {users.map((user) => {
                  const auth = getAuthStatus(user.email);
                  return (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-900">{user.fullName}</p>
                        <p className="text-xs text-slate-400">{user.orgName}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-slate-600">{user.email}</span>
                          {auth ? (
                            auth.emailConfirmed ? (
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex-shrink-0" title="Email verified">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleVerifyEmail(user.email, auth.authId)}
                                disabled={updating === user.email}
                                className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 hover:bg-amber-100 disabled:opacity-50 flex-shrink-0"
                                title="Click to verify email"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Verify
                              </button>
                            )
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-medium text-slate-400 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 flex-shrink-0">
                              No Auth
                            </span>
                          )}
                        </div>
                      </td>
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
                          <option value="explorer">Explorer</option>
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
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleSendReset(user.email)}
                            disabled={updating === user.email || !auth}
                            title={!auth ? "User must have an Auth account first (use Set Password)" : "Send password reset link"}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            Reset Pwd
                          </button>
                          <button
                            onClick={() => setPasswordModal({ email: user.email, authId: auth?.authId })}
                            className="text-xs text-violet-600 hover:text-violet-800 font-medium whitespace-nowrap"
                          >
                            Set Pwd
                          </button>
                          <button
                            onClick={() => setConfirmDelete(user.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
