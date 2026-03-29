# VettdRE AI Leasing Agent — Product Design Deep-Dive

> **Purpose:** Make the AI Leasing Agent the perfect product across every user type, with a free tier that hooks tiny landlords and organic upgrade paths that grow with them.

> **Last updated:** March 2026

---

## THE USER SPECTRUM

Understanding who uses this at each tier is critical to designing the right product.

### Persona 1: "Dave the Day-Job Landlord" (Free Tier Target)
- Owns 3-20 units across 1-3 buildings (inherited, invested, house-hacked)
- Has a day job — landlording is side income
- Currently: posts on Craigslist/StreetEasy, puts cell number, responds when he can
- Pain: misses texts, returns calls 4-8 hours late, loses prospects to faster landlords
- Tech comfort: uses iPhone, Venmo, maybe a spreadsheet for rent tracking
- Has never heard of a CRM or BMS
- Budget: $0. Absolutely will not pay for software until he feels the pain of NOT having it
- **What "perfect" means:** AI answers his phone/texts so he doesn't lose tenants while at work

### Persona 2: "Maria the Growing Manager" (Free → Pro Upgrade)
- Manages 20-80 units for herself and a few owners
- Has a part-time super, handles leasing herself
- Currently: StreetEasy, Apartments.com, personal phone + a Google Voice number
- Pain: busy season (May-September) is overwhelming — 30+ inquiries/week, can't keep up
- Tech comfort: uses Google Workspace, has tried AppFolio or Buildium
- Budget: will pay if ROI is obvious
- **What "perfect" means:** handles the flood during busy season, books showings on her calendar

### Persona 3: "Nathan the Broker" (Pro/Team)
- Runs a brokerage with exclusive listings and lease-ups
- Has agents, uses BMS for deal tracking
- Currently: agents respond when they feel like it, no consistency
- Pain: paying agents to answer "do you have a 2BR?" instead of closing deals
- Tech comfort: high — already using VettdRE
- Budget: ROI-driven, will pay $149-399/building without blinking
- **What "perfect" means:** AI is his leasing team's first line, agents only touch qualified leads

### Persona 4: "Apex Development Group" (Team/Enterprise)
- Developer with 200-1,000+ unit lease-up
- Has marketing budget, leasing team, maybe already uses EliseAI
- Currently: paying $2,000-5,000/month for AI leasing tools + PMS integration
- Pain: slow implementation, rigid systems, expensive per-unit pricing
- **What "perfect" means:** faster setup, lower cost, better AI, no PMS lock-in

---

## THE FREE TIER: DESIGNED FOR DAVE

Everything about the free tier should feel like magic to someone who's never used any tool beyond their phone.

### Onboarding: "3 Minutes to Magic"

**Step 1: Sign Up (30 seconds)**
- Email + password. That's it.
- No company name, no subscription selection, no credit card
- Skip the dashboard — go straight to the leasing setup wizard

**Step 2: Add Your Property (60 seconds)**

This is the critical design moment. Dave doesn't have "listings" in a "BMS." He has apartments he needs to rent.

```
┌─────────────────────────────────────────────────┐
│  Let's set up your AI leasing agent             │
│                                                 │
│  What's the address of your building?           │
│  ┌─────────────────────────────────────────┐    │
│  │ 847 Ocean Parkway, Brooklyn             │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  How many units do you have available?           │
│  ┌─────────────────────────────────────────┐    │
│  │ 3                                       │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Tell us about them:                            │
│  ┌─────────────────────────────────────────┐    │
│  │ Unit 2B · 1BR · $2,200/mo · Available now│   │
│  │ Unit 4A · 2BR · $2,800/mo · Available now│   │
│  │ Unit 6C · Studio · $1,600/mo · April 1   │   │
│  │ [+ Add another unit]                     │   │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Quick details about the building:              │
│  ☑ Laundry in building   ☐ Doorman             │
│  ☑ Pets allowed          ☐ Gym                  │
│  ☑ Near subway           ☐ Parking              │
│  ☐ Elevator              ☐ Roof deck            │
│  ☐ Dishwasher            ☐ In-unit W/D          │
│                                                 │
│  Anything else the AI should know?              │
│  ┌─────────────────────────────────────────┐    │
│  │ Heat and hot water included. No smoking. │    │
│  │ Guarantors accepted. Close to F and Q    │    │
│  │ trains.                                  │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│                          [Set Up My AI Agent →] │
└─────────────────────────────────────────────────┘
```

Key design decisions:
- **Address auto-complete** (Google Places or NYC-specific) — validates it's a real building
- **Unit entry is dead simple** — unit number, beds, price, available date. Nothing else required.
- **Amenity checklist, not free text** — Dave doesn't have to think about what to write
- **"Anything else" free text** — catches the stuff checklists miss (included utilities, house rules, transit)
- **No photos required** — nice to have, not a blocker
- **No floor plans, no square footage, no building class** — Dave doesn't know or care

