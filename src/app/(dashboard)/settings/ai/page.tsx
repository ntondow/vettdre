"use client";

import { useState, useEffect } from "react";
import { getAiSettings, saveAiSettings } from "../actions";

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full transition-colors ${value ? "bg-blue-600" : "bg-slate-200"}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? "translate-x-4" : ""}`} />
    </button>
  );
}

export default function AiSettingsPage() {
  const [settings, setSettings] = useState({
    autoResponseEnabled: false,
    autoResponseMode: "draft",
    responseDelay: 5,
    responseTone: "professional",
    customInstructions: "",
    autoParseEmails: true,
    autoCategorize: true,
    parseModel: "sonnet",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAiSettings().then(s => {
      if (s) setSettings({
        autoResponseEnabled: s.autoResponseEnabled,
        autoResponseMode: s.autoResponseMode,
        responseDelay: s.responseDelay,
        responseTone: s.responseTone,
        customInstructions: s.customInstructions || "",
        autoParseEmails: s.autoParseEmails,
        autoCategorize: s.autoCategorize,
        parseModel: s.parseModel,
      });
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await saveAiSettings({ ...settings, customInstructions: settings.customInstructions || null });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-6 bg-slate-100 rounded w-48" /><div className="h-60 bg-slate-100 rounded" /></div>;

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 mb-1">AI Settings</h1>
      <p className="text-sm text-slate-500 mb-6">Configure AI-powered features for email and leads</p>

      {/* Auto-Response */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h3 className="text-sm font-bold text-slate-900 mb-1">AI Auto-Response</h3>
        <p className="text-xs text-slate-400 mb-4">Let AI draft or send responses to incoming emails</p>

        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Enable Auto-Response</p>
              <p className="text-xs text-slate-400">AI will draft responses to inbound leads</p>
            </div>
            <Toggle value={settings.autoResponseEnabled} onChange={v => setSettings({ ...settings, autoResponseEnabled: v })} />
          </div>

          {settings.autoResponseEnabled && (
            <>
              <div>
                <label className="text-sm font-medium text-slate-700">Mode</label>
                <select value={settings.autoResponseMode} onChange={e => setSettings({ ...settings, autoResponseMode: e.target.value })}
                  className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="draft">Draft Only — AI writes, you review</option>
                  <option value="auto_send">Auto-Send — AI sends low-urgency, drafts high-urgency</option>
                  <option value="off">Off</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Response Delay</label>
                <p className="text-xs text-slate-400 mb-1">Wait before AI responds (avoids looking automated)</p>
                <select value={settings.responseDelay} onChange={e => setSettings({ ...settings, responseDelay: parseInt(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value={0}>Immediate</option>
                  <option value={5}>5 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Tone</label>
                <select value={settings.responseTone} onChange={e => setSettings({ ...settings, responseTone: e.target.value })}
                  className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="casual">Casual</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Custom Instructions</label>
                <p className="text-xs text-slate-400 mb-1">Special instructions for the AI (e.g. "Always mention Brooklyn rentals")</p>
                <textarea value={settings.customInstructions} onChange={e => setSettings({ ...settings, customInstructions: e.target.value })}
                  rows={4} placeholder="Example: Always mention that I specialize in Brooklyn rentals. Never discuss pricing over email."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* AI Parsing */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h3 className="text-sm font-bold text-slate-900 mb-1">AI Email Parsing</h3>
        <p className="text-xs text-slate-400 mb-4">Automatically analyze incoming emails for lead data</p>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Auto-parse inbound emails</p>
              <p className="text-xs text-slate-400">Extract name, phone, budget, area from new emails</p>
            </div>
            <Toggle value={settings.autoParseEmails} onChange={v => setSettings({ ...settings, autoParseEmails: v })} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Auto-categorize emails</p>
              <p className="text-xs text-slate-400">Sort into Lead, Personal, Newsletter, Transactional</p>
            </div>
            <Toggle value={settings.autoCategorize} onChange={v => setSettings({ ...settings, autoCategorize: v })} />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">AI Model</label>
            <select value={settings.parseModel} onChange={e => setSettings({ ...settings, parseModel: e.target.value })}
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="sonnet">Claude Sonnet (Recommended — more accurate)</option>
              <option value="haiku">Claude Haiku (Cheaper — less accurate)</option>
            </select>
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${saved ? "bg-emerald-500" : "bg-blue-600 hover:bg-blue-700"} disabled:opacity-50`}>
        {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
