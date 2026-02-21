# VettdRE Phase 1: Gmail Integration — Full Spec

## Overview
Connect Gmail to VettdRE so all email flows through the CRM. Inbound emails are automatically parsed by AI, linked to contacts, and scored. Outbound emails are sent from within VettdRE and tracked.

---

## Part A: Google Cloud Setup (YOU DO THIS — 15 minutes)

### Step 1: Create Google Cloud Project
1. Go to https://console.cloud.google.com
2. Click **New Project** → name it "VettdRE"
3. Select the project

### Step 2: Enable APIs
1. Go to **APIs & Services → Library**
2. Search and enable:
   - **Gmail API**
   - **Google Calendar API** (for later)
   - **Google People API** (optional, for contact sync)

### Step 3: Create OAuth Consent Screen
1. Go to **APIs & Services → OAuth consent screen**
2. Select **External** (or Internal if using Workspace)
3. Fill in:
   - App name: **VettdRE**
   - User support email: your email
   - Developer contact: your email
4. Scopes → Add:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.labels`
5. Test users → Add your Gmail address
6. Save

### Step 4: Create OAuth Credentials
1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: "VettdRE Web"
5. Authorized redirect URIs: `http://localhost:3000/api/auth/gmail/callback`
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

### Step 5: Add to .env
```
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-your-secret
GMAIL_REDIRECT_URI=http://localhost:3000/api/auth/gmail/callback
```

### Step 6: Verify it works
Restart your dev server, then proceed to tell Claude Code to build Part B.

---

## Part B: Claude Code Build Spec — Gmail Integration

### Instruction for Claude Code:
```
Read CLAUDE.md for project context. Build the Gmail integration as specified in GMAIL_SPEC.md. Start with the database schema, then OAuth flow, then the sync engine, then the UI.
```

### B1: Database Schema (add to prisma/schema.prisma)

```prisma
model GmailAccount {
  id            String   @id @default(uuid())
  userId        String   @map("user_id")
  email         String
  accessToken   String   @map("access_token")
  refreshToken  String   @map("refresh_token")
  tokenExpiry   DateTime @map("token_expiry")
  historyId     String?  @map("history_id")  // Gmail push sync cursor
  syncedAt      DateTime? @map("synced_at")
  isActive      Boolean  @default(true) @map("is_active")
  createdAt     DateTime @default(now()) @map("created_at")
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, email])
  @@map("gmail_accounts")
}

model EmailMessage {
  id              String    @id @default(uuid())
  orgId           String    @map("org_id")
  gmailMessageId  String    @map("gmail_message_id")
  threadId        String?   @map("thread_id")
  contactId       String?   @map("contact_id")
  direction       String    // "inbound" | "outbound"
  fromEmail       String    @map("from_email")
  fromName        String?   @map("from_name")
  toEmails        String[]  @map("to_emails")
  ccEmails        String[]  @default([]) @map("cc_emails")
  subject         String?
  bodyText        String?   @map("body_text")
  bodyHtml        String?   @map("body_html")
  snippet         String?
  labelIds        String[]  @default([]) @map("label_ids")
  isRead          Boolean   @default(false) @map("is_read")
  isStarred       Boolean   @default(false) @map("is_starred")
  hasAttachments  Boolean   @default(false) @map("has_attachments")
  receivedAt      DateTime  @map("received_at")
  
  // AI parsing results
  aiParsed        Boolean   @default(false) @map("ai_parsed")
  leadSource      String?   @map("lead_source")       // "streeteasy", "zillow", "realtor", "website", "referral", "direct"
  leadIntent      String?   @map("lead_intent")        // "rental_inquiry", "purchase_inquiry", "listing_inquiry", "general"
  extractedName   String?   @map("extracted_name")
  extractedPhone  String?   @map("extracted_phone")
  extractedBudget String?   @map("extracted_budget")
  extractedArea   String?   @map("extracted_area")     // neighborhood/area of interest
  aiSummary       String?   @map("ai_summary")
  sentimentScore  Int?      @map("sentiment_score")    // 1-5 (1=cold, 5=urgent)
  
  createdAt       DateTime  @default(now()) @map("created_at")
  organization    Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  contact         Contact?  @relation(fields: [contactId], references: [id], onDelete: SetNull)
  
  @@unique([orgId, gmailMessageId])
  @@index([orgId, contactId])
  @@index([orgId, receivedAt(sort: Desc)])
  @@index([orgId, leadSource])
  @@map("email_messages")
}

model EmailTemplate {
  id          String   @id @default(uuid())
  orgId       String   @map("org_id")
  name        String
  subject     String
  bodyHtml    String   @map("body_html")
  category    String   @default("general") // "follow_up", "listing", "welcome", "nurture"
  variables   String[] @default([])         // ["{{first_name}}", "{{property_address}}"]
  isActive    Boolean  @default(true) @map("is_active")
  usageCount  Int      @default(0) @map("usage_count")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  sequenceSteps EmailSequenceStep[]
  @@map("email_templates")
}

model EmailSequence {
  id          String   @id @default(uuid())
  orgId       String   @map("org_id")
  name        String
  description String?
  trigger     String   // "new_lead", "no_response_3d", "showing_completed", "manual"
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  steps       EmailSequenceStep[]
  enrollments EmailSequenceEnrollment[]
  @@map("email_sequences")
}

model EmailSequenceStep {
  id          String   @id @default(uuid())
  sequenceId  String   @map("sequence_id")
  templateId  String   @map("template_id")
  stepOrder   Int      @map("step_order")
  delayDays   Int      @map("delay_days")     // days after previous step
  delayHours  Int      @default(0) @map("delay_hours")
  sequence    EmailSequence @relation(fields: [sequenceId], references: [id], onDelete: Cascade)
  template    EmailTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  @@map("email_sequence_steps")
}

model EmailSequenceEnrollment {
  id          String    @id @default(uuid())
  sequenceId  String    @map("sequence_id")
  contactId   String    @map("contact_id")
  currentStep Int       @default(0) @map("current_step")
  status      String    @default("active") // "active", "completed", "paused", "cancelled"
  nextSendAt  DateTime? @map("next_send_at")
  enrolledAt  DateTime  @default(now()) @map("enrolled_at")
  completedAt DateTime? @map("completed_at")
  sequence    EmailSequence @relation(fields: [sequenceId], references: [id], onDelete: Cascade)
  contact     Contact   @relation(fields: [contactId], references: [id], onDelete: Cascade)
  @@unique([sequenceId, contactId])
  @@map("email_sequence_enrollments")
}
```

