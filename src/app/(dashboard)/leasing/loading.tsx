import { SkeletonLine, SkeletonStatCard, SkeletonSection, SkeletonBlock } from "@/components/ui/skeleton-shimmer";

export default function LeasingLoading() {
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
          {/* Navigation tabs */}
          <div className="flex gap-2 mb-8 border-b border-slate-200 overflow-x-auto pb-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonLine
                key={`tab-${i}`}
                width="w-32"
                height="h-8"
                className="flex-shrink-0 rounded"
              />
            ))}
          </div>

          {/* Main metric cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonStatCard key={`metric-${i}`} />
            ))}
          </div>

          {/* Content grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column - 2 sections */}
            <div className="lg:col-span-2 space-y-6">
              {/* Active conversations */}
              <SkeletonSection title="Active Conversations" icon="💬">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={`conv-${i}`} className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
                    <SkeletonBlock width="w-2" height="h-10" className="rounded-full" />
                    <div className="flex-1">
                      <SkeletonLine width="full" height="h-3" className="mb-1" />
                      <SkeletonLine width="lg" height="h-2" />
                    </div>
                    <SkeletonLine width="w-16" height="h-8" className="rounded" />
                  </div>
                ))}
              </SkeletonSection>

              {/* Recent activity / follow-ups */}
              <SkeletonSection title="Scheduled Follow-Ups" icon="⏰">
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={`followup-${i}`} className="p-3 bg-slate-50 rounded-lg">
                      <SkeletonLine width="full" height="h-3" className="mb-2" />
                      <SkeletonLine width="md" height="h-2" className="mb-2" />
                      <div className="flex gap-2">
                        <SkeletonLine width="w-16" height="h-5" className="rounded text-xs" />
                        <SkeletonLine width="w-20" height="h-5" className="rounded text-xs" />
                      </div>
                    </div>
                  ))}
                </div>
              </SkeletonSection>
            </div>

            {/* Right column - Quick info & settings */}
            <div className="space-y-6">
              {/* Usage meter */}
              <SkeletonSection title="Usage This Month" icon="📊">
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={`usage-${i}`}>
                      <SkeletonLine width="md" height="h-3" className="mb-2" />
                      <div className="w-full h-2 bg-slate-100 rounded-full">
                        <div
                          className="h-2 bg-slate-300 rounded-full animate-shimmer"
                          style={{ width: `${60 + i * 10}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </SkeletonSection>

              {/* Quick actions */}
              <SkeletonSection title="Quick Actions" icon="⚡">
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <SkeletonLine key={`action-${i}`} width="full" height="h-8" className="rounded" />
                  ))}
                </div>
              </SkeletonSection>

              {/* Configuration status */}
              <SkeletonSection title="Configuration" icon="⚙️">
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={`config-${i}`} className="flex items-center justify-between py-1">
                      <SkeletonLine width="md" height="h-3" />
                      <SkeletonLine width="w-8" height="h-4" className="rounded" />
                    </div>
                  ))}
                </div>
              </SkeletonSection>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
