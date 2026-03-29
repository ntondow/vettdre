# VettdRE Messages Inbox — Full Enhancement Spec

Read CLAUDE.md for project context. Enhance the existing Messages page with all features below. Work through each section in order.

---

## 1. Thread View (Group Replies Together)

### Backend Changes (`src/app/(dashboard)/messages/actions.ts` or similar):
- Query EmailMessage grouped by `threadId`
- Return threads as: `{ threadId, subject, participants[], messageCount, lastMessageAt, snippet, isRead, leadSource, messages[] }`
- Sort threads by `lastMessageAt` DESC
- A thread's `isRead` = false if ANY message in thread is unread
- A thread's `snippet` = the most recent message's snippet

### UI Changes:
- **Left panel**: Show thread list, not individual emails
  - Each thread row: sender name/avatar, subject (bold if unread), snippet preview, timestamp, message count badge, source badge if detected
  - Click thread → right panel shows full conversation
- **Right panel**: Thread detail view
  - Show all messages in chronological order (oldest first)
  - Each message: sender, timestamp, full body (render HTML safely with dangerouslySetInnerHTML in a sandboxed div)
  - Visual distinction: inbound messages left-aligned (gray bg), outbound right-aligned (blue bg) — like a chat
  - Collapse older messages, expand on click
  - Reply box at bottom (see Compose section)

---

## 2. Compose & Reply

### Send Email Server Action:
Create `src/app/(dashboard)/messages/send-actions.ts`:
```typescript
"use server";
// Send email via Gmail API
export async function sendEmail(params: {
  to: string;
  subject: string;
  bodyHtml: string;
  replyToMessageId?: string; // Gmail message ID for threading
  threadId?: string; // Gmail thread ID for threading
}) {
  // 1. Get user's GmailAccount from DB
  // 2. Refresh token if expired
  // 3. Build RFC 2822 email with proper headers
  //    - If replying: add In-Reply-To and References headers
  //    - Set threadId on the Gmail API call
  // 4. Base64url encode the message
  // 5. POST to https://gmail.googleapis.com/gmail/v1/users/me/messages/send
  //    Body: { raw: base64urlEncodedMessage, threadId: threadId }
  // 6. Save to EmailMessage table with direction "outbound"
  // 7. Return success/error
}
```

### Compose Modal (reusable component):
`src/app/(dashboard)/messages/compose-modal.tsx`:
- Triggered by: "Compose" button in Messages, "Reply" in thread view, "Email" on contact dossier
- Fields:
  - **To**: text input with autocomplete from CRM contacts (search by name/email)
  - **Subject**: text input (pre-filled with "Re: ..." when replying)
  - **Body**: textarea or simple rich text (bold, italic, links — use contentEditable div)
  - **Template picker**: dropdown to select from EmailTemplate table, fills subject + body
- Buttons: Send, Save Draft (stretch), Cancel
- On send: call sendEmail action, close modal, refresh thread list
- When replying: pre-fill To with sender, Subject with "Re: ...", quote previous message below

### Reply Box in Thread View:
- Simple inline reply at bottom of thread detail
- Just a textarea + Send button
- Pre-fills threading headers automatically

---

## 3. Auto-Link Emails to CRM Contacts

### In the Gmail sync function:
After fetching each email, run contact matching:

```typescript
async function linkEmailToContact(email: EmailMessage, orgId: string) {
  // 1. Extract the "other" email address (not the user's)
  const otherEmail = email.direction === "inbound" ? email.fromEmail : email.toEmails[0];
  
  // 2. Search contacts by email (exact match)
  let contact = await prisma.contact.findFirst({
    where: { orgId, email: { equals: otherEmail, mode: "insensitive" } }
  });
  
  // 3. If no match, try by name (fuzzy)
  if (!contact && email.fromName) {
    const parts = email.fromName.trim().split(/\s+/);
    if (parts.length >= 2) {
      contact = await prisma.contact.findFirst({
        where: {
          orgId,
          firstName: { equals: parts[0], mode: "insensitive" },
          lastName: { equals: parts.slice(1).join(" "), mode: "insensitive" }
        }
      });
    }
  }
  
  // 4. If matched, link
  if (contact) {
    await prisma.emailMessage.update({
      where: { id: email.id },
      data: { contactId: contact.id }
    });
    // Update contact's lastActivityAt
    await prisma.contact.update({
      where: { id: contact.id },
      data: { lastActivityAt: new Date() }
    });
  }
  
  return contact;
}
```

