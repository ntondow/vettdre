import { SkeletonLine, SkeletonBlock, SkeletonStatCard, SkeletonSection } from "@/components/ui/skeleton-shimmer";

export default function DashboardLoading() {
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
          {/* Greeting section */}
          <div className="mb-8">
            <SkeletonLine width="md" height="h-6" className="mb-2" />
          </div>

          {/* Market strip - 4 stat cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonStatCard key={`market-${i}`} />
            ))}
          </div>

          {/* News feed section */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <SkeletonLine width="lg" height="h-5" />
              <SkeletonLine width="sm" height="h-4" />
            </div>

            {/* Category pills */}
            <div className="flex gap-2 mb-6 overflow-x-auto">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonLine
                  key={`cat-${i}`}
                  width="w-20"
                  height="h-8"
                  className="flex-shrink-0"
                />
              ))}
            </div>

            {/* News cards */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={`news-${i}`} className="flex gap-4 py-4 border-b border-slate-100 last:border-0">
                <SkeletonBlock width="w-32" height="h-24" />
                <div className="flex-1">
                  <SkeletonLine width="full" height="h-4" className="mb-2" />
                  <SkeletonLine width="lg" height="h-3" className="mb-3" />
                  <div className="flex gap-2">
                    <SkeletonLine width="sm" height="h-6" />
                    <SkeletonLine width="sm" height="h-6" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Brokerage pulse & activity sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Brokerage Pulse */}
            <SkeletonSection title="Brokerage Pulse" icon="📊">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`pulse-${i}`} className="py-2 border-b border-slate-100 last:border-0">
                  <SkeletonLine width="full" height="h-3" className="mb-2" />
                  <SkeletonLine width="lg" height="h-4" />
                </div>
              ))}
            </SkeletonSection>

            {/* Recent Activity */}
            <SkeletonSection title="Recent Activity" icon="⏱️">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`activity-${i}`} className="py-2 border-b border-slate-100 last:border-0">
                  <SkeletonLine width="full" height="h-3" className="mb-2" />
                  <SkeletonLine width="md" height="h-3" />
                </div>
              ))}
            </SkeletonSection>
          </div>
        </div>
      </main>
    </div>
  );
}
