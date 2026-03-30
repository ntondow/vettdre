import { SkeletonLine, SkeletonBlock, SkeletonStatCard } from "@/components/ui/skeleton-shimmer";

export default function PropertiesLoading() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center px-8">
        <div className="flex-1">
          <SkeletonLine width="md" height="h-5" />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0 md:pl-60">
        <div className="p-4 md:p-8">
          {/* Summary stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonStatCard key={`stat-${i}`} />
            ))}
          </div>

          {/* View selector */}
          <div className="flex gap-2 mb-6 border-b border-slate-200 pb-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonLine key={`view-${i}`} width="w-24" height="h-8" className="rounded" />
            ))}
          </div>

          {/* Grid/List view - card layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={`property-${i}`}
                className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow"
              >
                {/* Image placeholder */}
                <SkeletonBlock width="full" height="h-40" className="rounded-t-lg" />

                {/* Content */}
                <div className="p-4">
                  {/* Address & type */}
                  <SkeletonLine width="full" height="h-4" className="mb-2" />
                  <SkeletonLine width="lg" height="h-3" className="mb-3" />

                  {/* Details grid */}
                  <div className="grid grid-cols-3 gap-2 mb-4 py-3 border-y border-slate-100">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <div key={`detail-${j}`}>
                        <SkeletonLine width="full" height="h-2" className="mb-1" />
                        <SkeletonLine width="md" height="h-3" />
                      </div>
                    ))}
                  </div>

                  {/* Status & actions */}
                  <div className="flex items-center justify-between">
                    <SkeletonLine width="w-20" height="h-6" className="rounded-full" />
                    <div className="flex gap-2">
                      <SkeletonLine width="w-8" height="h-8" className="rounded" />
                      <SkeletonLine width="w-8" height="h-8" className="rounded" />
                    </div>
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
