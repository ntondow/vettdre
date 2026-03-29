"use client";

import { useEffect, useState } from "react";
import { getAdminStats } from "./admin-actions";

interface Stats {
  total: number;
  approved: number;
  pending: number;
  free: number;
  pro: number;
  team: number;
  enterprise: number;
}

export default function AdminDashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminStats().then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  const cards = stats
    ? [
        { label: "Total Users", value: stats.total, color: "bg-slate-100 text-slate-700" },
        { label: "Approved", value: stats.approved, color: "bg-emerald-50 text-emerald-700" },
        { label: "Pending Approval", value: stats.pending, color: "bg-amber-50 text-amber-700" },
        { label: "Free Plan", value: stats.free, color: "bg-slate-50 text-slate-600" },
        { label: "Pro Plan", value: stats.pro, color: "bg-blue-50 text-blue-700" },
        { label: "Team Plan", value: stats.team, color: "bg-violet-50 text-violet-700" },
        { label: "Enterprise", value: stats.enterprise, color: "bg-amber-50 text-amber-700" },
      ]
    : [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Admin Dashboard</h1>
      <p className="text-sm text-slate-500 mb-8">System overview and user statistics.</p>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="h-4 w-24 bg-slate-200 rounded animate-pulse mb-3" />
              <div className="h-8 w-16 bg-slate-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-sm text-slate-500 mb-1">{card.label}</p>
              <p className="text-3xl font-bold">
                <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-lg ${card.color}`}>
                  {card.value}
                </span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