**What happens behind the scenes:**
- Create Organization (if new user)
- Create BmsProperty from address
- Create BmsListings from unit entries
- Auto-generate building knowledge object from amenities + notes
- If NYC address: auto-enrich with PLUTO data (year built, building class, units) — Dave doesn't see this but the AI uses it
- Provision a Twilio number (from a pool of pre-purchased numbers)
- Generate system prompt with building-specific knowledge

**Step 3: Your AI is Live (30 seconds)**

```
┌─────────────────────────────────────────────────┐
│  ✅ Your AI leasing agent is ready!              │
│                                                 │
│  Your leasing number:                           │
│  📱 (929) 555-0147         [Copy Number]        │
│                                                 │
│  Put this number on your listings and your      │
│  AI will handle inquiries 24/7.                 │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │  Want to see it in action?               │   │
│  │                                          │   │
│  │  Text "Hi, do you have any apartments    │   │
│  │  available?" to (929) 555-0147           │   │
│  │                                          │   │
│  │  [Send me a test text →]                 │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  Or try these on your listings:                 │
│  ┌──────────────────────────────────────────┐   │
│  │  StreetEasy listing text:                │   │
│  │  "Contact: (929) 555-0147"               │   │
│  │                                  [Copy]  │   │
│  ├──────────────────────────────────────────┤   │
│  │  Craigslist posting text:                │   │
│  │  "Text or call (929) 555-0147 for info   │   │
│  │  and to schedule a showing"              │   │
│  │                                  [Copy]  │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  Free plan: 25 messages/day across all units    │
│  That's about 4-6 conversations per day         │
└─────────────────────────────────────────────────┘
```

**The "Send me a test text" button is the most important element on this page.** It triggers the AI to text Dave's phone with a simulated prospect inquiry. Dave sees the AI respond to HIS building, with HIS units and prices, in real-time. This is the magic moment.

Test conversation flow:
1. VettdRE AI texts Dave: "Hey! I saw your listing for 847 Ocean Parkway. Do you have any 1-bedrooms available?"
2. Dave watches the AI respond (from the dashboard or from his phone if he texts the number)
3. AI responds: "Hi! Yes, we have a beautiful 1-bedroom — Unit 2B — available now at $2,200/month. The building has in-building laundry and is just a few minutes from the F and Q trains. Heat and hot water are included. Would you like to schedule a visit?"
4. Dave's jaw drops. He puts the number on his Craigslist posting.

### What Dave Sees Day-to-Day

Dave should NOT need to log into VettdRE to get value. The AI handles everything via SMS. But when he does check in, he sees:

