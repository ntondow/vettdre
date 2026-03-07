// Reusable skeleton/shimmer loading components for progressive data loading
// Used primarily by building-profile-skeleton.tsx but available app-wide

import { type ReactNode } from "react";

const shimmerCls = "animate-shimmer rounded";

// Single text-line placeholder
export function SkeletonLine({ width = "full", height = "h-4", className = "" }: {
  width?: "sm" | "md" | "lg" | "full" | string;
  height?: string;
  className?: string;
}) {
  const w = width === "sm" ? "w-20" : width === "md" ? "w-32" : width === "lg" ? "w-48" : width === "full" ? "w-full" : width;
  return <div className={`${shimmerCls} ${w} ${height} ${className}`} />;
}

// Rectangular block placeholder
export function SkeletonBlock({ width = "w-full", height = "h-24", className = "" }: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return <div className={`${shimmerCls} ${width} ${height} ${className}`} />;
}

// Circular placeholder (avatars, icons)
export function SkeletonCircle({ size = "w-10 h-10", className = "" }: {
  size?: string;
  className?: string;
}) {
  return <div className={`${shimmerCls} rounded-full ${size} ${className}`} />;
}

// Pre-composed stat card skeleton (matches building profile stat grids)
export function SkeletonStatCard({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-slate-50 rounded-lg p-3 space-y-2 ${className}`}>
      <SkeletonLine width="sm" height="h-3" />
      <SkeletonLine width="lg" height="h-6" />
    </div>
  );
}

// Pre-composed table skeleton
export function SkeletonTable({ rows = 4, cols = 3, className = "" }: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header row */}
      <div className="flex gap-3">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={`h-${i}`} width={i === 0 ? "lg" : "md"} height="h-3" />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 py-1.5 border-t border-slate-100">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonLine key={`${r}-${c}`} width={c === 0 ? "lg" : "md"} height="h-4" />
          ))}
        </div>
      ))}
    </div>
  );
}

// Score card skeleton (distress/investment scores)
export function SkeletonScoreCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg p-3 border border-slate-200 bg-slate-50 space-y-2 ${className}`}>
      <SkeletonLine width="md" height="h-3" />
      <div className="flex items-center gap-2">
        <SkeletonBlock width="w-12" height="h-8" />
        <SkeletonLine width="sm" height="h-5" />
      </div>
      <div className="space-y-1 mt-1">
        <SkeletonLine width="full" height="h-3" />
        <SkeletonLine width="lg" height="h-3" />
      </div>
    </div>
  );
}

// Section wrapper skeleton (matches Section component layout)
export function SkeletonSection({ title, icon, children, className = "" }: {
  title?: string;
  icon?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 ${className}`}>
      <div className="flex items-center justify-between p-5">
        <div className="flex items-center gap-2">
          {icon ? (
            <span className="text-lg">{icon}</span>
          ) : (
            <SkeletonCircle size="w-5 h-5" />
          )}
          {title ? (
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          ) : (
            <SkeletonLine width="lg" height="h-4" />
          )}
        </div>
        <span className="text-slate-300 text-xs">▶</span>
      </div>
      <div className="px-5 pb-5">
        {children}
      </div>
    </div>
  );
}

// Key-value pair row skeleton
export function SkeletonKeyValue({ pairs = 4, className = "" }: {
  pairs?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: pairs }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-1">
          <SkeletonLine width="md" height="h-3" />
          <SkeletonLine width="sm" height="h-4" />
        </div>
      ))}
    </div>
  );
}
