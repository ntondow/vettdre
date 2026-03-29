# VettdRE Settings — Full Spec

Read CLAUDE.md for project context. Rebuild the Settings page as a comprehensive admin panel with sidebar navigation.

---

## Layout: Sidebar Navigation

```
┌──────────────────────────────────────────────────────────────┐
│ ⚙️ Settings                                                  │
├────────────────┬─────────────────────────────────────────────┤
│                │                                             │
│  ACCOUNT       │  [Active Section Content]                   │
│  👤 Profile    │                                             │
│  ✍️ Signature  │  Full-width content area                    │
│  🔔 Notifs     │  with cards and forms                       │
│  🕐 Hours      │                                             │
│                │                                             │
│  TEAM          │                                             │
│  👥 Members    │                                             │
│  🎯 Lead Rules │                                             │
│                │                                             │
│  CRM           │                                             │
│  📊 Pipeline   │                                             │
│  🤖 AI Settings│                                             │
│  🎨 Branding   │                                             │
│                │                                             │
│  EMAIL         │                                             │
│  📬 Gmail      │                                             │
│  ⏱️ Sync       │                                             │
│  📝 Templates  │                                             │
│                │                                             │
│  DATA          │                                             │
│  🔑 API Keys   │                                             │
│  📤 Export     │                                             │
│                │                                             │
└────────────────┴─────────────────────────────────────────────┘
```

### Implementation:
- Use URL segments: `/settings/profile`, `/settings/signature`, `/settings/team`, etc.
- Settings layout: `src/app/(dashboard)/settings/layout.tsx` with sidebar + children
- Each section is a separate page in `src/app/(dashboard)/settings/[section]/page.tsx`
- Sidebar: 220px fixed, `bg-slate-50` left panel with grouped nav links
- Active link: `bg-white text-blue-600 font-medium` with left blue border
- Content area: `bg-white` with max-width 720px, centered, with card sections

---

## Section 1: Profile (`/settings/profile`)

### Fields:
- **Photo**: circular avatar upload (or initials fallback), click to change
  - Store in Supabase storage or as base64 in DB for now
- **First Name** / **Last Name**: text inputs
- **Email**: display only (from auth), with "Change email" link
- **Phone**: text input
- **Title**: text input (e.g. "Licensed Real Estate Agent")
- **License Number**: text input (NY RE license)
- **Brokerage**: text input

### Server Action:
```typescript
export async function updateProfile(userId: string, data: {
  firstName?: string;
  lastName?: string;
  phone?: string;
  title?: string;
  licenseNumber?: string;
  brokerage?: string;
  photoUrl?: string;
}) { ... }
```

### DB: Add fields to User model if not present:
```prisma
phone         String?
title         String?
licenseNumber String?  @map("license_number")
brokerage     String?
photoUrl      String?  @map("photo_url")
```

---

## Section 2: Email Signature (`/settings/signature`)

### Visual Signature Builder:
Pre-built signature templates the user can customize:

**Template 1 — Classic:**
```
Nathan Tondow
Licensed Real Estate Agent
Cammeby's International | 732-902-1678
ntondow@gmail.com | LinkedIn
```

**Template 2 — With Logo:**
```
[Logo Image]
Nathan Tondow | Director of Innovation
Cammeby's International
📞 732-902-1678 | ✉️ ntondow@gmail.com
🔗 LinkedIn | 🌐 Website
```

**Template 3 — Minimal:**
```
—
Nathan Tondow · 732-902-1678
```

### Builder UI:
- Template selector (3 cards, click to select)
- Preview pane (live preview of signature)
- Customize fields: name, title, company, phone, email, LinkedIn URL, website URL
- Logo upload (optional)
- Color picker for accent color (default: blue)
- "Save Signature" button

### Storage:
```prisma
model EmailSignature {
  id        String   @id @default(uuid())
  userId    String   @unique @map("user_id")
  template  String   @default("classic") // "classic", "with_logo", "minimal"
  html      String   @db.Text // rendered HTML signature
  logoUrl   String?  @map("logo_url")
  accentColor String @default("#2563EB") @map("accent_color")
  linkedinUrl String? @map("linkedin_url")
  websiteUrl  String? @map("website_url")
  isActive  Boolean  @default(true) @map("is_active")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("email_signatures")
}
```

### Integration:
- Auto-append signature HTML to all outgoing emails
- Preview in compose modal

---

## Section 3: Notifications (`/settings/notifications`)

### Notification Preferences:
Toggle switches for each notification type:

