// Slice 9 smoke — emoji → lucide icon migration.
//
// Three nav surfaces (global sidebar, mobile bottom nav + More sheet,
// settings sidebar) carried 54 emoji-character icons inherited from a
// pre-design-system phase. Slice 9 swapped each to a lucide-react
// component and migrated NavItem.icon from `string` to `LucideIcon`.
//
// These contracts lock the migration end-to-end so a future "let me
// just throw an emoji in there real quick" edit fails loudly at the
// PR-review stage rather than landing as a visual regression.
//
// Failure-output intent: contracts grouped by file in describe blocks
// so a future regression reads "settings-sidebar.tsx is emoji-free" in
// the test reporter, not a line number.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const sidebarSrc = readSource("src/components/layout/sidebar.tsx");
const mobileSrc = readSource("src/components/layout/mobile-nav.tsx");
const settingsSrc = readSource("src/app/(dashboard)/settings/settings-sidebar.tsx");
const brokerageSrc = readSource("src/app/(dashboard)/brokerage/layout.tsx");

// Every emoji used as a UI icon in the three nav files pre-slice-9,
// plus the « / » collapse arrows. If a single one survives a future
// edit, the regex matches and the contract fails. The character class
// is built from the audit list so it's exhaustive but not overbroad —
// we don't want to catch emoji used as data (e.g. EmailLabel.icon
// DEFAULT_LABELS, deferred to a Phase 4 slice).
const EMOJI_TARGETS =
  "📊📋🛡💼👥📬📅🎯🔍📡⚙️🏢🧮🤖🏠🏛⚡🚪📧☰«»👤✍🔔🕐🎨📞⏱📝💳🔑📤➕";
const emojiRegex = new RegExp(`[${EMOJI_TARGETS}]`, "u");

