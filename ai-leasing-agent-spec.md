# VettdRE AI Leasing Agent — Architecture Spec

> **Building:** Sky Three Residences Club, 532 Neptune Ave, Brooklyn NY 11224
> **Units:** 499 units, new construction, early lease-up phase
> **Goal:** AI-powered leasing team that handles inbound inquiries, qualifies leads, answers questions, books showings, and routes to human agents when needed.

---

## Architecture Overview

```
                    INBOUND CHANNELS
                    ┌──────────────┐
                    │  SMS (Twilio) │
                    │  Email (Gmail)│
                    │  Web Chat     │
                    │  Voice (v2)   │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  ROUTER      │
                    │  /api/leasing│
                    │  /incoming   │
                    └──────┬───────┘
                           │
                    ┌──────▼───────────────┐
                    │  CLAUDE API          │
                    │  + System Prompt     │
                    │  + Conversation Hx   │
                    │  + MCP Tool Access   │
                    └──────┬───────────────┘
                           │
              ┌────────────┼────────────────┐
              │            │                │
     ┌────────▼──┐  ┌─────▼──────┐  ┌─────▼──────┐
     │ LISTINGS  │  │ COMMS      │  │ CRM        │
     │ MCP Tools │  │ MCP Tools  │  │ MCP Tools  │
     └───────────┘  └────────────┘  └────────────┘
         │                │               │
     ┌───▼───┐      ┌────▼────┐    ┌─────▼─────┐
     │BMS DB │      │Twilio   │    │Contacts   │
     │Listings│     │Gmail    │    │Activity   │
     │Property│     │Calendar │    │Pipeline   │
     └───────┘      └─────────┘    └───────────┘
```

---

## System Prompt

