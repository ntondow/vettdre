"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import Link from "next/link";

/**
 * Upgrade tease shown in building profiles for free/explorer users.
 * Dismissible per session. Only renders if user doesn't have condo_intel access.
 */
export default function IntelUpgradeTease() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg text-xs">
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} className="text-blue-500 shrink-0" />
        <span className="text-slate-600">
          <Link href="/settings/billing" className="text-blue-600 font-medium hover:text-blue-800">
            Upgrade to Pro
          </Link>
          {" "}for unit-level ownership, distress signals &amp; owner dossiers
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-slate-400 hover:text-slate-600 shrink-0"
        aria-label="Dismiss"
      >
        <X size={12} />
      </button>
    </div>
  );
}
