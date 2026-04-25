# VettdRE Design System v2.0

## Philosophy: The Architectural Operator

VettdRE is a platform that deals with real buildings, real money, and real decisions. The visual language should reflect that weight. We borrow the editorial restraint and tonal depth of high-end architectural media but adapt it for an operational tool where agents work 8 hours a day.

**Core tensions we balance:**

- **Premium feel** vs. **information density** — the dashboard should feel like Bloomberg dressed by an architect, not a luxury brochure.
- **Calm authority** vs. **actionable clarity** — muted tones set the mood, but status colors must pop when they need to.
- **Whitespace as material** vs. **screen real estate** — generous spacing on summary views, tighter grids on workhorse pages (pipeline, inbox, tables).

---

## 1. Color System

### 1.1 Brand Foundation

| Token | Hex | Role |
|---|---|---|
| `--brand-navy` | `#0F172A` | Brand anchor. Sidebar, headers, high-authority surfaces. |
| `--brand-accent` | `#3B5998` | Interactive primary. Buttons, links, focus rings, active states. |
| `--brand-accent-hover` | `#2D4A7A` | Hover state for primary interactive elements. |
| `--brand-accent-subtle` | `#E8EEF7` | Accent tint for selected rows, active tabs, light highlights. |

**Rationale:** The deep navy (`#0F172A`) gives VettdRE the gravitas of an established firm — it's the "suit" the brand wears. The accent (`#3B5998`) is a refined, desaturated blue that's professional without being "SaaS blue." It has enough saturation to be clearly interactive but doesn't scream startup.

### 1.2 Surface Hierarchy

Surfaces replace borders as the primary way to define regions. Think of them as layers of paper — each slightly different in tone.

| Token | Hex | Use |
|---|---|---|
| `--surface-base` | `#F7F9FB` | Page background. The "desk" everything sits on. |
| `--surface-raised` | `#FFFFFF` | Cards, modals, popovers. Sits "above" the base. |
| `--surface-sunken` | `#EFF2F5` | Inset areas: sidebar backgrounds, table headers, code blocks. |
| `--surface-overlay` | `#E4E9EE` | Hover backgrounds, alternating row tints, secondary panels. |
| `--surface-nav` | `#0F172A` | Sidebar and top-level navigation. Uses brand navy. |

**The "Prefer Tonal Shift" Rule:** When defining a region boundary, try a background color change first. If the contrast is insufficient (especially in data tables or tight layouts), use a `--border-subtle` line. This is a guideline, not a prohibition — data-dense views get borders when they need them.

### 1.3 Text Hierarchy

| Token | Hex | Use |
|---|---|---|
| `--text-primary` | `#0F172A` | Headings, labels, primary data values. |
| `--text-secondary` | `#475569` | Body text, descriptions, secondary labels. |
| `--text-tertiary` | `#94A3B8` | Metadata, timestamps, placeholders, disabled text. |
| `--text-inverse` | `#F8FAFC` | Text on dark backgrounds (sidebar, navy headers). |
| `--text-accent` | `#3B5998` | Links, interactive text, active breadcrumbs. |

### 1.4 Border & Divider Tokens

| Token | Hex | Use |
|---|---|---|
| `--border-default` | `#E2E8F0` | Standard card borders, input borders at rest. |
| `--border-subtle` | `#F1F5F9` | Light dividers between table rows, section separators. |
| `--border-strong` | `#CBD5E1` | Emphasized boundaries when tonal shift alone isn't enough. |
| `--border-focus` | `#3B5998` | Focus rings on inputs, buttons, interactive elements. |

### 1.5 Semantic Colors

These communicate system state. They're intentionally muted compared to typical SaaS palettes — enough to be clear, not enough to be garish.

| Token | Hex | Name | Use |
|---|---|---|---|
| `--semantic-success` | `#16A34A` | Verdant | Completed, signed, closed-won, connected. |
| `--semantic-success-subtle` | `#F0FDF4` | | Success backgrounds. |
| `--semantic-warning` | `#D97706` | Amber | Expiring, attention needed, moderate risk. |
| `--semantic-warning-subtle` | `#FFFBEB` | | Warning backgrounds. |
| `--semantic-error` | `#9F403D` | Brick | Failed, rejected, overdue, high risk. |
| `--semantic-error-subtle` | `#FEF2F2` | | Error backgrounds. |
| `--semantic-info` | `#3B5998` | Slate Blue | Informational, in-progress, pending. |
| `--semantic-info-subtle` | `#E8EEF7` | | Info backgrounds. |

