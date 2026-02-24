"use client";

import { useState, useEffect } from "react";
import { getApiKeyStatus, testApiConnection } from "../actions";

interface ApiInfo {
  name: string;
  key: string;
  icon: string;
  desc: string;
  comingSoon?: boolean;
}

const apis: ApiInfo[] = [
  { name: "People Data Labs", key: "pdl", icon: "🔍", desc: "Skip tracing and contact enrichment" },
  { name: "Apollo.io", key: "apollo", icon: "🚀", desc: "People Search, People Enrichment, Organization Intel, Bulk Enrich" },
  { name: "Tracerfy", key: "tracerfy", icon: "📋", desc: "Backup skip trace (CSV-based)" },
  { name: "Anthropic (Claude AI)", key: "anthropic", icon: "🤖", desc: "Email parsing, ownership analysis, AI features" },
  { name: "Gmail", key: "gmail", icon: "📬", desc: "Email sync and send" },
  { name: "Google Calendar", key: "gcal", icon: "📅", desc: "Showing scheduling and availability", comingSoon: true },
  { name: "FRED (Federal Reserve)", key: "fred", icon: "📉", desc: "Live mortgage rates and economic indicators" },
  { name: "HUD Fair Market Rents", key: "hud", icon: "🏘️", desc: "Zip-level Fair Market Rents from HUD" },
  { name: "Fannie Mae Loan Lookup", key: "fannie", icon: "🏦", desc: "Determine if property has GSE-backed mortgage" },
];

export default function ApiKeysPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message: string }>>({});

  useEffect(() => { getApiKeyStatus().then(s => { setStatus(s); setLoading(false); }); }, []);

  const handleTest = async (key: string) => {
    setTesting(key);
    const result = await testApiConnection(key);
    setTestResult(prev => ({ ...prev, [key]: result }));
    setTesting(null);
  };

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 mb-1">API Keys & Integrations</h1>
      <p className="text-sm text-slate-500 mb-6">Manage external service connections</p>

      <div className="space-y-4">
        {apis.map(api => {
          const info = status?.[api.key];
          const configured = info?.configured;
          const result = testResult[api.key];

          return (
            <div key={api.key} className={`bg-white rounded-xl border border-slate-200 p-5 ${api.comingSoon ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <span className="text-xl">{api.icon}</span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{api.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{api.desc}</p>
                    {info?.preview && (
                      <p className="text-xs font-mono text-slate-500 mt-1">{info.preview}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {api.comingSoon ? (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-400">Coming Soon</span>
                  ) : loading ? (
                    <div className="w-20 h-6 bg-slate-100 rounded-full animate-pulse" />
                  ) : (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      configured ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                    }`}>
                      {configured ? "Configured" : "Not Set"}
                    </span>
                  )}
                </div>
              </div>

              {/* Apollo-specific details */}
              {api.key === "apollo" && configured && !loading && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                    <div className="bg-indigo-50 rounded-lg p-2.5">
                      <p className="text-[10px] text-indigo-400 uppercase font-semibold">Endpoints Available</p>
                      <div className="mt-1 space-y-0.5 text-indigo-700">
                        <p>People Search <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded">FREE</span></p>
                        <p>People Enrichment <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded">CREDITS</span></p>
                        <p>Bulk Enrichment <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded">CREDITS</span></p>
                        <p>Org Enrichment <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded">CREDITS</span></p>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Used In</p>
                      <div className="mt-1 space-y-0.5 text-slate-600">
                        <p>Building Profiles (auto)</p>
                        <p>Contact Enrichment</p>
                        <p>Bulk Enrich (contacts)</p>
                        <p>Lead Verification</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Test connection + result */}
              {!api.comingSoon && configured && (
                <div className={"flex items-center gap-3 " + (api.key === "apollo" ? "" : "mt-3 pt-3 border-t border-slate-100")}>
                  <button onClick={() => handleTest(api.key)} disabled={testing === api.key}
                    className="text-xs px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 disabled:opacity-50 font-medium transition-colors">
                    {testing === api.key ? "Testing..." : "Test Connection"}
                  </button>
                  {result && (
                    <span className={`text-xs font-medium ${result.success ? "text-emerald-600" : "text-red-600"}`}>
                      {result.success ? "Connected" : result.message}
                    </span>
                  )}
                </div>
              )}

              {!api.comingSoon && !configured && !loading && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-400">
                    {api.key === "gmail"
                      ? "Connect via Settings > Gmail"
                      : `Set ${api.key.toUpperCase()}_API_KEY in your .env file`
                    }
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
