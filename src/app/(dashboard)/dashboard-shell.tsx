"use client";

import { useSidebar } from "@/components/layout/sidebar-context";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <main className={`pb-16 md:pb-0 transition-all duration-200 ${collapsed ? "md:pl-[60px]" : "md:pl-60"}`}>
      {children}
    </main>
  );
}
