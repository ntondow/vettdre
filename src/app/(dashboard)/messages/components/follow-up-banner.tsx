"use client";

import { useState, useEffect } from "react";
import { getPendingFollowUps, dismissFollowUp, snoozeFollowUp, type FollowUpData } from "../follow-up-actions";

const fmtTimeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function FollowUpBanner({
  followUpCount,
  onSelectThread,
}: {
  followUpCount: number;
  onSelectThread: (threadId: string) => void;
}) {
  const [followUps, setFollowUps] = useState<FollowUpData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (followUpCount > 0 && !loaded) {
      getPendingFollowUps().then(data => {
        setFollowUps(data);
        setLoaded(true);
      });
    }
  }, [followUpCount, loaded]);

  if (followUpCount === 0 || dismissed || followUps.length === 0) return null;

  const shown = followUps.slice(0, 3);

  const handleDismiss = async (id: string) => {
    await dismissFollowUp(id);
    setFollowUps(prev => prev.filter(f => f.id !== id));
  };

  const handleSnooze1Day = async (id: string) => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await snoozeFollowUp(id, tomorrow);
    setFollowUps(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg mx-3 mt-3 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-amber-600 text-sm font-semibold">Needs Follow-up</span>
          <span className="bg-amber-200 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {followUps.length}
          </span>
        </div>
        <button onClick={() => setDismissed(true)} className="text-xs text-amber-500 hover:text-amber-700">
          Dismiss all
        </button>
      </div>
      <div className="space-y-1.5">
        {shown.map(f => (
          <div key={f.id} className="flex items-center gap-2 text-xs">
            <button onClick={() => onSelectThread(f.threadId)}
              className="text-amber-800 font-medium hover:underline truncate max-w-[140px]">
              {f.contactName || "Unknown"}
            </button>
            <span className="text-amber-500 truncate flex-1">{f.subject}</span>
            <span className="text-amber-400 flex-shrink-0">{fmtTimeAgo(f.dueAt)}</span>
            <button onClick={() => handleSnooze1Day(f.id)} className="text-amber-500 hover:text-amber-700 flex-shrink-0" title="Snooze 1 day">
              +1d
            </button>
            <button onClick={() => handleDismiss(f.id)} className="text-amber-400 hover:text-amber-600 flex-shrink-0" title="Dismiss">
              &times;
            </button>
          </div>
        ))}
      </div>
      {followUps.length > 3 && (
        <p className="text-[10px] text-amber-500 mt-1.5">+{followUps.length - 3} more</p>
      )}
    </div>
  );
}