**Conversation Feed (the home screen)**
```
┌─────────────────────────────────────────────────┐
│  AI Leasing Agent            25 messages left    │
│  847 Ocean Parkway           today               │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ 🟢 Sarah M. — Unit 2B           11:42 PM│    │
│  │ "What time works for a showing?"          │    │
│  │ AI: Offered Wed 5pm, Thu 6pm, Sat 11am   │    │
│  │ Status: Showing booked (Thu 6 PM)         │    │
│  └──────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────┐    │
│  │ 🟡 James K. — Studio             9:15 PM│    │
│  │ "Is the studio still available?"          │    │
│  │ AI: Responded with details, asked budget  │    │
│  │ Status: Qualifying                        │    │
│  └──────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────┐    │
│  │ 🔴 Mike T. — General             3:22 PM│    │
│  │ "I had an eviction, is that ok?"          │    │
│  │ AI: Escalated to you                      │    │
│  │ Status: Needs your response     [Reply →] │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

Key design:
- **Traffic light status:** Green = AI handled it, Yellow = in progress, Red = needs human
- **Dave only needs to act on red items** — everything else is handled
- **One-tap reply** for escalated conversations — Dave responds from the VettdRE app, sent via the AI's Twilio number (not Dave's personal phone)
- **Message counter** visible but not alarming — shows remaining for today

### What Dave Gets for Free (That He Can't Get Anywhere Else)

1. **24/7 responses** — his listings finally work at 11 PM on Sunday
2. **Professional first impression** — AI writes better than Dave does
3. **Automatic qualification** — AI asks about budget, timeline, household before Dave has to
4. **Showing suggestions** — AI suggests times (Dave sets availability windows), prospect picks
5. **No personal phone exposure** — listings show the Twilio number, not Dave's cell
6. **Conversation transcripts** — Dave can read every exchange, see what prospects asked
7. **Basic notifications** — push notification when AI escalates something to Dave

### What Dave DOESN'T Get (Upgrade Triggers)

These are things Dave will naturally want as he uses the free tier:

| What He Wants | Why He Wants It | Which Tier Has It |
|--------------|----------------|-------------------|
| More than 25 messages/day | Hit the cap during busy season | Pro |
| Email channel | Wants AI to handle StreetEasy email inquiries too | Pro |
| Auto-book showings | Tired of confirming times manually | Pro |
| Follow-up sequences | Prospects go cold, AI could re-engage them | Pro |
| Multiple buildings | Bought another property, wants AI on both | Pro (10 buildings) |
| Analytics | Wants to know which listing platform brings the best leads | Pro |
| Custom AI personality | Wants it to sound more like him | Team |
| Voice calls | Wants AI to answer phone calls | Team |
| Spanish/other languages | His building is in a diverse neighborhood | Team |

The genius of this: **Dave doesn't know he wants these things until he's been using the free tier for 2-3 weeks.** He discovers the need organically. The upgrade isn't a sales pitch — it's Dave realizing "I wish it could also do X" and seeing that X is one click away.

---

## MAKING THE AI ACTUALLY PERFECT

The AI quality is the entire product. If it sends one bad response, Dave pulls the number off his listings. Here's what "perfect" means:

### Intelligence Level 1: Tiny Landlord (Minimal Knowledge Input)

The AI must be excellent even when Dave gives it almost nothing. From the onboarding wizard, the AI might only know:
- Address: 847 Ocean Parkway, Brooklyn
- 3 units: 1BR/$2,200, 2BR/$2,800, Studio/$1,600
- Amenities: laundry, pets ok, near subway
- Notes: "Heat and hot water included. No smoking."

**What the AI must handle perfectly with just this:**

| Prospect Question | AI Response Quality |
|------------------|-------------------|
| "Do you have any apartments available?" | Lists all 3 units with prices. Asks what size they need. |
| "How much is the 1-bedroom?" | "$2,200/month, heat and hot water included." |
| "Are pets allowed?" | "Yes! We're pet-friendly. Do you have a dog or cat? What size?" |
| "Where is it?" | "847 Ocean Parkway in Brooklyn, close to the F and Q subway lines." Uses PLUTO enrichment to add: "It's a [X]-story building built in [year], in the Kensington neighborhood." |
| "Can I see it?" | "Absolutely! When works for you? I have availability [suggests times from Dave's settings]." |
| "What's the neighborhood like?" | Uses census/location data: "Kensington is a diverse, family-friendly neighborhood. You're a short walk from Prospect Park, and the F train gets you to Manhattan in about 30 minutes." (Fair Housing compliant — factual, no steering) |
| "Is there parking?" | "The building doesn't have dedicated parking, but there's street parking in the area. Want me to check on nearby garage options?" |
| "What's the lease term?" | AI doesn't know → "Leases are typically 12 months, but I'll confirm the details for you. When would you be looking to move in?" (Graceful handling of unknown info — makes reasonable assumption, promises to confirm, pivots to qualification) |
| "I had an eviction 2 years ago" | **ESCALATE** — "I appreciate you being upfront about that. Let me connect you with the landlord directly — they can discuss your specific situation. They'll reach out shortly." |
| "Can you do $2,000 on the 1-bedroom?" | **ESCALATE** — "I understand budget is important. Let me pass your interest along to the landlord so they can discuss options with you directly." |

**The key principle: the AI should never make something up, but it should never leave a prospect hanging either.** For unknowns, it gives the most reasonable default, flags that it will confirm, and keeps the conversation moving toward a showing.

### Auto-Enrichment (NYC Properties)

For NYC addresses, the AI silently enriches its knowledge:

**From PLUTO (automatic, free):**
- Year built, building class, number of floors, total units
- Zoning (residential, mixed-use)
- Borough, neighborhood name
- Lot size, building dimensions

**From Transit Data (automatic, free):**
- Nearest subway stations and lines
- Walking distance/time to each
- Bus routes

**From Census/Neighborhood (automatic, free):**
- Neighborhood name and general character
- Proximity to parks, schools (factual, not steering)
- Walk Score, Transit Score

**From HPD (automatic, free):**
- Violation history (AI won't volunteer this, but if asked "are there violations?" it can be honest)
- Rent stabilization status (important for legal compliance)

**Result:** Dave enters "847 Ocean Parkway" and the AI knows:
- It's a 6-story, 48-unit pre-war elevator building in Kensington
- Built in 1929, zoned R7-1
- 4-minute walk to the F train (Church Ave), 7 minutes to Q train
- Near Prospect Park (0.5 miles)
- Building has 12 open HPD violations (3 Class B)
- 38 rent-stabilized units

Dave didn't enter any of this. The AI just knows it. **This is the competitive moat.** No other AI leasing tool has this data layer because they're all built on top of PMS systems, not property intelligence platforms.

### Intelligence Level 2: Broker with Building Knowledge Base (Pro)

When a broker sets up the building knowledge base, the AI becomes a true leasing expert:

```json
{
  "building": {
    "name": "Sky Three Residences Club",
    "address": "532 Neptune Ave, Brooklyn, NY 11224",
    "type": "New Construction Luxury Rental",
    "totalUnits": 499,
    "floors": 30,
    "developer": "Shuster Group",
    "yearBuilt": 2025,
    "neighborhood": "Coney Island / Gravesend"
  },
  "amenities": {
    "building": [
      "24-hour concierge and doorman",
      "Rooftop pool and sun deck (30th floor)",
      "State-of-the-art fitness center with Peloton bikes",
      "Residents' lounge with billiards and coworking space",
      "Children's playroom",
      "Pet spa and dog run",
      "Package room with cold storage",
      "Bicycle storage",
      "On-site parking garage",
      "EV charging stations"
    ],
    "inUnit": [
      "In-unit washer/dryer",
      "Central AC",
      "Floor-to-ceiling windows",
      "Quartz countertops",
      "Stainless steel appliances",
      "Hardwood floors throughout",
      "Walk-in closets in bedrooms",
      "Smart lock entry"
    ]
  },
  "pricing": {
    "studios": { "min": 2200, "max": 2800 },
    "oneBed": { "min": 2800, "max": 3600 },
    "twoBed": { "min": 3400, "max": 4800 },
    "threeBed": { "min": 4200, "max": 6500 }
  },
  "concessions": {
    "active": true,
    "offers": [
      {
        "description": "1 month free on 14-month leases",
        "validUntil": "2026-04-30",
        "canAIMention": true,
        "whenToMention": "after_price_objection"
      },
      {
        "description": "Application fee waived for showings this week",
        "validUntil": "2026-03-15",
        "canAIMention": true,
        "whenToMention": "when_booking_showing"
      }
    ]
  },
  "policies": {
    "pets": {
      "allowed": true,
      "restrictions": "Dogs and cats. Dogs up to 50 lbs. Max 2 pets per unit.",
      "deposit": "$500 one-time pet deposit",
      "monthlyFee": "$50/month per pet"
    },
    "income": "Combined gross income must be 40x monthly rent, or guarantor with 80x",
    "creditScore": "Minimum 650 preferred, evaluated case-by-case",
    "guarantors": "Accepted. Must be US-based with 80x income requirement.",
    "smoking": "No smoking. Building is entirely smoke-free.",
    "subletting": "Not permitted.",
    "leaseTerms": ["12 months", "14 months (with concession)"],
    "moveInCosts": "First month, security deposit (1 month), broker fee (if applicable)"
  },
  "transit": {
    "subway": [
      { "line": "F", "station": "Neptune Ave", "walk": "2 minutes" },
      { "line": "D/N/Q", "station": "Coney Island - Stillwell Ave", "walk": "10 minutes" }
    ],
    "bus": ["B36", "B68", "B74"],
    "commute": {
      "downtown_manhattan": "40 minutes via F train",
      "midtown": "50 minutes via F train",
      "downtown_brooklyn": "25 minutes via F train"
    }
  },
  "neighborhood": {
    "description": "Oceanfront living with direct beach access. Growing restaurant and retail scene along Neptune and Mermaid Avenues.",
    "highlights": [
      "Steps from Coney Island beach and boardwalk",
      "MCU Park (Brooklyn Cyclones) across the street",
      "Luna Park and NY Aquarium within walking distance",
      "Growing dining scene with new restaurants",
      "Direct F train to Manhattan"
    ]
  },
  "competitors": [
    {
      "name": "The Oceana Condominium",
      "proximity": "0.3 miles",
      "type": "Condo (not rental)",
      "ourAdvantage": "We're a rental — no purchase required, flexible lease terms"
    },
    {
      "name": "Surf Avenue rentals",
      "proximity": "0.5 miles",
      "type": "Older rental buildings",
      "ourAdvantage": "New construction, modern finishes, full amenity package they don't have"
    }
  ],
  "sellingPoints": {
    "primary": "Brand new luxury building with resort-style amenities, steps from the beach, with in-unit W/D and F train access",
    "forYoungProfessionals": "F train to Midtown in under an hour, coworking lounge, rooftop pool, vibrant neighborhood",
    "forFamilies": "Children's playroom, proximity to parks and beach, safe quiet residential area, spacious 2-3BR layouts",
    "forDownsizers": "Luxury finishes, concierge service, pet-friendly, no maintenance responsibilities",
    "valueProposition": "Get Manhattan-quality finishes and amenities at Brooklyn pricing, with beach access you can't get anywhere else in the city"
  },
  "faq": [
    {
      "question": "Is there a broker fee?",
      "answer": "For many of our units, there is no broker fee. For units with a broker fee, it's typically one month's rent. I can let you know the specifics for any unit you're interested in."
    },
    {
      "question": "When is the building open for tours?",
      "answer": "We offer tours 7 days a week. Weekdays 9 AM - 7 PM, weekends 10 AM - 5 PM. We can also accommodate evening appointments by request."
    },
    {
      "question": "Is the building finished?",
      "answer": "Yes! The building is brand new and fully complete. Residents are already moving in and enjoying all the amenities."
    },
    {
      "question": "What floor will I be on?",
      "answer": "We have units available on various floors. Higher floors offer ocean and city views at a premium. I can show you options on the floors you prefer."
    }
  ],
  "escalation": {
    "priceNegotiation": true,
    "priorEviction": true,
    "legalQuestions": true,
    "complexGuarantor": true,
    "angryProspect": true,
    "requestForHuman": true,
    "applicationStatus": true,
    "maintenanceIssues": true
  }
}
```

With this knowledge base, the AI goes from "helpful apartment answering machine" to "the best leasing agent at the building" — it knows every amenity, every policy, every competitive differentiator, and when to use each one.

### Intelligence Level 3: AI That Learns (Team)

At the Team tier, the AI gets smarter over time:

**Conversation Pattern Analysis:**
- What questions get asked most? → Surface to landlord as FAQ gaps
- What objections come up repeatedly? → Suggest knowledge base additions
- Which responses lead to showings vs. drop-offs? → Optimize messaging
- What time of day gets the most inquiries? → Show to landlord for planning

**Follow-Up Optimization:**
- Track which follow-up messages get responses vs. ignored
- Adjust timing and content based on what works for THIS building
- Different cadences for different prospect types (hot lead = faster, browser = slower)

**Cross-Building Intelligence (Aggregate):**
- Anonymous benchmarking: "Your response rate is 89% — top 10% of similar buildings"
- Conversion insights: "Buildings with your amenity profile see highest conversion from [channel]"
- Pricing intelligence: "Similar 2BRs in your area are listed at $X-Y" (VettdRE already has this data)

---

## CRITICAL PRODUCT DETAILS

### Message Counting (Free Tier)

**What counts as a message:**
- Each SMS segment sent by AI = 1 message
- Each SMS segment received from prospect = 1 message
- System messages (showing confirmations, reminders) = 1 message each

**What does NOT count:**
- Dave's manual replies to escalated conversations (those are his texts, not AI)
- Internal notifications to Dave (push notifications, emails about escalations)
- The test conversation during onboarding

**Why count both inbound and outbound:**
- Simpler to explain ("25 messages per day")
- Prevents abuse (someone scripting inbound spam)
- A conversation is ~6 messages total, so 25 = ~4 conversations. Clear enough.

**When you hit the limit:**
```
┌─────────────────────────────────────────────────┐
│  ⚡ You've used 25/25 messages today             │
│                                                  │
│  Your AI will resume tomorrow at midnight.       │
│                                                  │
│  Want unlimited messages?                        │
│  Upgrade to Pro — $149/building/month            │
│  [Upgrade Now] [Remind Me Tomorrow]              │
│                                                  │
│  In the meantime, 2 prospects are waiting:       │
│  • Sarah M. asked about Unit 2B                  │
│  • James K. asked about the studio               │
│  [Reply manually →]                              │
└─────────────────────────────────────────────────┘
```

**The prospect gets this if they text after the limit:**
Nothing. The message goes to a queue. When the limit resets at midnight, the AI processes queued messages in order. Prospect sees the AI respond first thing in the morning.

**Alternative: burst allowance.** Consider allowing 5 "emergency" messages beyond the 25 limit, deducted from the next day's allocation. This prevents the worst case: a hot lead texts at 11 PM and gets nothing. But keep it simple for v1.

### Twilio Number Management

**Free tier:**
- 1 Twilio number from a pre-purchased pool
- Local area code when possible (718/347/917 for NYC)
- Number shared across all of Dave's buildings (up to 3)
- If Dave churns, number returns to pool after 30 days

**Pro tier:**
- 1 dedicated number per building
- Can port existing number in (landlords who already have a Google Voice leasing number)
- Vanity number options (future)

**Cost management:**
- Twilio number: ~$1.15/month
- SMS: $0.0079/segment sent, $0.0075/segment received
- At 25 messages/day = ~$6/month per active free user
- At 500 messages/day = ~$120/month per active Pro building (covered easily by $149 price)

### Showing Scheduling

**Free tier: "Suggest and Confirm"**
Dave sets available time windows (e.g., "Weekday evenings 5-8 PM, Saturday mornings 10 AM-1 PM"):

```
Prospect: "Can I come see the apartment?"
AI: "Of course! I have availability this Thursday between 5-8 PM 
     or Saturday morning. What works for you?"
