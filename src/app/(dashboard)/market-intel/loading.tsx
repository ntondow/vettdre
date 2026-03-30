import { SkeletonLine, SkeletonBlock, SkeletonCircle } from "@/components/ui/skeleton-shimmer";

export default function MarketIntelLoading() {
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
        <div className="p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel - Search & Results */}
          <div className="lg:col-span-1">
            {/* Search tabs */}
            <div className="flex gap-2 mb-4 border-b border-slate-200">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonLine
                  key={`tab-${i}`}
                  width="w-24"
                  height="h-8"
                  className="flex-shrink-0"
                />
              ))}
            </div>

            {/* Search input */}
            <div className="mb-6">
              <SkeletonLine width="full" height="h-10" className="rounded-lg" />
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap gap-2 mb-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonLine key={`filter-${i}`} width="w-20" height="h-8" className="rounded-full" />
              ))}
            </div>

            {/* Results list */}
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`result-${i}`} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <SkeletonLine width="full" height="h-4" className="mb-2" />
                  <SkeletonLine width="lg" height="h-3" className="mb-2" />
                  <SkeletonLine width="md" height="h-3" />
                </div>
              ))}
            </div>
          </div>

          {/* Right panel - Map */}
          <div className="lg:col-span-2">
            {/* Map container */}
            <div className="w-full h-full min-h-96 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center">
              <div className="text-center">
                <div className="mb-4 flex justify-center">
                  <SkeletonCircle size="w-12 h-12" />
                </div>
                <SkeletonLine width="md" height="h-4" />
              </div>
            </div>

            {/* Map legend below */}
            <div className="mt-4 bg-white rounded-lg border border-slate-200 p-4">
              <SkeletonLine width="sm" height="h-4" className="mb-3" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={`legend-${i}`} className="flex items-center gap-3">
                    <SkeletonBlock width="w-6" height="h-6" className="rounded" />
                    <SkeletonLine width="md" height="h-3" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
