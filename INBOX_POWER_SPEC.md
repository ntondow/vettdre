# VettdRE Power Inbox — HubSpot-Style Enhancement Spec

Read CLAUDE.md for project context. This builds on the existing Messages page. Implement all sections in order.

---

## 1. Bulk Actions Toolbar

### UI: Floating action bar appears when threads are selected
When 1+ threads are checked, show a sticky toolbar at top of thread list:

```
┌──────────────────────────────────────────────────┐
│ ☑ 3 selected  │ 📖 Read │ 📕 Unread │ ⭐ Star │ 📌 Pin │ 🏷️ Label │ ⏰ Snooze │ 🗑️ Delete │ ✕ │
└──────────────────────────────────────────────────┘
```

### Thread List Checkboxes:
- Add checkbox to left of each thread row
- "Select all" checkbox in thread list header (selects all visible threads)
- Shift+click for range selection
- Selected threads get `bg-blue-50` highlight

### Server Actions (`src/app/(dashboard)/messages/bulk-actions.ts`):
```typescript
"use server";

export async function bulkMarkRead(messageIds: string[]) {
  // 1. Update EmailMessage.isRead = true in DB
  // 2. Batch update Gmail API: POST /gmail/v1/users/me/messages/batchModify
  //    Body: { ids: [...], removeLabelIds: ["UNREAD"] }
}

export async function bulkMarkUnread(messageIds: string[]) {
  // Same but addLabelIds: ["UNREAD"], isRead = false
}

export async function bulkStar(threadIds: string[]) {
  // Update EmailMessage.isStarred = true for all messages in threads
  // Gmail API: addLabelIds: ["STARRED"]
}

export async function bulkUnstar(threadIds: string[]) {
  // Reverse of above
}

export async function bulkArchive(threadIds: string[]) {
  // Add "archived" label, remove from inbox view
  // Gmail API: removeLabelIds: ["INBOX"]
  // DB: set isArchived = true on EmailMessage
}

export async function bulkDelete(threadIds: string[]) {
  // Gmail API: POST /gmail/v1/users/me/messages/batchModify
  //    Body: { ids: [...], addLabelIds: ["TRASH"] }
  // DB: soft delete (set isDeleted = true) or hard delete
}

export async function bulkApplyLabel(threadIds: string[], labelId: string) {
  // Apply custom label to threads (see Labels section)
}

export async function bulkSnooze(threadIds: string[], snoozeUntil: Date) {
  // See Snooze section
}
```

### DB Schema Addition:
Add to EmailMessage model:
```prisma
isArchived  Boolean  @default(false) @map("is_archived")
isDeleted   Boolean  @default(false) @map("is_deleted")
isPinned    Boolean  @default(false) @map("is_pinned")
snoozedUntil DateTime? @map("snoozed_until")
category    String?  // "lead", "newsletter", "personal", "spam", "transactional"
```

---

## 2. Snooze Emails

### How it works:
- Snoozing a thread hides it from inbox until the snooze time
- When snooze expires, thread reappears at top of inbox as "unread"
- Snoozed threads visible in a "Snoozed" filter view

### Snooze Picker UI:
When clicking Snooze (from bulk bar or individual thread), show dropdown:
- Later today (3 hours from now)
- Tomorrow morning (9:00 AM)
- Tomorrow afternoon (2:00 PM)  
- This weekend (Saturday 9:00 AM)
- Next week (Monday 9:00 AM)
- Custom date/time picker

### Server Action:
```typescript
export async function snoozeThread(threadId: string, snoozeUntil: Date) {
  await prisma.emailMessage.updateMany({
    where: { threadId },
    data: { snoozedUntil: snoozeUntil }
  });
}

export async function unsnoozeThread(threadId: string) {
  await prisma.emailMessage.updateMany({
    where: { threadId },
    data: { snoozedUntil: null, isRead: false }
  });
}
```

### Thread List Filtering:
- Default inbox: exclude where `snoozedUntil > now()` AND `isArchived = false` AND `isDeleted = false`
- Snoozed view: show where `snoozedUntil > now()`
- On page load, check for any `snoozedUntil <= now()` and auto-unsnooze them (set snoozedUntil = null, isRead = false)

