import { SkeletonLine, SkeletonCircle, SkeletonBlock } from "@/components/ui/skeleton-shimmer";

export default function CalendarLoading() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-8">
        <div className="flex-1">
          <SkeletonLine width="md" height="h-5" />
        </div>
        <div className="flex gap-2">
          <SkeletonLine width="w-20" height="h-8" className="rounded" />
          <SkeletonLine width="w-10" height="h-10" className="rounded" />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0 md:pl-60">
        <div className="p-4 md:p-8 grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left sidebar - Mini calendar & upcoming */}
          <div className="lg:col-span-1 space-y-4">
            {/* View selector */}
            <div className="flex gap-2 border-b border-slate-200 pb-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonLine key={`view-${i}`} width="w-16" height="h-7" className="rounded text-sm" />
              ))}
            </div>

            {/* Mini calendar */}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <SkeletonLine width="full" height="h-6" className="mb-4" />

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {/* Day headers */}
                {Array.from({ length: 7 }).map((_, i) => (
                  <SkeletonLine key={`dow-${i}`} width="full" height="h-4" className="text-center text-xs" />
                ))}

                {/* Calendar days */}
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={`day-${i}`} className="aspect-square flex items-center justify-center">
                    <SkeletonCircle size="w-6 h-6" />
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming events */}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <SkeletonLine width="lg" height="h-4" className="mb-3" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={`upcoming-${i}`} className="py-2 border-b border-slate-100 last:border-0">
                    <SkeletonLine width="full" height="h-3" className="mb-1" />
                    <SkeletonLine width="sm" height="h-2" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main calendar view */}
          <div className="lg:col-span-3">
            {/* Month/Week view */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {/* Calendar header with weekdays */}
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={`weekday-${i}`} className="p-3 text-center border-r border-slate-200 last:border-0">
                    <SkeletonLine width="md" height="h-3" />
                  </div>
                ))}
              </div>

              {/* Calendar grid - 6 weeks x 7 days */}
              <div className="grid grid-cols-7">
                {Array.from({ length: 42 }).map((_, i) => {
                  const week = Math.floor(i / 7);
                  const day = i % 7;
                  const eventCount = Math.floor(Math.random() * 3);

                  return (
                    <div
                      key={`cell-${i}`}
                      className={`min-h-32 p-2 border-r border-b border-slate-200 last:border-r-0 ${
                        week % 2 === 0 ? "bg-white" : "bg-slate-50"
                      }`}
                    >
                      {/* Day number */}
                      <SkeletonLine width="w-6" height="h-4" className="mb-2" />

                      {/* Events in day */}
                      <div className="space-y-1">
                        {Array.from({ length: eventCount }).map((_, e) => (
                          <SkeletonBlock key={`evt-${i}-${e}`} width="full" height="h-6" className="rounded text-xs" />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
