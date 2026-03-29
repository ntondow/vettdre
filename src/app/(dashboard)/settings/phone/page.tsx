"use client";

import { useState, useEffect } from "react";
import {
  searchAvailableNumbers,
  purchaseNumber,
  releaseNumber,
  updateForwardingNumber,
  getUserPhoneNumbers,
} from "@/lib/twilio-actions";
import type { UserPlan } from "@/lib/feature-gate";

function formatPhone(number: string) {
  // +12125551234 → (212) 555-1234
  if (number.startsWith("+1") && number.length === 12) {
    return `(${number.slice(2, 5)}) ${number.slice(5, 8)}-${number.slice(8)}`;
  }
  return number;
}

export default function PhoneSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [numbers, setNumbers] = useState<any[]>([]);
  const [plan, setPlan] = useState<UserPlan>("free");
  const [smsCount, setSmsCount] = useState(0);
  const [callCount, setCallCount] = useState(0);

  // Search state
  const [areaCode, setAreaCode] = useState("212");
  const [searching, setSearching] = useState(false);
  const [available, setAvailable] = useState<any[]>([]);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  // Forwarding state
  const [editingForwarding, setEditingForwarding] = useState<string | null>(null);
  const [forwardingInput, setForwardingInput] = useState("");
  const [savingForwarding, setSavingForwarding] = useState(false);

  // Release state
  const [releasing, setReleasing] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const data = await getUserPhoneNumbers();
    setNumbers(data.numbers);
    setPlan(data.plan);
    setSmsCount(data.smsThisMonth || 0);
    setCallCount(data.callsThisMonth || 0);
    setLoading(false);
  }

  async function handleSearch() {
    if (!areaCode || areaCode.length !== 3) return;
    setSearching(true);
    setError(null);
    setAvailable([]);
    const result = await searchAvailableNumbers(areaCode, 10);
    if (result.error) setError(result.error);
    setAvailable(result.numbers || []);
    setSearching(false);
  }

  async function handlePurchase(phoneNumber: string) {
    setPurchasing(phoneNumber);
    setError(null);
    const result = await purchaseNumber(phoneNumber);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(`Successfully purchased ${formatPhone(phoneNumber)}`);
      setAvailable([]);
      await loadData();
    }
    setPurchasing(null);
  }

  async function handleRelease(id: string) {
    if (!confirm("Are you sure you want to release this number? This cannot be undone.")) return;
    setReleasing(id);
    setError(null);
    const result = await releaseNumber(id);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess("Number released successfully");
      await loadData();
    }
    setReleasing(null);
  }

  async function handleSaveForwarding(phoneId: string) {
    setSavingForwarding(true);
    const result = await updateForwardingNumber(phoneId, forwardingInput);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess("Forwarding number updated");
      setEditingForwarding(null);
      await loadData();
    }
    setSavingForwarding(false);
  }

  const canPurchase = plan === "pro" || plan === "team" || plan === "enterprise";

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-slate-100 rounded w-48" />
        <div className="h-40 bg-slate-100 rounded" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 mb-1">Phone & SMS</h1>
      <p className="text-sm text-slate-500 mb-6">
        Manage your VettdRE phone number for calling and texting property owners
      </p>

      {/* Status messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">×</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-2 text-emerald-500 hover:text-emerald-700">×</button>
        </div>
      )}

      {/* Active Numbers */}
      {numbers.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Your Phone Numbers</h2>
          <div className="space-y-4">
            {numbers.map((num) => (
              <div key={num.id} className="border border-slate-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center">
                      <span className="text-lg">📞</span>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-slate-900">{formatPhone(num.number)}</p>
                      <p className="text-xs text-slate-400">
                        {num.friendlyName || `Area code ${num.areaCode}`} &bull; Active since{" "}
                        {new Date(num.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
                    Active
                  </span>
                </div>

                {/* Call Forwarding */}
                <div className="border-t border-slate-100 pt-3 mt-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-0.5">Call Forwarding</p>
                      <p className="text-sm text-slate-700">
                        {num.forwardingNumber
                          ? `Forwarding to ${formatPhone(num.forwardingNumber)}`
                          : "Not configured — calls go to voicemail"}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingForwarding(editingForwarding === num.id ? null : num.id);
                        setForwardingInput(num.forwardingNumber || "");
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {editingForwarding === num.id ? "Cancel" : "Edit"}
                    </button>
                  </div>

                  {editingForwarding === num.id && (
                    <div className="flex gap-2 mt-2">
                      <input
                        type="tel"
                        placeholder="+12125551234"
                        value={forwardingInput}
                        onChange={(e) => setForwardingInput(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => handleSaveForwarding(num.id)}
                        disabled={savingForwarding}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {savingForwarding ? "Saving..." : "Save"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Release */}
                <div className="border-t border-slate-100 pt-3 mt-3 flex justify-end">
                  <button
                    onClick={() => handleRelease(num.id)}
                    disabled={releasing === num.id}
                    className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                  >
                    {releasing === num.id ? "Releasing..." : "Release Number"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Usage Stats */}
      {numbers.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{smsCount}</p>
            <p className="text-xs text-slate-500">SMS this month</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{callCount}</p>
            <p className="text-xs text-slate-500">Calls this month</p>
          </div>
        </div>
      )}

      {/* Get a Number */}
      {canPurchase ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">
            {numbers.length > 0 ? "Add Another Number" : "Get a Phone Number"}
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            {plan === "team" || plan === "enterprise"
              ? "Included with your plan (up to 5 numbers)"
              : "Phone numbers are $2/mo + usage on the Pro plan"}
          </p>

          {/* Area code search */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              maxLength={3}
              placeholder="Area code"
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, ""))}
              className="w-24 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-mono"
            />
            <button
              onClick={handleSearch}
              disabled={searching || areaCode.length !== 3}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {searching ? "Searching..." : "Search Available Numbers"}
            </button>
          </div>

          {/* Results */}
          {available.length > 0 && (
            <div className="space-y-2">
              {available.map((num) => (
                <div
                  key={num.phoneNumber}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900 font-mono">
                      {formatPhone(num.phoneNumber)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {[num.locality, num.region].filter(Boolean).join(", ")}
                    </p>
                  </div>
                  <button
                    onClick={() => handlePurchase(num.phoneNumber)}
                    disabled={purchasing === num.phoneNumber}
                    className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {purchasing === num.phoneNumber ? "Purchasing..." : "Purchase"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {searching && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent" />
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">📱</span>
          </div>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Phone & SMS</h2>
          <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
            Get a dedicated phone number to call and text property owners directly from VettdRE.
            Available on Pro, Team, and Enterprise plans.
          </p>
          <a
            href="/settings/billing"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors"
          >
            Upgrade to Pro
          </a>
        </div>
      )}
    </div>
  );
}
