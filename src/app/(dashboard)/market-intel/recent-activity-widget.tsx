"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { fetchRecentActivity } from "./recent-activity-actions";
import type { RecentActivityData } from "./recent-activity-actions";

const activityIcons: Record<string, string> = {
  email: "✉️", call: "📞", text: "💬", showing: "🏠",
  note: "📝", meeting: "🤝", document: "📄", system: "⚙️",
};

export default function RecentActivityWidget() {
  const [data, setData] = useState<RecentActivityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentActivity()
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
            <div className="h-3 bg-slate-100 rounded w-20 mb-2" />
            <div className="h-6 bg-slate-100 rounded w-10" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const hasActivity = data.recentActivity.length > 0 || data.loiFollowUps.length > 0;

  return (
    <div className="mb-6 space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href="/properties" className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-200 transition-colors">
          <p className="text-xs text-slate-500">Saved Properties</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{data.savedProperties}</p>
        </Link>
        <Link href="/pipeline" className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-200 transition-colors">
          <p className="text-xs text-slate-500">Active Deals</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{data.activeDeals}</p>
        </Link>
        <Link href="/prospecting" className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-200 transition-colors">
          <p className="text-xs text-slate-500">Prospecting</p>
          <p className="text-xl font-bold text-blue-600 mt-0.5">View Lists</p>
        </Link>
        <Link href="/contacts" className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-200 transition-colors">
          <p className="text-xs text-slate-500">Contacts</p>
          <p className="text-xl font-bold text-blue-600 mt-0.5">Manage</p>
        </Link>
      </div>

      {/* Activity + LOI Follow-ups */}
      {hasActivity && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.recentActivity.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Recent Activity</h3>
              <div className="space-y-2.5">
                {data.recentActivity.map((a, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="text-sm mt-0.5">{activityIcons[a.type] || "📌"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">{a.subject}</p>
                      <p className="text-xs text-slate-400">{a.contactName ? `${a.contactName} · ` : ""}{a.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.loiFollowUps.length > 0 && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-3">LOI Follow-ups Needed</h3>
              <div className="space-y-2.5">
                {data.loiFollowUps.map((d) => (
                  <div key={d.id} className="flex items-center gap-2.5">
                    <span className="text-sm">📨</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">{d.name}</p>
                      <p className="text-xs text-amber-600">{d.address ? `${d.address} · ` : ""}Sent {d.daysSinceSent}d ago</p>
                    </div>
                    <Link href={`/deals/new?id=${d.id}`} className="text-xs font-medium text-amber-700 hover:text-amber-900 whitespace-nowrap">
                      Follow up
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
