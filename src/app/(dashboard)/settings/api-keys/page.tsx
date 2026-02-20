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
  { name: "Apollo.io", key: "apollo", icon: "🚀", desc: "Professional enrichment and lead verification" },
  { name: "Tracerfy", key: "tracerfy", icon: "📋", desc: "Backup skip trace (CSV-based)" },
  { name: "Anthropic (Claude AI)", key: "anthropic", icon: "🤖", desc: "Email parsing, ownership analysis, AI features" },
  { name: "Gmail", key: "gmail", icon: "📬", desc: "Email sync and send" },
  { name: "Google Calendar", key: "gcal", icon: "📅", desc: "Showing scheduling and availability", comingSoon: true },
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

              {/* Test connection + result */}
              {!api.comingSoon && configured && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3">
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