### 1.6 Operational Colors

These are the workday colors — used across pipeline boards, contact statuses, deal health indicators, and leasing temperature gauges. Each set is designed to be distinguishable at a glance while staying within the overall muted-professional palette.

#### Pipeline Stages

| Stage | Badge BG | Badge Text | Kanban Left Border |
|---|---|---|---|
| New Lead | `#E8EEF7` | `#3B5998` | `#3B5998` |
| Contacted | `#F0EDFF` | `#6C5CE7` | `#6C5CE7` |
| Showing | `#FFF3E0` | `#E67E22` | `#E67E22` |
| Offer | `#FFF8E1` | `#F59E0B` | `#F59E0B` |
| Under Contract | `#E8F5E9` | `#2E7D32` | `#2E7D32` |
| Closed Won | `#F0FDF4` | `#16A34A` | `#16A34A` |
| Closed Lost | `#F1F5F9` | `#94A3B8` | `#94A3B8` |

#### Contact Status

| Status | Color | Dot/Badge |
|---|---|---|
| Active | `#16A34A` | Green dot |
| Nurturing | `#3B5998` | Blue dot |
| Cold | `#94A3B8` | Gray dot |
| Unqualified | `#D97706` | Amber dot |
| Do Not Contact | `#9F403D` | Brick dot |

#### Deal Health / Risk Score

| Level | Color | Use |
|---|---|---|
| Strong (0-25) | `#16A34A` | Low risk, on track. |
| Fair (26-50) | `#D97706` | Moderate risk, watch items. |
| Distressed (51-75) | `#EA580C` | Elevated risk, action needed. |
| Critical (76-100) | `#9F403D` | High risk, urgent intervention. |

#### Leasing Temperature

| Temp | Color | Badge BG |
|---|---|---|
| Hot | `#DC2626` | `#FEE2E2` |
| Warm | `#F59E0B` | `#FEF3C7` |
| Cool | `#3B5998` | `#E8EEF7` |
| Cold | `#94A3B8` | `#F1F5F9` |

#### Showing Types

| Type | Color |
|---|---|
| Showing | `#3B5998` |
| Open House | `#16A34A` |
| Inspection | `#D97706` |
| Closing | `#0F172A` |
| Meeting | `#6C5CE7` |
| Task | `#94A3B8` |

---

## 2. Typography

**Font: Manrope** — A geometric sans-serif with warmth. Modern enough for a tech product, grounded enough for real estate.

Import: `https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap`

| Level | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| Display | 2.25rem (36px) | 700 | 1.2 | -0.02em | Hero metrics, page titles on summary views. |
| Heading | 1.5rem (24px) | 700 | 1.3 | -0.01em | Section headers, modal titles. |
| Subheading | 1.125rem (18px) | 600 | 1.4 | 0 | Card titles, panel headers, form section labels. |
| Body | 0.875rem (14px) | 400 | 1.5 | 0 | Default text, descriptions, form help text. |
| Body Small | 0.8125rem (13px) | 400 | 1.5 | 0 | Table cell text, compact UI, secondary content. |
| Caption | 0.75rem (12px) | 500 | 1.4 | 0.01em | Metadata, timestamps, column headers. |
| Overline | 0.6875rem (11px) | 600 | 1.3 | 0.08em | Section labels (uppercase), status badges, nav group headers. |

**Key rules:**
- Pair large Display type with generous whitespace on summary/overview screens.
- Data tables and work surfaces use Body Small (13px) for density.
- Never go below 11px for any text.
- Use negative letter-spacing on Display and Heading levels only.

---

## 3. Spacing & Layout

**Base unit: 4px**

| Scale | Value | Use |
|---|---|---|
| 1 | 4px | Icon-to-text gap, inline badge padding. |
| 2 | 8px | Tight element spacing, compact list gap. |
| 3 | 12px | Default element gap (buttons in a group, form fields). |
| 4 | 16px | Card internal padding, section title to content. |
| 5 | 20px | Column gaps in grids. |
| 6 | 24px | Card padding (standard). |
| 8 | 32px | Major section separation (within a page). |
| 10 | 40px | Page section gaps (between distinct feature blocks). |
| 12 | 48px | Page-level vertical rhythm (between major sections). |

