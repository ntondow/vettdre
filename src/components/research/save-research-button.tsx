"use client";

import { useState } from "react";
import { Bookmark, Check, Loader2 } from "lucide-react";

interface SaveResearchButtonProps {
  onSave: () => Promise<void>;
  saved?: boolean;
  disabled?: boolean;
}

export default function SaveResearchButton({ onSave, saved, disabled }: SaveResearchButtonProps) {
  const [saving, setSaving] = useState(false);

  const handleClick = async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      await onSave();
    } catch {
      // parent handles error
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || saving}
      className={`flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors ${
        saved
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          : "bg-white/5 hover:bg-white/10 border border-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed"
      }`}
    >
      {saving ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : saved ? (
        <Check className="w-4 h-4" />
      ) : (
        <Bookmark className="w-4 h-4" />
      )}
      {saving ? "Saving..." : saved ? "Saved" : "Save Research"}
    </button>
  );
}
