# VettdRE Calendar — Full Spec

Read CLAUDE.md for project context. Build a comprehensive calendar system with Google Calendar two-way sync, showing scheduler, and multiple views.

---

## 0. Google Cloud Setup (Already Done)

Google Calendar API should already be enabled in the same Google Cloud project used for Gmail. The same OAuth credentials work — just need to add the calendar scope.

### Update OAuth Scopes:
In the Gmail OAuth flow (`src/app/api/auth/gmail/route.ts`), add the Google Calendar scope alongside the existing Gmail scopes:
```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/calendar.events
```

The user may need to re-authorize (disconnect + reconnect Gmail in Settings) to grant the new calendar permission.

---

## 1. Database Schema

```prisma
model CalendarEvent {
  id              String    @id @default(uuid())
  orgId           String    @map("org_id")
  userId          String    @map("user_id")
  googleEventId   String?   @map("google_event_id")  // null if VettdRE-only event
  googleCalendarId String?  @map("google_calendar_id")
  
  // Event basics
  title           String
  description     String?   @db.Text
  location        String?
  
  // Timing
  startAt         DateTime  @map("start_at")
  endAt           DateTime  @map("end_at")
  allDay          Boolean   @default(false) @map("all_day")
  timezone        String    @default("America/New_York")
  
  // Recurrence
  recurring       Boolean   @default(false)
  recurrenceRule  String?   @map("recurrence_rule")  // RRULE format
  
  // CRM links
  eventType       String    @default("general")  // "showing", "meeting", "open_house", "inspection", "closing", "task_deadline", "deal_milestone", "general"
  contactId       String?   @map("contact_id")
  propertyId      String?   @map("property_id")
  dealId          String?   @map("deal_id")
  showingId       String?   @map("showing_id")
  
  // Showing-specific
  propertyAddress String?   @map("property_address")
  unitNumber      String?   @map("unit_number")
  
  // Status
  status          String    @default("confirmed")  // "confirmed", "tentative", "cancelled"
  color           String    @default("#3B82F6")     // for display
  
  // Attendees
  attendees       Json?     // [{ email, name, status: "accepted"|"declined"|"tentative" }]
  
  // Sync
  syncedAt        DateTime? @map("synced_at")
  lastModified    DateTime? @map("last_modified")
  source          String    @default("vettdre")  // "vettdre", "google", "scheduler"
  
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  
  organization    Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user            User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  contact         Contact?   @relation(fields: [contactId], references: [id], onDelete: SetNull)
  deal            Deal?      @relation(fields: [dealId], references: [id], onDelete: SetNull)
  
  @@unique([orgId, googleEventId])
  @@index([orgId, startAt])
  @@index([userId, startAt])
  @@index([contactId])
  @@index([propertyAddress])
  @@map("calendar_events")
}

model ShowingSlot {
  id              String    @id @default(uuid())
  orgId           String    @map("org_id")
  userId          String    @map("user_id")
  propertyAddress String    @map("property_address")
  unitNumber      String?   @map("unit_number")
  
  // Slot timing
  startAt         DateTime  @map("start_at")
  endAt           DateTime  @map("end_at")
  duration        Int       @default(30)  // minutes
  
  // Booking status
  isBooked        Boolean   @default(false) @map("is_booked")
  bookedByName    String?   @map("booked_by_name")
  bookedByEmail   String?   @map("booked_by_email")
  bookedByPhone   String?   @map("booked_by_phone")
  bookedAt        DateTime? @map("booked_at")
  contactId       String?   @map("contact_id")
  calendarEventId String?   @map("calendar_event_id")
  
  // Notes
  notes           String?
  
  createdAt       DateTime  @default(now()) @map("created_at")
  
  organization    Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user            User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  contact         Contact?   @relation(fields: [contactId], references: [id], onDelete: SetNull)
  calendarEvent   CalendarEvent? @relation(fields: [calendarEventId], references: [id], onDelete: SetNull)
  
  @@index([orgId, propertyAddress, startAt])
  @@map("showing_slots")
}
```