---

## 3. Labels / Custom Categories

### DB Schema:
```prisma
model EmailLabel {
  id        String   @id @default(uuid())
  orgId     String   @map("org_id")
  name      String
  color     String   @default("#6B7280") // hex color
  icon      String?  // emoji
  createdAt DateTime @default(now()) @map("created_at")
  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  threads   EmailThreadLabel[]
  @@unique([orgId, name])
  @@map("email_labels")
}

model EmailThreadLabel {
  id        String   @id @default(uuid())
  threadId  String   @map("thread_id")
  labelId   String   @map("label_id")
  label     EmailLabel @relation(fields: [labelId], references: [id], onDelete: Cascade)
  @@unique([threadId, labelId])
  @@map("email_thread_labels")
}
```

Also add to Organization model: `emailLabels EmailLabel[]`

### Default Labels (auto-created):
- 🔴 Hot Lead (color: #EF4444)
- 🟡 Follow Up (color: #F59E0B)
- 🟢 Active Deal (color: #10B981)
- 🔵 Showing (color: #3B82F6)
- ⚫ Archived (color: #6B7280)

### Label Management UI:
In Messages page sidebar or settings:
- List all labels with color dots
- Click label → filter threads by that label
- Create new label: name + color picker
- Edit/delete labels
- Label count badges

### Apply Label:
- From bulk action bar: click 🏷️ → dropdown of labels → click to apply
- From individual thread: right-click or ... menu → Apply Label
- Multiple labels per thread allowed

### Label Display:
- Small colored pills next to thread subject in list view
- Example: `Re: 2BR on Kent  🔴 Hot Lead  🔵 Showing`

---

## 4. Quick Reply Templates

### DB: Already have EmailTemplate model. Enhance usage:

### Quick Reply UI in Thread Detail:
Below the reply box, show a row of template buttons:
```
Quick replies: [Thanks, will follow up] [Schedule showing?] [Send application] [Not available] [+ Custom]
```

### Pre-built Templates (auto-created on first use):
1. **Thanks, will follow up**
   - "Hi {{first_name}}, thank you for reaching out! I'll review your inquiry and get back to you shortly."

2. **Schedule showing?**
   - "Hi {{first_name}}, I'd love to show you this property. Are you available this week? What times work best for you?"

3. **Send application**
   - "Hi {{first_name}}, great news — I'd like to move forward with your application. Please find the rental application attached. Let me know if you have any questions."

4. **Not available**
   - "Hi {{first_name}}, unfortunately this unit is no longer available. However, I have similar listings in the area that might interest you. Would you like me to send some options?"

5. **Price info**
   - "Hi {{first_name}}, thanks for your interest! The asking price for this property is {{price}}. Happy to discuss further or schedule a viewing."

### Template Variable Replacement:
When sending a quick reply:
1. Look up the linked contact (if any)
2. Replace `{{first_name}}` with contact.firstName or parsed sender name
3. Replace `{{last_name}}`, `{{property_address}}`, `{{price}}` if available from thread context
4. Show preview before sending

### Create Custom Template:
- "+ Custom" button opens modal: name, subject (optional), body
- Save to EmailTemplate table
- Appears in quick reply bar for future use

---

## 5. Pin Important Threads

### How it works:
- Pinned threads always appear at top of inbox, above all other threads
- Pinned section has a subtle divider: "📌 Pinned" header
- Multiple pinned threads sorted by lastMessageAt

### Server Action:
```typescript
export async function togglePinThread(threadId: string) {
  const msgs = await prisma.emailMessage.findMany({ where: { threadId } });
  const isPinned = msgs[0]?.isPinned || false;
  await prisma.emailMessage.updateMany({
    where: { threadId },
    data: { isPinned: !isPinned }
  });
}
```

### UI:
- Pin icon (📌) on thread row hover → click to toggle
- Also available in bulk actions and right-click menu
- Pinned threads: show 📌 icon, slightly different bg (very light yellow/amber)

### Thread List Order:
1. Pinned threads (sorted by lastMessageAt DESC)
2. ── Divider ──
3. Unpinned threads (sorted by lastMessageAt DESC, excluding snoozed/archived/deleted)

---

## 6. Auto-Categorize (AI)

### Categories:
- **lead** — Inquiry about property, showing request, application
- **newsletter** — Marketing emails, listing alerts, market reports
- **personal** — Direct communication, known contacts, conversations
- **transactional** — Receipts, confirmations, automated notifications
- **spam** — Unwanted, promotional

### Rule-Based Detection (fast, runs on every sync):
```typescript
function categorizeEmail(email: EmailMessage): string {
  const from = email.fromEmail.toLowerCase();
  const subject = (email.subject || "").toLowerCase();
  const body = (email.bodyText || "").slice(0, 500).toLowerCase();
  
  // Newsletter detection
  if (from.includes("noreply") || from.includes("no-reply") || from.includes("newsletter") ||
      from.includes("marketing") || from.includes("updates@") || from.includes("digest@") ||
      subject.includes("unsubscribe") || body.includes("unsubscribe") ||
      email.labelIds.includes("CATEGORY_PROMOTIONS")) {
    return "newsletter";
  }
  
  // Lead detection (from portals or with inquiry keywords)
  if (from.includes("streeteasy") || from.includes("zillow") || from.includes("realtor.com") ||
      from.includes("apartments.com") || from.includes("renthop") ||
      subject.match(/inquir|interest|showing|available|listing/) ||
      body.match(/looking for|interested in|budget|bedroom|move.in date/)) {
    return "lead";
  }
  
  // Transactional
  if (from.includes("receipt") || from.includes("confirmation") || from.includes("invoice") ||
      from.includes("payment") || subject.match(/receipt|confirm|invoice|order/)) {
    return "transactional";
  }
  
  // If linked to existing contact → personal
  if (email.contactId) return "personal";
  
  // Default
  return "personal";
}
```

### Category Filter Tabs:
Add category tabs to the top of Messages page:
```
[All] [🔴 Leads (5)] [👤 Personal (12)] [📰 Newsletters (8)] [🧾 Transactional (3)]
```

- Each tab shows count of unread in that category
- Leads tab is highlighted/prominent — this is the most important for a CRM
- Categories auto-assigned on sync, can be manually changed via right-click menu

### Category Badges in Thread List:
Small colored dot or text badge:
- 🔴 Lead
- 👤 Personal  
- 📰 Newsletter
- 🧾 Transactional

---

## 7. Follow-Up Reminders

### How it works:
- System tracks when you last replied to each thread
- If a lead hasn't replied in X days, creates a follow-up task/alert
- Configurable per-category thresholds

### Default Thresholds:
- **Lead threads**: Alert after 1 day of no response
- **Active deal threads**: Alert after 2 days
- **General threads**: Alert after 5 days (or never)

### DB Schema:
```prisma
model FollowUpReminder {
  id          String    @id @default(uuid())
  orgId       String    @map("org_id")
  threadId    String    @map("thread_id")
  contactId   String?   @map("contact_id")
  status      String    @default("pending") // "pending", "dismissed", "completed"
  reason      String    // "no_reply_1d", "no_reply_3d", "lead_going_cold"
  dueAt       DateTime  @map("due_at")
  dismissedAt DateTime? @map("dismissed_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  contact     Contact?  @relation(fields: [contactId], references: [id], onDelete: SetNull)
  @@unique([orgId, threadId, reason])
  @@map("follow_up_reminders")
}
```

Also add to Organization model: `followUpReminders FollowUpReminder[]`
Also add to Contact model: `followUpReminders FollowUpReminder[]`

### Reminder Generation (runs on sync):
```typescript
async function checkFollowUps(orgId: string) {
  // Find threads where:
  // 1. Last message is inbound (they sent, we haven't replied)
  // 2. Last message is older than threshold
  // 3. Thread category is "lead" or has a linked contact
  // 4. No existing pending reminder for this thread
  
  const leadThreads = await prisma.emailMessage.groupBy({
    by: ['threadId'],
    where: {
      orgId,
      category: 'lead',
      isArchived: false,
      isDeleted: false,
    },
    _max: { receivedAt: true },
  });
  
  for (const thread of leadThreads) {
    const lastMsg = await prisma.emailMessage.findFirst({
      where: { threadId: thread.threadId },
      orderBy: { receivedAt: 'desc' },
    });
    
    if (lastMsg?.direction === 'inbound') {
      const hoursSince = (Date.now() - lastMsg.receivedAt.getTime()) / (1000 * 60 * 60);
      
      if (hoursSince > 24) {
        await prisma.followUpReminder.upsert({
          where: { orgId_threadId_reason: { orgId, threadId: thread.threadId, reason: 'no_reply_1d' } },
          create: {
            orgId,
            threadId: thread.threadId,
            contactId: lastMsg.contactId,
            reason: 'no_reply_1d',
            dueAt: new Date(),
          },
          update: {},
        });
      }
    }
  }
}
```

### Follow-Up UI:
**In Messages page — alert banner at top:**
```
⚠️ 3 leads need follow-up  |  John Smith (1d ago)  Jane Doe (2d ago)  Mike R. (3d ago)  [View All]
```

**Each reminder shows:**
- Contact name + thread subject
- Time since last inbound message
- Quick actions: [Reply Now] [Snooze 1 Day] [Dismiss]
- "Reply Now" opens the thread with reply box focused
- "Dismiss" marks reminder as dismissed

**In sidebar:**
- Show follow-up count badge on Messages: `📬 Messages (3 🔔)`
- Or separate "Follow-ups" section under Messages

---

## 8. Email Behavior Scoring

### Scoring Signals (per contact, based on email behavior):
```typescript
function calculateEmailEngagementScore(contactId: string): number {
  // Query all emails linked to this contact
  let score = 0;
  
  // Frequency: how often they email
  // 5+ emails in last 30 days = +15
  // 3-4 emails = +10
  // 1-2 emails = +5
  
  // Recency: how recent was last email
  // Last 24 hours = +15
  // Last 3 days = +10
  // Last week = +5
  // Last month = +2
  
  // Response speed: how fast they reply to your emails
  // Under 1 hour = +15
  // Under 4 hours = +10
  // Under 24 hours = +5
  
  // Thread depth: long conversations = engaged
  // 5+ messages in a thread = +10
  // 3-4 messages = +5
  
  // Initiative: do they initiate conversations
  // Started 2+ threads = +10
  // Started 1 thread = +5
  
  return Math.min(100, score);
}
```

### Integration with Lead Score:
- Add email engagement score to the existing AI Lead Score in enrich-actions.ts
- New signal: "Email Engagement" with points from calculateEmailEngagementScore
- Update score when new emails sync

### Display:
- In contact dossier: show "Email Engagement: High/Medium/Low" with score
- In thread list: contacts with high engagement get a subtle indicator

---

## 9. HubSpot-Style CRM Sidebar in Thread Detail

### When viewing a thread, the right side shows a CRM context panel:
```
┌─────────────────────────────┐
│ Thread Detail          CRM ▸│
├─────────────────────────────┤
│ [email messages...]         │
│                             │
│ [Reply box]                 │
├─────────────────────────────┤
│ 📇 Contact                  │
│ Nathan Tondow               │
│ 📞 732-902-1678             │
│ 📧 ntondow@gmail.com        │
│ 🏢 Director @ Cammeby's     │
│ Score: 36 D                 │
│ [View Full Dossier →]       │
├─────────────────────────────┤
│ 🏠 Properties               │
│ No owned properties found   │
├─────────────────────────────┤
│ 💰 Deals                    │
│ 2 Blue Slip — $20,000 open  │
│ [View Deal →]               │
├─────────────────────────────┤
│ 📋 Recent Activity          │
│ Email sent — 2 hours ago    │
│ Note added — yesterday      │
│ Task due — tomorrow         │
├─────────────────────────────┤
│ 🔔 Follow-up                │
│ No reply in 1 day ⚠️        │
│ [Snooze] [Dismiss]          │
└─────────────────────────────┘
```

### Implementation:
- When a thread is selected AND has a linked contact:
  - Fetch contact details, deals, activities, enrichment data
  - Display in a collapsible sidebar panel (right side of thread detail, or below thread)
- When no contact linked:
  - Show "Unknown sender" with [Create Lead] [Create Contact] buttons
- Quick actions from sidebar:
  - Click phone → opens tel: link
  - Click email → focuses reply box
  - "Add Note" → inline note input that saves to contact
  - "Create Task" → quick task creation modal

---

## 10. Updated Messages Page Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│ 📬 Messages                                    [Compose] [⟳ Sync]    │
│ [🔍 Search emails...                                               ] │
│ [All (25)] [🔴 Leads (5)] [👤 Personal (12)] [📰 News (8)] [⏰ Snoozed (2)] [📌 Pinned (1)] │
├──────────────────────┬─────────────────────────────┬───────────────────┤
│ ⚠️ 3 leads need      │                             │                   │
│ follow-up [View All] │                             │                   │
├──────────────────────┤                             │                   │
│ ☐ Select All  Sort ▾ │  Thread Detail              │  CRM Sidebar      │
│                      │                             │                   │
│ 📌 PINNED            │  AI Lead Banner             │  📇 Contact       │
│ ☐ 🟢 Jane D.    1h  │  🟡 Active Lead · rental    │  Name, phone,     │
│   Lease renewal      │  Budget: $3,500             │  company, score   │
│   🟢 Active Deal     │                             │                   │
│ ── ── ── ── ── ──   │  Messages...                │  💰 Deals         │
│                      │                             │  Recent deals     │
│ ☐ 🔵 John S.    2m  │  [inbound msg - gray bg]    │                   │
│   Re: 2BR on Kent   │  [outbound msg - blue bg]   │  📋 Activity      │
│   🔴 Hot Lead        │  [inbound msg - gray bg]    │  Recent notes,    │
│   🔴 Lead            │                             │  tasks, calls     │
│                      │  Quick replies:             │                   │
│ ☐ 🟢 Mike R.    1d  │  [Thanks] [Show?] [Apply]   │  🔔 Follow-up     │
│   Price question     │                             │  No reply 1d ⚠️   │
│   👤 Personal        │  [Reply box          ]      │  [Snooze][Dismiss] │
│                      │  [                   ][Send] │                   │
└──────────────────────┴─────────────────────────────┴───────────────────┘
```

### Three-column layout:
- **Left (30%)**: Thread list with checkboxes, bulk actions, pinned section
- **Center (45%)**: Thread detail with messages, AI banner, quick replies, reply box
- **Right (25%)**: CRM context sidebar (contact info, deals, activity, follow-ups)

---

## Build Order:
1. DB: Add new fields to EmailMessage (isArchived, isDeleted, isPinned, snoozedUntil, category)
2. DB: Create EmailLabel, EmailThreadLabel, FollowUpReminder models
3. DB: Run prisma migrate
4. Backend: Bulk action server actions (read/unread/star/archive/delete/pin/snooze)
5. Backend: Auto-categorize function + integrate with sync
6. Backend: Follow-up reminder check function + integrate with sync
7. Backend: Email engagement scoring function
8. Backend: Label CRUD server actions
9. UI: Bulk actions toolbar with checkboxes
10. UI: Category filter tabs
11. UI: Snooze picker dropdown
12. UI: Pin functionality + pinned section in thread list
13. UI: Label management + display
14. UI: Quick reply templates bar
15. UI: Follow-up alert banner + reminder actions
16. UI: CRM context sidebar in thread detail
17. UI: Update thread list layout (three-column)
18. Integration: Wire everything together, test

## Important Reminders:
- All exported functions in "use server" files must be async (Next.js 16)
- Use Array.isArray() before spreading API response arrays
- Serialize dates with JSON.parse(JSON.stringify()) when passing Server→Client
- Prisma migrate: run `npx prisma migrate dev --name inbox_enhancements` after schema changes
- Gmail API batch modify endpoint: POST https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify
- Keep the existing SenderBadge component and quick-create modal — enhance, don't replace
- Default email templates should be seeded on first load if none exist
- Follow-up check should run after each Gmail sync, not as a cron job (we don't have cron yet)
