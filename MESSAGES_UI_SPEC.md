# VettdRE Messages — UI Polish + Template Management Spec

Read CLAUDE.md for project context. This enhances the existing Messages page with better design and full template management.

---

## 1. Template Management System

### Template Manager Page: `src/app/(dashboard)/messages/templates/page.tsx`
Add a "Templates" sub-nav or accessible from Messages page via a ⚙️ icon.

**Template List View:**
- Card grid layout (2 columns)
- Each card shows: template name, category badge, subject preview, body preview (first 2 lines), usage count, last used date
- Hover: shows Edit and Delete buttons
- Top: "Create Template" button + search bar

**Template Create/Edit Modal:**
- Name (required)
- Category dropdown: Follow Up, Showing, Application, Welcome, Nurture, Cold Outreach, Custom
- Subject line (with variable insertion buttons)
- Body (rich-ish textarea with basic formatting: bold, italic, line breaks)
- Variable insertion toolbar: clickable chips that insert at cursor position
  - `{{first_name}}` `{{last_name}}` `{{property_address}}` `{{price}}` `{{agent_name}}` `{{agent_phone}}` `{{date}}`
- Preview pane: shows template with sample data filled in (e.g. "Hi John," instead of "Hi {{first_name}},")
- Save / Cancel buttons

**Template Delete:**
- Confirmation dialog: "Delete template '[name]'? This cannot be undone."

### Server Actions: `src/app/(dashboard)/messages/template-actions.ts`
```typescript
"use server";

export async function getTemplates(orgId: string) {
  return prisma.emailTemplate.findMany({
    where: { orgId, isActive: true },
    orderBy: { usageCount: 'desc' }
  });
}

export async function createTemplate(data: {
  orgId: string;
  name: string;
  subject: string;
  bodyHtml: string;
  category: string;
  variables: string[];
}) { ... }

export async function updateTemplate(id: string, data: Partial<...>) { ... }

export async function deleteTemplate(id: string) {
  await prisma.emailTemplate.update({
    where: { id },
    data: { isActive: false }  // soft delete
  });
}

export async function incrementTemplateUsage(id: string) {
  await prisma.emailTemplate.update({
    where: { id },
    data: { usageCount: { increment: 1 } }
  });
}
```

### Default Templates (seed on first load if 0 templates exist):
```typescript
const defaultTemplates = [
  {
    name: "Quick Follow Up",
    category: "follow_up",
    subject: "Following up — {{property_address}}",
    bodyHtml: "Hi {{first_name}},<br><br>Just following up on your inquiry. Are you still interested? I'm happy to answer any questions or schedule a showing at your convenience.<br><br>Best,<br>{{agent_name}}<br>{{agent_phone}}"
  },
  {
    name: "Schedule Showing",
    category: "showing",
    subject: "Let's schedule a showing — {{property_address}}",
    bodyHtml: "Hi {{first_name}},<br><br>I'd love to show you this property. What times work best for you this week? I have availability:<br><br>• [Day/Time 1]<br>• [Day/Time 2]<br>• [Day/Time 3]<br><br>Looking forward to it!<br>{{agent_name}}"
  },
  {
    name: "Send Application",
    category: "application",
    subject: "Rental Application — {{property_address}}",
    bodyHtml: "Hi {{first_name}},<br><br>Great news! I'd like to move forward with your application for {{property_address}}.<br><br>Please complete the attached rental application and return it along with:<br>• Government-issued photo ID<br>• Last 2 pay stubs or proof of income<br>• Most recent bank statement<br><br>Let me know if you have any questions.<br><br>Best,<br>{{agent_name}}"
  },
  {
    name: "Unit Not Available",
    category: "follow_up",
    subject: "Re: {{property_address}}",
    bodyHtml: "Hi {{first_name}},<br><br>Thank you for your interest! Unfortunately, this unit is no longer available.<br><br>However, I have similar listings in the area that might be a great fit. Would you like me to send some options?<br><br>Best,<br>{{agent_name}}"
  },
  {
    name: "New Listing Alert",
    category: "nurture",
    subject: "New listing you might love — {{property_address}}",
    bodyHtml: "Hi {{first_name}},<br><br>I just listed a property I think you'll love:<br><br>📍 {{property_address}}<br>💰 {{price}}<br><br>Want to see it? I can arrange a private showing at your convenience.<br><br>{{agent_name}}<br>{{agent_phone}}"
  },
  {
    name: "Thank You After Showing",
    category: "showing",
    subject: "Thanks for visiting {{property_address}}",
    bodyHtml: "Hi {{first_name}},<br><br>It was great meeting you today! I hope you enjoyed seeing {{property_address}}.<br><br>A few things to keep in mind:<br>• [Key selling point 1]<br>• [Key selling point 2]<br><br>If you'd like to move forward or have any questions, don't hesitate to reach out.<br><br>Best,<br>{{agent_name}}"
  },
  {
    name: "Cold Outreach — Owner",
    category: "cold_outreach",
    subject: "Interested in your property at {{property_address}}",
    bodyHtml: "Hi {{first_name}},<br><br>My name is {{agent_name}} and I work with property owners in your area. I noticed your building at {{property_address}} and wanted to reach out.<br><br>I have qualified tenants actively looking in your neighborhood. Would you be open to a brief conversation about your property?<br><br>Best,<br>{{agent_name}}<br>{{agent_phone}}"
  }
];
```

