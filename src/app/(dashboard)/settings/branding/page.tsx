"use client";

import { useState, useEffect } from "react";
import { getBrandSettings, saveBrandSettings } from "../actions";

export default function BrandingPage() {
  const [settings, setSettings] = useState({
    primaryColor: "#2563EB",
    companyName: "",
    tagline: "",
    websiteUrl: "",
    logoUrl: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getBrandSettings().then(s => {
      if (s) setSettings({
        primaryColor: s.primaryColor || "#2563EB",
        companyName: s.companyName || "",
        tagline: s.tagline || "",
        websiteUrl: s.websiteUrl || "",
        logoUrl: s.logoUrl || "",
      });
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await saveBrandSettings({
      primaryColor: settings.primaryColor,
      companyName: settings.companyName || null,
      tagline: settings.tagline || null,
      websiteUrl: settings.websiteUrl || null,
      logoUrl: settings.logoUrl || null,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-6 bg-slate-100 rounded w-48" /><div className="h-40 bg-slate-100 rounded" /></div>;

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 mb-1">Branding</h1>
      <p className="text-sm text-slate-500 mb-6">Customize your brand appearance in emails and templates</p>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium text-slate-700">Company Name</label>
            <input value={settings.companyName} onChange={e => setSettings({ ...settings, companyName: e.target.value })}
              placeholder="e.g. Cammeby's International"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Tagline</label>
            <input value={settings.tagline} onChange={e => setSettings({ ...settings, tagline: e.target.value })}
              placeholder="e.g. NYC's Premier Real Estate Brokerage"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-slate-400 mt-1">Optional tagline shown in email templates</p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Website URL</label>
            <input value={settings.websiteUrl} onChange={e => setSettings({ ...settings, websiteUrl: e.target.value })}
              placeholder="https://example.com"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium text-slate-700">Primary Brand Color</label>
              <div className="flex items-center gap-3 mt-1">
                <input type="color" value={settings.primaryColor} onChange={e => setSettings({ ...settings, primaryColor: e.target.value })}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200" />
                <input value={settings.primaryColor} onChange={e => setSettings({ ...settings, primaryColor: e.target.value })}
                  className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <p className="text-xs text-slate-400 mt-1">Used in email signature, templates, and alerts</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Logo URL</label>
            <input value={settings.logoUrl} onChange={e => setSettings({ ...settings, logoUrl: e.target.value })}
              placeholder="https://example.com/logo.png"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-slate-400 mt-1">Square logo for emails and client-facing materials</p>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Preview</h3>
        <div className="border border-slate-200 rounded-lg p-6 bg-slate-50">
          <div className="flex items-center gap-4 mb-3">
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="w-10 h-10 rounded object-cover" />
            ) : (
              <div className="w-10 h-10 rounded flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: settings.primaryColor }}>
                {(settings.companyName || "V")[0]}
              </div>
            )}
            <div>
              <p className="text-sm font-bold" style={{ color: settings.primaryColor }}>{settings.companyName || "Your Company"}</p>
              {settings.tagline && <p className="text-xs text-slate-500">{settings.tagline}</p>}
            </div>
          </div>
          <div className="h-px w-full" style={{ backgroundColor: settings.primaryColor, opacity: 0.2 }} />
          <p className="text-xs text-slate-400 mt-2">{settings.websiteUrl || "https://example.com"}</p>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${saved ? "bg-emerald-500" : "bg-blue-600 hover:bg-blue-700"} disabled:opacity-50`}>
        {saving ? "Saving..." : saved ? "Saved!" : "Save Branding"}
      </button>
    </div>
  );
}
