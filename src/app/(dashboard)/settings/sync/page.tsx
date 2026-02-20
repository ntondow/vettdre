"use client";

import { useState, useEffect } from "react";
import { getSyncSettings, saveSyncSettings, getSyncStats } from "../actions";

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full transition-colors ${value ? "bg-blue-600" : "bg-slate-200"}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? "translate-x-4" : ""}`} />
    </button>
  );
}

const fmtDate = (d: string | null) => d ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(d)) : "Never";

export default function SyncPage() {
  const [settings, setSettings] = useState({
    autoSync: true,
    syncFrequency: 15,
    syncDepth: "30d",
    syncLabels: ["INBOX", "SENT"],
    lastSyncAt: null as string | null,
  });
  const [stats, setStats] = useState<{ totalEmails: number; linkedContacts: number; leadsCreated: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([getSyncSettings(), getSyncStats()]).then(([s, st]) => {
      if (s) setSettings({
        autoSync: s.autoSync,
        syncFrequency: s.syncFrequency,
        syncDepth: s.syncDepth,
        syncLabels: s.syncLabels || ["INBOX", "SENT"],
        lastSyncAt: s.lastSyncAt,
      });
      setStats(st);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await saveSyncSettings({
      autoSync: settings.autoSync,
      syncFrequency: settings.syncFrequency,
      syncDepth: settings.syncDepth,
      syncLabels: settings.syncLabels,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleLabel = (label: string) => {
    setSettings(prev => ({
      ...prev,
      syncLabels: prev.syncLabels.includes(label)
        ? prev.syncLabels.filter(l => l !== label)
        : [...prev.syncLabels, label],
    }));
  };

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-6 bg-slate-100 rounded w-48" /><div className="h-40 bg-slate-100 rounded" /></div>;

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 mb-1">Email Sync</h1>
      <p className="text-sm text-slate-500 mb-6">Configure how emails are synced from Gmail</p>

      {/* Sync stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Emails Synced", value: stats.totalEmails.toLocaleString() },
            { label: "Contacts Linked", value: stats.linkedContacts.toLocaleString() },
            { label: "Leads Created", value: stats.leadsCreated.toLocaleString() },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Auto-sync</p>
            <p className="text-xs text-slate-400">Automatically sync new emails in the background</p>
          </div>
          <Toggle value={settings.autoSync} onChange={v => setSettings({ ...settings, autoSync: v })} />
        </div>

        {settings.autoSync && (
          <div>
            <label className="text-sm font-medium text-slate-700">Sync Frequency</label>
            <select value={settings.syncFrequency} onChange={e => setSettings({ ...settings, syncFrequency: parseInt(e.target.value) })}
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value={5}>Every 5 minutes</option>
              <option value={15}>Every 15 minutes</option>
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every hour</option>
            </select>
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-slate-700">Sync Depth</label>
          <p className="text-xs text-slate-400 mb-1">How far back to sync on initial setup</p>
          <select value={settings.syncDepth} onChange={e => setSettings({ ...settings, syncDepth: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Gmail Labels to Sync</label>
          <p className="text-xs text-slate-400 mb-2">Choose which Gmail labels to include</p>
          <div className="flex gap-2 flex-wrap">
            {["INBOX", "SENT", "IMPORTANT", "STARRED"].map(label => (
              <button key={label} onClick={() => toggleLabel(label)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  settings.syncLabels.includes(label)
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-400">Last sync: {fmtDate(settings.lastSyncAt)}</p>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${saved ? "bg-emerald-500" : "bg-blue-600 hover:bg-blue-700"} disabled:opacity-50`}>
        {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