### UI Indicators:
- In thread list: show contact avatar/initials if linked, generic icon if not
- In thread detail: show "Linked to: [Contact Name]" with link to their dossier
- If not linked: show "Link to Contact" button → opens contact search modal

---

## 4. AI Parse Inbound Leads

### Create `src/lib/email-parser.ts`:
```typescript
"use server";

export async function parseInboundEmail(email: {
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  bodyText: string | null;
}): Promise<{
  leadSource: string;
  leadIntent: string;
  extractedName: string | null;
  extractedPhone: string | null;
  extractedBudget: string | null;
  extractedArea: string | null;
  aiSummary: string;
  sentimentScore: number;
}> {
  // Step 1: Rule-based source detection (fast, free)
  let leadSource = "unknown";
  const from = email.fromEmail.toLowerCase();
  const body = (email.bodyText || "").toLowerCase();
  const subject = (email.subject || "").toLowerCase();
  
  if (from.includes("streeteasy") || body.includes("streeteasy.com")) leadSource = "streeteasy";
  else if (from.includes("zillow") || from.includes("trulia")) leadSource = "zillow";
  else if (from.includes("realtor.com") || from.includes("move.com")) leadSource = "realtor";
  else if (from.includes("apartments.com") || from.includes("costar")) leadSource = "apartments_com";
  else if (from.includes("renthop")) leadSource = "renthop";
  else if (body.includes("referred by") || body.includes("recommended by")) leadSource = "referral";
  
  // Step 2: Claude AI extraction (for real leads, not newsletters/spam)
  const isLikelyLead = leadSource !== "unknown" || 
    subject.match(/inquir|interest|question|showing|appointment|available/) ||
    body.match(/looking for|interested in|budget|move.in|bedroom|apartment/);
  
  if (!isLikelyLead) {
    return {
      leadSource,
      leadIntent: "general",
      extractedName: email.fromName,
      extractedPhone: null,
      extractedBudget: null,
      extractedArea: null,
      aiSummary: "",
      sentimentScore: 1,
    };
  }
  
  // Call Claude for detailed parsing
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return { leadSource, leadIntent: "general", extractedName: email.fromName, extractedPhone: null, extractedBudget: null, extractedArea: null, aiSummary: "", sentimentScore: 2 };
  
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `Parse this real estate inquiry email. Return ONLY valid JSON, no markdown.

From: ${email.fromName || "Unknown"} <${email.fromEmail}>
Subject: ${email.subject || ""}
Body: ${(email.bodyText || "").slice(0, 2000)}

Return:
{
  "leadIntent": "rental_inquiry|purchase_inquiry|seller_inquiry|listing_inquiry|showing_request|general",
  "extractedName": "full name or null",
  "extractedPhone": "phone number or null",
  "extractedBudget": "budget/price range or null",
  "extractedArea": "neighborhood or area of interest or null",
  "aiSummary": "one sentence summary of what they want",
  "sentimentScore": 1-5
}

Sentiment: 1=just browsing, 2=mildly interested, 3=actively looking, 4=ready to act, 5=urgent/deadline`
      }]
    })
  });
  
  if (!response.ok) {
    console.error("AI parse failed:", response.status);
    return { leadSource, leadIntent: "general", extractedName: email.fromName, extractedPhone: null, extractedBudget: null, extractedArea: null, aiSummary: "", sentimentScore: 2 };
  }
  
  const data = await response.json();
  const text = data.content?.[0]?.text || "";
  
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      leadSource,
      leadIntent: parsed.leadIntent || "general",
      extractedName: parsed.extractedName || email.fromName,
      extractedPhone: parsed.extractedPhone || null,
      extractedBudget: parsed.extractedBudget || null,
      extractedArea: parsed.extractedArea || null,
      aiSummary: parsed.aiSummary || "",
      sentimentScore: parsed.sentimentScore || 2,
    };
  } catch {
    return { leadSource, leadIntent: "general", extractedName: email.fromName, extractedPhone: null, extractedBudget: null, extractedArea: null, aiSummary: text.slice(0, 200), sentimentScore: 2 };
  }
}
```

### Integration with Sync:
After syncing each inbound email:
1. Run `parseInboundEmail()` 
2. Update EmailMessage with parsed fields
3. If extractedName + extractedPhone found AND no matching contact exists → auto-create Contact with status "lead", source from leadSource
4. Link email to that contact
5. Log: `[AI PARSE] Source: streeteasy | Intent: rental_inquiry | Name: John Smith | Phone: 555-1234 | Urgency: 4`

