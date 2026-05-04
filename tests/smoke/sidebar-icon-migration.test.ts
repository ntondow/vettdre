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

// ── Slice 9-ext — emoji → lucide on secondary render surfaces ──
//
// Slice 9 PR #29 migrated 54 emoji icons across the 3 nav files; slice
// 9-typography (PR #31) dropped uppercase rendering on section labels.
// Slice 9-ext extends the emoji migration to the secondary render-side
// surfaces (filter pills, tab bars, kanban stages, building-profile
// section icons, message folders/categories, export cards).
//
// Scope: typed-props pattern only (icon: LucideIcon on configs/maps).
// Inline button-text emoji (e.g. "✉️ Email") deferred to slice 9-ext-inline.
// Per-file regexes scan ONLY the typed-props declaration block (not the
// whole file) so deferred inline emoji can stay in place without
// false-failing.
//
// Lucide picks track the slice 9 swap-table conventions: `Building2`
// for landlords/multifamily, `Home` for buyers, `DollarSign` for sellers/
// deals, `Mail` for email, etc. Departures noted inline below.

const contactListSrc = readSource("src/app/(dashboard)/contacts/contact-list.tsx");
const contactDossierSrc = readSource("src/app/(dashboard)/contacts/[id]/contact-dossier.tsx");
const dealsPipelineSrc = readSource("src/app/(dashboard)/deals/pipeline/page.tsx");
const njBuildingSrc = readSource("src/app/(dashboard)/market-intel/nj-building-profile.tsx");
const nysBuildingSrc = readSource("src/app/(dashboard)/market-intel/nys-building-profile.tsx");
const buildingSkeletonSrc = readSource("src/app/(dashboard)/market-intel/building-profile-skeleton.tsx");
const messagesSrc = readSource("src/app/(dashboard)/messages/messages-view.tsx");
const exportSrc = readSource("src/app/(dashboard)/settings/export/page.tsx");
const skeletonShimmerSrc = readSource("src/components/ui/skeleton-shimmer.tsx");