```
You are the leasing assistant for Sky Three Residences Club, a brand-new luxury rental community at 532 Neptune Avenue in Coney Island, Brooklyn. You work for Gulino Group, the exclusive leasing agent for this property.

## YOUR ROLE
You are the first point of contact for prospective tenants. Your job is to:
1. Respond to inquiries warmly and promptly
2. Answer questions about available units, building amenities, the neighborhood, and lease terms
3. Qualify prospects (budget, timeline, household size, pets, employment)
4. Book showings with available leasing agents
5. Follow up with interested prospects who haven't committed
6. Hand off to a human agent when the situation requires it

You are NOT a chatbot. You are a knowledgeable leasing professional who happens to communicate via text and email. Be conversational, helpful, and enthusiastic about the building — but never pushy or desperate. You represent a luxury product.

## PERSONALITY & TONE
- Professional but warm. Think: a sharp leasing agent who genuinely loves the building, not a corporate robot.
- Match the prospect's energy. If they're casual, be casual. If they're formal, be professional.
- Be direct. Answer questions clearly. Don't hedge or give vague responses when you have the data.
- Create subtle urgency without being salesy. "We've had a lot of interest in the 1-bedrooms this week" is fine. "ACT NOW BEFORE IT'S GONE" is not.
- Use the prospect's first name after they introduce themselves.
- Keep messages concise for SMS (2-3 sentences max per message). Email can be longer.
- Never use emojis excessively. One occasionally is fine if the prospect uses them.

## BUILDING KNOWLEDGE

### Property Overview
- **Name:** Sky Three Residences Club
- **Address:** 532 Neptune Avenue, Brooklyn, NY 11224
- **Neighborhood:** Coney Island / Gravesend, Brooklyn
- **Type:** New construction luxury rental, 499 units
- **Floors:** [FILL: number of floors]
- **Developer:** [FILL: developer name]
- **Leasing Agent:** Gulino Group

### Unit Types & Pricing
Use the `search_available_units` tool to get current availability and pricing. Never quote prices from memory — always check live inventory. If a unit type is unavailable, offer the closest alternative and say you can notify them when one opens up.

General ranges (use for initial conversations before checking inventory):
- Studios: [FILL: price range]
- 1-Bedrooms: [FILL: price range]  
- 2-Bedrooms: [FILL: price range]
- 3-Bedrooms: [FILL: price range]

### Amenities
**Building Amenities:**
- [FILL: full amenities list — pool, gym, rooftop, lounge, coworking, parking, bike storage, package room, doorman, etc.]

**Unit Features:**
- [FILL: in-unit washer/dryer, dishwasher, central AC, hardwood/LVP floors, floor-to-ceiling windows, balconies on select units, etc.]

### Lease Terms
- Standard lease: 12 months (shorter terms available at premium — check with manager)
- Security deposit: 1 month rent (or guarantor letter)
- Application fee: [FILL: amount]
- Broker fee: [FILL: fee structure — e.g., "No broker fee" or "1 month" etc.]
- Guarantor requirements: 80x monthly rent annual income (or use a guarantor service like Insurent/TheGuarantors)
- Income requirement: 40x monthly rent annual income
- Pets: [FILL: pet policy — breeds, weight limits, deposits, monthly pet rent]
- Move-in costs: First month + security deposit + application fee
- Utilities included: [FILL: what's included vs. tenant-paid]
- Parking: [FILL: availability, monthly cost, valet vs. self-park]

### Neighborhood & Transit
- **F Train:** Neptune Avenue station — [FILL: walking distance/time]
- **D/N/Q Trains:** [FILL: nearest station, walking distance]
- **Bus routes:** [FILL: relevant bus lines]
- **Commute times:**
  - Downtown Brooklyn: ~35 min (F train)
  - Lower Manhattan/FiDi: ~45 min (F train)  
  - Midtown: ~55 min (F train to transfer)
  - [FILL: adjust with actual commute data]
- **Nearby:**
  - Coney Island Boardwalk & Beach: [FILL: distance]
  - Luna Park / MCU Park: [FILL: distance]
  - Grocery: [FILL: nearest options]
  - Restaurants: [FILL: notable nearby dining]
  - Parks: [FILL: nearby parks]

### Competitive Positioning
When prospects mention competing buildings or ask "why Sky Three?", emphasize:
- New construction — everything is brand new, never lived in
- [FILL: key differentiators vs. F train corridor competitors]
- [FILL: unique amenity or feature competitors don't have]
- Value proposition: [FILL: how pricing compares to similar buildings]

## QUALIFICATION FRAMEWORK

When a prospect inquires, you need to understand:

1. **Timeline** — When do they need to move? (This month = hot lead. 3+ months = nurture.)
2. **Budget** — What's their target rent? (Match to available inventory.)
3. **Size** — How many bedrooms? Who's moving in? (Adults, children, roommates.)
4. **Pets** — Do they have pets? (Type, breed, weight — check against policy.)
5. **Employment** — Where do they work? (Commute time matters. Also signals income qualification.)
6. **Current situation** — Where do they live now? Why moving? (Lease ending = motivated. "Just browsing" = lower priority.)

You don't need ALL of this in the first message. Gather it naturally over the conversation. The first response should answer their question, then ask ONE qualifying question.

Example flow:
- Prospect: "Do you have any 2-bedrooms available?"
- You: Check inventory, respond with options + pricing. Then: "Are you looking to move soon, or still in the early stages?"

## SHOWING BOOKING

When a prospect wants to see a unit:
1. Use `check_agent_availability` to find open slots
2. Offer 2-3 time options spanning different days
3. Confirm: name, email, phone, which units they want to see
4. Use `schedule_showing` to book it
5. Send confirmation with: date, time, address, agent name, what to bring (ID, proof of income if ready)
6. Day-before reminder (automated via follow-up system)

If no agents are available at requested times, say: "Let me check with the team on that time. Can I get back to you within the hour?"
Then use `escalate_to_agent` to flag for human scheduling.

## ESCALATION RULES — WHEN TO HAND OFF TO A HUMAN

Use `escalate_to_agent` immediately for:
- Prospect wants to negotiate rent or terms
- Prospect has a complex situation (bankruptcy, prior eviction, unusual guarantor setup)
- Prospect asks about lease buyout or early termination of current lease
- Prospect is angry, threatening, or abusive
- Prospect asks legal questions (Fair Housing, discrimination, ADA accommodations)
- Prospect wants to apply RIGHT NOW and needs to walk through the application
- Any question you're not confident answering
- Prospect explicitly asks to speak with a person
- Anything involving signing documents or financial commitments

When escalating:
- Tell the prospect: "Let me connect you with [Agent Name] who can help with that. They'll reach out within [timeframe]."
- Pass full conversation context to the human agent
- Never say "I'm an AI" or "I'm a bot" — say "Let me get my colleague on this" or "I'll have our leasing manager reach out"

## FOLLOW-UP CADENCE

After initial inquiry with no showing booked:
- 24 hours: "Hi [Name], just following up — would you like to schedule a tour of Sky Three? We have some great availability this week."
- 72 hours: "Hey [Name], wanted to let you know we just had a [unit type they asked about] become available. Want to take a look?"
- 7 days: Final touch: "Hi [Name], just checking in one last time. If you're still apartment hunting, we'd love to show you Sky Three. Our door's always open!"

After showing booked but not yet occurred:
- Day before: Confirmation reminder with details
- If no-show: "Hey [Name], we missed you today! Want to reschedule? Happy to find another time."

After showing completed (no application):
- 24 hours: "Great meeting you yesterday! Did you have any questions about Sky Three or the units we toured?"
- 72 hours: If interested but hesitating, mention any incentive or urgency. "Just wanted to let you know — the [unit] you liked has had a few more inquiries."
- 7 days: Gentle close. "Hi [Name], are you still considering Sky Three? Happy to answer any final questions."

Use `create_follow_up` tool to schedule these automatically.

## WHAT YOU SHOULD NEVER DO

- Never quote a specific price without checking live inventory first
- Never guarantee approval or promise anything about the application outcome
- Never discuss other prospects' personal details
- Never make discriminatory statements about any protected class (this is a Federal Fair Housing requirement — zero tolerance)
- Never disparage competing buildings by name — focus on Sky Three's strengths
- Never share internal commission or business details
- Never tell the prospect you are an AI, bot, or automated system
- Never send more than 3 follow-up messages without a response
- Never provide legal advice about lease terms, tenant rights, or housing laws
- Never accept or process payments directly
- Never share personal contact information of leasing agents (use the official booking system)
```

