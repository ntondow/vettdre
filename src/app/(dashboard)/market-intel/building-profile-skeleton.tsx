// Full skeleton layout mirroring building-profile.tsx sections
// Shows immediately while data loads, replaced progressively by real content

import {
  SkeletonLine,
  SkeletonBlock,
  SkeletonStatCard,
  SkeletonSection,
  SkeletonScoreCard,
  SkeletonTable,
  SkeletonKeyValue,
} from "@/components/ui/skeleton-shimmer";

export default function BuildingProfileSkeleton() {
  return (
    <div className="space-y-4">
      {/* ============================================ */}
      {/* HEADER — address, buttons */}
      {/* ============================================ */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <SkeletonLine width="w-64" height="h-6" />
            <SkeletonLine width="w-48" height="h-4" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBlock width="w-24" height="h-9" className="rounded-lg" />
            <SkeletonBlock width="w-36" height="h-9" className="rounded-lg" />
            <SkeletonBlock width="w-28" height="h-9" className="rounded-lg" />
            <SkeletonBlock width="w-28" height="h-9" className="rounded-lg" />
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* QUICK STATS BAR — 6-col horizontal strip */}
      {/* ============================================ */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <SkeletonLine width="w-12" height="h-2" />
              <SkeletonLine width="w-16" height="h-5" />
            </div>
          ))}
        </div>
      </div>

      {/* ============================================ */}
      {/* OWNER + CONTACT CARD */}
      {/* ============================================ */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          {/* Owner side */}
          <div className="flex-1 space-y-2">
            <SkeletonLine width="w-12" height="h-2" />
            <div className="flex items-center gap-2">
              <SkeletonBlock width="w-10" height="h-5" className="rounded" />
              <SkeletonLine width="w-48" height="h-5" />
            </div>
            <SkeletonLine width="w-40" height="h-3" />
            <SkeletonLine width="w-52" height="h-3" />
          </div>
          {/* Contact side */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <SkeletonLine width="w-14" height="h-2" />
              <div className="flex gap-1.5">
                <SkeletonBlock width="w-14" height="h-6" className="rounded-lg" />
                <SkeletonBlock width="w-14" height="h-6" className="rounded-lg" />
              </div>
            </div>
            <SkeletonLine width="w-36" height="h-4" />
            <SkeletonLine width="w-44" height="h-3" />
            <SkeletonLine width="w-48" height="h-3" />
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* INTELLIGENCE SCORES — 2 score cards */}
      {/* ============================================ */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-3 mb-3">
          <SkeletonLine width="w-36" height="h-4" />
          <SkeletonBlock width="w-20" height="h-5" className="rounded-full" />
          <SkeletonBlock width="w-24" height="h-5" className="rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SkeletonScoreCard />
          <SkeletonScoreCard />
        </div>
        {/* Resolved Ownership */}
        <div className="mt-3 p-3 bg-slate-50 rounded-lg space-y-2">
          <SkeletonLine width="sm" height="h-3" />
          <SkeletonLine width="lg" height="h-5" />
          <SkeletonLine width="w-40" height="h-3" />
        </div>
      </div>

      {/* ============================================ */}
      {/* VIOLATIONS SUMMARY — tabbed aggregate */}
      {/* ============================================ */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <SkeletonLine width="w-40" height="h-4" />
          <div className="flex gap-1.5">
            <SkeletonBlock width="w-20" height="h-5" className="rounded-full" />
            <SkeletonBlock width="w-16" height="h-5" className="rounded-full" />
            <SkeletonBlock width="w-14" height="h-5" className="rounded-full" />
            <SkeletonBlock width="w-18" height="h-5" className="rounded-full" />
          </div>
        </div>
        {/* Tab bar */}
        <div className="flex gap-3 border-b border-slate-200 mb-3 pb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonLine key={i} width="w-16" height="h-3" />
          ))}
        </div>
        <SkeletonTable rows={3} cols={3} />
      </div>

      {/* ============================================ */}
      {/* COMPARABLES */}
      {/* ============================================ */}
      <SkeletonSection title="Sales Comparables" icon="📊">
        <div className="space-y-3">
          <div className="flex gap-2">
            <SkeletonBlock width="w-24" height="h-8" className="rounded-lg" />
            <SkeletonBlock width="w-24" height="h-8" className="rounded-lg" />
            <SkeletonBlock width="w-24" height="h-8" className="rounded-lg" />
          </div>
          <SkeletonTable rows={4} cols={4} />
        </div>
      </SkeletonSection>

      {/* ============================================ */}
      {/* PROPERTY OVERVIEW (collapsed by default) */}
      {/* ============================================ */}
      <SkeletonSection title="Property Overview" icon="🏢">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
      </SkeletonSection>

      {/* ============================================ */}
      {/* NEIGHBORHOOD / CENSUS */}
      {/* ============================================ */}
      <SkeletonSection title="Neighborhood Profile" icon="🏘️">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
      </SkeletonSection>
    </div>
  );
}
