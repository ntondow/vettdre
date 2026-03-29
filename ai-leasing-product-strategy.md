# VettdRE AI Leasing Agent — Product Strategy & Best Practices Playbook

> **Purpose:** Product strategy for VettdRE's AI leasing agent feature — competitive positioning, tier design, industry best practices baked into the system, and go-to-market approach.

> **Last updated:** March 2026

---

## THE OPPORTUNITY

### Market Size
- 50M rental units in the US, mostly owned by small/mid operators
- Global multifamily software market: $1.1B in 2023, projected $2.2B by 2033
- AI adoption among large operators jumped from 21% to 34% in one year (AppFolio 2025)
- 99% of multifamily operators are implementing or planning AI solutions
- Leasing staff turnover exceeds 40% industry-wide, average salary $37.5K

### The Critical Data Points That Justify This Product
- **5 minutes:** Response time threshold — conversion drops dramatically after this
- **15 minutes:** After this, you're losing deals to competitors
- **57%:** Percentage of tours booked after business hours
- **32+ days:** Average lead-to-lease cycle across the industry
- **90-97%:** Percentage of inbound messages Cortland's AI handles autonomously
- **185%:** Increase in conversion when follow-up happens within 10 minutes
- **71%:** Higher conversion rate when renters can self-schedule tours
- **5.5x:** Higher conversion rate when renters can complete applications online
- **Gen Z majority by 2030:** 50% say they'd live in a fully automated property

---

## COMPETITIVE LANDSCAPE

### The Enterprise Incumbents

| Player | Target | Pricing | Channels | Integration Required | Free Tier |
|--------|--------|---------|----------|---------------------|-----------|
| **EliseAI** | 700+ large operators (hundreds of properties each) | Per-unit/month, enterprise contracts | SMS, email, chat, phone, ILS | Yardi, RealPage, Entrata, MRI | No |
| **Funnel Leasing** | Portfolio-wide operators | Enterprise SaaS | Full lifecycle CRM | Deep PMS integration | No |
| **ResMate (Respage)** | Mid-to-large multifamily | Per-unit + flat chatbot fee | SMS, email, chat, phone, ILS, Facebook | AppFolio, Yardi, RealPage, Rent Manager | No |
| **PERQ** | Mid-market operators | SaaS | Website tools, chat, nurture | PMS integration | No |
| **Apartment List** | Owners/operators (marketplace) | Pay-per-lease | Marketplace, AI nurture | Listing platform | Marketplace listing |
| **Leasey.AI** | Operators preparing for sale | Per-unit | Full lifecycle | PMS integration | No |

### What They All Have in Common
1. **Enterprise sales cycles** — demos, contracts, implementation teams
2. **PMS dependency** — require Yardi/RealPage/Entrata integration to function
3. **Large operator focus** — built for companies managing 500-50,000+ units
4. **No self-serve** — can't sign up and start using it today
5. **No free tier** — minimum spend is hundreds/month before you send a single message
6. **Months of onboarding** — implementation, data migration, training

### THE GAP VettdRE FILLS

**There is no self-serve AI leasing agent for brokerages, small operators, or individual lease-ups.**

A broker running a 499-unit lease-up (like Sky Three), a landlord with 50 units, or a brokerage managing 10 exclusive listings has ZERO options that don't require enterprise contracts and PMS integration.

VettdRE's advantage:
- **Already has the infrastructure:** BMS listings = live inventory, CRM = contact management, Google Calendar = showing scheduling, Twilio = SMS, Gmail = email
- **Self-serve from day one:** Sign up → add listings → assign phone number → AI is live
- **No PMS required:** VettdRE IS the system of record. No integration needed.
- **Free tier:** Start using it today with real value before paying anything
- **Built by a broker, for brokers:** Not enterprise software adapted down — it's broker software with enterprise intelligence

### Positioning Statement