| Notification | Email | Push | In-App |
|---|---|---|---|
| New lead from email | ✅ | ✅ | ✅ |
| Lead follow-up reminder | ✅ | ✅ | ✅ |
| New email received | ❌ | ✅ | ✅ |
| Deal stage changed | ❌ | ❌ | ✅ |
| Task due today | ✅ | ✅ | ✅ |
| Task overdue | ✅ | ✅ | ✅ |
| Team member assigned lead | ❌ | ❌ | ✅ |
| Weekly summary report | ✅ | ❌ | ❌ |

### Storage:
```prisma
model NotificationPreferences {
  id                    String  @id @default(uuid())
  userId                String  @unique @map("user_id")
  newLeadEmail          Boolean @default(true) @map("new_lead_email")
  newLeadPush           Boolean @default(true) @map("new_lead_push")
  followUpEmail         Boolean @default(true) @map("follow_up_email")
  followUpPush          Boolean @default(true) @map("follow_up_push")
  newEmailPush          Boolean @default(true) @map("new_email_push")
  taskDueEmail          Boolean @default(true) @map("task_due_email")
  taskDuePush           Boolean @default(true) @map("task_due_push")
  taskOverdueEmail      Boolean @default(true) @map("task_overdue_email")
  weeklySummaryEmail    Boolean @default(true) @map("weekly_summary_email")
  user                  User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("notification_preferences")
}
```

### UI:
- Group by category (Leads, Email, Tasks, Reports)
- Each row: label + description + toggle switches
- Save auto-saves on toggle (no save button needed)
- Note: "Push notifications require browser permission" with enable button

---

## Section 4: Working Hours (`/settings/hours`)

### Schedule Grid:
| Day | Active | Start | End |
|---|---|---|---|
| Monday | ✅ | 9:00 AM | 6:00 PM |
| Tuesday | ✅ | 9:00 AM | 6:00 PM |
| Wednesday | ✅ | 9:00 AM | 6:00 PM |
| Thursday | ✅ | 9:00 AM | 6:00 PM |
| Friday | ✅ | 9:00 AM | 6:00 PM |
| Saturday | ✅ | 10:00 AM | 3:00 PM |
| Sunday | ❌ | — | — |

### Features:
- Toggle each day on/off
- Time pickers for start/end
- Timezone selector dropdown
- "Copy to all weekdays" button
- Used for: auto-responder hours, snooze defaults, showing availability

### Storage:
```prisma
model WorkingHours {
  id        String  @id @default(uuid())
  userId    String  @unique @map("user_id")
  timezone  String  @default("America/New_York")
  schedule  Json    // { mon: { active: true, start: "09:00", end: "18:00" }, ... }
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("working_hours")
}
```

---

## Section 5: Team Members (`/settings/team`)

### Team List:
Table showing all team members:
| Name | Email | Role | Status | Actions |
|---|---|---|---|---|
| Nathan Tondow | ntondow@gmail.com | Admin | Active | Edit, Remove |

### Invite Member:
- "Invite Team Member" button → modal
- Fields: email, role (Admin, Agent, Viewer)
- Sends invite email (or for now, just creates the user)

### Roles:
- **Admin**: full access to all settings, can manage team
- **Agent**: can manage own contacts, deals, emails. Cannot change settings.
- **Viewer**: read-only access to dashboards and reports

### Storage:
Add to User model:
```prisma
role      String  @default("admin") // "admin", "agent", "viewer"
teamId    String? @map("team_id")
invitedBy String? @map("invited_by")
```

---

## Section 6: Lead Assignment Rules (`/settings/lead-rules`)

### Assignment Methods:
- **Round Robin**: new leads distributed evenly across agents
- **By Source**: StreetEasy leads → Agent A, Zillow → Agent B
- **By Geography**: Brooklyn leads → Agent A, Manhattan → Agent B
- **Manual**: all leads go to inbox, manually assign

### UI:
- Method selector (radio buttons with descriptions)
- If Round Robin: show agent order (drag to reorder)
- If By Source: mapping table (source → agent dropdown)
- If By Geography: mapping table (borough/neighborhood → agent dropdown)

### Storage:
```prisma
model LeadAssignmentRule {
  id          String  @id @default(uuid())
  orgId       String  @map("org_id")
  method      String  @default("manual") // "round_robin", "by_source", "by_geography", "manual"
  rules       Json?   // { "streeteasy": "agent-uuid-1", "zillow": "agent-uuid-2" }
  agentOrder  Json?   @map("agent_order") // ["agent-uuid-1", "agent-uuid-2"] for round robin
  lastAssigned String? @map("last_assigned") // last agent assigned (for round robin)
  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@unique([orgId])
  @@map("lead_assignment_rules")
}
```

