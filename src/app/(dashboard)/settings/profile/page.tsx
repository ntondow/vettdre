"use client";

import { useEffect, useState } from "react";
import { getProfile, updateProfile } from "../actions";

const AVATAR_COLORS: Record<string, string> = {
  A: "bg-red-500",    B: "bg-orange-500", C: "bg-amber-500",  D: "bg-yellow-500",
  E: "bg-lime-500",   F: "bg-green-500",  G: "bg-emerald-500",H: "bg-teal-500",
  I: "bg-cyan-500",   J: "bg-sky-500",    K: "bg-blue-500",   L: "bg-indigo-500",
  M: "bg-violet-500", N: "bg-purple-500", O: "bg-fuchsia-500",P: "bg-pink-500",
  Q: "bg-rose-500",   R: "bg-red-600",    S: "bg-orange-600", T: "bg-amber-600",
  U: "bg-emerald-600",V: "bg-teal-600",   W: "bg-cyan-600",   X: "bg-blue-600",
  Y: "bg-indigo-600", Z: "bg-violet-600",
};

function getAvatarColor(name: string) {
  const letter = (name || "?")[0].toUpperCase();
  return AVATAR_COLORS[letter] || "bg-slate-500";
}

function getInitials(first: string, last: string) {
  const f = (first || "")[0]?.toUpperCase() || "";
  const l = (last || "")[0]?.toUpperCase() || "";
  return f + l || "?";
}

function SkeletonField({ wide = true }: { wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : "col-span-1"}>
      <div className="h-4 w-24 bg-slate-200 rounded mb-2 animate-pulse" />
      <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
    </div>
  );
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (profile) {
        const parts = (profile.fullName || "").split(" ");
        setFirstName(parts[0] || "");
        setLastName(parts.slice(1).join(" ") || "");
        setEmail(profile.email || "");
        setPhone(profile.phone || "");
        setTitle(profile.title || "");
        setLicenseNumber(profile.licenseNumber || "");
        setBrokerage(profile.brokerage || "");
        setAvatarUrl(profile.avatarUrl || null);
      }
      setLoading(false);
    })();
  }, []);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
    const result = await updateProfile({
      fullName: fullName || undefined,
      phone: phone || undefined,
      title: title || undefined,
      licenseNumber: licenseNumber || undefined,
      brokerage: brokerage || undefined,
    });
    setSaving(false);
    if (result.success) {
      setToast("Profile updated successfully");
    }
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}

      {/* Section header */}
      <h1 className="text-lg font-bold text-slate-900 mb-1">Profile</h1>
      <p className="text-sm text-slate-500 mb-6">
        Manage your personal information and professional details.
      </p>

      {/* Profile Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        {loading ? (
          /* Loading skeleton */
          <div>
            {/* Avatar skeleton */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-slate-200 animate-pulse" />
              <div>
                <div className="h-5 w-40 bg-slate-200 rounded animate-pulse mb-2" />
                <div className="h-4 w-56 bg-slate-100 rounded animate-pulse" />
              </div>
            </div>
            {/* Field skeletons */}
            <div className="grid grid-cols-2 gap-4">
              <SkeletonField wide={false} />
              <SkeletonField wide={false} />
              <SkeletonField />
              <SkeletonField />
              <SkeletonField />
              <SkeletonField />
              <SkeletonField />
            </div>
          </div>
        ) : (
          <div>
            {/* Avatar */}
            <div className="flex items-center gap-4 mb-6">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`${firstName} ${lastName}`}
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold ${getAvatarColor(firstName)}`}
                >
                  {getInitials(firstName, lastName)}
                </div>
              )}
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {[firstName, lastName].filter(Boolean).join(" ") || "Your Name"}
                </p>
                <p className="text-sm text-slate-500">{email}</p>
              </div>
            </div>

            {/* Form fields */}
            <div className="grid grid-cols-2 gap-4">
              {/* First Name */}
              <div className="col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Last Name */}
              <div className="col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Email (display only) */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Email is managed by your authentication provider and cannot be changed here.
                </p>
              </div>

              {/* Phone */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Used for team communications and client callbacks.
                </p>
              </div>

              {/* Title */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Licensed Real Estate Salesperson"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Your professional title (appears on email signatures and exports).
                </p>
              </div>

              {/* License Number */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  License Number
                </label>
                <input
                  type="text"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="10401234567"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Your NY DOS real estate license number.
                </p>
              </div>

              {/* Brokerage */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Brokerage
                </label>
                <input
                  type="text"
                  value={brokerage}
                  onChange={(e) => setBrokerage(e.target.value)}
                  placeholder="Compass, Corcoran, etc."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  The brokerage firm you are affiliated with.
                </p>
              </div>
            </div>

            {/* Save button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
