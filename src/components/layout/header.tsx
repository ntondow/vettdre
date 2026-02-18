"use client";

export default function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
    </header>
  );
}