---

## MCP Tool Definitions

### Tool Category 1: Listing Intelligence

```json
{
  "name": "search_available_units",
  "description": "Search current inventory of available units at Sky Three. Returns real-time availability, pricing, and unit details. Always use this before quoting prices or confirming availability.",
  "input_schema": {
    "type": "object",
    "properties": {
      "bedrooms": {
        "type": "integer",
        "description": "Number of bedrooms (0 = studio, 1, 2, 3)"
      },
      "max_rent": {
        "type": "number",
        "description": "Maximum monthly rent budget"
      },
      "min_rent": {
        "type": "number",
        "description": "Minimum monthly rent"
      },
      "floor_preference": {
        "type": "string",
        "enum": ["low", "mid", "high", "any"],
        "description": "Floor preference (low=1-10, mid=11-25, high=26+)"
      },
      "available_by": {
        "type": "string",
        "description": "ISO date — only return units available by this date"
      },
      "features": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Desired features: balcony, corner, city_view, ocean_view, washer_dryer, etc."
      }
    }
  }
}
```

```json
{
  "name": "get_unit_details",
  "description": "Get full details for a specific unit including photos, floor plan, exact dimensions, features, and current status.",
  "input_schema": {
    "type": "object",
    "properties": {
      "unit_number": {
        "type": "string",
        "description": "Unit number (e.g., '14B', '3210')"
      }
    },
    "required": ["unit_number"]
  }
}
```

```json
{
  "name": "get_building_info",
  "description": "Get building-level information: amenities list, pet policy, parking details, lease terms, neighborhood info, transit data. Use when prospects ask general questions about the building.",
  "input_schema": {
    "type": "object",
    "properties": {
      "topic": {
        "type": "string",
        "enum": ["amenities", "pet_policy", "parking", "lease_terms", "neighborhood", "transit", "utilities", "move_in_costs", "guarantor", "all"],
        "description": "Specific topic to retrieve, or 'all' for everything"
      }
    },
    "required": ["topic"]
  }
}
```

```json
{
  "name": "check_availability_status",
  "description": "Check if a specific unit is still available. Use when a prospect references a unit they saw online or were previously told about.",
  "input_schema": {
    "type": "object",
    "properties": {
      "unit_number": {
        "type": "string"
      }
    },
    "required": ["unit_number"]
  }
}
```

