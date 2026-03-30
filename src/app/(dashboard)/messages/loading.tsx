import { SkeletonLine, SkeletonCircle, SkeletonBlock } from "@/components/ui/skeleton-shimmer";

export default function MessagesLoading() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-8">
        <div className="flex-1">
          <SkeletonLine width="md" height="h-5" />
        </div>
        <div className="flex gap-2">
          <SkeletonLine width="w-10" height="h-10" className="rounded" />
        </div>
      </div>

      {/* Main content - 3 pane layout */}
      <main className="flex-1 overflow-hidden pb-16 md:pb-0 md:pl-60 flex">
        {/* Left pane - Folder/Label sidebar */}
        <div className="hidden sm:flex flex-col w-48 bg-slate-50 border-r border-slate-200 p-4 overflow-y-auto">
          {/* Compose button */}
          <SkeletonLine width="full" height="h-10" className="mb-4 rounded" />

          {/* Folder list */}
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={`folder-${i}`} className="flex items-center gap-2 py-2">
                <SkeletonCircle size="w-4 h-4" />
                <SkeletonLine width="lg" height="h-3" />
              </div>
            ))}
          </div>
        </div>

        {/* Center pane - Thread list */}
        <div className="flex-1 border-r border-slate-200 flex flex-col overflow-hidden">
          {/* Toolbar & filters */}
          <div className="h-12 bg-white border-b border-slate-200 px-4 flex items-center gap-2 overflow-x-auto">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonLine
                key={`filter-${i}`}
                width="w-20"
                height="h-6"
                className="flex-shrink-0 rounded"
              />
            ))}
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={`thread-${i}`}
                className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
              >
                {/* Checkbox */}
                <SkeletonCircle size="w-4 h-4" className="mt-2 flex-shrink-0" />

                {/* Avatar */}
                <SkeletonCircle size="w-10 h-10" className="flex-shrink-0" />

                {/* Thread preview */}
                <div className="flex-1 min-w-0">
                  <SkeletonLine width="full" height="h-4" className="mb-1" />
                  <SkeletonLine width="lg" height="h-3" className="mb-2" />
                  <SkeletonLine width="sm" height="h-3" />
                </div>

                {/* Date & badge */}
                <div className="flex-shrink-0 text-right">
                  <SkeletonLine width="w-12" height="h-3" className="mb-1" />
                  <SkeletonCircle size="w-5 h-5" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right pane - Message detail / CRM sidebar (hidden on mobile) */}
        <div className="hidden lg:flex flex-col w-80 bg-white border-l border-slate-200 p-4 overflow-y-auto">
          {/* Contact card */}
          <div className="mb-6 pb-6 border-b border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <SkeletonCircle size="w-12 h-12" />
              <div className="flex-1">
                <SkeletonLine width="lg" height="h-4" className="mb-1" />
                <SkeletonLine width="md" height="h-3" />
              </div>
            </div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonLine key={`info-${i}`} width="full" height="h-3" />
              ))}
            </div>
          </div>

          {/* Related deals section */}
          <div className="mb-6">
            <SkeletonLine width="md" height="h-4" className="mb-3" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={`deal-${i}`} className="p-2 bg-slate-50 rounded mb-2">
                <SkeletonLine width="full" height="h-3" className="mb-1" />
                <SkeletonLine width="sm" height="h-2" />
              </div>
            ))}
          </div>

          {/* Activities */}
          <div>
            <SkeletonLine width="md" height="h-4" className="mb-3" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={`activity-${i}`} className="py-2 border-b border-slate-100 last:border-0">
                <SkeletonLine width="full" height="h-3" className="mb-1" />
                <SkeletonLine width="sm" height="h-2" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
