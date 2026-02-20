"use client";

import { useState } from "react";
import { createLabel, type LabelData } from "../label-actions";

const COLOR_OPTIONS = [
  "#ef4444", "#f59e0b", "#22c55e", "#3b82f6",
  "#6366f1", "#ec4899", "#14b8a6", "#94a3b8",
];

export default function LabelPicker({
  labels,
  appliedLabelIds,
  onApply,
  onRemove,
  onClose,
}: {
  labels: LabelData[];
  appliedLabelIds: string[];
  onApply: (labelId: string) => void;
  onRemove: (labelId: string) => void;
  onClose: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const result = await createLabel(newName.trim(), newColor);
    if ("id" in result && result.id) {
      onApply(result.id as string);
      setNewName("");
      setCreating(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-xl w-56 text-sm" onClick={e => e.stopPropagation()}>
      <div className="p-2 border-b border-slate-100">
        <p className="text-xs font-semibold text-slate-500 px-2 py-1">Labels</p>
        {labels.map(l => {
          const isApplied = appliedLabelIds.includes(l.id);
          return (
            <button key={l.id}
              onClick={() => isApplied ? onRemove(l.id) : onApply(l.id)}
              className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
              <span className="flex-1 text-slate-700">{l.icon ? `${l.icon} ` : ""}{l.name}</span>
              {isApplied && <span className="text-blue-600 text-xs font-bold">&#10003;</span>}
            </button>
          );
        })}
      </div>
      {!creating ? (
        <div className="p-2 border-t border-slate-100">
          <button onClick={() => setCreating(true)}
            className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded text-blue-600 text-xs font-medium">
            + Create new label
          </button>
        </div>
      ) : (
        <div className="p-2 space-y-2 border-t border-slate-100">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Label name"
            className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
            autoFocus
            onKeyDown={e => e.key === "Enter" && handleCreate()} />
          <div className="flex items-center gap-1 px-1">
            {COLOR_OPTIONS.map(c => (
              <button key={c} onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full border-2 ${newColor === c ? "border-slate-900" : "border-transparent"}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex gap-1">
            <button onClick={handleCreate} disabled={!newName.trim()}
              className="flex-1 px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50">
              Create
            </button>
            <button onClick={() => setCreating(false)}
              className="px-2 py-1 text-xs text-slate-400 hover:text-slate-600">
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="border-t border-slate-100 p-1">
        <button onClick={onClose} className="w-full text-center px-2 py-1 text-xs text-slate-400 hover:text-slate-600">
          Close
        </button>
      </div>
    </div>
  );
}
