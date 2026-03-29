"use client";

// Tab bar component for building profile

export type ProfileTab = "overview" | "ownership" | "financials" | "condition" | "market";

interface TabDef {
  id: ProfileTab;
  label: string;
  badge?: string | number | null;
  loading?: boolean;
  locked?: boolean;
}

interface Props {
  active: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  tabs: TabDef[];
}

export default function ProfileTabs({ active, onChange, tabs }: Props) {
  return (
    <div className="border-b border-slate-200 bg-white overflow-x-auto no-scrollbar">
      <nav className="flex min-w-max px-4">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? "text-blue-600 border-blue-600"
                  : "text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {tab.label}
              {tab.locked && (
                <svg className="ml-1 inline-block w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              )}
              {tab.loading && !tab.locked && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              )}
              {!tab.loading && !tab.locked && tab.badge != null && (
                <span className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  isActive ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
