"use client";

import { useState, useEffect } from "react";
import { getPipelines, updatePipelineStages } from "../actions";

const COLORS = ["#3B82F6", "#F59E0B", "#F97316", "#8B5CF6", "#10B981", "#22C55E", "#EF4444", "#64748B"];

interface Stage { id: string; name: string; color: string; icon?: string; isDefault?: boolean; }

export default function PipelinePage() {
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3B82F6");

  useEffect(() => {
    getPipelines().then(p => {
      setPipelines(p);
      if (p.length > 0) {
        setSelectedPipeline(p[0].id);
        setStages(Array.isArray(p[0].stages) ? p[0].stages : []);
      }
      setLoading(false);
    });
  }, []);

  const handleSelectPipeline = (id: string) => {
    const p = pipelines.find(x => x.id === id);
    setSelectedPipeline(id);
    setStages(p && Array.isArray(p.stages) ? p.stages : []);
  };

  const handleSave = async () => {
    if (!selectedPipeline) return;
    setSaving(true);
    await updatePipelineStages(selectedPipeline, stages);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addStage = () => {
    if (!newName.trim()) return;
    setStages([...stages, { id: crypto.randomUUID(), name: newName, color: newColor }]);
    setNewName(""); setNewColor("#3B82F6");
  };

  const removeStage = (idx: number) => {
    if (!confirm(`Remove stage "${stages[idx].name}"?`)) return;
    setStages(stages.filter((_, i) => i !== idx));
  };

  const moveStage = (idx: number, dir: -1 | 1) => {
    const next = [...stages];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setStages(next);
  };

  const updateStage = (idx: number, field: string, value: string) => {
    const next = [...stages];
    (next[idx] as any)[field] = value;
    setStages(next);
  };

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-6 bg-slate-100 rounded w-48" /><div className="h-60 bg-slate-100 rounded" /></div>;

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 mb-1">Pipeline Settings</h1>
      <p className="text-sm text-slate-500 mb-6">Customize your deal pipeline stages</p>

      {/* Pipeline selector */}
      {pipelines.length > 1 && (
        <div className="flex gap-2 mb-6">
          {pipelines.map(p => (
            <button key={p.id} onClick={() => handleSelectPipeline(p.id)}
              className={`px-3 py-1.5 text-sm rounded-lg border ${selectedPipeline === p.id ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Stages list */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Stages</h3>
        <div className="space-y-2">
          {stages.map((stage, idx) => (
            <div key={stage.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg group">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveStage(idx, -1)} disabled={idx === 0} className="text-slate-400 hover:text-slate-600 disabled:opacity-30 text-[10px]">▲</button>
                <button onClick={() => moveStage(idx, 1)} disabled={idx === stages.length - 1} className="text-slate-400 hover:text-slate-600 disabled:opacity-30 text-[10px]">▼</button>
              </div>
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
              {editIdx === idx ? (
                <>
                  <input value={stage.name} onChange={e => updateStage(idx, "name", e.target.value)} autoFocus
                    className="flex-1 border border-slate-200 rounded px-2 py-1 text-sm" onBlur={() => setEditIdx(null)} onKeyDown={e => e.key === "Enter" && setEditIdx(null)} />
                  <input type="color" value={stage.color} onChange={e => updateStage(idx, "color", e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-slate-700 cursor-pointer" onClick={() => setEditIdx(idx)}>{stage.name}</span>
                  {stage.isDefault && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">Default</span>}
                </>
              )}
              <button onClick={() => removeStage(idx)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-sm">&times;</button>
            </div>
          ))}
        </div>

        {/* Add new stage */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New stage name"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={e => e.key === "Enter" && addStage()} />
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
          <button onClick={addStage} disabled={!newName.trim()}
            className="px-3 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 disabled:opacity-50">
            Add
          </button>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${saved ? "bg-emerald-500" : "bg-blue-600 hover:bg-blue-700"} disabled:opacity-50`}>
        {saving ? "Saving..." : saved ? "Saved!" : "Save Stages"}
      </button>
    </div>
  );
}
