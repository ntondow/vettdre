"use client";

// Skeleton shimmer components for progressive loading in building profile tabs

export function SkeletonPulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className}`} />;
}

export function SkeletonLine({ width = "full" }: { width?: "sm" | "md" | "lg" | "full" }) {
  const w = width === "sm" ? "w-20" : width === "md" ? "w-40" : width === "lg" ? "w-64" : "w-full";
  return <SkeletonPulse className={`h-3.5 ${w}`} />;
}

export function SkeletonKeyValueGrid({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex justify-between gap-2">
          <SkeletonPulse className="h-3 w-20" />
          <SkeletonPulse className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonOwnerCard() {
  return (
    <div className="bg-blue-50/50 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <SkeletonPulse className="h-3 w-20" />
        <SkeletonPulse className="h-5 w-16 rounded-full" />
      </div>
      <div className="space-y-2">
        <SkeletonPulse className="h-2.5 w-32 mb-1" />
        <SkeletonPulse className="h-5 w-48" />
        <SkeletonPulse className="h-3 w-40" />
      </div>
      <div className="pt-2 border-t border-blue-100 space-y-1.5">
        <SkeletonPulse className="h-3 w-56" />
        <SkeletonPulse className="h-3 w-44" />
      </div>
    </div>
  );
}

export function SkeletonContactCard() {
  return (
    <div className="bg-slate-50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <SkeletonPulse className="h-4 w-32" />
        <SkeletonPulse className="h-4 w-14 rounded-full" />
      </div>
      <SkeletonPulse className="h-5 w-36" />
      <SkeletonPulse className="h-3.5 w-44" />
    </div>
  );
}

export function SkeletonContactsList() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <SkeletonPulse className="h-3 w-16" />
      </div>
      <SkeletonContactCard />
      <SkeletonContactCard />
    </div>
  );
}

export function SkeletonConditionCard() {
  return (
    <div className="bg-slate-50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <SkeletonPulse className="h-3.5 w-32" />
        <SkeletonPulse className="h-5 w-12 rounded" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <SkeletonPulse className="h-3 w-28" />
          <SkeletonPulse className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-1">
      <div className="flex gap-3 pb-1 border-b border-slate-200">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonPulse key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="flex gap-3 py-1">
          {Array.from({ length: cols }).map((_, ci) => (
            <SkeletonPulse key={ci} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonSection({ title }: { title?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 space-y-3">
      {title && <SkeletonPulse className="h-3.5 w-36" />}
      <SkeletonKeyValueGrid rows={4} />
    </div>
  );
}
