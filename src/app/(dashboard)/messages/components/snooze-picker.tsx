"use client";

import { useState } from "react";

function getPresets(): Array<{ label: string; value: string }> {
  const now = new Date();

  // Later today (+3h)
  const laterToday = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  // Tomorrow 9 AM
  const tomorrowAM = new Date(now);
  tomorrowAM.setDate(tomorrowAM.getDate() + 1);
  tomorrowAM.setHours(9, 0, 0, 0);

  // Tomorrow 2 PM
  const tomorrowPM = new Date(now);
  tomorrowPM.setDate(tomorrowPM.getDate() + 1);
  tomorrowPM.setHours(14, 0, 0, 0);

  // This weekend (Saturday 9 AM)
  const saturday = new Date(now);
  const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7;
  saturday.setDate(saturday.getDate() + daysUntilSat);
  saturday.setHours(9, 0, 0, 0);

  // Next week (Monday 9 AM)
  const monday = new Date(now);
  const daysUntilMon = (1 - now.getDay() + 7) % 7 || 7;
  monday.setDate(monday.getDate() + daysUntilMon);
  monday.setHours(9, 0, 0, 0);

  return [
    { label: "Later today", value: laterToday.toISOString() },
    { label: "Tomorrow AM", value: tomorrowAM.toISOString() },
    { label: "Tomorrow PM", value: tomorrowPM.toISOString() },
    { label: "This weekend", value: saturday.toISOString() },
    { label: "Next week", value: monday.toISOString() },
  ];
}

export default function SnoozePicker({
  onSelect,
  onClose,
}: {
  onSelect: (isoString: string) => void;
  onClose: () => void;
}) {
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("09:00");
  const presets = getPresets();

  const handleCustom = () => {
    if (!customDate) return;
    const dt = new Date(`${customDate}T${customTime}:00`);
    onSelect(dt.toISOString());
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-xl w-56 text-slate-700 text-sm" onClick={e => e.stopPropagation()}>
      <div className="p-2 border-b border-slate-100">
        <p className="text-xs font-semibold text-slate-500 px-2 py-1">Snooze until</p>
        {presets.map(p => (
          <button key={p.label} onClick={() => onSelect(p.value)}
            className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded text-sm">
            {p.label}
          </button>
        ))}
      </div>
      <div className="p-2 space-y-2">
        <p className="text-xs font-semibold text-slate-500 px-2">Custom</p>
        <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
          className="w-full px-2 py-1 border border-slate-200 rounded text-xs" />
        <input type="time" value={customTime} onChange={e => setCustomTime(e.target.value)}
          className="w-full px-2 py-1 border border-slate-200 rounded text-xs" />
        <button onClick={handleCustom} disabled={!customDate}
          className="w-full px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50">
          Set
        </button>
      </div>
      <div className="border-t border-slate-100 p-1">
        <button onClick={onClose} className="w-full text-center px-2 py-1 text-xs text-slate-400 hover:text-slate-600">
          Cancel
        </button>
      </div>
    </div>
  );
}
