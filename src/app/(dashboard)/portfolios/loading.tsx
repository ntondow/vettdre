import { SkeletonLine, SkeletonBlock, SkeletonStatCard, SkeletonSection } from "@/components/ui/skeleton-shimmer";

export default function PortfoliosLoading() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-8">
        <div className="flex-1">
          <SkeletonLine width="md" height="h-5" />
        </div>
        <SkeletonLine width="w-32" height="h-10" className="rounded" />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0 md:pl-60">
        <div className="p-4 md:p-8">
          {/* Portfolio summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonStatCard key={`summary-${i}`} />
            ))}
          </div>

          {/* Portfolio list */}
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={`portfolio-${i}`}
                className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <SkeletonLine width="lg" height="h-5" className="mb-2" />
                    <SkeletonLine width="md" height="h-3" />
                  </div>
                  <SkeletonLine width="w-20" height="h-8" className="rounded" />
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-y border-slate-100">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={`stat-${j}`}>
                      <SkeletonLine width="sm" height="h-2" className="mb-1" />
                      <SkeletonLine width="md" height="h-4" />
                    </div>
                  ))}
                </div>

                {/* Properties preview */}
                <div className="mt-4">
                  <SkeletonLine width="sm" height="h-3" className="mb-3" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={`prop-${j}`} className="p-2 bg-slate-50 rounded">
                        <SkeletonLine width="full" height="h-3" className="mb-1" />
                        <SkeletonLine width="sm" height="h-2" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-8">
            <SkeletonLine width="sm" height="h-4" />
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonLine key={`page-${i}`} width="w-8" height="h-8" className="rounded" />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