Prospect: "Thursday at 6 works"
AI: "I'll pencil you in for Thursday at 6 PM at 847 Ocean Parkway.
     I'll confirm the appointment shortly!"
```
→ Dave gets a notification: "Sarah M. wants to see Unit 2B at Thursday 6 PM. [Confirm] [Suggest Different Time]"
→ Dave taps Confirm → AI texts prospect: "You're confirmed for Thursday at 6 PM!"

**Pro tier: "Auto-Book"**
AI reads Dave's Google Calendar, knows his real availability, books directly:

```
Prospect: "Can I come see the apartment?"
AI: "Absolutely! I have the following times available:
     • Wednesday 5:30 PM
     • Thursday 6:00 PM  
     • Saturday 11:00 AM
     Which works best for you?"
Prospect: "Thursday 6"
AI: "You're all set! Thursday at 6 PM at 847 Ocean Parkway, Apt 2B.
     You'll be meeting with Dave. 
     
     📍 847 Ocean Parkway, Brooklyn NY 11218
     🚇 F train to Church Ave (4 min walk)
     📋 Bring: photo ID and proof of income
     
     I'll send you a reminder Thursday morning. See you then!"
```
→ Calendar event auto-created, reminder auto-scheduled, no Dave interaction needed

### Escalation Flow

When the AI can't or shouldn't handle something, it needs to hand off cleanly.

**What gets escalated (free tier):**
- Price negotiation
- Prior eviction or complex background
- Legal questions (lead paint, lease terms specifics)
- Angry or threatening messages
- Explicit request for a human
- Application questions
- Maintenance issues (current tenant)
- Anything the AI isn't confident about

**How escalation works:**

1. AI responds to prospect: "That's a great question — let me connect you with the landlord directly. They'll get back to you shortly."
2. AI texts Dave: "🔴 New escalation from Sarah M. about Unit 2B. She's asking about negotiating the rent. Here's the conversation so far: [summary]. Reply here to respond."
3. Dave replies via VettdRE (or via SMS to the VettdRE number with a special prefix) → response sent to prospect from the AI's number
4. When Dave resolves it, he marks it done → AI resumes handling that prospect

**Key principle: the prospect never knows they were talking to an AI and then a human.** The number doesn't change. The conversation is seamless.

### Notifications

**Free tier — essential only:**
- Push notification on escalation (🔴 — needs your response)
- Daily summary email at 8 AM: "Yesterday, your AI handled 4 conversations. 1 showing booked, 1 needs your response."
- Weekly summary: conversations, showings, message usage

**Pro tier — adds:**
- Real-time notifications for new conversations
- Showing confirmations and cancellations
- Follow-up status updates
- "You're at 80% of your daily limit" warning

**Team tier — adds:**
- Agent assignment notifications
- Lead score alerts (hot lead notification)
- Conversation sentiment alerts (unhappy prospect)
- Performance reports

---

## THE UPGRADE JOURNEY

### How Dave Goes from Free → Pro

**Week 1:** Dave sets up, tests it, puts the number on one Craigslist listing. Gets 2-3 conversations. Amazed it works.

**Week 2-3:** Puts number on all his listings. Getting 3-5 conversations/day. Well within the 25 message limit. Two showings booked. He confirmed them manually — took 30 seconds each. Fine.

**Week 4-6:** A unit turns over. Dave posts it everywhere. Suddenly getting 6-8 conversations/day. Hits 25 message limit on a Tuesday. Gets the upgrade prompt but ignores it. Next day, 3 prospects who texted after the limit get delayed responses. One of them found another apartment.

**Week 7:** Dave hits the limit again. This time, a Saturday afternoon — peak inquiry time. He realizes he's losing leads. Sees the upgrade prompt: "$149/month. Unlimited messages. AI books showings on your calendar automatically."

**Dave's internal math:** "I charge one month's rent as a broker fee. That's $2,200 on the 1-bedroom. If this thing helps me fill one vacancy even one week faster, it pays for itself for 15 months."

**Dave upgrades.**

### How Maria Goes from Pro → Team

**Month 1-3:** Maria manages 3 buildings on Pro ($149 × 3 = $447/month). AI handles 80% of inquiries. She's saving 15+ hours/week. Life-changing.

**Month 4:** Busy season hits. She's getting 50+ inquiries/day across all buildings. Email inquiries from StreetEasy are piling up because she's only on SMS + email (Pro). She wants the AI to answer phone calls too — she's still getting 10+ calls/day that go to voicemail.

**Month 5:** She takes on 2 more buildings from a landlord friend. Now managing 5. She wants all 5 on the AI but Pro caps at 10 buildings. Fine for now. But she wants:
- Voice channel (stop losing phone-call leads)
- Spanish language (one of her buildings is in Washington Heights)
- Round-robin assignment (she hired a part-time assistant, wants leads distributed)

**Maria upgrades to Team ($399 × 5 = $1,995/month).** Still less than a full-time leasing coordinator ($3,500+/month), and the AI works 24/7.

---

## MAKING THE FREE TIER MAGNETIC

### For Marketing Purposes

The free tier isn't just a product — it's a marketing tool. Here's how to make it magnetic:

**"Put this number on your Craigslist listing" campaign:**
- Target: NYC landlords posting on Craigslist (we can identify them)
- Message: "Your Craigslist listing gets 50 texts. You respond to 10. We respond to all of them. Free."
- CTA: Sign up, get your AI number in 3 minutes, add it to your posting

**"Your StreetEasy listing is losing you money" campaign:**
- Target: Small landlords with StreetEasy listings
- Message: "You're paying $X/month for StreetEasy leads. 57% of them come in after hours. Who's answering?"
- CTA: Free AI leasing agent that responds 24/7

**"The landlord's answering machine" positioning:**
- Not "AI" — that scares some landlords
- It's "an answering service that texts back for you"
- Like a virtual assistant, but free and instant

**Reddit / BiggerPockets / landlord forums:**
- "I set up a free AI to answer my rental listing texts. Here's what happened."
- Genuine case study from Nathan's properties
- Not an ad — a real experience post with the signup link at the end

### Word-of-Mouth Mechanics

The free tier should be so good that Dave tells other landlords about it. Design for this:

1. **Shareable moment:** When AI books a showing at 11 PM, Dave screenshots the conversation and texts it to his landlord friends. This is the viral loop.

2. **Referral nudge:** After Dave's first week: "Know any landlords who could use an AI leasing agent? Share your link and you both get 10 extra messages/day for a month."

3. **Landlord community integration:** Post in NYC landlord Facebook groups, BiggerPockets NYC forums, local real estate investment clubs.

4. **Building super network:** Supers know every landlord in the neighborhood. Give them a referral incentive.

---

## TECHNICAL IMPLICATIONS FOR VettdRE

### What Needs to Exist in VettdRE for This to Work

**Already built (just need wiring):**
- BmsProperty + BmsListing (inventory)
- Contact model (CRM)
- Google Calendar integration (showing scheduling)
- Twilio integration (SMS send/receive)
- Gmail integration (email channel)
- Activity logging
- Follow-up reminders
- Lead scoring infrastructure
- Organization + User auth

**Needs to be built:**
- LeasingConversation + LeasingMessage models
- Claude API orchestrator (handleInbound)
- Building knowledge base CRUD + storage (JSON on BmsProperty or new model)
- Leasing Agent settings page (availability windows, escalation preferences)
- Conversation feed UI
- Message counter + limit enforcement
- Twilio number pool management
- Onboarding wizard
- Notification system for escalations
- Analytics dashboard

**The free tier can launch with:**
- SMS only
- 3 core tools (search_units, find_contact, send_sms)
- Basic building knowledge (from onboarding wizard)
- Manual showing confirmation
- Escalation via SMS notification to landlord
- Conversation feed with traffic light status
- NYC auto-enrichment (PLUTO)

### Data Model Additions

```prisma
model LeasingConfig {
  id              String   @id @default(uuid())
  orgId           String
  org             Organization @relation(fields: [orgId], references: [id])
  propertyId      String?
  property        BmsProperty? @relation(fields: [propertyId], references: [id])
  
  // Twilio
  twilioNumber    String   @unique
  twilioNumberSid String?
  
  // Settings
  isActive        Boolean  @default(true)
  tier            String   @default("free") // free, pro, team
  dailyMessageLimit Int    @default(25)
  messagesUsedToday Int    @default(0)
  limitResetAt    DateTime?
  
  // Availability (for showing suggestions)
  availabilityWindows Json? // [{ dayOfWeek: 0-6, startTime: "17:00", endTime: "20:00" }]
  
  // Building Knowledge
  buildingKnowledge Json?  // The full knowledge base object
  
  // AI Configuration
  aiPersonality   String   @default("professional_friendly")
  aiName          String?  // Custom name for Team tier
  systemPromptOverrides Json? // Custom rules
  
  // Channels
  smsEnabled      Boolean  @default(true)
  emailEnabled    Boolean  @default(false)
  voiceEnabled    Boolean  @default(false)
  webChatEnabled  Boolean  @default(false)
  
  // Escalation
  escalationPhone String?  // Where to send escalation notifications
  escalationEmail String?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  conversations   LeasingConversation[]
}

