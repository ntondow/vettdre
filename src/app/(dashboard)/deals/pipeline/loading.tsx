import { SkeletonLine, SkeletonBlock, SkeletonCircle } from "@/components/ui/skeleton-shimmer";

export default function DealsPipelineLoading() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-8">
        <div className="flex-1">
          <SkeletonLine width="md" height="h-5" />
        </div>
        <div className="flex gap-2">
          <SkeletonLine width="w-10" height="h-10" className="rounded" />
          <SkeletonLine width="w-10" height="h-10" className="rounded" />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0 md:pl-60">
        {/* Toolbar */}
        <div className="h-12 bg-white border-b border-slate-200 px-4 flex items-center gap-4 overflow-x-auto">
          <SkeletonLine width="w-24" height="h-8" className="rounded flex-shrink-0" />
          <SkeletonLine width="w-20" height="h-8" className="rounded flex-shrink-0" />
          <SkeletonLine width="w-20" height="h-8" className="rounded flex-shrink-0" />
          <div className="flex-1" />
          <SkeletonLine width="w-10" height="h-10" className="rounded flex-shrink-0" />
        </div>

        {/* Kanban board */}
        <div className="p-4 overflow-x-auto">
          <div className="flex gap-6 min-w-max">
            {/* 5 Kanban columns */}
            {Array.from({ length: 5 }).map((_, colIdx) => (
              <div
                key={`column-${colIdx}`}
                className="w-80 flex-shrink-0"
              >
                {/* Column header */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <SkeletonLine width="lg" height="h-4" />
                    <SkeletonCircle size="w-6 h-6" />
                  </div>
                </div>

                {/* Deal cards in column */}
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, cardIdx) => (
                    <div
                      key={`card-${colIdx}-${cardIdx}`}
                      className="bg-white rounded-lg border border-slate-200 p-4 space-y-3 cursor-move hover:shadow-md transition-shadow"
                    >
                      {/* Deal title */}
                      <SkeletonLine width="full" height="h-4" />

                      {/* Address */}
                      <SkeletonLine width="lg" height="h-3" />

                      {/* Deal value */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <SkeletonLine width="md" height="h-3" />
                        <SkeletonLine width="sm" height="h-3" />
                      </div>

                      {/* Agent avatar & confidence */}
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                          <SkeletonCircle size="w-6 h-6" />
                          <SkeletonLine width="sm" height="h-3" />
                        </div>
                        <SkeletonLine width="w-12" height="h-5" className="rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add card button */}
                <div className="mt-3 p-2 rounded-lg border border-dashed border-slate-300 bg-slate-50">
                  <SkeletonLine width="full" height="h-8" className="rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