> "EliseAI is for operators managing 10,000 units across 50 properties. VettdRE is for the broker who just landed a 499-unit exclusive and needs an AI leasing team running by Monday."

---

## PRODUCT TIERS

### Design Principles
1. **Free tier must deliver real value** — not a demo, not a trial, not crippled. A broker with 5 listings should be able to run their leasing on the free tier indefinitely.
2. **Upgrade trigger is volume, not features** — the AI works the same at every tier. You pay when you need more capacity.
3. **Per-building pricing for the paid add-on** — aligns cost with value. A 499-unit lease-up generates more revenue than a 20-unit building.
4. **No contracts** — month-to-month. Cancel anytime. Confidence in the product.

### Tier Structure

#### Free — "Leasing Starter"
**Included with any VettdRE plan (including Free)**

| Capability | Limit |
|-----------|-------|
| AI conversations | 25 messages/day (both inbound + outbound count) |
| Buildings/properties | 3 |
| Active listings | 15 |
| Channels | SMS only (1 Twilio number) |
| Showing scheduling | Manual (AI suggests times, agent confirms) |
| Follow-up sequences | 1 follow-up per conversation |
| Conversation history | 30 days retention |
| Response personality | Standard (professional, friendly) |

**What 25 messages/day actually means:**
- A typical leasing conversation is 4-6 message exchanges (prospect sends 3, AI sends 3)
- That's roughly 4-6 complete conversations per day
- For a broker with 5-15 active listings, this handles a steady trickle of inquiries
- Enough to prove value, not enough for a lease-up with 200 inquiries/week

**Why this works as a free tier:**
- Zero cost to VettdRE: ~$0.50-1.00/day in API + Twilio costs per active user
- Prospects experience the full AI quality — not a degraded version
- Natural upgrade trigger: broker lands a bigger listing or hits the message cap during busy season
- Free users become advocates ("this thing just booked me a showing at 11 PM")

#### Pro Add-On — "Leasing Agent"
**$149/building/month** (on top of VettdRE Pro subscription)

| Capability | Limit |
|-----------|-------|
| AI conversations | 500 messages/day per building |
| Buildings/properties | 10 |
| Active listings | Unlimited per building |
| Channels | SMS + Email + Web chat widget |
| Showing scheduling | Auto-book (AI books directly to agent calendar) |
| Follow-up sequences | 3-touch cadence (24h, 72h, 7d) |
| Conversation history | 1 year retention |
| Response personality | Customizable (tone, building knowledge, objection handling) |
| Lead scoring | Automatic qualification scoring |
| Analytics dashboard | Conversion funnel, response times, lead sources |
| Human handoff | Escalation to specific agents with full context |
| Building knowledge base | Custom FAQ, amenity details, neighborhood info |
| Spanish language | Auto-detect and respond in Spanish |
| A/B testing | Test different opening messages and follow-up cadences |

**Why $149/building/month:**
- A single lease signed = $3,000-$8,000+ in commission (NYC rental)
- If AI assists in closing even 1 extra deal/month, it's 20-50x ROI
- Cheaper than every competitor (EliseAI is per-unit, likely $2-5/unit/month = $1,000-2,500/month for a 499-unit building)
- For a 499-unit lease-up: $149/month vs. $3,000-5,000/month for a part-time leasing coordinator

#### Team Add-On — "Leasing Team"
**$399/building/month** (on top of VettdRE Team subscription)

| Capability | Limit |
|-----------|-------|
| AI conversations | Unlimited |
| Buildings/properties | Unlimited |
| Active listings | Unlimited |
| Channels | SMS + Email + Web chat + Voice (Twilio voice) |
| Showing scheduling | Auto-book + self-guided tour instructions |
| Follow-up sequences | Customizable cadences (unlimited touches) |
| Conversation history | Unlimited retention |
| Response personality | Full brand voice customization per building |
| Lead scoring | + Predictive scoring (likelihood to lease) |
| Analytics dashboard | + Comparative analytics across buildings |
| Human handoff | + Round-robin agent assignment |
| Building knowledge base | + Auto-generated from BMS listing data |
| Multi-language | English, Spanish, Mandarin, Russian, Hebrew |
| Concession management | AI can offer/present specials within approved parameters |
| ILS integration | Auto-import inquiries from StreetEasy, Apartments.com |
| Waitlist management | Auto-manage waitlists, notify when units become available |
| White-label | Custom AI name, no VettdRE branding in conversations |