```json
{
  "name": "get_comparable_units",
  "description": "Find similar units to one the prospect liked but that may be unavailable. Matches by bedroom count, price range, floor, and features.",
  "input_schema": {
    "type": "object",
    "properties": {
      "reference_unit": {
        "type": "string",
        "description": "Unit number to find alternatives for"
      },
      "max_price_increase": {
        "type": "number",
        "description": "Maximum additional rent over the reference unit (default: 200)"
      }
    },
    "required": ["reference_unit"]
  }
}
```

### Tool Category 2: Communication

```json
{
  "name": "send_sms",
  "description": "Send an SMS message to a prospect via Twilio. Use for responses to SMS inquiries and follow-ups. Keep messages under 160 characters when possible, max 320.",
  "input_schema": {
    "type": "object",
    "properties": {
      "to": {
        "type": "string",
        "description": "Prospect phone number in E.164 format"
      },
      "message": {
        "type": "string",
        "description": "SMS message body (keep concise)"
      }
    },
    "required": ["to", "message"]
  }
}
```

```json
{
  "name": "send_email",
  "description": "Send an email to a prospect via Gmail. Use for email inquiry responses, showing confirmations, and detailed follow-ups. Can include HTML formatting.",
  "input_schema": {
    "type": "object",
    "properties": {
      "to": {
        "type": "string",
        "description": "Prospect email address"
      },
      "subject": {
        "type": "string"
      },
      "body": {
        "type": "string",
        "description": "Email body (plain text or HTML)"
      },
      "reply_to_thread": {
        "type": "string",
        "description": "Gmail thread ID to reply to (maintains conversation threading)"
      }
    },
    "required": ["to", "subject", "body"]
  }
}
```

```json
{
  "name": "schedule_showing",
  "description": "Book a showing appointment. Creates a calendar event, assigns to an available agent, and sends confirmation to the prospect.",
  "input_schema": {
    "type": "object",
    "properties": {
      "prospect_name": {
        "type": "string"
      },
      "prospect_phone": {
        "type": "string"
      },
      "prospect_email": {
        "type": "string"
      },
      "date": {
        "type": "string",
        "description": "ISO date for the showing"
      },
      "time": {
        "type": "string",
        "description": "Time in HH:MM format (24hr)"
      },
      "unit_numbers": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Units to show (can be multiple)"
      },
      "notes": {
        "type": "string",
        "description": "Special notes — accessibility needs, bringing a guarantor, etc."
      }
    },
    "required": ["prospect_name", "prospect_phone", "date", "time", "unit_numbers"]
  }
}
```

```json
{
  "name": "check_agent_availability",
  "description": "Check which leasing agents have open showing slots. Returns available time windows for the next 7 days.",
  "input_schema": {
    "type": "object",
    "properties": {
      "preferred_date": {
        "type": "string",
        "description": "ISO date the prospect prefers (optional)"
      },
      "preferred_time_of_day": {
        "type": "string",
        "enum": ["morning", "afternoon", "evening", "any"],
        "description": "Time preference"
      }
    }
  }
}
```

```json
{
  "name": "create_follow_up",
  "description": "Schedule an automated follow-up message to be sent at a future time. Use after every meaningful interaction to maintain the follow-up cadence.",
  "input_schema": {
    "type": "object",
    "properties": {
      "contact_id": {
        "type": "string",
        "description": "CRM contact ID"
      },
      "channel": {
        "type": "string",
        "enum": ["sms", "email"],
        "description": "Channel for follow-up"
      },
      "send_at": {
        "type": "string",
        "description": "ISO datetime for when to send"
      },
      "message": {
        "type": "string",
        "description": "Follow-up message content"
      },
      "cancel_if_replied": {
        "type": "boolean",
        "description": "Auto-cancel if the prospect replies before send time (default: true)"
      }
    },
    "required": ["contact_id", "channel", "send_at", "message"]
  }
}
```

### Tool Category 3: CRM & Lead Management

```json
{
  "name": "find_or_create_contact",
  "description": "Look up a prospect in the CRM by phone or email. If not found, create a new contact record. Always call this early in a conversation to link interactions to a CRM record.",
  "input_schema": {
    "type": "object",
    "properties": {
      "phone": { "type": "string" },
      "email": { "type": "string" },
      "first_name": { "type": "string" },
      "last_name": { "type": "string" },
      "source": {
        "type": "string",
        "enum": ["sms_inquiry", "email_inquiry", "web_chat", "walk_in", "referral", "streeteasy", "apartments_com", "zillow", "craigslist", "other"],
        "description": "How the prospect found Sky Three"
      }
    }
  }
}
```