---

## 2. Compose Area Redesign

### Current Problem:
The compose area takes up the entire right panel even when just browsing threads. Templates dropdown is in a weird spot. Needs to feel more like a professional email client.

### New Compose Behavior:

**When NO thread is selected:**
- Right panel shows an empty state: "Select a conversation to view" with a mail icon
- Compose button opens a modal overlay (not inline)

**When a thread IS selected:**
- Right panel shows thread detail (messages + reply box at bottom)
- Reply box is compact: single-line textarea that expands on focus

**Compose Modal** (triggered by Compose button or keyboard shortcut):
```
┌─────────────────────────────────────────────────┐
│ New Message                                  ✕  │
├─────────────────────────────────────────────────┤
│ To:  [autocomplete input                     ]  │
│ Subject: [                                   ]  │
├─────────────────────────────────────────────────┤
│ Templates: [Quick Follow Up ▾] [Schedule ▾]     │
│            [Application ▾] [Cold Outreach ▾]    │
│            [+ Manage Templates]                 │
├─────────────────────────────────────────────────┤
│                                                 │
│ [Rich text editor area                       ]  │
│ [                                            ]  │
│ [                                            ]  │
│ [                                            ]  │
│                                                 │
├─────────────────────────────────────────────────┤
│ B I U 🔗  │  {{first_name}} {{address}} + │     │
├─────────────────────────────────────────────────┤
│                          [Discard]  [Send ➤]    │
└─────────────────────────────────────────────────┘
```

**Template Selection in Compose:**
- Templates shown as clickable pills/chips above the editor (not a dropdown)
- Grouped by category with small labels
- Click a template → fills subject + body (with confirmation if body already has content: "Replace current message with template?")
- "Manage Templates" link → opens template manager

### Reply Box (in thread detail):
```
┌─────────────────────────────────────────────────┐
│ Quick replies: [Follow Up] [Schedule] [Thanks]  │
├─────────────────────────────────────────────────┤
│ [Write a reply...                            ]  │
│ [                                            ]  │
│                                [Send ➤]         │
└─────────────────────────────────────────────────┘
```
- Quick reply chips: top 3 most-used templates as one-click buttons
- Click → fills reply with template text → can edit before sending
- Reply textarea: starts as single line, expands to 4 lines on focus
- Send button: blue, right-aligned

---

## 3. UI Design Improvements

### Color Palette (consistent across all Messages views):
```
Background:     #F8FAFC (slate-50)
Card/Panel:     #FFFFFF
Borders:        #E2E8F0 (slate-200)
Primary:        #2563EB (blue-600) — buttons, links, selected states
Unread accent:  #1E40AF (blue-800) — bold text for unread
Lead badge:     #EF4444 (red-500)
Personal badge: #6366F1 (indigo-500)
Newsletter:     #8B5CF6 (purple-500)
Success/Sent:   #10B981 (emerald-500)
Warning:        #F59E0B (amber-500)
Muted text:     #94A3B8 (slate-400)
```

### Thread List Improvements:
- **Avatar/Initials circle** for each sender (colored by first letter, like Google)
  - A-E: blue, F-J: emerald, K-O: amber, P-T: purple, U-Z: rose
- **Unread threads**: left blue border (3px), bold sender name + subject, slightly brighter bg
- **Read threads**: normal weight, standard bg
- **Selected thread**: `bg-blue-50` with blue left border
- **Hover**: subtle `bg-slate-50` transition
- **Source badge**: small pill below snippet
  - StreetEasy: emerald bg with white text
  - Zillow: blue bg
  - Realtor: amber bg
  - Direct: slate bg
- **Time stamps**: relative ("2m", "1h", "Yesterday", "Feb 18")
- **Thread count**: small circle badge `(3)` if multiple messages