**Why $399/building/month:**
- For operators running multiple active lease-ups
- Voice channel alone justifies the upgrade (handles inbound calls)
- ILS integration captures the highest-volume lead source
- White-label means their brand, not ours, in every conversation

### Enterprise
**Custom pricing** — for operators with 10+ buildings or 1,000+ units

- Everything in Team
- Dedicated Twilio numbers per building
- Custom PMS integration (for operators who also use Yardi/RealPage)
- SLA guarantees (response time, uptime)
- Custom model tuning on their historical leasing data
- Dedicated account manager

---

## LEASING BEST PRACTICES — BAKED INTO THE AI

This is what makes VettdRE's AI leasing agent more than a chatbot. Every industry best practice is encoded into the system prompt, tool behavior, and conversation flow.

### 1. The Speed Imperative

**Best Practice:** Respond within 5 minutes. After 15 minutes, conversion drops dramatically. After 24 hours, the lead is effectively dead.

**How VettdRE implements this:**
- AI responds in < 30 seconds to SMS, < 5 minutes to email
- No business hours dependency — 24/7/365
- After-hours inquiries (57% of tour bookings) get instant, full-quality responses
- System prompt includes: "You are the first point of contact. Speed is your competitive advantage. Respond with substance, not just acknowledgment."

### 2. The Qualification Framework (BANT for Leasing)

**Best Practice:** Qualify prospects systematically to prioritize leasing team time. The best operators qualify on Budget, Timeline, Household, and Requirements before offering tours.

**How VettdRE implements this:**
The AI qualifies through natural conversation, never interrogation. System prompt encodes a progressive qualification framework:

**TIER 1 — Essential (gather in first 2 exchanges):**
- **Budget:** "What's your price range?" / "I have studios from $X and one-bedrooms from $Y — what fits your budget?"
- **Timeline:** "When are you looking to move?" / "Are you flexible on move-in date?"

**TIER 2 — Important (gather before booking showing):**
- **Household:** Size (adults, children, pets) — determines unit size and pet policy
- **Requirements:** Bedrooms, amenities, floor preference, parking
- **Employment:** "Will you be working nearby?" (proxy for income qualification)

**TIER 3 — Nice to have (gather during/after showing):**
- Current living situation (renter vs. owner, lease end date)
- Decision timeline ("Are you looking at other places?")
- Decision makers ("Will anyone else need to see the apartment?")

**Scoring logic:**
- Budget stated + timeline < 60 days + household size known = HOT (80+ score)
- Budget stated + timeline stated = WARM (50-79 score)
- General inquiry, no specifics = COOL (20-49 score)
- Just browsing, no engagement = COLD (0-19 score)

### 3. The Conversational Selling Framework

**Best Practice:** Don't just answer questions — guide the conversation toward a showing. Every response should move the prospect one step closer to visiting.

**How VettdRE implements this:**
System prompt includes conversation progression rules:

```
RESPONSE STRUCTURE (every message):
1. Answer their question directly (never dodge)
2. Add one relevant detail they didn't ask about (create curiosity)
3. Include a soft call-to-action (suggest next step)

EXAMPLES:
❌ "Yes, we have 2-bedrooms available."
✅ "Yes! We have three 2-bedrooms available right now, starting at $3,200. 
    The 22nd floor unit has incredible Manhattan views — it won't last long. 
    Would you like to come see it this week?"

❌ "Pets are allowed."  
✅ "Great news — we're pet-friendly! We allow cats and dogs up to 50 lbs 
    with a one-time $500 pet deposit. We even have a dog run on the 3rd floor 
    terrace. What size is your pet?"
```