### AI Parse UI in Thread View:
When viewing a thread with AI-parsed data, show a colored banner at top:
- 🟢 High urgency (4-5): "Hot Lead — rental inquiry, budget $3,500, looking in Williamsburg"
- 🟡 Medium (3): "Active Lead — purchase inquiry, interested in Brooklyn"
- ⚪ Low (1-2): "General inquiry"
- Show: source badge, intent, extracted phone (clickable), budget, area

---

## 5. Search & Filter

### Search Bar:
- Full-text search across: subject, bodyText, fromEmail, fromName
- Debounced (300ms) server-side search
- Use Prisma `contains` with `mode: "insensitive"`

### Filter Buttons/Dropdowns:
- **Status**: All, Unread, Read, Starred
- **Source**: All, StreetEasy, Zillow, Realtor, Apartments.com, Referral, Direct, Unknown
- **Contact**: Linked, Unlinked
- **Date**: Today, This Week, This Month, Custom Range
- **Intent**: All, Rental, Purchase, Seller, Showing, General

### Server Action:
```typescript
export async function searchEmails(params: {
  orgId: string;
  query?: string;
  isRead?: boolean;
  leadSource?: string;
  hasContact?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  leadIntent?: string;
  page?: number;
  limit?: number;
}) {
  // Build Prisma where clause from params
  // Return paginated threads
}
```

---

## 6. Unread Badge in Sidebar

### Server Action:
```typescript
export async function getUnreadCount(orgId: string): Promise<number> {
  return prisma.emailMessage.count({
    where: { orgId, isRead: false, direction: "inbound" }
  });
}
```

### Sidebar Integration:
In `src/components/layout/sidebar.tsx`:
- Import and call `getUnreadCount` (or pass as prop from layout)
- Show red badge next to "Messages" nav item: `📬 Messages (12)`
- Badge styling: small red circle with white number, like iOS notification badges
- Update count after sync, after marking as read

### Mark as Read:
- When user opens a thread, mark all messages in that thread as read
- Update Gmail API too: `POST /gmail/v1/users/me/messages/{id}/modify` with `removeLabelIds: ["UNREAD"]`

---

## 7. Clickable Senders + Auto Lead/Contact Creation

### Every inbound sender is clickable:
In both the thread list and thread detail view, every sender name and email address should be a clickable element.

### On Click Logic:
```typescript
async function handleSenderClick(fromEmail: string, fromName: string | null, emailMessage: EmailMessage) {
  // 1. Check if contact exists
  const existingContact = await findContactByEmail(orgId, fromEmail);
  
  // 2. If exists → navigate to /contacts/[id]
  if (existingContact) {
    router.push(`/contacts/${existingContact.id}`);
    return;
  }
  
  // 3. If not exists → open quick-create modal
  openCreateModal({ fromEmail, fromName, emailMessage });
}
```

### Quick-Create Modal:
Pre-filled with all available data:
- **Name**: parsed from email "From" header (split into firstName/lastName)
- **Email**: sender's email address
- **Phone**: if AI extracted one from the email body
- **Source**: AI-detected lead source (streeteasy, zillow, referral, etc.)
- **Notes**: auto-populated with AI summary, budget, area of interest if available

Two action buttons with smart defaults:
- **"Create Lead"** (primary/default button) — use when:
  - Email is from a listing portal (StreetEasy, Zillow, etc.)
  - AI detected rental/purchase/showing intent
  - This is their first email to you
  - Sets: status="lead", auto-assigns to current user
  
- **"Create Contact"** (secondary button) — use when:
  - They appear to be a vendor, colleague, or existing relationship
  - They've emailed 3+ times already
  - AI detected non-lead intent (general)
  - Sets: status="active"

After creation:
1. Save the new contact to database
2. Link ALL existing emails from that sender's address to the new contact
3. Auto-run PDL enrichment on the new contact (use the enrichContact function from enrich-actions.ts)
4. Navigate to the new contact's dossier page

### Sender Status Indicators:
Every sender name/email in the UI should show a visual indicator:
- 🟢 **Green dot** = linked to existing CRM contact (clickable → goes to dossier)
- 🔵 **Blue dot** = new sender, not yet in CRM (clickable → opens create modal)