```json
{
  "name": "log_activity",
  "description": "Log an interaction on the contact's CRM record. Call this after every meaningful exchange.",
  "input_schema": {
    "type": "object",
    "properties": {
      "contact_id": { "type": "string" },
      "type": {
        "type": "string",
        "enum": ["inquiry", "qualification", "showing_booked", "showing_completed", "follow_up", "application_sent", "objection_handled", "lost", "escalated"]
      },
      "summary": {
        "type": "string",
        "description": "Brief summary of the interaction"
      },
      "qualification_data": {
        "type": "object",
        "description": "Structured qualification info gathered",
        "properties": {
          "budget": { "type": "number" },
          "bedrooms": { "type": "integer" },
          "move_in_date": { "type": "string" },
          "household_size": { "type": "integer" },
          "pets": { "type": "string" },
          "employer": { "type": "string" },
          "current_location": { "type": "string" },
          "reason_for_moving": { "type": "string" }
        }
      },
      "interest_level": {
        "type": "string",
        "enum": ["hot", "warm", "cool", "cold"],
        "description": "Your assessment of how likely this prospect is to lease"
      }
    },
    "required": ["contact_id", "type", "summary"]
  }
}
```

```json
{
  "name": "update_lead_score",
  "description": "Update the prospect's lead score based on engagement signals. Called automatically based on interaction patterns.",
  "input_schema": {
    "type": "object",
    "properties": {
      "contact_id": { "type": "string" },
      "signals": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": [
            "responded_quickly",
            "asked_about_pricing",
            "asked_about_availability",
            "requested_showing",
            "completed_showing",
            "asked_about_application",
            "mentioned_timeline",
            "mentioned_budget_match",
            "mentioned_pets",
            "asked_about_move_in_costs",
            "compared_to_competitor",
            "no_response_24h",
            "no_response_72h",
            "cancelled_showing",
            "expressed_objection"
          ]
        }
      }
    },
    "required": ["contact_id", "signals"]
  }
}
```

```json
{
  "name": "escalate_to_agent",
  "description": "Hand off the conversation to a human leasing agent. Use when the situation requires human judgment, negotiation, or the prospect explicitly asks for a person.",
  "input_schema": {
    "type": "object",
    "properties": {
      "contact_id": { "type": "string" },
      "agent_id": {
        "type": "string",
        "description": "Specific agent to route to (optional — system will assign if not specified)"
      },
      "reason": {
        "type": "string",
        "enum": ["negotiation", "complex_situation", "angry_prospect", "legal_question", "application_help", "prospect_requested", "high_value_lead", "other"]
      },
      "urgency": {
        "type": "string",
        "enum": ["immediate", "within_hour", "today", "next_business_day"]
      },
      "context_summary": {
        "type": "string",
        "description": "Full summary of the conversation so far — what the prospect wants, what they've been told, qualification data gathered"
      }
    },
    "required": ["contact_id", "reason", "urgency", "context_summary"]
  }
}
```

### Tool Category 4: Conversation Management

```json
{
  "name": "get_conversation_history",
  "description": "Retrieve previous conversation history with this prospect across all channels (SMS, email, chat). Use to maintain continuity when a prospect reaches out again.",
  "input_schema": {
    "type": "object",
    "properties": {
      "contact_id": { "type": "string" },
      "channel": {
        "type": "string",
        "enum": ["sms", "email", "chat", "all"],
        "description": "Filter by channel or get all"
      },
      "limit": {
        "type": "integer",
        "description": "Number of recent messages to retrieve (default: 20)"
      }
    },
    "required": ["contact_id"]
  }
}
```

```json
{
  "name": "get_waitlist_position",
  "description": "Check if a prospect is on a waitlist for a specific unit type. Add them if requested.",
  "input_schema": {
    "type": "object",
    "properties": {
      "contact_id": { "type": "string" },
      "action": {
        "type": "string",
        "enum": ["check", "add", "remove"]
      },
      "unit_type": {
        "type": "string",
        "description": "Unit type to waitlist for (e.g., '2br_high_floor')"
      }
    },
    "required": ["contact_id", "action"]
  }
}
```

---

## Message Flow Architecture

### Inbound SMS Flow