### 4. Urgency Creation (Ethical)

**Best Practice:** Create authentic urgency based on real market conditions. Fabricated urgency damages trust.

**How VettdRE implements this:**
AI uses REAL data from BMS listings to create genuine urgency:

- **Inventory scarcity:** "We only have 2 one-bedrooms left on floors 20+. They've been getting a lot of interest."
- **Pricing changes:** "Current pricing is valid through [date]. After that, rates on the remaining units go up."
- **Seasonal timing:** "Spring is our busiest season — the best units typically go within a week of listing."
- **Showing competition:** "I have 3 other showings booked for that unit this week. I'd recommend coming sooner rather than later."

System prompt rule: "Never fabricate urgency. Only reference scarcity, pricing, or competition when verifiable through inventory data. If a unit has been available for 60+ days, DO NOT claim high demand."

### 5. Objection Handling

**Best Practice:** Address objections with empathy + information + redirect. Never be defensive.

**How VettdRE implements this:**
System prompt includes an objection handling matrix:

| Objection | Response Pattern |
|-----------|-----------------|
| **"Too expensive"** | Acknowledge → Reframe value (amenities, location, included utilities) → Offer alternatives → "Would you like to see a unit that's closer to your budget?" |
| **"I'm still looking"** | Validate → Differentiate ("What specifically are you comparing?") → Offer low-commitment next step ("I can send you a comparison of what's available in this area") |
| **"Not ready yet"** | Respect timeline → Stay helpful ("When you are ready, would you like me to keep you updated on availability?") → Schedule future follow-up |
| **"Can you do better on price?"** | **ESCALATE TO HUMAN** — AI never negotiates price |
| **"I saw bad reviews"** | Acknowledge without defensiveness → Provide context if legitimate → Redirect to personal experience ("Reviews are mixed for any building — the best way to know is to visit") |
| **"The commute seems long"** | Provide specific transit data → Reframe lifestyle benefits → "The F train is a 2-minute walk and gets you to Midtown in 35 minutes" |

### 6. Follow-Up Cadence

**Best Practice:** 3-4 follow-ups within a week. After that, move to nurture cadence. Never spam. Always add value.

**How VettdRE implements this:**

**Active Follow-Up (post-initial-inquiry, no showing booked):**
- **+24 hours:** "Hi [Name], just following up on the [unit type] at [building]. I checked and [unit] is still available. Would this week work for a quick tour?"
- **+72 hours:** Value-add message. "Hey [Name] — thought you'd want to know we just listed a new [unit type] on the [floor]. Here's what makes it special: [detail]. Want to see it?"
- **+7 days:** Last touch. "Hi [Name], I don't want to bother you, but I wanted to let you know the [unit] you asked about is still available. If your plans change, I'm here to help anytime."
- **After 3 unanswered:** Stop. Mark as nurture. No more active outreach.

**Post-Showing Follow-Up (showing completed, no application):**
- **Same day (2 hours after):** "Great meeting you today! What did you think of [unit]? Happy to answer any questions."
- **+48 hours:** "Hi [Name], just checking in. Have you had a chance to think about [unit]? I can also arrange a second visit if you'd like to see it again or show it to someone."
- **+5 days:** "Hey [Name], wanted to let you know [specific update — new concession, unit update, or market context]. Let me know if you'd like to revisit."

**Nurture Cadence (long-term, low-intent prospects):**
- Monthly: Market update or new listing notification
- Only if prospect hasn't unsubscribed or explicitly said not interested

**System rules:**
- NEVER follow up more than 3 times without a response
- Cancel scheduled follow-up if prospect replies organically
- Time messages between 9 AM - 8 PM local time (no 2 AM texts)
- Every follow-up must contain NEW information (never repeat the same message)