describe("Slice 9 — sidebar.tsx is emoji-free", () => {
  // The global sidebar carries 18 NAV item icons + sign-out + collapse
  // (ChevronLeft / ChevronRight). All swapped to lucide components.

  it("contains zero target nav emoji", () => {
    expect(sidebarSrc).not.toMatch(emojiRegex);
  });

  it("imports the lucide-react icons matching the swap table", () => {
    // Each named import must appear in a lucide-react import statement.
    // We don't assert ordering or single-line vs multi-line — just that
    // the names show up in the import block.
    const lucideImportBlock = sidebarSrc.match(
      /import\s*\{([\s\S]*?)\}\s*from\s*["']lucide-react["']/,
    );
    expect(lucideImportBlock).not.toBeNull();
    const imported = lucideImportBlock![1];

    const required = [
      "LayoutDashboard",
      "Briefcase",
      "ClipboardCheck",
      "MessageSquare",
      "Calendar",
      "Users",
      "Map",
      "Activity",
      "Target",
      "ShieldCheck",
      "Building",
      "Building2",
      "Calculator",
      "Bot",
      "Settings",
      "LogOut",
      "ChevronLeft",
      "ChevronRight",
    ];
    for (const name of required) {
      expect(imported).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it("NavItem.icon type is LucideIcon, not a string", () => {
    expect(sidebarSrc).toMatch(/icon:\s*LucideIcon/);
    expect(sidebarSrc).not.toMatch(/icon:\s*string/);
  });
});

describe("Slice 9 — mobile-nav.tsx is emoji-free", () => {
  // 5-tab bottom bar + 7 More-sheet items + Settings entry + sign-out.

  it("contains zero target nav emoji", () => {
    expect(mobileSrc).not.toMatch(emojiRegex);
  });

  it("imports Menu + LogOut + the tab/More icons from lucide-react", () => {
    const lucideImportBlock = mobileSrc.match(
      /import\s*\{([\s\S]*?)\}\s*from\s*["']lucide-react["']/,
    );
    expect(lucideImportBlock).not.toBeNull();
    const imported = lucideImportBlock![1];

    // Tab bar uses Menu; sign-out uses LogOut; tab/More items reference
    // the standard slice-9 swap table.
    const required = [
      "Menu",
      "LogOut",
      "LayoutDashboard",
      "Building",
      "MessageSquare",
      "Calendar",
      "Briefcase",
      "ClipboardCheck",
      "Users",
      "Building2",
      "Calculator",
      "Bot",
      "Map",
      "Activity",
      "Target",
      "ShieldCheck",
      "Settings",
    ];
    for (const name of required) {
      expect(imported).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

describe("Slice 9 — settings-sidebar.tsx is emoji-free", () => {
  // 14 NAV items + 5 ADMIN_NAV items. Includes the three semantic
  // disambiguations: GitBranch (Pipeline, not BarChart3 which reads
  // "reports"), Sparkles (AI Settings, not Bot which is reserved for
  // Leasing), UserPlus (Add User, not generic Plus).

  it("contains zero target nav emoji", () => {
    expect(settingsSrc).not.toMatch(emojiRegex);
  });

  it("imports the disambiguated icons (GitBranch, Sparkles, UserPlus) from lucide-react", () => {
    // *** SEMANTIC LOCK ***
    //
    // Pipeline → GitBranch: BarChart3 reads "reports", which Reports owns.
    // AI Settings → Sparkles: Bot is reserved for the Leasing surface.
    // Add User → UserPlus: specific intent vs. generic Plus.
    //
    // These three picks survived audit on the explicit grounds that the
    // alternative was a semantic collision. Locking by name so a future
    // "looks fine, swap to Bot" edit fails the contract.
    const lucideImportBlock = settingsSrc.match(
      /import\s*\{([\s\S]*?)\}\s*from\s*["']lucide-react["']/,
    );
    expect(lucideImportBlock).not.toBeNull();
    const imported = lucideImportBlock![1];

    expect(imported).toMatch(/\bGitBranch\b/);
    expect(imported).toMatch(/\bSparkles\b/);
    expect(imported).toMatch(/\bUserPlus\b/);

    // And the file should NOT import the colliding alternatives, so a
    // future swap can't sneak past.
    expect(imported).not.toMatch(/\bBarChart3\b/);
    expect(imported).not.toMatch(/\bBot\b/);
  });
});

// ── Slice 9-typography — drop ALL CAPS on section labels ──────
//
// Slice 9's audit spec had two concerns: emoji icons (shipped in PR #29)
// and "no ALL CAPS section headers." The typography half was deferred so
// it could ship as an explicit, separately-reviewable visual change.
//
// All four nav surfaces previously wrapped the section-label <p> with
// `uppercase tracking-wider`. Removing `uppercase` keeps the subtle
// letterspacing (still useful for headers) but renders the labels in
// their natural mixed case — matching the source-of-truth strings
// ("My Work", "Operations", etc.).
//
// Each contract reads the section-label render line and asserts the
// className string does not contain `uppercase`. Scoped to the section-
// label render site only — not a blanket file-wide ban — so a future
// legitimate use of `uppercase` elsewhere in the file (e.g. a status
// pill) doesn't false-trigger.
//
// Why one regex per file: the four files use slightly different render
// shapes (template literal vs static string, `section.label` vs
// `group.group`), so a single shared regex would either miss one or
// over-match. Per-file regexes keep failure messages readable.
describe("Slice 9-typography — section labels are not ALL CAPS", () => {
  it("sidebar.tsx section-label className does not include uppercase", () => {
    // Template-literal className wrapping `${section.label}`.
    const match = sidebarSrc.match(
      /<p\s+className=\{`[^`]*`\}\s*>\s*\{section\.label\}\s*<\/p>/,
    );
    expect(match).not.toBeNull();
    expect(match![0]).not.toMatch(/\buppercase\b/);
    expect(match![0]).toMatch(/\btracking-wider\b/);
  });

  it("mobile-nav.tsx section-label className does not include uppercase", () => {
    // Static string className wrapping {section.label}.
    const match = mobileSrc.match(
      /<p\s+className="[^"]*">\{section\.label\}<\/p>/,
    );
    expect(match).not.toBeNull();
    expect(match![0]).not.toMatch(/\buppercase\b/);
    expect(match![0]).toMatch(/\btracking-wider\b/);
  });

  it("brokerage/layout.tsx group-label className does not include uppercase", () => {
    // Static string className wrapping {group.group}.
    const match = brokerageSrc.match(
      /<p\s+className="[^"]*">\s*\{group\.group\}\s*<\/p>/,
    );
    expect(match).not.toBeNull();
    expect(match![0]).not.toMatch(/\buppercase\b/);
    expect(match![0]).toMatch(/\btracking-wider\b/);
  });

  it("settings-sidebar.tsx group-label className does not include uppercase", () => {
    // Static string className wrapping {group.group}.
    const match = settingsSrc.match(
      /<p\s+className="[^"]*">\s*\{group\.group\}\s*<\/p>/,
    );
    expect(match).not.toBeNull();
    expect(match![0]).not.toMatch(/\buppercase\b/);
    expect(match![0]).toMatch(/\btracking-wider\b/);
  });
});
