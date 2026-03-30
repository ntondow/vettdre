export default function OnboardingLoading() {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div className="h-7 w-48 bg-slate-200 rounded animate-shimmer" />
          <div className="h-9 w-44 bg-slate-200 rounded-lg animate-shimmer" />
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 rounded-full bg-slate-200 animate-shimmer" style={{ width: `${60 + i * 12}px` }} />
          ))}
        </div>
        <div className="bg-white rounded-lg border border-slate-200">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-slate-50">
              <div className="h-5 w-32 bg-slate-200 rounded animate-shimmer" />
              <div className="h-5 w-24 bg-slate-200 rounded animate-shimmer" />
              <div className="h-5 w-16 bg-slate-200 rounded-full animate-shimmer" />
              <div className="h-5 w-20 bg-slate-200 rounded animate-shimmer ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