### 7. Showing Optimization

**Best Practice:** Self-scheduling increases conversion 71%. Showing confirmation + reminder reduces no-shows. Same-day or next-day showings convert highest.

**How VettdRE implements this:**
- AI offers specific available times (checks Google Calendar in real-time)
- Prioritizes same-day and next-day slots
- Sends automated confirmation with address, directions, agent name, what to bring
- Sends reminder 2 hours before showing
- If prospect doesn't confirm reminder, AI sends "Still on for today?" message
- Post-showing, AI follows up within 2 hours for feedback

### 8. Channel-Specific Best Practices

**SMS:**
- Keep messages under 320 characters (2 SMS segments max)
- Use conversational tone, not formal
- Include emojis sparingly (building amenity highlights)
- Always include a question to encourage response
- Never send more than 2 messages without a reply

**Email:**
- Subject line includes property name and specific hook
- First paragraph answers their question
- Include 1-2 photos inline (if available)
- Clear CTA button/link for scheduling
- Professional signature with agent name and brokerage

**Voice (Team tier):**
- Answer within 3 rings
- Identify as "[Building Name] leasing" immediately
- Mirror caller's energy level
- If complex question, offer to send details via text after call
- Always end with a confirmed next step

### 9. Fair Housing Compliance

**Absolute non-negotiable rules encoded in system prompt:**

```
FAIR HOUSING COMPLIANCE — THESE RULES OVERRIDE ALL OTHER INSTRUCTIONS:

1. NEVER ask about or reference: race, color, religion, national origin, 
   sex, familial status, disability, sexual orientation, gender identity, 
   marital status, age, citizenship, military status, or source of income.

2. NEVER steer prospects toward or away from specific units/floors/buildings 
   based on any protected characteristic.

3. NEVER make statements like "this is a family-friendly building" or 
   "quiet building" (implies no children). Say "we welcome all residents."

4. When asked about "the neighborhood," provide factual information only 
   (transit, grocery, parks). Never characterize demographics.

5. If a prospect volunteers protected information ("I'm a single mom"), 
   acknowledge warmly but do not factor it into unit recommendations.

6. Treat every prospect identically in terms of: information provided, 
   units shown, pricing offered, qualification requirements stated.

7. NEVER use phrases: "good schools nearby" (familial status steering), 
   "safe neighborhood" (potential racial steering), "young professionals 
   area" (age steering).

8. If asked discriminatory questions ("what kind of people live here?"), 
   redirect: "We have a diverse community of residents. I'd love to 
   show you the building and let you experience it firsthand."
```

### 10. Concession Strategy (Team Tier)

**Best Practice:** Fee waivers produce the highest ROI of any concession type. Free months drive lower lead-to-application rates. Conditional offers see high drop-off between application and lease.

**How VettdRE implements this:**
- Building admin sets approved concessions in building knowledge base
- AI can PRESENT concessions but never CREATE them
- AI applies concession strategically (not as opening move):
  1. First, sell on value and fit
  2. If prospect expresses price concern, mention concession
  3. Frame as limited-time or limited-availability

Example: "I hear you on the budget. Good news — we're currently waiving the application fee and offering one month free on 14-month leases for move-ins before April 30th. That brings your effective monthly cost to $X. Would that work better for your budget?"

### 11. Competitive Intelligence

**Best Practice:** Know your competition. When prospects compare, address it head-on.

**How VettdRE implements this:**
Building knowledge base includes a competitive positioning section:

```json
{
  "competitors": [
    {
      "name": "The Surf Club",
      "address": "123 Surf Ave",
      "pricing": "$2,800-4,200",
      "advantages": ["Closer to beach", "Lower price point"],
      "our_advantages": ["In-unit W/D", "Rooftop pool", "24hr concierge", "Newer construction", "F train access"],
      "talking_points": [
        "While The Surf Club has great beach access, our residents love the convenience of in-unit laundry and the rooftop pool — amenities they don't offer.",
        "Our F train access gives you a faster commute than their location."
      ]
    }
  ]
}
```