### Thread Detail Improvements:
- **Message bubbles** (not just blocks of text):
  - Inbound: left-aligned, `bg-slate-100` rounded-lg, max-width 85%
  - Outbound: right-aligned, `bg-blue-50` rounded-lg, max-width 85%
  - Each bubble: sender name (small, muted), timestamp, body
  - Smooth scroll to latest message on thread open
- **Thread header**: 
  - Subject line (large, bold)
  - Participant names with SenderBadge dots
  - Thread actions: Pin, Snooze, Label, Archive, Delete (icon buttons)
- **AI Lead Banner** (when applicable):
  - Full-width colored banner below thread header
  - Hot lead (red-50 bg): "🔥 Hot Lead — rental inquiry · $3,500 · Williamsburg · StreetEasy"
  - Active (amber-50 bg): "⚡ Active Lead — purchase inquiry · Brooklyn"
  - General (slate-50 bg): minimal info

### CRM Sidebar Improvements:
- **Collapsible sections** with smooth animation
- **Contact card**: photo/initials circle, name, title @ company, lead score badge
- **Quick actions row**: 📞 Call  📧 Email  📋 Note  ✅ Task (icon buttons)
- **Deal cards**: colored by pipeline stage, show value
- **Empty states**: helpful text like "No deals yet — [Create Deal]"

### Empty States:
- **No thread selected**: Large mail icon + "Select a conversation" text, centered in right panel
- **No emails synced**: "Connect Gmail to start syncing" with arrow to Settings
- **No search results**: "No emails match your search" with clear filters button
- **No templates**: "Create your first template to speed up replies" with Create button

### Sidebar Badge:
- Messages badge: solid red circle, white text, slight shadow
- If 99+: show "99+"
- Pulse animation on new unread (subtle, 1 cycle)

### Loading States:
- Thread list: skeleton loader (gray pulsing rectangles)
- Thread detail: skeleton for message bubbles
- Sync button: spinner + "Syncing..." text while active

### Micro-interactions:
- Checkbox: smooth check animation
- Bulk action bar: slides down from top with spring animation
- Thread selection: instant highlight, no delay
- Send button: brief green flash on success
- Delete: thread slides out to left before removing
- Snooze: thread fades with clock icon overlay before removing

---

## 4. Thread Detail Three-Panel Layout

### Responsive Breakpoints:
- **Desktop (>1280px)**: Three columns — thread list (30%) | thread detail (45%) | CRM sidebar (25%)
- **Tablet (768-1280px)**: Two columns — thread list (35%) | thread detail (65%), CRM sidebar as slide-out drawer
- **Mobile (<768px)**: Single column — thread list OR thread detail, with back button to navigate

### Panel Resizing:
- Thread list and CRM sidebar have fixed widths on desktop
- Thread detail fills remaining space
- CRM sidebar can be collapsed/expanded with a toggle button

---

## 5. Keyboard Shortcuts (Superhuman-inspired)

Add these keyboard shortcuts (show hint toast on first use):
- `c` — Compose new email
- `r` — Reply to selected thread
- `e` — Archive selected thread
- `#` — Delete selected thread
- `s` — Star/unstar selected thread
- `p` — Pin/unpin selected thread
- `j` / `k` — Navigate down/up in thread list
- `Enter` — Open selected thread
- `Escape` — Close compose modal / deselect thread
- `Shift+U` — Mark unread
- `/` — Focus search bar
- `?` — Show keyboard shortcuts help modal

### Implementation:
- Use a `useEffect` with `keydown` listener on the Messages page
- Only active when not typing in an input/textarea
- Small `?` icon in bottom-right corner opens shortcuts reference

---

## Build Order:
1. Backend: Template CRUD server actions + seed default templates
2. UI: Template management page (list, create, edit, delete)
3. UI: Redesign compose as modal overlay
4. UI: Redesign reply box with quick reply template chips
5. UI: Thread list visual polish (avatars, badges, unread styling)
6. UI: Thread detail message bubbles
7. UI: Empty states for all views
8. UI: Loading skeletons
9. UI: CRM sidebar polish
10. UI: Three-panel responsive layout
11. UI: Keyboard shortcuts
12. Integration: Template usage in compose + reply, variable replacement
13. Polish: Animations, micro-interactions, transitions

## Important Reminders:
- All exported functions in "use server" files must be async (Next.js 16)
- Serialize dates with JSON.parse(JSON.stringify()) when passing Server→Client
- Use Tailwind for ALL styling — no separate CSS files
- Keep existing functionality working — enhance, don't break
- Test compose + send flow after redesign
- Test template variable replacement: {{first_name}} etc.
- Seed default templates only if org has 0 templates