model LeasingConversation {
  id              String   @id @default(uuid())
  configId        String
  config          LeasingConfig @relation(fields: [configId], references: [id])
  orgId           String
  org             Organization @relation(fields: [orgId], references: [id])
  contactId       String?
  contact         Contact? @relation(fields: [contactId], references: [id])
  
  // Prospect info (before contact record exists)
  prospectPhone   String?
  prospectEmail   String?
  prospectName    String?
  
  // State machine
  state           String   @default("new_inquiry") 
  // new_inquiry, qualifying, showing_booked, showing_completed, 
  // application, closed_won, closed_lost, nurture, escalated
  
  // Qualification data (progressive)
  budget          Json?    // { min: number, max: number }
  timeline        String?  // "immediate", "30_days", "60_days", "flexible"
  household       Json?    // { adults: number, children: number, pets: [] }
  requirements    Json?    // { bedrooms: number, amenities: [], floorPref: string }
  employmentInfo  String?
  
  // Scoring
  leadScore       Int      @default(0)
  leadTemperature String   @default("cold") // hot, warm, cool, cold
  
  // Escalation
  isEscalated     Boolean  @default(false)
  escalatedAt     DateTime?
  escalationReason String?
  assignedAgentId String?
  
  // Engagement
  channel         String   @default("sms") // sms, email, voice, web_chat
  source          String?  // craigslist, streeteasy, apartments_com, direct, etc.
  interestedUnits String[] // listing IDs
  
  // Timing
  firstMessageAt  DateTime?
  lastMessageAt   DateTime?
  showingBookedAt DateTime?
  showingDate     DateTime?
  
  // Follow-up
  nextFollowUpAt  DateTime?
  followUpCount   Int      @default(0)
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  messages        LeasingMessage[]
}

