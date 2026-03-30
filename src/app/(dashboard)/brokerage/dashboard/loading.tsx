import { SkeletonLine, SkeletonStatCard, SkeletonBlock, SkeletonSection } from "@/components/ui/skeleton-shimmer";

export default function BrokerageDashboardLoading() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center px-8">
        <div className="flex-1">
          <SkeletonLine width="lg" height="h-5" />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0 md:pl-60">
        <div className="p-4 md:p-8">
          {/* Period selector */}
          <div className="flex gap-2 mb-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonLine key={`period-${i}`} width="w-20" height="h-9" className="rounded" />
            ))}
          </div>

          {/* Top stat cards - 4 columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonStatCard key={`stat-${i}`} />
            ))}
          </div>

          {/* Main content grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Left column - 2 sections */}
            <div className="lg:col-span-2 space-y-6">
              {/* Deal pipeline section */}
              <SkeletonSection title="Deal Pipeline" icon="📋">
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={`stage-${i}`} className="flex items-center justify-between py-2">
                      <SkeletonLine width="md" height="h-3" />
                      <div className="flex-1 mx-4">
                        <div className="w-full h-2 bg-slate-100 rounded-full">
                          <div className="h-2 bg-slate-300 rounded-full animate-shimmer" style={{ width: '60%' }} />
                        </div>
                      </div>
                      <SkeletonLine width="sm" height="h-4" />
                    </div>
                  ))}
                </div>
              </SkeletonSection>

              {/* Transaction summary section */}
              <SkeletonSection title="Recent Transactions" icon="💰">
                {/* Table header */}
                <div className="grid grid-cols-4 gap-3 mb-3 pb-3 border-b border-slate-100">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonLine key={`header-${i}`} width={i === 0 ? "lg" : "md"} height="h-3" />
                  ))}
                </div>
                {/* Table rows */}
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={`row-${i}`} className="grid grid-cols-4 gap-3 py-3 border-b border-slate-100 last:border-0">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <SkeletonLine key={`cell-${j}`} width={j === 0 ? "lg" : "md"} height="h-3" />
                    ))}
                  </div>
                ))}
              </SkeletonSection>
            </div>

            {/* Right column - Leaderboard & Quick stats */}
            <div className="space-y-6">
              {/* Agent leaderboard */}
              <SkeletonSection title="Top Agents" icon="🏆">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={`agent-${i}`} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                    <SkeletonLine width="w-6" height="h-6" className="flex-shrink-0 rounded-full" />
                    <div className="flex-1 min-w-0">
                      <SkeletonLine width="full" height="h-3" className="mb-1" />
                      <SkeletonLine width="md" height="h-2" />
                    </div>
                    <SkeletonLine width="w-12" height="h-4" className="flex-shrink-0" />
                  </div>
                ))}
              </SkeletonSection>

              {/* Quick metrics */}
              <SkeletonSection title="Metrics" icon="📊">
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={`metric-${i}`} className="py-2">
                      <SkeletonLine width="md" height="h-3" className="mb-2" />
                      <SkeletonLine width="full" height="h-5" />
                    </div>
                  ))}
                </div>
              </SkeletonSection>
            </div>
          </div>

          {/* Bottom section - Additional details */}
          <SkeletonSection title="Submission Queue" icon="⏳">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`submission-${i}`} className="p-3 bg-slate-50 rounded-lg">
                  <SkeletonLine width="full" height="h-3" className="mb-2" />
                  <SkeletonLine width="lg" height="h-3" className="mb-2" />
                  <div className="flex gap-2">
                    <SkeletonLine width="w-20" height="h-6" className="rounded" />
                    <SkeletonLine width="w-20" height="h-6" className="rounded" />
                  </div>
                </div>
              ))}
            </div>
          </SkeletonSection>
        </div>
      </main>
    </div>
  );
}
