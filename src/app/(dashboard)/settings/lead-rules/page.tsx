"use client";

import { useState, useEffect } from "react";
import { getLeadAssignmentRule, saveLeadAssignmentRule, getTeamMembers } from "../actions";

const methods = [
  { id: "manual", label: "Manual Assignment", desc: "All leads go to inbox. Manually assign to agents." },
  { id: "round_robin", label: "Round Robin", desc: "New leads distributed evenly across agents in order." },
  { id: "by_source", label: "By Source", desc: "Assign leads based on where they came from (StreetEasy, Zillow, etc.)." },
  { id: "by_geography", label: "By Geography", desc: "Assign leads based on borough or neighborhood." },
];

const sources = ["streeteasy", "zillow", "realtor", "apartments_com", "renthop", "referral", "website", "cold"];
const boroughs = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

export default function LeadRulesPage() {
  const [rule, setRule] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [method, setMethod] = useState("manual");
  const [sourceMap, setSourceMap] = useState<Record<string, string>>({});
  const [geoMap, setGeoMap] = useState<Record<string, string>>({});
  const [agentOrder, setAgentOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([getLeadAssignmentRule(), getTeamMembers()]).then(([r, m]) => {
      setMembers(m.filter((x: any) => x.isActive));
      if (r) {
        setMethod(r.method);
        setSourceMap(r.rules || {});
        setGeoMap(r.rules || {});
        setAgentOrder(r.agentOrder || []);
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const data: any = { method };
    if (method === "by_source") data.rules = sourceMap;
    if (method === "by_geography") data.rules = geoMap;
    if (method === "round_robin") data.agentOrder = agentOrder.length ? agentOrder : members.map((m: any) => m.id);
    await saveLeadAssignmentRule(data);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-6 bg-slate-100 rounded w-48" /><div className="h-40 bg-slate-100 rounded" /></div>;

  const activeMembers = members.filter((m: any) => m.role !== "viewer");

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 mb-1">Lead Assignment Rules</h1>
      <p className="text-sm text-slate-500 mb-6">Configure how new leads are assigned to agents</p>

      {/* Method selector */}
      <div className="space-y-3 mb-8">
        {methods.map(m => (
          <label key={m.id}
            className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
              method === m.id ? "border-blue-500 bg-blue-50/50" : "border-slate-200 hover:border-slate-300"
            }`}>
            <input type="radio" name="method" value={m.id} checked={method === m.id}
              onChange={() => setMethod(m.id)} className="mt-1 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-slate-900">{m.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
            </div>
          </label>
        ))}
      </div>

      {/* Round Robin: Agent order */}
      {method === "round_robin" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Agent Order</h3>
          <p className="text-xs text-slate-400 mb-4">Leads are assigned in this order, cycling through agents.</p>
          <div className="space-y-2">
            {(agentOrder.length ? agentOrder : activeMembers.map((m: any) => m.id)).map((id, idx) => {
              const member = activeMembers.find((m: any) => m.id === id);
              return member ? (
                <div key={id} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                  <span className="text-xs font-bold text-slate-400 w-6">{idx + 1}.</span>
                  <span className="text-sm text-slate-700">{member.fullName}</span>
                  <span className="text-xs text-slate-400">{member.email}</span>
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* By Source: Source → Agent mapping */}
      {method === "by_source" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Source Assignments</h3>
          <div className="space-y-3">
            {sources.map(src => (
              <div key={src} className="flex items-center gap-3">
                <span className="text-sm text-slate-700 w-32 capitalize">{src.replace(/_/g, " ")}</span>
                <select value={sourceMap[src] || ""} onChange={e => setSourceMap({ ...sourceMap, [src]: e.target.value })}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
                  <option value="">Unassigned</option>
                  {activeMembers.map((m: any) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By Geography: Borough → Agent mapping */}
      {method === "by_geography" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Borough Assignments</h3>
          <div className="space-y-3">
            {boroughs.map(borough => (
              <div key={borough} className="flex items-center gap-3">
                <span className="text-sm text-slate-700 w-32">{borough}</span>
                <select value={geoMap[borough] || ""} onChange={e => setGeoMap({ ...geoMap, [borough]: e.target.value })}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
                  <option value="">Unassigned</option>
                  {activeMembers.map((m: any) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={handleSave} disabled={saving}
        className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${saved ? "bg-emerald-500" : "bg-blue-600 hover:bg-blue-700"} disabled:opacity-50`}>
        {saving ? "Saving..." : saved ? "Saved!" : "Save Rules"}
      </button>
    </div>
  );
}