**IMPORTANT:** Also add these relations to existing models:
- `Contact` model: add `emails EmailMessage[]` and `sequenceEnrollments EmailSequenceEnrollment[]`
- `Organization` model: add `emailMessages EmailMessage[]`, `emailTemplates EmailTemplate[]`, `emailSequences EmailSequence[]`
- `User` model: add `gmailAccounts GmailAccount[]`

### B2: OAuth Flow

Create `src/app/api/auth/gmail/route.ts`:
- GET → Redirects to Google OAuth consent screen
- Scopes: gmail.readonly, gmail.send, gmail.modify, gmail.labels

Create `src/app/api/auth/gmail/callback/route.ts`:
- Receives auth code from Google
- Exchanges for access_token + refresh_token
- Saves to GmailAccount table
- Redirects to /messages

Token refresh helper in `src/lib/gmail.ts`:
- Check if token expired before each API call
- Auto-refresh using refresh_token
- Update GmailAccount with new access_token

### B3: Gmail Sync Engine

Create `src/lib/gmail-sync.ts`:

**Initial sync (on first connect):**
1. Fetch last 100 emails from Gmail API (messages.list + messages.get)
2. Parse headers: From, To, CC, Subject, Date
3. Match fromEmail/toEmails against Contact.email in database
4. If matched → set contactId on EmailMessage
5. If no match but inbound → create new Contact with status "lead"
6. Store in EmailMessage table

**Incremental sync (on page load or manual refresh):**
1. Use Gmail history API with stored historyId
2. Fetch only new/changed messages since last sync
3. Process same as above

**AI Parsing (for inbound emails):**
Create `src/lib/email-parser.ts`:

```typescript
// Call Claude API to parse each inbound email
const prompt = `Analyze this real estate email and extract structured data.

Email:
From: ${email.fromName} <${email.fromEmail}>
Subject: ${email.subject}
Body: ${email.bodyText}

Return JSON:
{
  "leadSource": "streeteasy|zillow|realtor|apartments_com|website|referral|cold|unknown",
  "leadIntent": "rental_inquiry|purchase_inquiry|seller_inquiry|listing_inquiry|showing_request|general",
  "extractedName": "full name if found",
  "extractedPhone": "phone if found",
  "extractedBudget": "budget range if mentioned",
  "extractedArea": "neighborhood or area of interest",
  "summary": "one sentence summary of what this person wants",
  "urgency": 1-5 (1=browsing, 5=ready to sign),
  "suggestedResponse": "brief suggestion for how to respond"
}

Source detection rules:
- StreetEasy: from @streeteasy.com or contains "streeteasy.com" in body
- Zillow: from @zillow.com or @trulia.com
- Realtor.com: from @realtor.com or @move.com
- Apartments.com: from @apartments.com or @costar.com
- Referral: body mentions "referred by" or "recommendation"
- Website: from your domain or contains form submission markers
`;
```

**Marketing Source Detection Rules:**
| Source | Detection |
|--------|-----------|
| StreetEasy | From *@streeteasy.com, or body contains streeteasy.com links |
| Zillow | From *@zillow.com or *@trulia.com |
| Realtor.com | From *@realtor.com or *@move.com |
| Apartments.com | From *@apartments.com or *@costar.com |
| RentHop | From *@renthop.com |
| Direct/Website | From your website domain |
| Referral | Body contains "referred by", "recommended by" |

