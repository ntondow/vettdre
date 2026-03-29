"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Globe, Copy, Check, ExternalLink, Lock, Loader2, Code2,
} from "lucide-react";
import { getWebChatConfig, updateLeasingConfig } from "../../actions";

export default function WebChatSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const configId = params.configId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [webChatEnabled, setWebChatEnabled] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [tier, setTier] = useState("free");
  const [propertyName, setPropertyName] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const isTeamTier = tier === "team";
  const hostedUrl = slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/chat/${slug}` : null;
  const embedSnippet = slug
    ? `<script src="${typeof window !== "undefined" ? window.location.origin : ""}/leasing-widget.js" data-config="${slug}" data-color="#1D4ED8"></script>`
    : null;

  useEffect(() => {
    (async () => {
      const res = await getWebChatConfig(configId);
      if (!res.error) {
        setWebChatEnabled(res.webChatEnabled);
        setSlug(res.slug);
        setTier(res.tier);
        setPropertyName(res.propertyName);
      }
      setLoading(false);
    })();
  }, [configId]);

  const handleToggle = useCallback(async () => {
    if (!isTeamTier) return;
    setSaving(true);
    const newValue = !webChatEnabled;
    const res = await updateLeasingConfig(configId, { webChatEnabled: newValue });
    if (res.success) setWebChatEnabled(newValue);
    setSaving(false);
  }, [configId, webChatEnabled, isTeamTier]);

  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <button
        onClick={() => router.push("/leasing")}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leasing
      </button>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
          <Globe className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Web Chat Widget</h1>
          <p className="text-sm text-slate-500">{propertyName}</p>
        </div>
      </div>

      {/* Team gate */}
      {!isTeamTier && (
        <div className="mb-6 p-4 rounded-xl bg-violet-50 border border-violet-200">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-violet-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-violet-900">Team Plan Required</p>
              <p className="text-sm text-violet-700 mt-1">
                Web Chat Widget is available on the Team plan. Embed a live AI chat
                on your property website to capture leads 24/7.
              </p>
              <button
                onClick={() => router.push("/settings/billing?upgrade=leasing_team")}
                className="mt-3 px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors"
              >
                Upgrade to Team
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enable toggle */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Enable Web Chat</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Allow prospects to chat with your AI agent from any website
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={!isTeamTier || saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              webChatEnabled ? "bg-blue-600" : "bg-slate-200"
            } ${!isTeamTier ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                webChatEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Hosted URL */}
      {hostedUrl && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ExternalLink className="w-4 h-4 text-slate-400" />
            <p className="text-sm font-semibold text-slate-900">Hosted Chat Page</p>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Share this link directly with prospects or use it as a standalone chat page.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 text-sm bg-slate-50 rounded-lg border border-slate-200 truncate text-slate-700">
              {hostedUrl}
            </code>
            <button
              onClick={() => copyToClipboard(hostedUrl, "url")}
              className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors flex items-center gap-1.5 flex-shrink-0"
            >
              {copiedField === "url" ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedField === "url" ? "Copied" : "Copy"}
            </button>
            <a
              href={hostedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors flex-shrink-0"
            >
              Open
            </a>
          </div>
        </div>
      )}

      {/* Embed code */}
      {embedSnippet && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Code2 className="w-4 h-4 text-slate-400" />
            <p className="text-sm font-semibold text-slate-900">Embed Code</p>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Add this snippet before the closing <code className="text-xs px-1 py-0.5 bg-slate-100 rounded">&lt;/body&gt;</code> tag
            on your property website. The widget appears as a floating chat button.
          </p>
          <div className="relative">
            <pre className="px-3 py-3 text-xs bg-slate-900 text-slate-200 rounded-lg overflow-x-auto font-mono leading-relaxed">
              {embedSnippet}
            </pre>
            <button
              onClick={() => copyToClipboard(embedSnippet, "embed")}
              className="absolute top-2 right-2 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-md transition-colors flex items-center gap-1"
            >
              {copiedField === "embed" ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              {copiedField === "embed" ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-3 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">
              <strong>Customize:</strong> Change <code className="text-xs px-1 py-0.5 bg-blue-100 rounded">data-color</code> to match
              your brand. The widget button and accents will use this color.
            </p>
          </div>
        </div>
      )}

      {/* Status */}
      {webChatEnabled && slug && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <p className="text-sm font-medium text-green-800">Web Chat is live</p>
          </div>
          <p className="text-xs text-green-600 mt-1">
            Prospects can chat with your AI agent. Conversations appear in your Leasing dashboard.
          </p>
        </div>
      )}

      {!webChatEnabled && isTeamTier && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-sm text-slate-600">
            Enable Web Chat above to start receiving conversations from your website.
          </p>
        </div>
      )}
    </div>
  );
}