Hover tooltip:
- Green: "View Contact: [Name]"
- Blue: "Create Lead/Contact"

### Sender Display Component:
Create a reusable `<SenderBadge>` component used in thread list and thread detail:
```tsx
// src/app/(dashboard)/messages/sender-badge.tsx
interface SenderBadgeProps {
  email: string;
  name: string | null;
  contactId: string | null;  // null = not linked
  contactName: string | null;
  aiData?: { extractedPhone?: string; leadSource?: string; aiSummary?: string };
}
```
- Shows: colored dot + name (or email if no name)
- Green dot + clickable if contactId exists
- Blue dot + clickable if no contactId
- On click: navigate or open create modal

---

## 8. Contact Dossier Email Tab

In `src/app/(dashboard)/contacts/[id]/contact-dossier.tsx`:
- Add "📬 Emails" tab between Activity and Deals
- Shows all EmailMessage records linked to this contact
- Same thread grouping as Messages page
- "Compose" button at top sends to this contact's email
- If no emails linked: "No emails found. Emails will auto-link when synced from Gmail."

---

## 9. UI Layout Spec

### Messages Page Layout:
```
┌─────────────────────────────────────────────────────┐
│ Messages                          [Compose] [Sync]  │
│ [Search bar                                       ] │
│ [All] [Unread] [StreetEasy] [Zillow] [Realtor] ... │
├──────────────────────┬──────────────────────────────┤
│ Thread List (40%)    │ Thread Detail (60%)          │
│                      │                              │
│ 🔵 John Smith    2m  │ 🟡 Active Lead               │
│   Re: 2BR on Kent   │ rental_inquiry · $3,500      │
│   I'm interested ... │ Williamsburg                 │
│   🟢 StreetEasy  (3) │ ─────────────────────────── │
│                      │                              │
│ 🟢 Jane Doe     1h   │ 🔵 John Smith → You          │
│   Showing request    │ Feb 19, 2:30 PM              │
│   Can we schedule... │ Hi, I'm interested in the    │
│   🟡 Zillow      (1) │ 2BR apartment at 125 Kent... │
│                      │                              │
│ 🔵 Mike R.      3h   │ ─────────────────────────── │
│   Price question     │                              │
│   What's the ask...  │ You → 🔵 John Smith          │
│   ⚪ Direct      (2) │ Feb 19, 2:45 PM              │
│                      │ Thanks for your interest!    │
│                      │                              │
│                      │ ─────────────────────────── │
│                      │ [Reply box                 ] │
│                      │ [                    ] [Send] │
└──────────────────────┴──────────────────────────────┘
```

Note: 🟢 = linked contact (click → dossier), 🔵 = new sender (click → create lead/contact)

### Styling:
- Use existing Tailwind patterns from the codebase
- Thread list: `bg-white rounded-xl border`, hover states, selected state with `bg-blue-50`
- Unread threads: bold subject + name, slightly different bg
- Source badges: same color coding as building profiles (emerald=StreetEasy, blue=Zillow, amber=Realtor, purple=Apartments, slate=unknown)
- Urgency dot: green/yellow/gray circle next to source badge
- Sender names: underline on hover, cursor pointer, colored dot before name
- Responsive: on mobile, thread list is full width, thread detail is a separate view

---

## Build Order:
1. Backend: Thread grouping query + search/filter actions
2. Backend: Send email action + AI parser
3. Backend: Contact lookup by email helper function
4. UI: SenderBadge reusable component
5. UI: Thread list + thread detail layout with clickable senders
6. UI: Quick-create lead/contact modal
7. UI: Compose modal + reply box
8. UI: Search/filter bar
9. UI: AI parse banner in thread detail
10. UI: Sidebar unread badge
11. UI: Contact dossier email tab
12. Integration: Auto-link + AI parse on sync + auto-enrichment on contact create
13. Test everything

## Important Reminders:
- All exported functions in "use server" files must be async (Next.js 16)
- Use Array.isArray() before spreading API response arrays
- Serialize dates with JSON.parse(JSON.stringify()) when passing Server→Client
- The Anthropic API key is in process.env.ANTHROPIC_API_KEY
- Gmail tokens are stored in the GmailAccount table
- Always refresh Gmail access token before API calls if expired
- The enrichContact function in src/app/(dashboard)/contacts/[id]/enrich-actions.ts handles PDL + NYC property enrichment — reuse it when auto-creating contacts from emails
