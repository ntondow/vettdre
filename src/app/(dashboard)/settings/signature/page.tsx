"use client";

import { useEffect, useState, useCallback } from "react";
import { getSignature, getProfile, saveSignature } from "../actions";

type Template = "classic" | "with_logo" | "minimal";

interface ProfileData {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  title: string | null;
  brokerage: string | null;
}

interface SignatureData {
  template: string;
  accentColor: string;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
}

const TEMPLATES: { key: Template; label: string; description: string }[] = [
  { key: "classic", label: "Classic", description: "Name, title, company, and contact info in a clean layout" },
  { key: "with_logo", label: "With Logo", description: "Logo alongside your details with icons for each field" },
  { key: "minimal", label: "Minimal", description: "Just your name and phone -- nothing more" },
];

function buildSignatureHtml(
  template: Template,
  profile: ProfileData,
  accentColor: string,
  linkedinUrl: string,
  websiteUrl: string,
): string {
  const name = profile.fullName || "Your Name";
  const title = profile.title || "Your Title";
  const company = profile.brokerage || "Your Company";
  const phone = profile.phone || "000-000-0000";
  const email = profile.email || "you@email.com";

  const linkedinLink = linkedinUrl
    ? `<a href="${linkedinUrl}" style="color:${accentColor};text-decoration:none;">LinkedIn</a>`
    : "LinkedIn";

  const websiteLink = websiteUrl
    ? `<a href="${websiteUrl}" style="color:${accentColor};text-decoration:none;">${websiteUrl.replace(/^https?:\/\//, "")}</a>`
    : "Website";

  switch (template) {
    case "classic":
      return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#334155;">
  <div style="font-size:16px;font-weight:700;color:${accentColor};">${name}</div>
  <div style="font-size:13px;color:#64748b;">${title}</div>
  <div style="font-size:13px;color:#334155;">${company} | ${phone}</div>
  <div style="font-size:13px;color:#334155;">
    <a href="mailto:${email}" style="color:${accentColor};text-decoration:none;">${email}</a> | ${linkedinLink}
  </div>
</div>`;

    case "with_logo":
      return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#334155;display:flex;gap:16px;align-items:flex-start;">
  <div style="width:60px;height:60px;border-radius:8px;background:${accentColor};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:22px;flex-shrink:0;">${name.charAt(0)}</div>
  <div>
    <div><span style="font-size:16px;font-weight:700;color:${accentColor};">${name}</span> <span style="color:#94a3b8;">|</span> <span style="font-size:13px;color:#64748b;">${title}</span></div>
    <div style="font-size:13px;color:#334155;">${company}</div>
    <div style="font-size:13px;color:#334155;">\u{1F4DE} ${phone} | \u{2709}\u{FE0F} <a href="mailto:${email}" style="color:${accentColor};text-decoration:none;">${email}</a></div>
    <div style="font-size:13px;color:#334155;">\u{1F517} ${linkedinLink} | \u{1F310} ${websiteLink}</div>
  </div>
</div>`;

    case "minimal":
      return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#334155;">
  <div style="border-top:2px solid ${accentColor};width:40px;margin-bottom:8px;"></div>
  <div style="font-size:14px;color:#334155;">${name} \u{00B7} ${phone}</div>
</div>`;

    default:
      return "";
  }
}

export default function SignaturePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [template, setTemplate] = useState<Template>("classic");
  const [accentColor, setAccentColor] = useState("#2563EB");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [sig, prof] = await Promise.all([getSignature(), getProfile()]);
        if (prof) setProfile(prof as ProfileData);
        if (sig) {
          setTemplate((sig.template || "classic") as Template);
          setAccentColor(sig.accentColor || "#2563EB");
          setLinkedinUrl(sig.linkedinUrl || "");
          setWebsiteUrl(sig.websiteUrl || "");
        }
      } catch (e) {
        console.error("Failed to load signature data:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const signatureHtml = useCallback(() => {
    if (!profile) return "";
    return buildSignatureHtml(template, profile, accentColor, linkedinUrl, websiteUrl);
  }, [profile, template, accentColor, linkedinUrl, websiteUrl]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const html = signatureHtml();
      await saveSignature({
        template,
        html,
        accentColor,
        linkedinUrl: linkedinUrl || null,
        websiteUrl: websiteUrl || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("Failed to save signature:", e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Email Signature</h1>
          <p className="text-sm text-slate-500 mt-1">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Email Signature</h1>
        <p className="text-sm text-slate-500 mt-1">
          Choose a template and customize your email signature
        </p>
      </div>

      {/* Template Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-bold text-slate-900 mb-4">Choose Template</h2>
        <div className="grid grid-cols-3 gap-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTemplate(t.key)}
              className={`border-2 rounded-xl p-4 cursor-pointer text-left transition-colors ${
                template === t.key
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="text-sm font-semibold text-slate-900 mb-1">{t.label}</div>
              <div className="text-xs text-slate-500 leading-relaxed">{t.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Live Preview */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-bold text-slate-900 mb-4">Preview</h2>
        <div
          className="border border-slate-200 rounded-lg p-6 bg-white"
          dangerouslySetInnerHTML={{ __html: signatureHtml() }}
        />
      </div>

      {/* Customization Fields */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-bold text-slate-900 mb-4">Customize</h2>
        <div className="space-y-4">
          {/* LinkedIn URL */}
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              LinkedIn URL
            </label>
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/yourprofile"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Website URL */}
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Website URL
            </label>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://yourwebsite.com"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Accent Color */}
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Accent Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Save Signature"}
        </button>
        {saved && (
          <span className="text-sm text-emerald-600 font-medium">Signature saved!</span>
        )}
      </div>
    </div>
  );
}