AI can reference this when prospects mention competitors, but NEVER disparages competitors directly. Always positions as "here's what makes us different" not "they're worse."

### 12. Lead Source Optimization

**Best Practice:** Track where leads come from and how they convert. StreetEasy leads in NYC are highest-intent. Generic web chat is lowest.

**How VettdRE implements this:**
- Each channel/source tagged automatically
- Lead score adjusted by source:
  - StreetEasy/Apartments.com inquiry: +15 to base score
  - Direct website: +10
  - SMS to listing number: +10
  - Social media: +5
  - General web chat: +0
- Analytics dashboard shows conversion rates by source
- Helps brokers optimize marketing spend

---

## ONBOARDING FLOW

### For Free Tier
1. User has VettdRE account with BMS
2. Navigate to Brokerage → Leasing Agent (new sidebar item)
3. "Enable AI Leasing" → assigns a Twilio number from pool
4. Add building knowledge (name, address, amenities checklist, pricing range)
5. AI is live — put the number on your listings
6. **Time to live: < 10 minutes**

### For Pro Tier
1. Enable AI Leasing from Brokerage settings
2. Select building(s) to activate
3. Building knowledge wizard:
   - Basic info (auto-populated from BMS property if exists)
   - Amenity checklist (pool, gym, doorman, laundry, parking, etc.)
   - Pricing matrix (unit types, price ranges, concessions)
   - Pet policy, income requirements, application process
   - Competitive positioning (optional)
   - Custom FAQ (optional)
4. Channel setup: SMS number + email forwarding address
5. Agent assignment (which agents get escalations, showing bookings)
6. Test conversation (AI texts YOU to demo the experience)
7. Go live
8. **Time to live: < 30 minutes**

### For Team Tier
- Everything above, plus:
- Voice number configuration
- ILS forwarding setup (StreetEasy, Apartments.com email parsing)
- Brand voice customization
- Concession rules configuration
- Multi-building management dashboard

---

## ANALYTICS DASHBOARD

### Overview Tab
- Active conversations (last 7 days)
- Messages sent/received (vs. limit for free tier)
- Response time (average, p95)
- Lead temperature distribution (hot/warm/cool/cold pie chart)

### Conversion Funnel
```
Inquiries Received ──→ Qualified ──→ Showing Booked ──→ Showing Completed ──→ Application ──→ Leased
     100                  72              38                   31                  18            12
                        (72%)           (53%)                (82%)               (58%)         (67%)
```
- Each stage shows conversion rate and drop-off
- Compare to industry benchmarks (VettdRE can aggregate anonymized data across all users)

### Response Metrics
- Average first response time
- Messages per conversation
- Conversations per day (by hour heatmap)
- After-hours vs. business hours split

### Agent Efficiency
- Escalation rate (% of conversations requiring human)
- Escalation reasons breakdown
- Agent response time (after escalation)
- Showings booked by AI vs. by human

### Lead Quality
- Score distribution
- Source effectiveness (which channels produce the best leads)
- Top qualification gaps (what info is AI unable to gather)

### Financial Impact (Pro+)
- Estimated vacancy days saved
- Cost per conversation (API + messaging costs)
- Cost per showing booked
- Cost per lease (attributed to AI-assisted conversations)
- ROI calculator (AI cost vs. estimated revenue from AI-booked showings)

---

## IMPLEMENTATION PRIORITY

### Week 1-2: Free Tier MVP
- `/api/leasing/sms` webhook endpoint
- `LeasingConversation` + `LeasingMessage` Prisma models
- Claude API orchestrator with tool loop
- 3 core tools: `search_available_units`, `find_or_create_contact`, `send_sms`
- System prompt with Sky Three knowledge
- 25 message/day counter (per org)
- Basic `/brokerage/leasing` dashboard page