---

## Section 7: Pipeline Settings (`/settings/pipeline`)

### Customize Pipeline Stages:
Drag-and-drop list of deal stages:
1. 🔵 New Lead (default)
2. 🟡 Contacted
3. 🟠 Showing Scheduled
4. 🟣 Application Submitted
5. 🟢 Approved
6. 💚 Lease Signed
7. ❌ Lost/Closed

### Features:
- Drag to reorder stages
- Edit stage name and color
- Add new stage (name + color picker)
- Delete stage (with confirmation: "Move X deals to which stage?")
- Default stage for new deals selector

### Storage:
Already have PipelineStage model — enhance with:
```prisma
color     String  @default("#3B82F6")
icon      String? // emoji
isDefault Boolean @default(false) @map("is_default")
```

---

## Section 8: AI Settings (`/settings/ai`)

### AI Auto-Response:
- **Enable/Disable** toggle
- **Mode**: 
  - Draft Only (AI writes draft, you review before sending)
  - Auto-Send (AI sends immediately for low-urgency, drafts for high-urgency)
  - Off
- **Response delay**: how long to wait before AI responds (0min, 5min, 15min, 30min)
  - Helps avoid looking like a bot
- **Tone**: Professional, Friendly, Casual (dropdown)
- **Custom instructions**: textarea for special instructions
  - Example: "Always mention that I specialize in Brooklyn rentals. Never discuss pricing over email."

### AI Parsing:
- **Auto-parse inbound emails**: toggle (on/off)
- **Auto-categorize emails**: toggle
- **Parse model**: Claude Sonnet (default) or Claude Haiku (cheaper, less accurate)

### Storage:
```prisma
model AiSettings {
  id                  String  @id @default(uuid())
  orgId               String  @unique @map("org_id")
  autoResponseEnabled Boolean @default(false) @map("auto_response_enabled")
  autoResponseMode    String  @default("draft") // "draft", "auto_send", "off"
  responseDelay       Int     @default(5) @map("response_delay") // minutes
  responseTone        String  @default("professional") @map("response_tone")
  customInstructions  String? @map("custom_instructions") @db.Text
  autoParseEmails     Boolean @default(true) @map("auto_parse_emails")
  autoCategorize      Boolean @default(true) @map("auto_categorize")
  parseModel          String  @default("sonnet") @map("parse_model") // "sonnet", "haiku"
  organization        Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@map("ai_settings")
}
```

---

## Section 9: Branding (`/settings/branding`)

### Brand Settings:
- **Logo upload**: square logo for emails and client-facing materials
- **Primary color**: color picker (used in email templates, signature)
- **Company name**: text input
- **Tagline**: text input (optional)
- **Website URL**: text input

### Preview:
Live preview of how branding appears in:
- Email signature
- Email templates
- Listing alerts

### Storage:
```prisma
model BrandSettings {
  id           String  @id @default(uuid())
  orgId        String  @unique @map("org_id")
  logoUrl      String? @map("logo_url")
  primaryColor String  @default("#2563EB") @map("primary_color")
  companyName  String? @map("company_name")
  tagline      String?
  websiteUrl   String? @map("website_url")
  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@map("brand_settings")
}
```

---

## Section 10: Gmail Connection (`/settings/gmail`)

### Already built — enhance with:
- Show connected email address prominently
- Last sync timestamp
- "Disconnect" button with confirmation
- Sync status indicator (green dot = connected, red = error)
- OAuth token expiry info
- Re-authenticate button if token expired

---

## Section 11: Email Sync (`/settings/sync`)

### Sync Settings:
- **Auto-sync**: toggle on/off
- **Sync frequency**: Every 5 min, 15 min, 30 min, 1 hour, Manual only
- **Sync depth**: Last 7 days, 30 days, 90 days, All time
- **Sync labels**: choose which Gmail labels to sync (Inbox, Sent, All Mail)
- **Last sync**: timestamp + "Sync Now" button
- **Sync stats**: total emails synced, contacts linked, leads created

### Storage:
```prisma
model SyncSettings {
  id             String   @id @default(uuid())
  userId         String   @unique @map("user_id")
  autoSync       Boolean  @default(true) @map("auto_sync")
  syncFrequency  Int      @default(15) @map("sync_frequency") // minutes
  syncDepth      String   @default("30d") @map("sync_depth") // "7d", "30d", "90d", "all"
  syncLabels     String[] @default(["INBOX", "SENT"]) @map("sync_labels")
  lastSyncAt     DateTime? @map("last_sync_at")
  totalSynced    Int      @default(0) @map("total_synced")
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("sync_settings")
}
```

