"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  realOrgName?: string;
  viewingOrgName?: string;
}

// Strips ?as_org=... from the current URL so a click on "Exit override"
// keeps the user on the same path with the override cleared.
function buildClearHref(pathname: string): string {
  if (typeof window === "undefined") return pathname;
  const url = new URL(window.location.href);
  url.searchParams.delete("as_org");
  return url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "");
}

export default function SuperAdminBanner({ realOrgName, viewingOrgName }: Props) {
  const pathname = usePathname();

  return (
    <div className="bg-amber-500 text-amber-950 text-sm font-medium shadow-sm border-b border-amber-600">
      <div className="px-4 md:px-6 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="flex-shrink-0 w-2 h-2 rounded-full bg-amber-900 animate-pulse" />
          <span className="truncate">
            <strong>Super-admin override:</strong> viewing as{" "}
            <strong className="font-semibold">{viewingOrgName || "another organization"}</strong>
            {realOrgName ? (
              <span className="text-amber-900/80 ml-2">(home: {realOrgName})</span>
            ) : null}
          </span>
        </div>
        <Link
          href={buildClearHref(pathname)}
          className="flex-shrink-0 underline underline-offset-2 hover:text-amber-900 whitespace-nowrap"
        >
          Exit override
        </Link>
      </div>
    </div>
  );
}
