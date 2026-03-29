"use client";

import { useState } from "react";
import { X, Check, Loader2, Zap, Crown } from "lucide-react";

// ── Trigger → feature label mapping ──────────────────────────

const TRIGGER_HIGHLIGHT: Record<string, string> = {
  message_limit: "Unlimited messages",
  auto_book: "Auto-book showings",
  email_channel: "Email channel",
  three_touch: "3-touch follow-up sequences",
  analytics: "Full analytics",
  knowledge_pro: "Knowledge base editor",
  spanish: "Spanish language",
  web_chat: "Web chat widget",
  voice: "Voice channel",
};

// ── Feature lists ────────────────────────────────────────────

const PRO_FEATURES = [
  "Unlimited messages",
  "Email channel",
  "Auto-book showings",
  "3-touch follow-up sequences",
  "Full analytics",
  "Spanish language",
  "Knowledge base editor",
];

const TEAM_FEATURES = [
  "Everything in Pro, plus:",
  "Web chat widget",
  "Voice channel",
  "ILS email parsing",
  "Round-robin agent assignment",
  "Multi-language (5 languages)",
  "Custom cadences",
];

// ══════════════════════════════════════════════════════════════

interface UpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
  trigger: string;
  configId: string;
  currentTier: "free" | "pro" | "team";
}

export default function UpgradePrompt({
  isOpen, onClose, trigger, configId, currentTier,
}: UpgradePromptProps) {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  if (!isOpen) return null;

  const highlightLabel = TRIGGER_HIGHLIGHT[trigger] || "";
  const showProColumn = currentTier === "free";

  const handleUpgrade = async (tier: "pro" | "team") => {
    setLoadingTier(tier);
    try {
      const res = await fetch("/api/leasing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId, tier }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Upgrade error:", data.error);
        setLoadingTier(null);
      }
    } catch (err) {
      console.error("Upgrade fetch error:", err);
      setLoadingTier(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-[modal-in_0.2s_ease-out]">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-slate-100">
          <Zap className="w-8 h-8 text-blue-600 mx-auto mb-2" />
          <h2 className="text-xl font-bold text-slate-900">
            {currentTier === "pro" ? "Upgrade to Team" : "Unlock More Power"}
          </h2>
          <p className="text-sm text-slate-500 mt-1">Per building per month. Cancel anytime. No setup fees.</p>
        </div>

        {/* Columns */}
        <div className={`grid ${showProColumn ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 max-w-sm mx-auto"} gap-4 p-6`}>
          {/* Pro column */}
          {showProColumn && (
            <div className="relative border-2 border-blue-500 rounded-xl p-5">
              {/* Most popular badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-3 py-0.5 bg-blue-600 text-white text-[10px] font-bold uppercase rounded-full">
                  Most Popular
                </span>
              </div>

              <div className="text-center mb-4 mt-1">
                <h3 className="text-lg font-bold text-slate-900">Pro</h3>
                <div className="mt-1">
                  <span className="text-3xl font-bold text-slate-900">$149</span>
                  <span className="text-sm text-slate-500">/mo</span>
                </div>
              </div>

              <ul className="space-y-2.5 mb-5">
                {PRO_FEATURES.map((feature) => {
                  const isHighlighted = feature === highlightLabel;
                  return (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isHighlighted ? "text-blue-600" : "text-emerald-500"}`} />
                      <span className={isHighlighted ? "font-semibold text-blue-700" : "text-slate-600"}>
                        {feature}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <button
                onClick={() => handleUpgrade("pro")}
                disabled={loadingTier !== null}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loadingTier === "pro" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {loadingTier === "pro" ? "Redirecting..." : "Upgrade to Pro"}
              </button>
            </div>
          )}

          {/* Team column */}
          <div className={`border ${currentTier === "pro" ? "border-2 border-violet-500" : "border-slate-200"} rounded-xl p-5`}>
            {currentTier === "pro" && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-3 py-0.5 bg-violet-600 text-white text-[10px] font-bold uppercase rounded-full">
                  Upgrade
                </span>
              </div>
            )}

            <div className="text-center mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center justify-center gap-1.5">
                <Crown className="w-4 h-4 text-violet-600" />
                Team
              </h3>
              <div className="mt-1">
                <span className="text-3xl font-bold text-slate-900">$399</span>
                <span className="text-sm text-slate-500">/mo</span>
              </div>
            </div>

            <ul className="space-y-2.5 mb-5">
              {TEAM_FEATURES.map((feature, i) => {
                const isHeader = i === 0;
                const isHighlighted = feature === highlightLabel;
                return (
                  <li key={feature} className={`flex items-start gap-2 text-sm ${isHeader ? "font-medium text-slate-500" : ""}`}>
                    {!isHeader && (
                      <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isHighlighted ? "text-violet-600" : "text-emerald-500"}`} />
                    )}
                    <span className={isHighlighted ? "font-semibold text-violet-700" : isHeader ? "" : "text-slate-600"}>
                      {feature}
                    </span>
                  </li>
                );
              })}
            </ul>

            <button
              onClick={() => handleUpgrade("team")}
              disabled={loadingTier !== null}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors ${
                currentTier === "pro"
                  ? "bg-violet-600 text-white hover:bg-violet-700"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {loadingTier === "team" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Crown className="w-4 h-4" />
              )}
              {loadingTier === "team" ? "Redirecting..." : "Upgrade to Team"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