---

## Section 12: Email Templates (`/settings/templates`)

Link to the template management page built in MESSAGES_UI_SPEC.md.
Embed or redirect to the templates manager. Show template list with create/edit/delete.

---

## Section 13: API Keys (`/settings/api-keys`)

### Dashboard showing all integrations:
Card for each API with:
- Name + logo/icon
- Status: 🟢 Configured | 🔴 Not configured | 🟡 Error
- Key preview (last 4 chars only): `****N4w`
- Usage this month (if trackable)
- "Update Key" / "Configure" / "Test Connection" buttons

### APIs to show:
1. **People Data Labs (PDL)** — Skip tracing — Status based on PDL_API_KEY
2. **Apollo.io** — Professional enrichment — Status based on APOLLO_API_KEY
3. **Tracerfy** — Backup skip trace — Status based on TRACERFY_API_KEY
4. **Anthropic (Claude AI)** — Email parsing, ownership analysis — Status based on ANTHROPIC_API_KEY
5. **Gmail** — Email sync — Status based on GmailAccount record
6. **Google Calendar** — (Coming soon) — Disabled state

### "Test Connection" Button:
For each API, make a minimal test call:
- PDL: person/enrich with a known test query
- Apollo: check if key returns 200 on a basic endpoint
- Anthropic: simple completion call
- Gmail: check token validity

---

## Section 14: Data Export (`/settings/export`)

### Export Options:
Cards for each data type:

**Contacts Export:**
- Format: CSV
- Fields: all contact fields + enrichment data
- Filters: by status, source, date range, tags
- "Export" button → generates CSV → download link

**Deals Export:**
- Format: CSV
- Fields: deal name, value, stage, contact, dates
- "Export" button

**Emails Export:**
- Format: CSV
- Fields: date, from, to, subject, category, lead source
- Date range filter
- "Export" button

**Full Backup:**
- Exports everything as a ZIP with multiple CSVs
- "Download Full Backup" button

### Server Actions:
```typescript
export async function exportContacts(orgId: string, filters?: { status?: string; source?: string; dateFrom?: Date; dateTo?: Date }) {
  const contacts = await prisma.contact.findMany({ where: { orgId, ...filters } });
  // Convert to CSV string
  // Return as downloadable file
}
```

---

## UI Design Rules for All Settings Pages:

### Card Style:
```
┌─────────────────────────────────────────────┐
│ Section Title                               │
│ Brief description text in muted color       │
├─────────────────────────────────────────────┤
│                                             │
│  Form fields / content                      │
│                                             │
│                            [Save Changes]   │
└─────────────────────────────────────────────┘
```

### Form Styling:
- Labels: `text-sm font-medium text-slate-700` above input
- Inputs: `border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500`
- Toggle switches: Tailwind toggle (blue when on, gray when off)
- Descriptions: `text-xs text-slate-400` below input
- Section dividers: `border-t border-slate-100 my-6`
- Save button: `bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700`
- Destructive button: `bg-red-50 text-red-600 border border-red-200 hover:bg-red-100`

### Sidebar Nav:
- Width: 220px fixed
- Background: `bg-slate-50`
- Group headers: `text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 py-2`
- Nav items: `text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-100`
- Active: `bg-white text-blue-600 font-medium shadow-sm border border-slate-200`
- Icons: emoji or Lucide icons, 16px, before text

---

## Build Order:
1. DB: Add all new models and fields (migrate)
2. Layout: Create settings layout with sidebar nav
3. Profile page with form + save
4. Email signature builder with templates
5. Notification preferences with toggles
6. Working hours schedule grid
7. Team members list + invite
8. Lead assignment rules
9. Pipeline stage customization
10. AI settings with toggles
11. Branding with color picker + logo upload
12. Gmail connection (enhance existing)
13. Sync settings
14. Templates (link to existing)
15. API keys dashboard with test connections
16. Data export with CSV generation

## Important Reminders:
- All exported functions in "use server" files must be async (Next.js 16)
- Serialize dates with JSON.parse(JSON.stringify()) when passing Server→Client
- Use Tailwind for ALL styling
- Keep existing Gmail connection functionality — enhance it
- Settings sidebar should highlight the active section
- Each section auto-saves or has explicit Save button (prefer explicit Save for forms, auto-save for toggles)
- URL pattern: /settings/[section] — use Next.js dynamic routes or separate page files