### B4: Send Email

Create `src/lib/gmail-send.ts`:
- Use Gmail API messages.send
- Accept: to, subject, bodyHtml, optional replyToMessageId
- Create EmailMessage record with direction "outbound"
- Link to contact if known
- Support template variable replacement: {{first_name}}, {{property_address}}, etc.

### B5: UI Pages

**1. Messages Page** (`src/app/(dashboard)/messages/page.tsx`)
- Left sidebar: email list (newest first), grouped by thread
- Right panel: email detail view with full thread
- Top bar: Compose button, Search, Filter by source
- Each email shows: from/to, subject, snippet, time, source badge, AI urgency indicator
- Unread count in sidebar nav
- Click email → shows full thread, marks as read

**2. Compose Modal** (reusable component)
- To field (autocomplete from contacts)
- Subject
- Rich text editor (basic: bold, italic, links)
- Template picker dropdown
- Send button
- Can be opened from: Messages page, Contact dossier, Pipeline deal

**3. Contact Dossier — Email Tab**
- Add "Emails" tab to existing contact dossier
- Shows all emails linked to this contact
- Compose button sends email pre-filled with contact's email
- AI summary of email history

**4. Settings — Gmail Connection** (`src/app/(dashboard)/settings/page.tsx`)
- "Connect Gmail" button → triggers OAuth flow
- Shows connected email address
- Disconnect button
- Sync status indicator

**5. Templates Page** (`src/app/(dashboard)/templates/page.tsx`)
- List all templates
- Create/edit template with name, subject, body
- Variable insertion helper
- Preview with sample data

### B6: Sidebar Updates
Add to sidebar navigation:
- 📬 Messages (with unread badge count)
- Under INTELLIGENCE section or as its own section

---

## Part C: Testing Checklist (YOU DO THIS)

### After Claude Code builds it:

**Test 1: Gmail Connection**
1. Go to Settings → Click "Connect Gmail"
2. Should redirect to Google consent screen
3. Authorize → should redirect back to VettdRE
4. Settings should show your connected email
5. Check terminal for sync logs

**Test 2: Email Sync**
1. Go to Messages page
2. Should see your recent emails loading
3. Verify: subject, from, date all correct
4. Click an email → should show full body

**Test 3: AI Parsing**
1. Send yourself a test email from a fake StreetEasy-style address
   - Subject: "Inquiry about 2BR at 125 Greenpoint Ave"
   - Body: "Hi, I'm interested in the 2 bedroom apartment listed at $3,500/mo. My name is John Smith, phone 555-123-4567. I'm looking to move in by March 1st."
2. Sync emails
3. Check if AI parsed: source=streeteasy, intent=rental_inquiry, name=John Smith, phone=555-123-4567, budget=$3,500

**Test 4: Contact Auto-Creation**
1. After test email syncs, go to Contacts
2. Should see "John Smith" auto-created as a new lead
3. Email should be linked to this contact

**Test 5: Send Email**
1. Open a contact dossier
2. Click "Email" button
3. Compose a test email
4. Send → check your Gmail sent folder
5. Verify outbound email appears in Messages and on contact timeline

**Test 6: Marketing Source Tracking**
1. Go to Messages → filter by source
2. Should see source badges (StreetEasy, Zillow, Direct, etc.)
3. Go to Dashboard → source breakdown should reflect the data

**Test 7: Templates**
1. Go to Templates → Create new
2. Name: "Listing Follow Up"
3. Subject: "Following up on {{property_address}}"
4. Body: "Hi {{first_name}}, thanks for your interest in {{property_address}}..."
5. Go to compose → select template → verify variables populate

---

## Part D: Common Issues & Fixes

**"Access blocked: VettdRE has not completed the Google verification process"**
→ This is normal for development. Add your email as a Test User in Google Cloud Console → OAuth consent screen → Test users.

**Token expired errors**
→ The refresh token flow should handle this automatically. If not, disconnect and reconnect Gmail.

**Emails not syncing**
→ Check terminal logs. Common issues: token expired, rate limit hit (Gmail allows 250 API calls per second), or historyId mismatch.

**AI parsing costs**
→ Each email parse costs ~$0.01-0.02 with Claude Sonnet. For high volume, use Haiku (~$0.001/email) for initial classification, then Sonnet for detailed extraction on leads only.

**"use server" errors**
→ Remember: all exported functions in server action files must be async in Next.js 16.

---

## Part E: Future Enhancements (Phase 2+)

- **Gmail Push Notifications** — Google Pub/Sub for real-time email delivery (no polling)
- **Email Sequences** — automated drip campaigns triggered by lead status
- **AI Auto-Responder** — Claude drafts responses for new leads, queued for your approval
- **Open/Click Tracking** — pixel tracking + link wrapping
- **Attachment handling** — store and display email attachments
- **Bulk email** — send to segments/lists with template
- **Unsubscribe management** — CAN-SPAM compliance
