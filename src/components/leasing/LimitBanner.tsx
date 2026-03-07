"use client";

import { useState } from "react";
import { Zap, X } from "lucide-react";
import UpgradePrompt from "./UpgradePrompt";

interface LimitBannerProps {
  messagesUsed: number;
  messageLimit: number;
  pendingCount: number;
  configId: string;
}

export default function LimitBanner({
  messagesUsed, messageLimit, pendingCount, configId,
}: LimitBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  if (dismissed || messagesUsed < messageLimit) return null;

  return (
    <>
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
        <div className="flex items-center gap-3 text-sm">
          <Zap className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-amber-800">
            You&apos;ve used <strong>{messagesUsed}/{messageLimit}</strong> messages today &middot; AI resumes at midnight
            {pendingCount > 0 && (
              <> &middot; <strong>{pendingCount}</strong> prospect{pendingCount !== 1 ? "s" : ""} waiting</>
            )}
          </span>
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setUpgradeOpen(true)}
              className="flex items-center gap-1 px-3 py-1 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors"
            >
              <Zap className="w-3 h-3" />
              Upgrade to Pro
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-1 text-amber-400 hover:text-amber-600 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <UpgradePrompt
        isOpen={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        trigger="message_limit"
        configId={configId}
        currentTier="free"
      />
    </>
  );
}
