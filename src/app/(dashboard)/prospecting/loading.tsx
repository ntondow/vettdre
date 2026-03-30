import { SkeletonLine, SkeletonCircle, SkeletonTable } from "@/components/ui/skeleton-shimmer";

export default function ProspectingLoading() {
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
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-2">
              <SkeletonLine width="w-24" height="h-9" className="rounded" />
              <SkeletonLine width="w-24" height="h-9" className="rounded" />
            </div>
            <SkeletonLine width="w-32" height="h-10" className="rounded" />
          </div>

          {/* Prospects table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Table header */}
            <div className="px-6 py-4 border-b border-slate-200 grid grid-cols-7 gap-4 bg-slate-50">
              {Array.from({ length: 7 }).map((_, i) => (
                <SkeletonLine key={`header-${i}`} width={i === 0 ? "lg" : "md"} height="h-3" />
              ))}
            </div>

            {/* Table rows */}
            {Array.from({ length: 10 }).map((_, row) => (
              <div
                key={`row-${row}`}
                className="px-6 py-4 border-b border-slate-100 grid grid-cols-7 gap-4 items-center last:border-0 hover:bg-slate-50"
              >
                {/* Checkbox + Address + Owner */}
                <div className="flex items-center gap-3">
                  <SkeletonCircle size="w-4 h-4" />
                  <div className="flex-1">
                    <SkeletonLine width="full" height="h-3" className="mb-1" />
                    <SkeletonLine width="lg" height="h-2" />
                  </div>
                </div>

                {/* Units */}
                <SkeletonLine width="md" height="h-3" />

                {/* Owner */}
                <SkeletonLine width="lg" height="h-3" />

                {/* Last Sale */}
                <SkeletonLine width="md" height="h-3" />

                {/* Days Since */}
                <SkeletonLine width="sm" height="h-3" />

                {/* Status badge */}
                <SkeletonLine width="w-20" height="h-6" className="rounded-full" />

                {/* Actions */}
                <div className="flex gap-2">
                  <SkeletonCircle size="w-6 h-6" />
                  <SkeletonCircle size="w-6 h-6" />
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6">
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