Add relations to existing models:
- `Organization`: add `calendarEvents CalendarEvent[]`, `showingSlots ShowingSlot[]`
- `User`: add `calendarEvents CalendarEvent[]`, `showingSlots ShowingSlot[]`
- `Contact`: add `calendarEvents CalendarEvent[]`, `showingSlots ShowingSlot[]`
- `Deal`: add `calendarEvents CalendarEvent[]`
- `CalendarEvent`: add `showingSlots ShowingSlot[]`

---

## 2. Google Calendar Sync Engine

### Create `src/lib/google-calendar.ts`:

```typescript
const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

// Get access token (reuse Gmail token refresh logic)
async function getCalendarToken(userId: string): Promise<string> {
  // Same GmailAccount has the token — calendar uses same OAuth
  const account = await prisma.gmailAccount.findFirst({ where: { userId, isActive: true } });
  if (!account) throw new Error("No Google account connected");
  
  // Refresh if expired (reuse existing refresh logic from gmail.ts)
  if (account.tokenExpiry < new Date()) {
    // refresh token...
  }
  
  return account.accessToken;
}

// Fetch events from Google Calendar
export async function syncGoogleCalendar(userId: string, orgId: string) {
  const token = await getCalendarToken(userId);
  
  // Get events from primary calendar for the next 90 days and past 30 days
  const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  
  const res = await fetch(
    `${GCAL_BASE}/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&maxResults=500&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  
  if (!res.ok) {
    console.error("Calendar sync failed:", res.status);
    return;
  }
  
  const data = await res.json();
  const events = data.items || [];
  
  console.log(`[CALENDAR SYNC] Fetched ${events.length} events from Google Calendar`);
  
  for (const event of events) {
    await prisma.calendarEvent.upsert({
      where: { orgId_googleEventId: { orgId, googleEventId: event.id } },
      create: {
        orgId,
        userId,
        googleEventId: event.id,
        googleCalendarId: "primary",
        title: event.summary || "Untitled",
        description: event.description || null,
        location: event.location || null,
        startAt: new Date(event.start.dateTime || event.start.date),
        endAt: new Date(event.end.dateTime || event.end.date),
        allDay: !!event.start.date,
        status: event.status === "cancelled" ? "cancelled" : "confirmed",
        attendees: event.attendees ? JSON.parse(JSON.stringify(event.attendees.map((a: any) => ({
          email: a.email,
          name: a.displayName,
          status: a.responseStatus
        })))) : null,
        source: "google",
        syncedAt: new Date(),
        lastModified: event.updated ? new Date(event.updated) : new Date(),
      },
      update: {
        title: event.summary || "Untitled",
        description: event.description || null,
        location: event.location || null,
        startAt: new Date(event.start.dateTime || event.start.date),
        endAt: new Date(event.end.dateTime || event.end.date),
        allDay: !!event.start.date,
        status: event.status === "cancelled" ? "cancelled" : "confirmed",
        attendees: event.attendees ? JSON.parse(JSON.stringify(event.attendees.map((a: any) => ({
          email: a.email,
          name: a.displayName,
          status: a.responseStatus
        })))) : null,
        syncedAt: new Date(),
        lastModified: event.updated ? new Date(event.updated) : new Date(),
      }
    });
  }
  
  console.log(`[CALENDAR SYNC] Synced ${events.length} events`);
}

