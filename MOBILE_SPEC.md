# VettdRE — Mobile Responsiveness Spec

Read CLAUDE.md for project context. Make the entire app responsive so it works well on phones (375px+) and tablets (768px+). The app should feel like a native mobile app when added to the home screen.

---

## Breakpoints

```
Mobile:  < 768px
Tablet:  768px - 1024px
Desktop: > 1024px
```

Use Tailwind responsive prefixes: `sm:` (640px), `md:` (768px), `lg:` (1024px), `xl:` (1280px).

---

## 1. PWA Setup (Add to Home Screen)

Add to `src/app/layout.tsx` head:
```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="VettdRE" />
<meta name="theme-color" content="#1E40AF" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

Create `public/manifest.json`:
```json
{
  "name": "VettdRE CRM",
  "short_name": "VettdRE",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1E40AF",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Generate simple icons from the VettdRE logo or create a simple "V" icon in the brand blue color.

---

## 2. Sidebar Navigation → Mobile Bottom Tab Bar + Hamburger

### Current (Desktop):
Left sidebar with: Dashboard, Contacts, Pipeline, Messages, Calendar, Market Intel, Properties, Portfolios, Prospecting, Settings

### Mobile (<768px):

**Bottom Tab Bar** (fixed, 5 main items):
```
┌─────────────────────────────────────────┐
│  🏠    👥    📧    🔍    ☰             │
│ Home  Contacts Messages Intel  More     │
└─────────────────────────────────────────┘
```

- Fixed to bottom: `fixed bottom-0 left-0 right-0 z-50`
- Height: 64px with safe area padding for iPhone notch: `pb-safe`
- Background: `bg-white border-t border-slate-200`
- Active tab: `text-blue-600` with filled icon, inactive: `text-slate-400`
- Each tab: icon (24px) + label (text-xs) stacked vertically
- Tab 5 "More" opens a slide-up sheet with: Pipeline, Calendar, Properties, Portfolios, Prospecting, Settings

**More Sheet:**
- Slides up from bottom, dark overlay behind
- Full list of remaining nav items
- Each item: icon + label, full-width tap target (min 48px height)
- Tap outside or swipe down to close

**Desktop sidebar:**
- Hide on mobile: `hidden md:flex`
- Bottom tab bar: `flex md:hidden`

### Implementation in `src/components/layout/sidebar.tsx`:
- Keep existing sidebar for desktop
- Add a new `<MobileNav />` component rendered below `md:` breakpoint
- Add `pb-20 md:pb-0` to main content area so content isn't hidden behind bottom bar

---

## 3. Dashboard Page

### Mobile:
- Greeting: smaller text, single line
- Stat cards: 2x2 grid instead of 4 across (`grid grid-cols-2 md:grid-cols-4 gap-3`)
- Stat cards: reduce padding `p-3 md:p-5`, number `text-2xl md:text-3xl`
- Widgets: full width, single column stack
- Each widget card: `rounded-lg` with `mx-0` (edge-to-edge on mobile)

---

## 4. Contacts Page

### Contact List (Mobile):
- Hide table layout, show card list instead
- Each contact card:
```
┌──────────────────────────────────┐
│ JS  John Smith           Score A │
│     john@email.com               │
│     📞 (718) 555-1234    [Call]  │
│     Source: StreetEasy · 2d ago  │
└──────────────────────────────────┘
```
- Initials circle (40px) + name (font-medium) + score badge
- Email truncated, phone with tap-to-call button
- Source + relative date in text-xs text-slate-400
- Tap card → navigates to contact detail
- `[Call]` button: `<a href="tel:...">`
- Search bar: full width, sticky at top
- Filter pills: horizontal scroll below search
- Add contact FAB (floating action button): fixed bottom-right, above tab bar

### Contact Detail/Dossier (Mobile):
- Tabs stack vertically or become horizontal scroll pills
- Phone numbers: large tap targets with tel: links
- Email: mailto: links
- Property list: single column cards
- "Call" and "Email" as primary action buttons at top

---

## 5. Messages/Inbox Page

### Mobile Layout:
Follow the Gmail app pattern:

**Email List View:**
- Full width cards, no sidebar folders
- Folder selector: horizontal pill scroll at top (Inbox, Sent, Starred, etc.)
- Each email row:
```
┌──────────────────────────────────┐
│ JS  John Smith            2:30p │
│ Re: 125 Kent Ave showing        │
│ Thanks for the info, I'd li...  │
└──────────────────────────────────┘
```
- Sender initials circle + name (bold if unread) + time
- Subject line truncated
- Preview text truncated to 1 line, text-slate-400
- Swipe right: archive, swipe left: delete (stretch goal)
- Tap → opens thread view (full screen, replaces list)

**Thread View (Mobile):**
- Back arrow at top left
- Messages in vertical stack
- Reply box fixed at bottom with [Reply] button
- Compose: full screen modal

**Hide on mobile:**
- CRM sidebar panel
- Bulk action checkboxes (use long-press instead)
- Category filter bar (move to dropdown)

---

## 6. Pipeline Page

### Mobile Kanban:
Horizontal scroll columns don't work well on mobile. Two options:

**Option A: Vertical Stage List (recommended)**
```
┌──────────────────────────────────┐
│ ▼ New Lead (12)                  │
├──────────────────────────────────┤
│ John Smith — $2,400/mo           │
│ 2BR in Park Slope · 3 days      │
├──────────────────────────────────┤
│ Jane Doe — $1,800/mo             │
│ Studio in Williamsburg · 1 day   │
├──────────────────────────────────┤
│ ▼ Contacted (8)                  │
├──────────────────────────────────┤
│ ...                              │
└──────────────────────────────────┘
```
- Collapsible stage sections (tap header to expand/collapse)
- Deal cards: compact, single line name + value, second line details
- Tap card → deal detail
- Stage count in header badge
- Move deal: long-press → action sheet with stage options

**Option B: Horizontal scroll (keep existing but optimize)**
- Columns min-width: 280px
- Snap scrolling between columns
- Stage name sticky at top

Use Option A for mobile, keep existing Kanban for desktop.

---

## 7. Calendar Page

### Mobile:
- Default to **Agenda view** on mobile (not month grid)
- Month view: compact, smaller cells, only show dot indicators (no event pills)
- Tap day in month view → switches to day agenda
- Week view: hide on mobile (too cramped)
- Event cards: full width, tap to view/edit
- Create event: bottom sheet instead of modal
- Mini calendar sidebar: hidden on mobile

```
Mobile Calendar Layout:
┌──────────────────────────────────┐
│ ← February 2026 →    [+ Event]  │
│ [Month] [Agenda]                 │
├──────────────────────────────────┤
│ TODAY — Friday, Feb 21           │
│ ┌────────────────────────────┐   │
│ │ 🟣 10:00 AM                │   │
│ │ Showing — 125 Kent Ave     │   │
│ │ John Smith · 30 min        │   │
│ └────────────────────────────┘   │
│ ┌────────────────────────────┐   │
│ │ 🔵 2:00 PM                 │   │
│ │ Meeting — Lease Review     │   │
│ │ Jane Doe · 60 min          │   │
│ └────────────────────────────┘   │
│                                  │
│ TOMORROW — Saturday, Feb 22     │
│ ┌────────────────────────────┐   │
│ │ 🟢 11:00 AM                │   │
│ │ Open House — 456 Park Pl   │   │
│ │ 120 min                    │   │
│ └────────────────────────────┘   │
└──────────────────────────────────┘
```

---

## 8. Market Intel Page

### Search (Mobile):
- Tab bar (Property Search, Ownership, Name/Portfolio, Map): horizontal scroll pills
- Search input: full width
- Results: card list (not table)
- Each result card: address, borough, units, year built, owner
- Tap → building profile

### Building Profile (Mobile):
- Full screen panel (not side panel)
- Back button at top
- Phone numbers: LARGE tap targets with call buttons
- `<a href="tel:XXXXXXX">` for all phone numbers
- Collapsible sections (already built) work well on mobile
- Active listings links: 2-column grid of buttons
- AI Ownership Analysis: full width card
- Contact Intelligence: full width, phones prominent

### Map Search (Mobile):
- Map takes full screen
- Search bar overlays top of map
- Building profile: slides up from bottom as a bottom sheet (half screen)
- Pull up to see full profile, pull down to minimize
- Filter button: opens full screen filter modal

---

## 9. Settings Page

### Mobile:
- Sidebar nav → top dropdown selector or full-width list
- Each settings section: full width form
- Form fields: full width inputs
- Save button: sticky at bottom or full-width

---

## 10. Global Mobile Patterns

### Touch Targets:
- Minimum 44x44px for all tappable elements
- Buttons: `min-h-[44px] min-w-[44px]`
- List items: `min-h-[48px]` with full-width tap area

### Typography:
- Body text: min 16px on mobile (prevents iOS zoom on input focus)
- Input fields: `text-base` (16px) to prevent auto-zoom on iOS
- Headers: scale down but stay readable

### Spacing:
- Reduce padding on mobile: `p-3 md:p-6`
- Card margins: `mx-0 md:mx-4` (edge-to-edge cards on mobile)
- Section gaps: `gap-3 md:gap-6`

### Modals → Bottom Sheets:
- On mobile, modals should slide up from bottom instead of centering
- Full width, rounded top corners
- Swipe down to dismiss
- Max height: 90vh with scroll

### Forms:
- All inputs: `text-base` (16px) to prevent iOS zoom
- Labels above inputs (not beside)
- Full width inputs
- Submit buttons: full width on mobile

### Tables → Cards:
- Any table on desktop should become a card list on mobile
- Use `hidden md:table` for tables and `md:hidden` for card lists
- Or use responsive table with horizontal scroll

### Loading States:
- Skeleton loaders should match mobile layout
- Pull-to-refresh on list pages (stretch goal)

### Safe Areas:
- Account for iPhone notch and home indicator
- Bottom padding for content above tab bar: `pb-20 md:pb-0`
- Top padding if needed: `pt-safe`

---

## 11. Key CSS Utilities to Add

In `globals.css`, add:
```css
/* Safe area insets for iPhone */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom);
  }
  .pt-safe {
    padding-top: env(safe-area-inset-top);
  }
}

/* Hide scrollbar for horizontal scroll pills */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Bottom sheet animation */
@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.animate-slide-up {
  animation: slideUp 0.3s ease-out;
}
```

---

## 12. Build Order

1. **PWA manifest + meta tags** (5 min)
2. **Mobile nav: bottom tab bar + More sheet** (this is the foundation — do first)
3. **Main content padding** (pb-20 for bottom bar clearance)
4. **Contacts list** (card view on mobile, tap-to-call)
5. **Messages inbox** (Gmail-style mobile layout)
6. **Building profile** (full screen on mobile, prominent call buttons)
7. **Pipeline** (vertical collapsible stages)
8. **Calendar** (agenda-first on mobile)
9. **Market Intel search** (card results, full-screen map)
10. **Settings** (dropdown nav, full-width forms)
11. **Dashboard** (2x2 stat grid, stacked widgets)
12. **Contact detail/dossier** (full screen tabs)

## Priority: Focus on items 1-6 first. These are the pages you'll use most on your phone in the field.