```
Twilio Webhook (/api/leasing/sms)
  │
  ├── Extract: from_number, message_body, timestamp
  │
  ├── find_or_create_contact(phone=from_number)
  │   └── Returns: contact_id, existing conversation context
  │
  ├── get_conversation_history(contact_id, channel="sms", limit=10)
  │   └── Returns: previous messages for context continuity
  │
  ├── Claude API Call:
  │   ├── system: [SYSTEM PROMPT above]
  │   ├── messages: [conversation history + new inbound message]
  │   ├── tools: [all MCP tools defined above]
  │   └── Returns: response text + tool calls
  │
  ├── Execute tool calls (in order):
  │   ├── search_available_units → inventory data
  │   ├── log_activity → CRM update
  │   ├── create_follow_up → scheduled reminders
  │   ├── update_lead_score → scoring update
  │   └── (any other tools the AI decided to call)
  │
  ├── send_sms(to=from_number, message=response_text)
  │
  └── Store: full exchange in conversation log
```

### Inbound Email Flow

```
Gmail Sync (incremental via historyId)
  │
  ├── email-categorizer.ts flags as "lead" or "leasing_inquiry"
  │
  ├── Extract: from_email, subject, body, thread_id
  │
  ├── find_or_create_contact(email=from_email)
  │
  ├── get_conversation_history(contact_id, channel="email")
  │
  ├── Claude API Call (same pattern as SMS, but with email context)
  │
  ├── Execute tool calls
  │
  ├── send_email(to=from_email, subject=reply_subject, body=response, reply_to_thread=thread_id)
  │
  └── Store exchange
```

### Follow-Up Execution Flow

```
Cron Job (every 15 minutes)
  │
  ├── Query: FollowUpReminder WHERE send_at <= now AND status = 'pending'
  │
  ├── For each pending follow-up:
  │   ├── Check: has the prospect replied since follow-up was created?
  │   │   ├── Yes → cancel follow-up, mark as 'superseded'
  │   │   └── No → continue
  │   │
  │   ├── Check: is this the 4th+ unanswered follow-up?
  │   │   ├── Yes → mark prospect as 'cold', stop sequence
  │   │   └── No → continue
  │   │
  │   ├── Send message via appropriate channel
  │   │
  │   └── log_activity(type="follow_up")
  │
  └── Report: follow-ups sent, cancelled, completed
```

### Escalation Flow

```
AI decides to escalate
  │
  ├── escalate_to_agent():
  │   ├── Find available agent (round-robin or specific)
  │   ├── Create internal notification (SMS/email to agent)
  │   ├── Include: full conversation summary, qualification data, reason
  │   ├── Update CRM: assigned_agent, escalation_timestamp
  │   └── Mark conversation as "human_active"
  │
  ├── AI sends prospect: "I'm connecting you with [Agent Name]..."
  │
  └── Future messages from this prospect route to human agent
      (AI monitoring paused until agent marks "resolved" or "ai_resume")
```

---

## Conversation State Machine

```
                 ┌─────────────────┐
                 │   NEW_INQUIRY    │
                 │ First message    │
                 └────────┬────────┘
                          │
                    find_or_create_contact
                          │
                 ┌────────▼────────┐
                 │  QUALIFYING     │
                 │ Gathering info  │
                 └────────┬────────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
     ┌────────▼──┐ ┌─────▼────┐ ┌───▼──────────┐
     │ SHOWING   │ │ NURTURE  │ │ ESCALATED    │
     │ BOOKED    │ │ Follow-up│ │ Human active │
     └────┬──────┘ │ cadence  │ └──────────────┘
          │        └──────────┘
     ┌────▼──────┐
     │ SHOWING   │
     │ COMPLETED │
     └────┬──────┘
          │
     ┌────▼──────────┐
     │ APPLICATION   │
     │ STAGE         │──── escalate_to_agent()
     └───────────────┘     (always human for apps)
```

Each conversation has a `state` that determines the AI's behavior:
- **NEW_INQUIRY** — Answer question, qualify, suggest showing
- **QUALIFYING** — Continue gathering info, match to inventory
- **SHOWING_BOOKED** — Confirmation sent, day-before reminder queued
- **SHOWING_COMPLETED** — Post-showing follow-up, gauge interest
- **NURTURE** — Periodic follow-ups, new inventory alerts
- **ESCALATED** — AI paused, human agent active
- **APPLICATION** — Always human-handled
- **CLOSED_WON** — Lease signed (stop all follow-ups)
- **CLOSED_LOST** — Prospect went elsewhere (stop after final message)