### Week 3-4: Pro Tier
- 4 more tools: `schedule_showing`, `check_agent_availability`, `create_follow_up`, `log_activity`
- Email channel (Gmail integration)
- Auto-book showings
- Follow-up engine (cron job)
- Building knowledge base CRUD
- Analytics dashboard v1

### Week 5-6: Polish + Dogfood
- Run on Sky Three lease-up
- Tune system prompt based on real conversations
- Add escalation tools
- Lead scoring
- Conversation review UI (read transcripts, flag issues)

### Week 7-8: Team Tier
- Twilio voice channel
- Custom brand voice
- Concession management
- Multi-building support
- ILS email parsing

---

## GO-TO-MARKET

### Phase 1: Dogfood (Now)
- Run on Sky Three Residences Club (532 Neptune Ave, 499 units)
- Nathan's team tests with real prospects
- Measure: response time, showing conversion, agent time saved
- Collect testimonials and conversion data

### Phase 2: VettdRE Users (Month 2)
- Announce to existing VettdRE users
- Free tier available to all
- Pro tier for BMS users
- Content: "How we leased 50 units with an AI agent" case study

### Phase 3: NYC Brokerages (Month 3-4)
- Target lease-up brokerages
- Partner with developers who are sick of paying StreetEasy $5K/month for leads that go unanswered
- LinkedIn content: Nathan's real conversion data
- Pitch: "Your listings are generating leads 24/7. Why isn't someone answering them 24/7?"

### Phase 4: National (Month 6+)
- Not NYC-specific — works anywhere
- Target markets: Miami, LA, Austin, Chicago (high renter populations, competitive markets)
- Partnerships with listing platforms
- Referral program (existing users get free months for referrals)

---

## MESSAGING

### One-liner
"An AI leasing agent that responds to every inquiry in 30 seconds, books showings on your calendar, and follows up until they lease — 24/7."

### For Brokers
"You're losing deals at 11 PM on Sunday. Your AI isn't."

### For Developers/Owners
"Your $500K marketing budget is generating leads that sit unanswered for hours. VettdRE's AI responds in 30 seconds, qualifies in 3 minutes, and books showings while your team sleeps."

### For Agents
"Not replacing you. Handling the 80% of conversations that are 'do you have a 2BR?' so you can focus on the 20% that are 'where do I sign?'"

### Competitive Positioning
"EliseAI charges per-unit and requires a 6-month implementation. VettdRE's AI leasing agent is live in 10 minutes, free for up to 25 messages/day, and built by a broker who uses it on his own deals."

---

## WHAT MAKES THIS DIFFERENT

| Dimension | EliseAI / Funnel / ResMate | VettdRE AI Leasing Agent |
|-----------|---------------------------|--------------------------|
| **Setup time** | Weeks to months | 10 minutes |
| **Minimum spend** | $500-2,000+/month | Free |
| **Sales process** | Demo → proposal → contract → implementation | Sign up → enable → live |
| **PMS required** | Yes (Yardi, RealPage, etc.) | No — VettdRE IS the system |
| **Target user** | VP of Operations at 10,000-unit REIT | Broker with 5 exclusive listings |
| **Data advantage** | Limited to PMS data | Full VettdRE intelligence (comps, ownership, market data) |
| **Brokerage integration** | None (they're PM tools) | Full BMS — deals, invoices, transactions, commissions |
| **Self-serve** | No | Yes |
| **Contract** | Annual | Month-to-month |
| **Language** | English, Spanish | English, Spanish, Mandarin, Russian, Hebrew (Team) |

The critical insight: **the competitors are property management tools that added leasing AI. VettdRE is a brokerage tool that adds leasing AI.** Different customer, different workflow, different value prop. We're not competing with EliseAI — we're serving the market they can't reach.
