// Slice 4: minimal route-level skeleton matching the new dashboard
// shape (header + CTA strip + 4 KPIs + 2-column tasks/performers +
// transactions list). Each panel renders its own skeleton via
// PanelShell once mounted, so this only shows briefly while the React
// shell renders.

export default function BrokerageDashboardLoading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-64 bg-slate-200 animate-pulse rounded" />
          <div className="h-4 w-32 bg-slate-100 animate-pulse rounded" />
        </div>
        <div className="h-9 w-44 bg-slate-100 animate-pulse rounded-lg" />
      </div>

      {/* CTA strip */}
      <div className="h-16 bg-slate-100 animate-pulse rounded-xl" />

      {/* 4 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-slate-100 animate-pulse rounded-xl" />
        ))}
      </div>

      {/* Tasks + Performers */}
      <div className="grid md:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-56 bg-slate-100 animate-pulse rounded-xl"
          />
        ))}
      </div>

      {/* Active transactions */}
      <div className="h-40 bg-slate-100 animate-pulse rounded-xl" />
    </div>
  );
}
