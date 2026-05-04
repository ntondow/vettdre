// Hot-fix smoke contracts for the React error #31 crash on Market Intel
// "Full Profile" → BuildingProfile → BuildingProfileSkeleton → SkeletonSection.
//
// Root cause: SkeletonSection used `typeof icon === "function"` to detect
// component-vs-emoji, but Lucide icons are React.forwardRef objects, not
// functions. The check fell through to `<span>{icon as string}</span>` and
// rendered the forwardRef object directly as a child → React #31.
//
// These contracts pin the *fix surface* (skeleton-shimmer.tsx), per
// methodology v2.2 §"Verified-claim audit pattern". A regex against
// building-profile.tsx (where the bug was first observed) would not have
// caught the actual root cause.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BarChart3 } from "lucide-react";

import { SkeletonSection } from "@/components/ui/skeleton-shimmer";

afterEach(() => cleanup());

describe("hot-fix: SkeletonSection icon prop (React #31)", () => {
  it("C1 — renders a Lucide forwardRef icon without throwing", () => {
    // Pre-fix this throws "Objects are not valid as a React child" because
    // BarChart3 is a forwardRef object, not a function. Post-fix, the dual
    // mode branch detects the non-string and renders <BarChart3 />.
    // BarChart3 in lucide-react v0.564+ is aliased to ChartColumn, so we
    // assert against the generic `lucide-` prefix rather than a specific
    // alias name (resilient to upstream renames).
    const { container } = render(
      <SkeletonSection title="Sales Comparables" icon={BarChart3}>
        <div>child</div>
      </SkeletonSection>
    );

    const iconEl = container.querySelector('svg[class*="lucide-"]');
    expect(iconEl).not.toBeNull();
  });

  it("C2 — renders a legacy emoji string icon (regression-protect)", () => {
    // Existing callers in dashboard/loading.tsx and leasing/loading.tsx still
    // pass emoji strings (e.g. "📊", "💬"). The fix must keep that branch live.
    const { container } = render(
      <SkeletonSection title="Stats" icon="📊">
        <div>child</div>
      </SkeletonSection>
    );

    expect(container.textContent).toContain("📊");
  });

  it("C3 — bug pattern is not present in skeleton-shimmer.tsx", () => {
    // Defends against accidental revert. The pre-fix check was
    //   const IconComponent = typeof icon === "function" ? icon : null;
    // which is the exact shape that mis-detects forwardRef objects.
    const source = readFileSync(
      resolve(__dirname, "../../src/components/ui/skeleton-shimmer.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/typeof\s+icon\s*===\s*["']function["']/);
  });
});
