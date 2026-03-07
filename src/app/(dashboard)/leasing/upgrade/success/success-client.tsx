"use client";

import { useEffect } from "react";
import { Check, Zap, Crown, ArrowRight } from "lucide-react";
import Link from "next/link";
import confetti from "canvas-confetti";

const PRO_UNLOCKED = [
  "Unlimited AI messages",
  "Email channel",
  "Auto-book showings",
  "3-touch follow-up sequences",
  "Full analytics & heatmaps",
  "Spanish language",
  "Knowledge base editor",
];

const TEAM_UNLOCKED = [
  ...PRO_UNLOCKED,
  "Web chat widget",
  "Voice channel",
  "ILS email parsing",
  "Round-robin agent assignment",
  "Multi-language (5 languages)",
  "Custom cadences",
];

export default function SuccessClient({ tier }: { tier: "pro" | "team" }) {
  useEffect(() => {
    // Fire confetti on mount
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
  }, []);

  const isTeam = tier === "team";
  const features = isTeam ? TEAM_UNLOCKED : PRO_UNLOCKED;
  const color = isTeam ? "violet" : "blue";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="max-w-lg w-full text-center">
        {/* Animated checkmark */}
        <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6 animate-[modal-in_0.4s_ease-out] ${isTeam ? "bg-violet-100" : "bg-blue-100"}`}>
          {isTeam ? (
            <Crown className="w-10 h-10 text-violet-600" />
          ) : (
            <Zap className="w-10 h-10 text-blue-600" />
          )}
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Welcome to {isTeam ? "Team" : "Pro"}! 🎉
        </h1>
        <p className="text-slate-500 mb-8">
          Your AI leasing agent just got a major upgrade.
        </p>

        {/* Unlocked features */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8 text-left">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            Unlocked Features
          </h2>
          <ul className="space-y-3">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm">
                <div className={`w-5 h-5 rounded-full ${isTeam ? "bg-violet-100" : "bg-blue-100"} flex items-center justify-center flex-shrink-0`}>
                  <Check className={`w-3 h-3 ${isTeam ? "text-violet-600" : "text-blue-600"}`} />
                </div>
                <span className="text-slate-700">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/leasing"
            className={`inline-flex items-center justify-center gap-2 px-6 py-3 ${
              isTeam
                ? "bg-violet-600 hover:bg-violet-700"
                : "bg-blue-600 hover:bg-blue-700"
            } text-white text-sm font-semibold rounded-lg transition-colors`}
          >
            Go to Dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/leasing"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            Configure Agent
          </Link>
        </div>
      </div>
    </div>
  );
}
