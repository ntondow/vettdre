"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, X, Image as ImageIcon, Check } from "lucide-react";
import { getBrandSettings, saveBrandSettings, uploadBrandLogo } from "../actions";

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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBrandSettings().then((s) => {
      if (s)
        setSettings({
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

  const handleLogoUpload = useCallback(async (file: File) => {
    setUploadError("");
    if (!file.type.startsWith("image/")) {
      setUploadError("Please upload a PNG, JPG, or SVG image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError("File too large — max 2MB");
      return;
    }

    setUploading(true);
    const fd = new FormData();
    fd.append("logo", file);
    const result = await uploadBrandLogo(fd);
    setUploading(false);

    if (result.error) {
      setUploadError(result.error);
    } else if (result.url) {
      // Append cache-buster to force reload in preview
      setSettings((prev) => ({ ...prev, logoUrl: result.url + "?t=" + Date.now() }));
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleLogoUpload(file);
    },
    [handleLogoUpload],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleLogoUpload(file);
      e.target.value = "";
    },
    [handleLogoUpload],
  );

  const removeLogo = () => {
    setSettings((prev) => ({ ...prev, logoUrl: "" }));
  };

  if (loading)
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-slate-100 rounded w-48" />
        <div className="h-40 bg-slate-100 rounded" />
      </div>
    );

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 mb-1">Branding</h1>
      <p className="text-sm text-slate-500 mb-6">Customize your brand appearance in emails, onboarding documents, and templates</p>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="space-y-5">
          {/* Logo Upload */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Logo</label>
            {settings.logoUrl ? (
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <img
                    src={settings.logoUrl}
                    alt="Brokerage Logo"
                    className="w-20 h-20 rounded-lg border border-slate-200 object-contain bg-white p-1"
                  />
                  <button
                    onClick={removeLogo}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Logo uploaded</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-1"
                  >
                    Replace
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-blue-400 bg-blue-50"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
                }`}
              >
                {uploading ? (
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
                    <p className="text-sm text-slate-500">Uploading...</p>
                  </div>
                ) : (
                  <>
                    <ImageIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-600 font-medium">
                      <span className="text-blue-600">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-slate-400 mt-1">PNG, JPG, or SVG (max 2MB)</p>
                  </>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={handleFileSelect}
              className="hidden"
            />
            {uploadError && <p className="text-xs text-red-500 mt-2">{uploadError}</p>}
            <p className="text-xs text-slate-400 mt-2">
              Your logo appears on the Tenant Representation Agreement and client-facing emails
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Company Name</label>
            <input
              value={settings.companyName}
              onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              placeholder="e.g. Cammeby's International"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Tagline</label>
            <input
              value={settings.tagline}
              onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
              placeholder="e.g. NYC's Premier Real Estate Brokerage"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">Optional tagline shown in email templates</p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Website URL</label>
            <input
              value={settings.websiteUrl}
              onChange={(e) => setSettings({ ...settings, websiteUrl: e.target.value })}
              placeholder="https://example.com"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium text-slate-700">Primary Brand Color</label>
              <div className="flex items-center gap-3 mt-1">
                <input
                  type="color"
                  value={settings.primaryColor}
                  onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200"
                />
                <input
                  value={settings.primaryColor}
                  onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                  className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">Used in email signature, templates, and alerts</p>
            </div>
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
              <div
                className="w-10 h-10 rounded flex items-center justify-center text-white text-sm font-bold"
                style={{ backgroundColor: settings.primaryColor }}
              >
                {(settings.companyName || "V")[0]}
              </div>
            )}
            <div>
              <p className="text-sm font-bold" style={{ color: settings.primaryColor }}>
                {settings.companyName || "Your Company"}
              </p>
              {settings.tagline && <p className="text-xs text-slate-500">{settings.tagline}</p>}
            </div>
          </div>
          <div className="h-px w-full" style={{ backgroundColor: settings.primaryColor, opacity: 0.2 }} />
          <p className="text-xs text-slate-400 mt-2">{settings.websiteUrl || "https://example.com"}</p>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className={`inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${
          saved ? "bg-emerald-500" : "bg-blue-600 hover:bg-blue-700"
        } disabled:opacity-50`}
      >
        {saving ? "Saving..." : saved ? <><Check className="w-4 h-4" /> Saved!</> : "Save Branding"}
      </button>
    </div>
  );
}