### Layout Contexts

**Summary views** (Dashboard, Deal Overview, Portfolio): Use scale 8-12 for breathing room. Display typography. Editorial feel.

**Workhorse views** (Pipeline, Inbox, Contacts table, BMS transactions): Use scale 2-4. Body Small typography. Tighter grid. Borders permitted. Information density is the priority.

**Forms & Settings**: Use scale 3-6. Standard body typography. Comfortable but not lavish.

### Grid

- **Desktop**: 12-column grid, 20px gutters, max-width 1440px.
- **Sidebar**: 240px collapsed-capable (60px collapsed).
- **Dashboard main**: `pb-16 md:pb-0 md:pl-60` (unchanged from current).

---

## 4. Elevation & Depth

### Shadows

Shadows should feel like natural light, not Photoshop effects. Tinted with the text color for warmth.

| Level | Use | CSS |
|---|---|---|
| None | Flat cards on tinted backgrounds. | — |
| Subtle | Standard cards, dropdowns at rest. | `0 1px 3px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.06)` |
| Medium | Popovers, active dropdowns, floating panels. | `0 4px 12px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.04)` |
| High | Modals, command palettes, sheets. | `0 12px 40px rgba(15,23,42,0.08), 0 4px 12px rgba(15,23,42,0.04)` |

### Glassmorphism (Selective Use)

For sticky headers and floating toolbars only:
```css
background: rgba(255, 255, 255, 0.85);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
```

---

## 5. Border Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4px | Badges, small tags, inline chips. |
| `--radius-default` | 8px | Cards, buttons, inputs, dropdowns. |
| `--radius-lg` | 12px | Modals, sheets, large containers. |
| `--radius-xl` | 16px | Feature cards, hero sections, landing page blocks. |
| `--radius-full` | 9999px | Avatars, status dots, pill badges. |

---

## 6. Component Guidelines

### 6.1 Sidebar

- **Background**: `--surface-nav` (`#0F172A`) — dark navy.
- **Text**: `--text-inverse` at 60% opacity for inactive items, 100% for active.
- **Active indicator**: Left 3px accent bar (`--brand-accent`) + full opacity text + subtle background tint (`rgba(59,89,152,0.15)`).
- **Hover**: Background tint `rgba(255,255,255,0.06)`.
- **Section labels**: Overline type, 40% opacity.
- **Logo**: "Vettd" in white, "RE" in `--brand-accent`.
- **Collapsed state**: 60px width, icons centered, tooltips on hover.

### 6.2 Cards

- **Default card**: `--surface-raised` background, `--border-default` border (1px), `--radius-default` corners, `shadow-subtle` or no shadow depending on parent surface.
- **Stat cards**: Larger type for the metric (Display or Heading level), caption for label. Optional left accent bar for category coding.
- **On `--surface-base`**: Cards get the subtle shadow.
- **On `--surface-raised`**: Cards use tonal shift only (set card to `--surface-sunken`), no border.

### 6.3 Buttons

| Variant | Background | Text | Border |
|---|---|---|---|
| Primary | `--brand-accent` | white | none |
| Secondary | transparent | `--brand-accent` | 1px `--brand-accent` at 30% |
| Ghost | transparent | `--text-secondary` | none |
| Danger | `--semantic-error` | white | none |

- **Radius**: `--radius-default` (8px).
- **Height**: 36px default, 40px large, 28px compact.
- **Hover**: Darken 10% or use `--brand-accent-hover`.
- **Active**: Scale 0.98 + darken 15%.
- **Disabled**: 40% opacity, no pointer events.

### 6.4 Tables & Data Lists

Tables are the most-used pattern in VettdRE. Density is paramount.

- **Header row**: `--surface-sunken` background, Caption type, uppercase.
- **Row borders**: `--border-subtle` (1px). This is an exception to the "prefer tonal shift" rule — table rows need lines for scanability.
- **Row hover**: `--surface-overlay` background.
- **Selected row**: `--brand-accent-subtle` background + left 3px `--brand-accent` inset shadow.
- **Cell padding**: 12px horizontal, 10px vertical (compact mode: 8px vertical).
- **Zebra striping**: Optional. Alternate rows with `--surface-base` / `--surface-raised`.