model LeasingMessage {
  id              String   @id @default(uuid())
  conversationId  String
  conversation    LeasingConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  
  // Direction
  direction       String   // inbound, outbound, system
  sender          String   // prospect, ai, human (landlord/agent)
  
  // Content
  content         String   // The actual message text
  channel         String   // sms, email, voice_transcript
  
  // AI metadata
  toolsCalled     Json?    // Array of tool names + inputs + results
  modelUsed       String?  // claude-sonnet-4-5, claude-opus-4-6, etc.
  inputTokens     Int?
  outputTokens    Int?
  responseTimeMs  Int?     // Time from receipt to response sent
  
  // Delivery
  twilioMessageSid String?
  deliveryStatus  String?  // queued, sent, delivered, failed
  
  createdAt       DateTime @default(now())
}
```

---

## SUCCESS METRICS

### Free Tier
- **Activation rate:** % of signups that complete onboarding and send test text
- **7-day retention:** % of activated users whose AI handles at least 1 real conversation in week 2
- **Message utilization:** Average % of daily limit used (if low, limit might be too high; if always maxed, limit is right)
- **Escalation rate:** % of conversations requiring human intervention (target: < 20%)
- **Showing conversion:** % of conversations that result in a showing scheduled
- **NPS:** Would you recommend this to another landlord?

### Pro Tier
- **Conversion rate:** % of free users who upgrade
- **Time to upgrade:** Average days from free signup to Pro purchase
- **Upgrade trigger:** What pushed them over (message limit hit, wanted auto-booking, etc.)
- **Revenue per building:** $149 × buildings × months retained
- **Churn rate:** Monthly. Target < 5%
- **Net revenue retention:** > 110% (users add more buildings over time)

### AI Quality
- **Response accuracy:** % of AI responses rated "correct" by landlord (spot-check review)
- **Appropriate escalation:** % of escalations that were genuinely necessary
- **Conversation satisfaction:** Post-interaction prospect survey (optional, Pro+)
- **Fair Housing compliance:** 0 violations. Ever. Audit monthly.

---

## V1 LAUNCH CHECKLIST

### Must Have (Free Tier Launch)
- [ ] Onboarding wizard (address, units, amenities, notes)
- [ ] Twilio number provisioning from pool
- [ ] Claude API orchestrator with tool loop
- [ ] 3 core tools: search_units, find_contact, send_sms
- [ ] System prompt with building knowledge injection
- [ ] NYC auto-enrichment (PLUTO data for NYC addresses)
- [ ] Message counter with daily limit
- [ ] Conversation feed UI (traffic light status)
- [ ] Escalation notifications (SMS to landlord)
- [ ] Manual showing suggestion + confirmation flow
- [ ] Test conversation during onboarding
- [ ] Basic /brokerage/leasing dashboard page
- [ ] Fair Housing compliance rules in system prompt
- [ ] Graceful handling of unknown information
- [ ] Rate limiting and abuse prevention

### Should Have (Week 3-4)
- [ ] Email channel
- [ ] Auto-book showings (Google Calendar integration)
- [ ] Follow-up engine (cron job)
- [ ] Building knowledge base editor
- [ ] Analytics dashboard v1 (conversations, showings, response times)
- [ ] Upgrade prompts when hitting limits
- [ ] Conversation detail view (full transcript)

### Nice to Have (Before Public Launch)
- [ ] Referral system
- [ ] Spanish language support
- [ ] Voice channel
- [ ] ILS email parsing
- [ ] Concession management
- [ ] Cross-building intelligence
- [ ] Mobile app notifications
