"use client";

import { useState } from "react";
import {
  bulkMarkRead, bulkMarkUnread, bulkStar, bulkUnstar,
  bulkPin, bulkUnpin, bulkArchive, bulkDelete, bulkSnooze,
} from "../bulk-actions";
import SnoozePicker from "./snooze-picker";
import LabelPicker from "./label-picker";
import type { LabelData } from "../label-actions";

export default function BulkActionBar({
  selectedThreadIds,
  labels,
  onAction,
  onClear,
}: {
  selectedThreadIds: string[];
  labels: LabelData[];
  onAction: () => void;
  onClear: () => void;
}) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const count = selectedThreadIds.length;
  if (count === 0) return null;

  const run = async (fn: (ids: string[]) => Promise<void>) => {
    await fn(selectedThreadIds);
    onAction();
  };

  return (
    <div className="sticky top-0 z-10 bg-blue-600 text-white px-4 py-2 flex items-center gap-2.5 text-sm font-medium shadow-md">
      <span className="mr-2">{count} selected</span>
      <span className="w-px h-5 bg-blue-400" />
      <button onClick={() => run(bulkMarkRead)} className="px-2 py-1 hover:bg-blue-500 rounded" title="Mark read">
        ✓ Read
      </button>
      <button onClick={() => run(bulkMarkUnread)} className="px-2 py-1 hover:bg-blue-500 rounded" title="Mark unread">
        Unread
      </button>
      <button onClick={() => run(bulkStar)} className="px-2 py-1 hover:bg-blue-500 rounded" title="Star">
        ☆ Star
      </button>
      <button onClick={() => run(bulkPin)} className="px-2 py-1 hover:bg-blue-500 rounded" title="Pin">
        📌 Pin
      </button>
      <div className="relative">
        <button onClick={() => setLabelOpen(!labelOpen)} className="px-2 py-1 hover:bg-blue-500 rounded" title="Label">
          Label
        </button>
        {labelOpen && (
          <div className="absolute top-full left-0 mt-1">
            <LabelPicker
              labels={labels}
              appliedLabelIds={[]}
              onApply={(labelId) => {
                // Apply to all selected threads — handled via individual calls
                import("../label-actions").then(({ applyLabel }) => {
                  Promise.all(selectedThreadIds.map(tid => applyLabel(tid, labelId))).then(onAction);
                });
              }}
              onRemove={() => {}}
              onClose={() => setLabelOpen(false)}
            />
          </div>
        )}
      </div>
      <div className="relative">
        <button onClick={() => setSnoozeOpen(!snoozeOpen)} className="px-2 py-1 hover:bg-blue-500 rounded" title="Snooze">
          Snooze
        </button>
        {snoozeOpen && (
          <div className="absolute top-full left-0 mt-1">
            <SnoozePicker
              onSelect={(dt) => {
                bulkSnooze(selectedThreadIds, dt).then(onAction);
                setSnoozeOpen(false);
              }}
              onClose={() => setSnoozeOpen(false)}
            />
          </div>
        )}
      </div>
      <button onClick={() => run(bulkArchive)} className="px-2 py-1 hover:bg-blue-500 rounded" title="Archive">
        📁 Archive
      </button>
      <button onClick={() => run(bulkDelete)} className="px-2 py-1 hover:bg-blue-500 rounded text-red-200 hover:text-white" title="Delete">
        🗑 Delete
      </button>
      <div className="flex-1" />
      <button onClick={onClear} className="px-2 py-1 hover:bg-blue-500 rounded text-blue-200 hover:text-white">
        &times;
      </button>
    </div>
  );
}