### 6.5 Inputs & Forms

- **Border at rest**: `--border-default`.
- **Border on focus**: `--border-focus` (2px) + subtle box-shadow glow.
- **Background**: `--surface-raised`.
- **Label**: Caption type, `--text-secondary`, 4px below label to input.
- **Error state**: `--semantic-error` border + error message in Caption type below.
- **Disabled**: `--surface-sunken` background, 50% opacity text.

### 6.6 Badges & Status Indicators

- **Pill badges**: `--radius-full`, Overline type, tight padding (4px 10px).
- **Use the operational color tables** (section 1.6) for background/text color mapping.
- **Status dots**: 8px diameter circles before status text.

### 6.7 Modals & Sheets

- **Backdrop**: `rgba(15, 23, 42, 0.4)` with blur (4px).
- **Modal**: `--surface-raised`, `--radius-lg`, `shadow-high`.
- **Animation**: Scale from 0.95 + fade in, 200ms ease-out.
- **Mobile sheets**: Slide up from bottom, `--radius-lg` on top corners only.

### 6.8 Charts & Data Visualization

- **Grid lines**: `--border-subtle` at 40% opacity.
- **Primary data series**: `--brand-accent`.
- **Secondary series**: `--semantic-success`, then `--semantic-warning`.
- **Tooltips**: `--surface-raised` with `shadow-medium`, glassmorphism optional.
- **Numbers in charts**: Heading or Subheading type for impact.

---

## 7. Animation

All animations should feel physical — fast enough to be responsive, with enough easing to feel weighted.

| Name | Duration | Easing | Use |
|---|---|---|---|
| `fade-in` | 200ms | ease-out | Default entrance for cards, sections. |
| `modal-in` | 200ms | cubic-bezier(0.16, 1, 0.3, 1) | Modals, command palettes. |
| `slide-up` | 150ms | ease-out | Tooltips, dropdown menus. |
| `slide-up-sheet` | 300ms | cubic-bezier(0.32, 0.72, 0, 1) | Mobile sheets. |
| `shimmer` | 1.5s | ease-in-out infinite | Skeleton loading states. |

---

## 8. Iconography

**Current**: Emoji icons in sidebar + Lucide React for UI.

**Target**: Lucide React everywhere. Emojis removed from navigation. Icons should be 18px in nav, 16px inline, 20px in empty states.

Emoji icons were fine for rapid prototyping but hurt the premium feel. Lucide's clean line style matches Manrope's geometric character. Migration can happen incrementally — sidebar first, then the rest.

---

## 9. Dark Mode (Future)

The token system is designed to support a dark mode pass later:

- `--surface-base` → `#0F172A`
- `--surface-raised` → `#1E293B`
- `--surface-sunken` → `#0B1120`
- `--text-primary` → `#F1F5F9`
- `--text-secondary` → `#94A3B8`
- `--brand-accent` stays the same (already high-contrast on dark).

This is not a current priority but the token architecture supports it cleanly.

---

## 10. Migration Strategy

This is a 70+ page application. The rebrand should be applied incrementally, not in one massive PR.

### Phase 1: Foundation (Do First)
1. Add Manrope font import to `layout.tsx`.
2. Update `globals.css` with the `@theme` token block and base styles.
3. Update sidebar to dark navy + Lucide icons.
4. Update dashboard layout background to `--surface-base`.

### Phase 2: Core Surfaces
5. Cards, modals, and sheets adopt new surface tokens.
6. Buttons standardized across the app.
7. Input/form styling updated.

### Phase 3: Data Views
8. Contacts table, Pipeline kanban, BMS tables — apply table guidelines.
9. Status badges and operational colors across all views.

### Phase 4: Polish
10. Chart/visualization updates.
11. Calendar, email inbox, leasing pages.
12. Settings pages.
13. Public pages (signing page, booking, chat widget).

### Phase 5: Cleanup
14. Remove all hardcoded Tailwind color classes (`bg-blue-600`, `bg-slate-50`, etc.) in favor of semantic tokens.
15. Remove emoji icons from navigation.
16. Update PWA manifest theme color, favicons, OG images.