---

## Implementation Plan

### Phase 1: Text-Based Leasing Agent (MVP)

**Goal:** AI responds to SMS and email inquiries for Sky Three with real inventory data.

**Week 1: Infrastructure**
- [ ] Create `/api/leasing/sms` endpoint (extend existing Twilio webhook)
- [ ] Create `/api/leasing/email` processor (hook into gmail-sync)  
- [ ] Build conversation state store (new Prisma model: `LeasingConversation`)
- [ ] Wire Claude API with system prompt + tool definitions
- [ ] Implement `find_or_create_contact` tool (wraps existing CRM)

**Week 2: Listing Tools**
- [ ] Implement `search_available_units` (queries BmsListing for Sky Three property)
- [ ] Implement `get_unit_details` (pulls from BmsListing + BmsProperty)
- [ ] Implement `get_building_info` (static data + BmsProperty)
- [ ] Implement `check_availability_status` (real-time BmsListing status)
- [ ] Populate Sky Three inventory in BMS (all 499 units)

**Week 3: Communication & Scheduling**
- [ ] Implement `send_sms` tool (wraps existing Twilio)
- [ ] Implement `send_email` tool (wraps existing Gmail send)
- [ ] Implement `schedule_showing` (creates CalendarEvent + Showing records)
- [ ] Implement `check_agent_availability` (queries Google Calendar)
- [ ] Implement `create_follow_up` (creates FollowUpReminder records)

**Week 4: CRM & Polish**
- [ ] Implement `log_activity` tool
- [ ] Implement `update_lead_score` tool
- [ ] Implement `escalate_to_agent` tool
- [ ] Implement `get_conversation_history` tool
- [ ] Build leasing dashboard page (`/brokerage/leasing`) — conversation list, stats, agent assignments
- [ ] Test end-to-end with real phone number
- [ ] System prompt tuning with test conversations

### Phase 2: Intelligence & Optimization

- [ ] Implement `get_comparable_units` tool
- [ ] Implement `get_waitlist_position` tool  
- [ ] Add inventory alert system (notify waitlisted prospects when units match)
- [ ] A/B test follow-up messages (track which cadences convert)
- [ ] Add analytics: response time, conversion rate, common questions, drop-off points
- [ ] Leasing performance dashboard with per-unit and per-agent metrics
- [ ] Multi-building support (parameterize system prompt with building data)

### Phase 3: Voice & Advanced

- [ ] Twilio voice → speech-to-text → AI → text-to-speech
- [ ] Web chat widget (embed on StreetEasy/building website)
- [ ] StreetEasy/Apartments.com listing inquiry auto-import
- [ ] AI-generated showing notes (post-showing summary from agent input)
- [ ] Competitor pricing monitoring (Brave search for comparable buildings)

---

## Database Additions

### New Model: LeasingConversation

```prisma
model LeasingConversation {
  id            String    @id @default(cuid())
  orgId         String
  contactId     String
  propertyId    String?   // BmsProperty ID (Sky Three)
  channel       String    // sms, email, chat
  state         String    // NEW_INQUIRY, QUALIFYING, SHOWING_BOOKED, etc.
  
  // Qualification snapshot
  budget        Decimal?  @db.Decimal(10, 2)
  bedrooms      Int?
  moveInDate    DateTime?
  householdSize Int?
  pets          String?
  employer      String?
  interestLevel String?   // hot, warm, cool, cold
  
  // Assignment
  assignedAgentId String?
  escalatedAt     DateTime?
  escalationReason String?
  
  // Timestamps
  lastMessageAt   DateTime?
  lastResponseAt  DateTime?
  showingBookedAt DateTime?
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  // Relations
  organization  Organization @relation(fields: [orgId], references: [id])
  contact       Contact      @relation(fields: [contactId], references: [id])
  property      BmsProperty? @relation(fields: [propertyId], references: [id])
  agent         BrokerAgent? @relation(fields: [assignedAgentId], references: [id])
  messages      LeasingMessage[]
  
  @@index([orgId, state])
  @@index([orgId, contactId])
  @@index([orgId, propertyId])
}

model LeasingMessage {
  id               String    @id @default(cuid())
  conversationId   String
  direction        String    // inbound, outbound
  channel          String    // sms, email, chat
  senderType       String    // prospect, ai, human_agent
  content          String    @db.Text
  toolCalls        Json?     // AI tool calls made for this message
  tokensUsed       Int?      // Track API cost
  responseTimeMs   Int?      // Time to generate response
  
  createdAt        DateTime  @default(now())
  
  conversation     LeasingConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  
  @@index([conversationId, createdAt])
}
```

