import { SkeletonLine, SkeletonCircle, SkeletonTable } from "@/components/ui/skeleton-shimmer";

export default function ContactsLoading() {
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
            <div />
            <SkeletonLine width="sm" height="h-10" />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 mb-6 border-b border-slate-200">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonLine
                key={`tab-${i}`}
                width="w-20"
                height="h-8"
                className="flex-shrink-0"
              />
            ))}
          </div>

          {/* Contacts table/list skeleton */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Table header */}
            <div className="px-6 py-4 border-b border-slate-200 grid grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonLine key={`header-${i}`} width={i === 0 ? "lg" : "md"} height="h-3" />
              ))}
            </div>

            {/* Table rows */}
            {Array.from({ length: 8 }).map((_, row) => (
              <div
                key={`row-${row}`}
                className="px-6 py-4 border-b border-slate-100 grid grid-cols-6 gap-4 items-center last:border-0"
              >
                {/* Checkbox + Avatar + Name */}
                <div className="flex items-center gap-3">
                  <SkeletonCircle size="w-4 h-4" />
                  <SkeletonCircle size="w-8 h-8" />
                  <SkeletonLine width="md" height="h-4" />
                </div>

                {/* Email */}
                <SkeletonLine width="lg" height="h-3" />

                {/* Phone */}
                <SkeletonLine width="md" height="h-3" />

                {/* Status badge */}
                <SkeletonLine width="sm" height="h-6" className="rounded-full" />

                {/* Score */}
                <SkeletonLine width="sm" height="h-4" />

                {/* Actions */}
                <SkeletonLine width="w-6" height="h-6" />
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