// Create event in Google Calendar + local DB
export async function createCalendarEvent(params: {
  userId: string;
  orgId: string;
  title: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  eventType?: string;
  contactId?: string;
  propertyAddress?: string;
  dealId?: string;
  attendees?: { email: string; name?: string }[];
  color?: string;
  syncToGoogle?: boolean;  // default true
}) {
  const token = await getCalendarToken(params.userId);
  
  let googleEventId = null;
  
  if (params.syncToGoogle !== false) {
    // Create in Google Calendar
    const googleEvent: any = {
      summary: params.title,
      description: params.description || "",
      location: params.location || params.propertyAddress || "",
      start: params.allDay 
        ? { date: params.startAt.toISOString().split("T")[0] }
        : { dateTime: params.startAt.toISOString(), timeZone: "America/New_York" },
      end: params.allDay
        ? { date: params.endAt.toISOString().split("T")[0] }
        : { dateTime: params.endAt.toISOString(), timeZone: "America/New_York" },
    };
    
    if (params.attendees?.length) {
      googleEvent.attendees = params.attendees.map(a => ({ email: a.email, displayName: a.name }));
    }
    
    const res = await fetch(`${GCAL_BASE}/calendars/primary/events`, {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(googleEvent),
    });
    
    if (res.ok) {
      const created = await res.json();
      googleEventId = created.id;
      console.log("[CALENDAR] Created Google event:", created.id);
    } else {
      console.error("[CALENDAR] Failed to create Google event:", res.status);
    }
  }
  
  // Create in local DB
  const event = await prisma.calendarEvent.create({
    data: {
      orgId: params.orgId,
      userId: params.userId,
      googleEventId,
      googleCalendarId: "primary",
      title: params.title,
      description: params.description || null,
      location: params.location || null,
      startAt: params.startAt,
      endAt: params.endAt,
      allDay: params.allDay || false,
      eventType: params.eventType || "general",
      contactId: params.contactId || null,
      propertyAddress: params.propertyAddress || null,
      dealId: params.dealId || null,
      attendees: params.attendees ? JSON.parse(JSON.stringify(params.attendees)) : null,
      color: params.color || getEventTypeColor(params.eventType || "general"),
      source: "vettdre",
      syncedAt: new Date(),
    }
  });
  
  return event;
}