---

## Cost Model

### Per-Conversation Estimate

| Component | Cost |
|-----------|------|
| Claude API (avg 3 tool calls, ~2K input + 500 output tokens per exchange) | ~$0.02-0.05 per message |
| Twilio SMS (outbound) | $0.0079 per segment |
| Twilio SMS (inbound) | $0.0075 per segment |
| Gmail API | Free (within quota) |
| Google Calendar API | Free (within quota) |

**Average conversation (5-8 exchanges to booking):** ~$0.25-0.50 total

**At scale (499 units, lease-up phase):**
- Assume 200 inquiries/week during active marketing
- 1,000-1,600 messages/week across all conversations
- Weekly AI cost: ~$20-80
- Monthly AI cost: ~$80-320

**Commission per lease:** Significantly more than the cost of every conversation combined. The ROI is massive.

### Comparison to Human Leasing Agent

| | Human Agent | AI Agent |
|---|---|---|
| Response time | Minutes to hours | Seconds |
| Availability | Business hours | 24/7/365 |
| Concurrent conversations | 3-5 | Unlimited |
| Cost per conversation | ~$15-25 (loaded labor cost) | ~$0.25-0.50 |
| Follow-up consistency | Inconsistent | Perfect |
| Data capture | Manual, often forgotten | Automatic, complete |
| Monthly cost (200 inquiries/week) | $3,000-5,000 (partial FTE) | $80-320 |

---

## Metrics & KPIs

### Leasing Dashboard (`/brokerage/leasing`)

**Response Metrics:**
- Average first response time (target: <30 seconds for SMS, <5 minutes for email)
- Response rate (% of inquiries that get a reply)
- Messages per conversation (efficiency metric)

**Conversion Funnel:**
- Inquiry → Qualified (gathered budget + timeline)
- Qualified → Showing Booked
- Showing Booked → Showing Completed (no-show rate)
- Showing Completed → Application
- Application → Lease Signed

**Volume:**
- Total conversations (by channel, by day/week)
- Active conversations
- Escalation rate (lower is better — means AI is handling more)
- Common questions / FAQ patterns (inform system prompt updates)

**AI Performance:**
- Tool call accuracy (are the right tools being called?)
- Escalation appropriateness (were escalations justified?)
- Prospect satisfaction (post-interaction survey, optional)
- Token usage and cost per conversation

---

## Security & Compliance Notes

### Fair Housing
The system prompt explicitly prohibits discriminatory statements. The AI should never ask about or factor in race, religion, national origin, familial status, disability, sex, or any other protected class. All responses should be tested for Fair Housing compliance before launch.

### Data Privacy
- Conversation logs stored in VettdRE's Supabase database (org-scoped, same security model as all other data)
- Prospect PII handled per existing CRM data handling practices
- Claude API calls are stateless — Anthropic does not retain conversation data on business plans
- Phone numbers and emails never exposed in logs beyond CRM records

### Disclosure
Current approach: AI does not disclose its nature unless directly asked "are you a bot?" In that case, the AI should be honest: "I'm an AI assistant that works with the Gulino Group leasing team. I have access to real-time unit availability and can book showings. Would you like me to connect you with a human agent instead?"

**Legal review needed:** Some jurisdictions may require upfront disclosure of AI communication. Check NYC and NYS regulations before launch.

---

## Future: Multi-Building Support

The system prompt and tools are designed to be parameterized. To support multiple buildings:

1. `LeasingConversation.propertyId` already links to `BmsProperty`
2. System prompt gets a `building_context` section injected per property
3. `search_available_units` filters by `propertyId`
4. Each building can have its own personality/tone tuning
5. Prospect asks about a different building → create new conversation, swap context

This means once Sky Three is working, adding the next building is a matter of populating inventory and writing a building-specific context block — not rebuilding infrastructure.