// Helper: extract the body of an `=` assignment that opens with `[` (array)
// or `{` (object literal), brace-matched. Handles nested braces correctly.
// Used to scope emoji bans to a single config block (e.g. TYPE_FILTERS array)
// without false-failing on deferred inline emoji elsewhere in the file.
function extractDeclBody(src: string, declStart: RegExp): string {
  const m = src.match(declStart);
  if (!m) return "";
  const start = src.indexOf(m[0]) + m[0].length;
  // Find the opening bracket/brace
  let i = start;
  while (i < src.length && src[i] !== "[" && src[i] !== "{") i++;
  if (i >= src.length) return "";
  const open = src[i];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let j = i;
  for (; j < src.length; j++) {
    if (src[j] === open) depth++;
    else if (src[j] === close) { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(i, j);
}

describe("Slice 9-ext — contact-list.tsx TYPE_FILTERS migrated", () => {
  it("TYPE_FILTERS array contains zero emoji + uses LucideIcon", () => {
    const block = extractDeclBody(contactListSrc, /TYPE_FILTERS\s*:[^=]*=\s*/);
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(emojiRegex);
    // Type annotation references LucideIcon
    expect(contactListSrc).toMatch(/icon:\s*LucideIcon\s*\}\[\]\s*=/);
  });

  it("imports the lucide icons", () => {
    const lucideImportBlock = contactListSrc.match(
      /import\s*\{([\s\S]*?)\}\s*from\s*["']lucide-react["']/,
    );
    expect(lucideImportBlock).not.toBeNull();
    const imported = lucideImportBlock![1];
    for (const name of ["Users", "Building2", "Home", "DollarSign", "Key"]) {
      expect(imported).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

describe("Slice 9-ext — contact-dossier.tsx TABS + activityIcons migrated", () => {
  it("activityIcons map contains zero emoji + uses LucideIcon", () => {
    const block = extractDeclBody(contactDossierSrc, /const activityIcons:[^=]*=\s*/);
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(emojiRegex);
    expect(contactDossierSrc).toMatch(/activityIcons:\s*Record<string,\s*LucideIcon>/);
  });

  it("tabs array contains zero emoji + uses LucideIcon", () => {
    const block = extractDeclBody(contactDossierSrc, /const tabs:[^=]*=\s*/);
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(emojiRegex);
    expect(contactDossierSrc).toMatch(/tabs:\s*\{[^}]*icon:\s*LucideIcon[^}]*\}\[\]/);
  });

  it("imports the lucide icons for both tabs + activity types", () => {
    const lucideImportBlock = contactDossierSrc.match(
      /import\s*\{([\s\S]*?)\}\s*from\s*["']lucide-react["']/,
    );
    expect(lucideImportBlock).not.toBeNull();
    const imported = lucideImportBlock![1];
    for (const name of [
      "ClipboardList", "Pencil", "BarChart3", "DollarSign", "CheckSquare", "Mail",
      "Phone", "MessageCircle", "Home", "Handshake", "FileText", "Settings",
    ]) {
      expect(imported).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

describe("Slice 9-ext — deals/pipeline/page.tsx STAGES migrated", () => {
  it("STAGES array contains zero emoji + uses LucideIcon", () => {
    const block = extractDeclBody(dealsPipelineSrc, /const STAGES\s*:[^=]*=\s*/);
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(emojiRegex);
    expect(dealsPipelineSrc).toMatch(/icon:\s*LucideIcon\s*\}\[\]\s*=/);
  });

  it("imports stage lucide icons (Search/Target/Send/Pencil/CheckCircle2/Skull)", () => {
    const lucideImportBlock = dealsPipelineSrc.match(
      /import\s*\{([\s\S]*?)\}\s*from\s*["']lucide-react["']/,
    );
    expect(lucideImportBlock).not.toBeNull();
    const imported = lucideImportBlock![1];
    // Skull picked deliberately for "dead" stage — reads as "lost deal" in
    // a way no other lucide icon does. If a future PR swaps this, the
    // contract fails as a heads-up.
    for (const name of ["Search", "Target", "Send", "Pencil", "CheckCircle2", "Skull"]) {
      expect(imported).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

describe("Slice 9-ext — building-profile family migrated", () => {
  it("nj-building-profile.tsx Section component accepts LucideIcon", () => {
    expect(njBuildingSrc).toMatch(/icon\?:\s*LucideIcon/);
    // Both Section call sites use lucide components, not strings.
    expect(njBuildingSrc).toMatch(/icon=\{BarChart3\}/);
    expect(njBuildingSrc).toMatch(/icon=\{Lock\}/);
    // No string-emoji icon attributes in the file.
    expect(njBuildingSrc).not.toMatch(/icon="[^"]*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it("nys-building-profile.tsx Section component accepts LucideIcon", () => {
    expect(nysBuildingSrc).toMatch(/icon\?:\s*LucideIcon/);
    expect(nysBuildingSrc).toMatch(/icon=\{BarChart3\}/);
    expect(nysBuildingSrc).toMatch(/icon=\{Building\}/);
    expect(nysBuildingSrc).not.toMatch(/icon="[^"]*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it("building-profile-skeleton.tsx passes LucideIcon to SkeletonSection", () => {
    expect(buildingSkeletonSrc).toMatch(/icon=\{BarChart3\}/);
    expect(buildingSkeletonSrc).toMatch(/icon=\{Building\}/);
    expect(buildingSkeletonSrc).toMatch(/icon=\{Building2\}/);
    expect(buildingSkeletonSrc).not.toMatch(/icon="[^"]*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    // Imports
    const lucideImportBlock = buildingSkeletonSrc.match(
      /import\s*\{([\s\S]*?)\}\s*from\s*["']lucide-react["']/,
    );
    expect(lucideImportBlock).not.toBeNull();
    expect(lucideImportBlock![1]).toMatch(/\bBarChart3\b/);
    expect(lucideImportBlock![1]).toMatch(/\bBuilding\b/);
    expect(lucideImportBlock![1]).toMatch(/\bBuilding2\b/);
  });
});

describe("Slice 9-ext — messages-view.tsx categoryConfig + folders migrated", () => {
  it("categoryConfig map contains zero emoji + uses LucideIcon", () => {
    const block = extractDeclBody(messagesSrc, /const categoryConfig:[^=]*=\s*/);
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(emojiRegex);
    expect(messagesSrc).toMatch(/categoryConfig:\s*Record<string,\s*\{[^}]*icon:\s*LucideIcon/);
  });

  it("gmailFolders array contains zero emoji + uses LucideIcon", () => {
    const block = extractDeclBody(messagesSrc, /const gmailFolders\s*:[^=]*=\s*/);
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(emojiRegex);
    expect(messagesSrc).toMatch(/gmailFolders:\s*\{[^}]*icon:\s*LucideIcon[^}]*\}\[\]/);
  });

  it("imports the folder + category lucide icons", () => {
    const lucideImportBlock = messagesSrc.match(
      /import\s*\{([\s\S]*?)\}\s*from\s*["']lucide-react["']/,
    );
    expect(lucideImportBlock).not.toBeNull();
    const imported = lucideImportBlock![1];
    for (const name of [
      "Circle", "User", "Newspaper", "Receipt", "Ban",
      "Inbox", "Send", "Star", "Pencil", "Trash2", "AlertTriangle", "Folder",
    ]) {
      expect(imported).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

describe("Slice 9-ext — settings/export/page.tsx ExportCard migrated", () => {
  it("ExportCardProps.icon is LucideIcon", () => {
    expect(exportSrc).toMatch(/interface\s+ExportCardProps\s*\{[\s\S]*?icon:\s*LucideIcon/);
  });

  it("All 3 ExportCard call sites pass lucide components", () => {
    expect(exportSrc).toMatch(/icon=\{Users\}/);
    expect(exportSrc).toMatch(/icon=\{DollarSign\}/);
    expect(exportSrc).toMatch(/icon=\{Mail\}/);
    // No string-emoji icon attributes anywhere on ExportCard.
    expect(exportSrc).not.toMatch(/<ExportCard\s+icon="[^"]*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe("Slice 9-ext — skeleton-shimmer.tsx SkeletonSection accepts both icon types", () => {
  // The shared utility's prop type was widened from `string` to
  // `string | LucideIcon` to enable building-profile-skeleton.tsx to
  // migrate without breaking the deferred leasing/loading.tsx caller
  // (which still passes string emoji and lands in 9-ext-inline).
  it("icon prop type is the union string | LucideIcon", () => {
    expect(skeletonShimmerSrc).toMatch(/icon\?:\s*string\s*\|\s*LucideIcon/);
  });

  it("renders both branches: lucide component AND legacy string", () => {
    // Non-string check distinguishes the component branch from the legacy
    // string branch — locking in the dual-mode render so a future
    // "simplify to one or the other" edit fails the contract until the
    // leasing-skeleton caller also migrates. Updated 2026-05-03 by the
    // phase-1-hotfix-react31-skeleton-icon slice: the original
    // `typeof icon === "function"` predicate mis-classified Lucide's
    // forwardRef objects (whose typeof is "object") and triggered React
    // error #31 in production. Now `icon && typeof icon !== "string"`.
    expect(skeletonShimmerSrc).toMatch(/icon\s*&&\s*typeof\s+icon\s*!==\s*["']string["']/);
    expect(skeletonShimmerSrc).toMatch(/<IconComponent\s+className=/);
    expect(skeletonShimmerSrc).toMatch(/<span\s+className="text-lg">\{icon\s+as\s+string\}</);
  });

  it("imports LucideIcon type", () => {
    expect(skeletonShimmerSrc).toMatch(
      /import\s+type\s*\{\s*LucideIcon\s*\}\s+from\s+["']lucide-react["']/,
    );
  });
});