// Update event (both local + Google)
export async function updateCalendarEvent(eventId: string, updates: Partial<{
  title: string;
  description: string;
  location: string;
  startAt: Date;
  endAt: Date;
  status: string;
  color: string;
}>) {
  const event = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("Event not found");
  
  // Update Google if synced
  if (event.googleEventId) {
    const token = await getCalendarToken(event.userId);
    const googleUpdate: any = {};
    if (updates.title) googleUpdate.summary = updates.title;
    if (updates.description) googleUpdate.description = updates.description;
    if (updates.location) googleUpdate.location = updates.location;
    if (updates.startAt) googleUpdate.start = { dateTime: updates.startAt.toISOString(), timeZone: "America/New_York" };
    if (updates.endAt) googleUpdate.end = { dateTime: updates.endAt.toISOString(), timeZone: "America/New_York" };
    if (updates.status === "cancelled") googleUpdate.status = "cancelled";
    
    await fetch(`${GCAL_BASE}/calendars/primary/events/${event.googleEventId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(googleUpdate),
    });
  }
  
  // Update local
  return prisma.calendarEvent.update({ where: { id: eventId }, data: updates });
}

// Delete event
export async function deleteCalendarEvent(eventId: string) {
  const event = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!event) return;
  
  if (event.googleEventId) {
    const token = await getCalendarToken(event.userId);
    await fetch(`${GCAL_BASE}/calendars/primary/events/${event.googleEventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  
  await prisma.calendarEvent.delete({ where: { id: eventId } });
}

// Event type colors
function getEventTypeColor(type: string): string {
  const colors: Record<string, string> = {
    showing: "#8B5CF6",      // purple
    meeting: "#3B82F6",      // blue
    open_house: "#10B981",   // emerald
    inspection: "#F59E0B",   // amber
    closing: "#EF4444",      // red
    task_deadline: "#6366F1", // indigo
    deal_milestone: "#EC4899", // pink
    general: "#6B7280",      // gray
  };
  return colors[type] || colors.general;
}
```

---

## 3. Calendar Page UI

### Page: `src/app/(dashboard)/calendar/page.tsx`

### Layout:
```
┌────────────────────────────────────────────────────────────────┐
│ 📅 Calendar                    [+ New Event] [Sync] [⚙️]      │
│ [◀] February 2026 [▶]    [Today]    [Day] [Week] [Month] [Agenda] │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Calendar/Agenda content area (100% height, scrollable)        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### View Toggle:
Four view modes — Day, Week, Month, Agenda. Use state to toggle.

### Month View:
Standard calendar grid (7 columns x 5-6 rows):
- Header row: Sun Mon Tue Wed Thu Fri Sat
- Each day cell shows:
  - Date number (bold if today, muted if other month)
  - Up to 3 event pills (colored by eventType)
  - "+X more" if more than 3 events
- Click day → switches to Day view for that date
- Click event → opens event detail modal

### Week View:
7-column grid with hourly rows (6 AM — 10 PM):
- Left column: hour labels
- Events render as colored blocks spanning their duration
- Current time: red horizontal line
- Click empty slot → creates event at that time (drag to set duration)

### Day View:
Single column with hourly rows:
- Wider event blocks with more detail (title, time, contact, location)
- Current time indicator
- Side panel: list of all events for the day with full details

### Agenda View:
Scrollable list grouped by date:
```
TODAY — Wednesday, February 19
  🟣 10:00 AM  Showing — 125 Kent Ave #4B
     with John Smith · 30 min
  🔵 2:00 PM   Meeting — Lease review
     with Jane Doe · 1 hr
  
TOMORROW — Thursday, February 20
  🟣 11:00 AM  Showing — 456 Atlantic Ave
     with Mike R. · 30 min
  🔴 3:00 PM   Closing — 789 Flatbush Ave
     Deal: $450,000

FRIDAY, FEBRUARY 21
  🟢 12:00 PM  Open House — 100 Park Place
     2 hours
```

Each event row shows:
- Color dot (by event type)
- Time
- Title
- Contact name (linked to dossier)
- Property address (if applicable)
- Duration

### Event Type Legend:
Small legend below the view toggle:
🟣 Showing  🔵 Meeting  🟢 Open House  🟡 Inspection  🔴 Closing  🟤 Task  ⚫ General

---

## 4. Create/Edit Event Modal

### Triggered by:
- "+ New Event" button
- Clicking empty time slot on calendar
- Drag-and-drop on Week/Day view
- "Schedule Showing" from building profile
- "Create Event" from contact dossier

### Modal Layout:
```
┌─────────────────────────────────────────────────┐
│ New Event                                    ✕  │
├─────────────────────────────────────────────────┤
│ Title: [Showing — 125 Kent Ave              ]   │
│                                                 │
│ Type: [🟣 Showing ▾]                            │
│                                                 │
│ Date:  [Feb 19, 2026    ] — [Feb 19, 2026    ]  │
│ Time:  [10:00 AM        ] — [10:30 AM        ]  │
│ ☐ All day                                       │
│                                                 │
│ Location: [125 Kent Ave, Brooklyn, NY        ]  │
│ Unit: [4B                                    ]  │
│                                                 │
│ Contact: [🔍 Search contacts...              ]  │
│          John Smith · 555-123-4567              │
│                                                 │
│ Deal: [🔍 Link to deal (optional)...         ]  │
│                                                 │
│ Attendees:                                      │
│  [john@email.com                        ] [+]   │
│  john@email.com ✕                               │
│                                                 │
│ Description:                                    │
│ [Notes about this event...                   ]  │
│                                                 │
│ Color: [🟣 ▾]                                   │
│                                                 │
│ ☑ Sync to Google Calendar                       │
│ ☐ Send invite to attendees                      │
│                                                 │
│                     [Cancel]  [Save Event ➤]    │
└─────────────────────────────────────────────────┘
```

### Smart Defaults:
- If opened from building profile: pre-fill type=showing, location=building address, title="Showing — [address]"
- If opened from contact dossier: pre-fill contact
- If opened from clicking a time slot: pre-fill date/time
- Duration defaults: showing=30min, meeting=60min, open_house=120min, inspection=60min, closing=120min

### Type-Specific Fields:
- **Showing**: property address, unit number, contact (required)
- **Open House**: property address, duration (default 2hr)
- **Closing**: property address, deal link, all parties
- **Meeting**: location, attendees
- **Task Deadline**: linked task, no attendees needed
- **Deal Milestone**: linked deal, milestone name

---

## 5. Drag-and-Drop Event Creation

### Week/Day View:
- Click and drag on an empty time slot to create an event
- While dragging: show a blue highlighted block with start/end times
- On release: open the Create Event modal with times pre-filled
- Minimum drag: 15 minutes

### Month View:
- Click a date to switch to Day view (simpler than creating from month)
- Or: click + hold on date → opens Create Event modal for that date

### Move Existing Events:
- In Week/Day view: drag existing event blocks to new time slots
- Updates both local DB and Google Calendar
- Show confirmation toast: "Event moved to 2:00 PM"

### Implementation:
Use mouse event handlers (onMouseDown, onMouseMove, onMouseUp) on the calendar grid.
Track drag state: `{ isDragging, startSlot, endSlot, eventId? }`.
Calculate time from grid position (each row = 30 minutes or 15 minutes).

---

## 6. Showing Scheduler (Client-Facing)

### Agent Creates Showing Slots:
From the calendar or a dedicated "Showings" panel:

**Bulk Slot Creator:**
```
Property: [125 Kent Ave, Brooklyn         ]
Unit: [4B                                 ]

Create slots:
Date: [Feb 20, 2026]
From: [10:00 AM] To: [2:00 PM]
Duration: [30 min ▾]
Break between: [0 min ▾]

Preview:
  ☑ 10:00 AM — 10:30 AM
  ☑ 10:30 AM — 11:00 AM
  ☑ 11:00 AM — 11:30 AM
  ☑ 11:30 AM — 12:00 PM
  ☑ 12:00 PM — 12:30 PM
  ☑ 12:30 PM — 1:00 PM
  ☑ 1:00 PM — 1:30 PM
  ☑ 1:30 PM — 2:00 PM

[Create 8 Slots]
```

### Shareable Booking Link:
Generate a public URL: `https://app.vettdre.com/book/[agent-slug]/[property-slug]`

For now (localhost), create the booking page at:
`src/app/book/[slug]/page.tsx` — a public page (no auth required)

**Client Booking Page:**
```
┌─────────────────────────────────────────────────┐
│ 🏠 Showing — 125 Kent Ave #4B                   │
│ Brooklyn, NY                                     │
│                                                  │
│ Nathan Tondow · Cammeby's International          │
│                                                  │
│ Select a time:                                   │
│                                                  │
│ Thursday, February 20                            │
│ [10:00 AM] [10:30 AM] [11:00 AM] [11:30 AM]    │
│ [12:00 PM] [12:30 PM] [1:00 PM]  [1:30 PM]     │
│                                                  │
│ Selected: 11:00 AM — 11:30 AM                    │
│                                                  │
│ Your Info:                                       │
│ Name:  [                  ]                      │
│ Email: [                  ]                      │
│ Phone: [                  ]                      │
│ Notes: [                  ] (optional)           │
│                                                  │
│              [Confirm Booking ➤]                 │
└─────────────────────────────────────────────────┘
```

### On Booking:
1. Mark ShowingSlot as booked with client info
2. Create CalendarEvent linked to the slot
3. Sync event to Google Calendar with attendee (client email)
4. Auto-create Contact in CRM (as lead) if doesn't exist
5. Send confirmation (later — for now just create the event)
6. Show confirmation page: "Showing confirmed! Feb 20 at 11:00 AM"

### Showing Calendar View:
Filter calendar to show only showings:
- Toggle: "Show only showings" checkbox
- Property filter dropdown: shows all properties with upcoming slots
- Color coding: booked=purple filled, available=purple outline, past=gray

---

## 7. Task Deadlines on Calendar

### Integration:
- Query existing Task model where dueDate is not null
- Display tasks on the calendar as all-day events or timed events
- Color: indigo (🟤)
- Show task title + linked contact name
- Click → opens task detail (mark complete, edit, etc.)

### Create Task from Calendar:
- Type selector includes "Task Deadline"
- Creates a Task record AND a CalendarEvent
- Task appears in both Calendar and Tasks page

---

## 8. Deal Milestones on Calendar

### Auto-Generate Milestones:
When a deal moves to certain stages, auto-create calendar events:
- **Application Submitted** → "Application Review — [property]" (due in 3 days)
- **Approved** → "Lease Signing — [property]" (placeholder, agent sets date)
- **Lease Signed** → "Move-in — [property]" (from deal's move-in date)

### Manual Milestones:
From deal detail page, "Add Milestone" button:
- Name, date, linked to deal
- Shows on calendar with pink color

---

## 9. CRM Integration Everywhere

### From Contact Dossier:
- "Upcoming Events" section: shows calendar events linked to this contact
- "Schedule Showing" button → opens create event modal with contact pre-filled

### From Building Profile:
- "Schedule Showing" button → opens create event modal with property pre-filled
- "Upcoming Showings" section: shows all ShowingSlots for this building

### From Deal Page:
- "Milestones" section: shows calendar events linked to this deal
- "Add Milestone" button

### From Pipeline:
- Deal cards show next upcoming event date if any

---

## 10. Calendar Sidebar (Mini Calendar + Upcoming)

On the Calendar page, optional right sidebar:

```
┌──────────────────┐
│   February 2026  │
│ Su Mo Tu We Th Fr Sa │
│                 1  2 │
│  3  4  5  6  7  8  9 │
│ 10 11 12 13 14 15 16 │
│ 17 18 [19] 20 21 22 23 │
│ 24 25 26 27 28        │
├──────────────────┤
│ UPCOMING          │
│                   │
│ Today             │
│ 🟣 10:00 Showing  │
│ 🔵 2:00 Meeting   │
│                   │
│ Tomorrow          │
│ 🟣 11:00 Showing  │
│ 🔴 3:00 Closing   │
│                   │
│ This Week         │
│ 🟢 Fri Open House │
└──────────────────┘
```

### Mini calendar:
- Click a date → main view jumps to that date
- Days with events have a small dot indicator
- Today is highlighted

---

## 11. Calendar Library

Use one of these for the calendar grid rendering (don't build from scratch):

**Option A (Recommended):** Build a custom calendar grid with Tailwind
- Month: CSS Grid 7 columns
- Week/Day: CSS Grid with time rows (each row = 30min slot)
- This gives full control over styling and CRM integration
- More work but matches VettdRE design perfectly

**Option B:** Use `@fullcalendar/react` library
- `npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction`
- Handles month/week/day views, drag-and-drop, event rendering
- Less customizable but faster to implement
- May need CSS overrides to match VettdRE design

**Go with Option A (custom Tailwind grid)** for the best CRM-integrated experience. FullCalendar is great but hard to deeply customize for CRM context (showing contact names, deal links, etc. on events).

---

## Build Order:
1. DB: Create CalendarEvent and ShowingSlot models, add relations, migrate
2. Backend: Google Calendar sync engine (fetch + create + update + delete)
3. Backend: Calendar CRUD server actions
4. Backend: Showing slot CRUD + booking actions
5. UI: Calendar page layout with view toggle (Month/Week/Day/Agenda)
6. UI: Month view grid
7. UI: Week view grid with time slots
8. UI: Day view
9. UI: Agenda view (list)
10. UI: Create/Edit event modal
11. UI: Drag-and-drop on Week/Day views
12. UI: Showing slot creator (bulk)
13. UI: Public booking page
14. UI: Calendar sidebar (mini calendar + upcoming)
15. Integration: Tasks on calendar
16. Integration: Deal milestones on calendar
17. Integration: Contact dossier "Upcoming Events" section
18. Integration: Building profile "Schedule Showing" button
19. Add Calendar scope to OAuth flow, test sync

## Important Reminders:
- All exported functions in "use server" files must be async (Next.js 16)
- Serialize dates with JSON.parse(JSON.stringify()) when passing Server→Client
- Google Calendar API uses RFC 3339 timestamps (ISO 8601)
- All times stored in UTC, display in user's timezone (default America/New_York)
- The booking page must be public (no auth) — it's client-facing
- Keep Google Calendar as source of truth — always sync both directions
- Event colors should match the eventType legend consistently
- Calendar page should auto-sync on load (like Messages auto-fetch)
