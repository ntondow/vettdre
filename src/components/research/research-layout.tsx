"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface ResearchLayoutProps {
  icon: LucideIcon;
  iconColor: string;     // e.g. "text-blue-400"
  iconBg: string;        // e.g. "bg-blue-600/20"
  title: string;
  subtitle: string;
  children: ReactNode;
}

export default function ResearchLayout({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  children,
}: ResearchLayoutProps) {
  return (
    <div className="min-h-full bg-[#0B0F19] text-white">
      {/* Header */}
      <div className="border-b border-white/5 px-4 md:px-6 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">{title}</h1>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-5">
        {children}
      </div>
    </div>
  );
}
