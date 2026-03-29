# AI Leasing Agent — Router & Tool Layer Technical Implementation

> How the inbound message becomes an intelligent response. This is the engineering doc.

---

## The Core Loop in Plain English

Here's what happens when someone texts your leasing number at 11pm asking about 2-bedrooms:

1. **Twilio receives the SMS** and hits your webhook endpoint
2. **The router** identifies who this person is (new or returning), loads conversation history
3. **Claude API** receives the system prompt + conversation history + the new message + tool definitions
4. **Claude decides** what to do — it might call `search_available_units` to check inventory, then `find_or_create_contact` to log the person, then compose a response
5. **Tool results come back** — Claude sees the real inventory data and writes a personalized reply
6. **The response is sent** back via SMS, the conversation is logged, follow-ups are scheduled

The entire thing takes 2-4 seconds. The prospect has no idea they're talking to an AI.

---

## How to Explain It to Non-Technical People

### The Restaurant Analogy

Think of it like a really well-organized restaurant:

**The Router** is the host stand. When someone walks in (sends a message), the host checks: "Have you been here before? Do we have your reservation?" They pull up everything the restaurant knows about you.

**The AI Brain** is the server. They read the situation — what you're asking for, what's available tonight, whether you have dietary restrictions — and decide what to do. They don't just recite the menu. They recommend based on what they know about you.

**The Tools** are the kitchen, the reservation book, and the phone. The server doesn't cook the food — they tell the kitchen what to make. They don't memorize the calendar — they check the book. Each tool does one specific thing really well.

**The Response** is the server coming back to your table with exactly what you need. "We have a great 2-bedroom on the 22nd floor available April 1st. It's $3,850 with ocean views. Want to come see it Wednesday at 6?"

### The One-Sentence Version

> "When a prospect texts or emails about an apartment, our AI reads the message, checks live inventory, and responds with real availability and pricing in under 3 seconds — 24 hours a day."

### The Investor Version

> "We've built an AI leasing agent that handles initial prospect engagement autonomously. It responds to SMS and email inquiries using live inventory data, qualifies leads based on a configurable framework, books showings against our agents' real calendars, and maintains a multi-touch follow-up cadence. Cost per conversation is roughly $0.25 compared to $15-25 for human handling. It's not replacing our leasing agents — it's handling the 80% of interactions that are repetitive qualification, so our agents focus on tours and closing."

---

## Architecture: The Three Layers

```
┌─────────────────────────────────────────────────────┐
│                  LAYER 1: TRANSPORT                  │
│                                                      │
│  Twilio SMS Webhook    Gmail Sync    Web Chat (v2)   │
│  /api/leasing/sms      /api/leasing  /api/leasing    │
│                         /email        /chat           │
│                                                      │
│  Job: Receive raw messages, normalize format,        │
│       route to the orchestrator                      │
└──────────────────────┬──────────────────────────────┘
                       │
                       │  Normalized message:
                       │  { channel, from, body, timestamp }
                       │
┌──────────────────────▼──────────────────────────────┐
│                LAYER 2: ORCHESTRATOR                  │
│                                                      │
│  1. Identify contact (find_or_create_contact)        │
│  2. Load conversation state (LeasingConversation)    │
│  3. Load message history (last 10-20 messages)       │
│  4. Build Claude API payload                         │
│  5. Execute tool calls from Claude's response        │
│  6. Send outbound message                            │
│  7. Update conversation state                        │
│  8. Schedule follow-ups                              │
│                                                      │
│  This is the "brain coordinator" — it doesn't make   │
│  decisions itself, it orchestrates the AI + tools     │
└──────────────────────┬──────────────────────────────┘
                       │
                       │  Tool calls + results
                       │
┌──────────────────────▼──────────────────────────────┐
│                 LAYER 3: TOOL LAYER                   │
│                                                      │
│  Each tool is a thin wrapper around an existing       │
│  VettdRE server action or external API:               │
│                                                      │
│  search_available_units  →  BmsListing.findMany()    │
│  get_unit_details        →  BmsListing.findUnique()  │
│  send_sms                →  twilio-actions.ts         │
│  schedule_showing        →  CalendarEvent + Showing   │
│  find_or_create_contact  →  Contact upsert            │
│  log_activity            →  Activity.create()         │
│  escalate_to_agent       →  Notification + assign     │
│                                                      │
│  Tools are stateless functions. They take input,      │
│  do one thing, return a result. That's it.            │
└─────────────────────────────────────────────────────┘
```

---

## Layer 1: Transport (Message In / Message Out)

### SMS Inbound — How Twilio Hits Your App

You already have `/api/twilio/sms` catching inbound messages. The leasing router is an extension of that:

```
// Pseudocode — what the endpoint does

POST /api/leasing/sms
  
  // Twilio sends these fields:
  Body: "Do you have any 2BRs available?"
  From: "+17185551234"
  To:   "+19295559999"  (your Sky Three leasing number)

  // Step 1: Is this a leasing number?
  // Look up the To number → maps to a BmsProperty (Sky Three)
  // This is how multi-building works later — different numbers, different properties

  // Step 2: Hand off to the orchestrator
  orchestrator.handleInbound({
    channel: "sms",
    from: "+17185551234",
    body: "Do you have any 2BRs available?",
    propertyId: "sky-three-property-id",
    timestamp: now
  })

  // Step 3: Twilio needs a response immediately (or within 15 seconds)
  // Option A: Return empty TwiML (respond async via API)
  // Option B: Wait for orchestrator and return response in TwiML
  // Recommendation: Option A (async) — gives more time for tool calls
```

### Email Inbound — Gmail Sync Extension

Your existing `gmail-sync.ts` does incremental sync via historyId. The leasing router hooks into the email categorizer:

```
// Pseudocode — extending your email pipeline

// email-categorizer.ts already categorizes emails
// Add a new category: "leasing_inquiry"
// Detection signals:
//   - Sent to leasing@gulinogroup.com (or Sky Three email)
//   - Subject contains: apartment, unit, bedroom, rent, available, showing, tour
//   - From address not in known contacts with existing deals
//   - Not a reply to an agent's outbound (check thread)

// When categorized as "leasing_inquiry":
orchestrator.handleInbound({
  channel: "email",
  from: "prospect@gmail.com",
  body: parsedEmailBody,
  subject: emailSubject,
  threadId: gmailThreadId,   // critical for reply threading
  propertyId: determineProperty(emailRecipient),
  timestamp: emailDate
})
```

---

## Layer 2: The Orchestrator (The Brain Coordinator)

This is the most important piece. It's a single function that coordinates everything:

```
// Pseudocode — the orchestrator's handleInbound function

async function handleInbound(message: InboundMessage) {

  // ════════════════════════════════════════════
  // STEP 1: IDENTIFY THE PROSPECT
  // ════════════════════════════════════════════
  
  // Look up by phone (SMS) or email (email)
  let contact = await findContactByPhoneOrEmail(message.from)
  
  if (!contact) {
    // New prospect — create a CRM contact
    contact = await createContact({
      phone: message.channel === "sms" ? message.from : undefined,
      email: message.channel === "email" ? message.from : undefined,
      source: `${message.channel}_inquiry`,
    })
  }

  // ════════════════════════════════════════════
  // STEP 2: LOAD OR CREATE CONVERSATION
  // ════════════════════════════════════════════
  
  let conversation = await findActiveConversation(contact.id, message.propertyId)
  
  if (!conversation) {
    conversation = await createConversation({
      contactId: contact.id,
      propertyId: message.propertyId,
      channel: message.channel,
      state: "NEW_INQUIRY",
    })
  }

  // Check: is this conversation escalated to a human?
  if (conversation.state === "ESCALATED") {
    // Don't let the AI respond — route to assigned agent instead
    await notifyAgent(conversation.assignedAgentId, message)
    return
  }

  // ════════════════════════════════════════════
  // STEP 3: BUILD CONVERSATION HISTORY
  // ════════════════════════════════════════════
  
  const history = await getMessages(conversation.id, { limit: 20 })
  
  // Convert to Claude message format:
  // [{ role: "user", content: "prospect message" },
  //  { role: "assistant", content: "AI response" }, ...]
  const claudeMessages = history.map(msg => ({
    role: msg.direction === "inbound" ? "user" : "assistant",
    content: msg.content
  }))
  
  // Add the new inbound message
  claudeMessages.push({
    role: "user",
    content: message.body
  })

  // ════════════════════════════════════════════
  // STEP 4: CALL CLAUDE WITH TOOLS
  // ════════════════════════════════════════════
  
  const startTime = Date.now()
  
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 1024,
    system: buildSystemPrompt(message.propertyId),  // property-specific prompt
    messages: claudeMessages,
    tools: LEASING_TOOLS,  // all 14 tool definitions
  })

  // ════════════════════════════════════════════
  // STEP 5: EXECUTE TOOL CALLS
  // ════════════════════════════════════════════
  
  // Claude's response may contain tool_use blocks
  // We need to execute them and feed results back
  
  let finalResponse = response
  const toolCallLog = []
  
  // Loop: Claude may call tools, see results, call more tools
  while (finalResponse.stop_reason === "tool_use") {
    const toolResults = []
    
    for (const block of finalResponse.content) {
      if (block.type === "tool_use") {
        // Execute the tool
        const result = await executeTool(block.name, block.input, {
          orgId: conversation.orgId,
          contactId: contact.id,
          propertyId: message.propertyId,
          conversationId: conversation.id,
        })
        
        toolCallLog.push({
          tool: block.name,
          input: block.input,
          output: result,
        })
        
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        })
      }
    }
    
    // Feed tool results back to Claude
    claudeMessages.push({ role: "assistant", content: finalResponse.content })
    claudeMessages.push({ role: "user", content: toolResults })
    
    finalResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 1024,
      system: buildSystemPrompt(message.propertyId),
      messages: claudeMessages,
      tools: LEASING_TOOLS,
    })
  }

  // ════════════════════════════════════════════
  // STEP 6: EXTRACT AND SEND RESPONSE
  // ════════════════════════════════════════════
  
  const responseText = finalResponse.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n")
  
  const responseTimeMs = Date.now() - startTime
  
  // Send via the appropriate channel
  if (message.channel === "sms") {
    await sendSms(message.from, responseText)
  } else if (message.channel === "email") {
    await sendEmail({
      to: message.from,
      subject: `Re: ${message.subject}`,
      body: responseText,
      threadId: message.threadId,
    })
  }

  // ════════════════════════════════════════════
  // STEP 7: LOG EVERYTHING
  // ════════════════════════════════════════════
  
  // Log the inbound message
  await createMessage({
    conversationId: conversation.id,
    direction: "inbound",
    channel: message.channel,
    senderType: "prospect",
    content: message.body,
  })
  
  // Log the outbound response
  await createMessage({
    conversationId: conversation.id,
    direction: "outbound",
    channel: message.channel,
    senderType: "ai",
    content: responseText,
    toolCalls: toolCallLog,
    tokensUsed: finalResponse.usage?.input_tokens + finalResponse.usage?.output_tokens,
    responseTimeMs,
  })
  
  // Update conversation timestamps
  await updateConversation(conversation.id, {
    lastMessageAt: message.timestamp,
    lastResponseAt: new Date(),
  })
}
```

### The Tool Execution Router

This is the function that takes a tool name and input, and calls the right VettdRE server action:

```
// Pseudocode — tool execution dispatcher

async function executeTool(
  toolName: string,
  input: any,
  context: { orgId, contactId, propertyId, conversationId }
) {
  switch (toolName) {

    // ── LISTING INTELLIGENCE ──

    case "search_available_units":
      // Queries BmsListing table filtered to the property
      return await prisma.bmsListing.findMany({
        where: {
          property: { id: context.propertyId },
          orgId: context.orgId,
          status: "available",  // only show available units
          ...(input.bedrooms !== undefined && { bedrooms: input.bedrooms }),
          ...(input.max_rent && { rentPrice: { lte: input.max_rent } }),
          ...(input.min_rent && { rentPrice: { gte: input.min_rent } }),
          ...(input.available_by && { availableDate: { lte: new Date(input.available_by) } }),
        },
        select: {
          unit: true, bedrooms: true, bathrooms: true,
          rentPrice: true, sqft: true, floor: true,
          description: true, amenities: true, status: true,
          availableDate: true,
        },
        orderBy: { rentPrice: "asc" },
        take: 10,
      })

    case "get_unit_details":
      return await prisma.bmsListing.findFirst({
        where: {
          unit: input.unit_number,
          property: { id: context.propertyId },
          orgId: context.orgId,
        },
        include: { property: true, agent: true },
      })

    case "get_building_info":
      // Returns static + dynamic building data
      const property = await prisma.bmsProperty.findUnique({
        where: { id: context.propertyId },
      })
      // Merge with static knowledge base (amenities, policies, neighborhood)
      return {
        ...property,
        ...BUILDING_KNOWLEDGE[context.propertyId]?.[input.topic],
      }

    case "check_availability_status":
      const listing = await prisma.bmsListing.findFirst({
        where: { unit: input.unit_number, property: { id: context.propertyId } },
        select: { status: true, rentPrice: true, availableDate: true },
      })
      return listing || { status: "not_found" }

    case "get_comparable_units":
      const reference = await prisma.bmsListing.findFirst({
        where: { unit: input.reference_unit, property: { id: context.propertyId } },
      })
      if (!reference) return { error: "Reference unit not found" }
      const maxIncrease = input.max_price_increase || 200
      return await prisma.bmsListing.findMany({
        where: {
          property: { id: context.propertyId },
          status: "available",
          bedrooms: reference.bedrooms,
          rentPrice: {
            gte: reference.rentPrice - 200,
            lte: Number(reference.rentPrice) + maxIncrease,
          },
          NOT: { unit: input.reference_unit },
        },
        take: 5,
      })

    // ── COMMUNICATION ──

    case "send_sms":
      // Wraps existing Twilio actions
      return await sendTwilioSms(input.to, input.message)

    case "send_email":
      // Wraps existing Gmail send
      return await sendGmailEmail({
        to: input.to,
        subject: input.subject,
        body: input.body,
        threadId: input.reply_to_thread,
      })

    case "schedule_showing":
      // Creates CalendarEvent + Showing + sends confirmation
      const agent = await findAvailableAgent(input.date, input.time)
      const event = await createCalendarEvent({
        title: `Showing: ${input.unit_numbers.join(", ")} — ${input.prospect_name}`,
        startTime: `${input.date}T${input.time}`,
        duration: 30,  // 30-minute showing
        attendees: [input.prospect_email, agent.email],
        location: "532 Neptune Avenue, Brooklyn, NY 11224",
        notes: input.notes,
      })
      const showing = await prisma.showing.create({
        data: {
          orgId: context.orgId,
          contactId: context.contactId,
          agentId: agent.id,
          propertyAddress: "532 Neptune Avenue",
          unitNumbers: input.unit_numbers,
          startTime: new Date(`${input.date}T${input.time}`),
          status: "confirmed",
          calendarEventId: event.id,
        },
      })
      return { showingId: showing.id, agentName: agent.firstName, confirmed: true }

    case "check_agent_availability":
      // Queries Google Calendar for open slots
      return await getAvailableShowingSlots({
        propertyId: context.propertyId,
        preferredDate: input.preferred_date,
        timeOfDay: input.preferred_time_of_day,
        daysAhead: 7,
        slotDuration: 30,
      })

    case "create_follow_up":
      return await prisma.followUpReminder.create({
        data: {
          orgId: context.orgId,
          contactId: context.contactId,
          channel: input.channel,
          scheduledAt: new Date(input.send_at),
          message: input.message,
          cancelIfReplied: input.cancel_if_replied ?? true,
          status: "pending",
          source: "ai_leasing",
          conversationId: context.conversationId,
        },
      })

    // ── CRM & LEAD MANAGEMENT ──

    case "find_or_create_contact":
      // Upsert contact by phone or email
      let contact = await prisma.contact.findFirst({
        where: {
          orgId: context.orgId,
          OR: [
            input.phone ? { phone: input.phone } : undefined,
            input.email ? { email: input.email } : undefined,
          ].filter(Boolean),
        },
      })
      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            orgId: context.orgId,
            firstName: input.first_name || "Unknown",
            lastName: input.last_name || "",
            phone: input.phone,
            email: input.email,
            source: input.source || "sms_inquiry",
          },
        })
      }
      return { contactId: contact.id, isNew: !contact, name: `${contact.firstName} ${contact.lastName}` }

    case "log_activity":
      return await prisma.activity.create({
        data: {
          orgId: context.orgId,
          contactId: context.contactId,
          type: input.type,
          description: input.summary,
          metadata: input.qualification_data ? JSON.stringify(input.qualification_data) : undefined,
        },
      })
      // Also update conversation qualification fields if provided
      if (input.qualification_data) {
        await prisma.leasingConversation.update({
          where: { id: context.conversationId },
          data: {
            budget: input.qualification_data.budget,
            bedrooms: input.qualification_data.bedrooms,
            moveInDate: input.qualification_data.move_in_date ? new Date(input.qualification_data.move_in_date) : undefined,
            interestLevel: input.interest_level,
          },
        })
      }

    case "update_lead_score":
      // Score signals and update contact
      const scoreDeltas = {
        responded_quickly: +10,
        asked_about_pricing: +15,
        asked_about_availability: +10,
        requested_showing: +25,
        completed_showing: +20,
        asked_about_application: +30,
        mentioned_timeline: +15,
        mentioned_budget_match: +10,
        no_response_24h: -10,
        no_response_72h: -15,
        cancelled_showing: -20,
        expressed_objection: -5,
      }
      const delta = input.signals.reduce((sum, s) => sum + (scoreDeltas[s] || 0), 0)
      return await prisma.contact.update({
        where: { id: context.contactId },
        data: { score: { increment: delta } },
      })

    case "escalate_to_agent":
      // Find an agent, notify them, pause AI
      const assignedAgent = input.agent_id
        ? await prisma.brokerAgent.findUnique({ where: { id: input.agent_id } })
        : await findNextAvailableAgent(context.orgId)
      
      // Update conversation state
      await prisma.leasingConversation.update({
        where: { id: context.conversationId },
        data: {
          state: "ESCALATED",
          assignedAgentId: assignedAgent.id,
          escalatedAt: new Date(),
          escalationReason: input.reason,
        },
      })
      
      // Notify the agent (SMS + email)
      await sendTwilioSms(assignedAgent.phone, 
        `New escalation: ${input.reason}. Prospect needs help. Check VettdRE for details.`)
      await sendGmailEmail({
        to: assignedAgent.email,
        subject: `[Leasing Escalation] ${input.reason}`,
        body: input.context_summary,
      })
      
      return { escalated: true, agentName: assignedAgent.firstName, agentId: assignedAgent.id }

    case "get_conversation_history":
      return await prisma.leasingMessage.findMany({
        where: { 
          conversation: { contactId: context.contactId },
          ...(input.channel !== "all" && { channel: input.channel }),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit || 20,
      })

    case "get_waitlist_position":
      // Manage waitlist for specific unit types
      // Implementation depends on how you want to track this
      // Could be a tag on the Contact or a separate WaitlistEntry model
      if (input.action === "add") {
        await prisma.activity.create({
          data: {
            orgId: context.orgId,
            contactId: context.contactId,
            type: "waitlist_added",
            description: `Added to waitlist for ${input.unit_type}`,
          },
        })
        return { added: true, unitType: input.unit_type }
      }
      // ... check and remove implementations

    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}
```

---

## How MCP Fits In (vs. Direct Tool Calls)

There are two ways to implement the tool layer:

### Option A: Direct Tool Calls (Simpler, Build First)

The pseudocode above IS direct tool calls. Claude's API supports tool definitions natively. You define the tools in the API request, Claude returns `tool_use` blocks, you execute them with a switch statement, feed results back.

**Pros:** Simple. Everything in one codebase. No extra infrastructure.
**Cons:** Tightly coupled. Adding a new tool means editing the switch statement and redeploying.

### Option B: MCP Server (More Flexible, Build Second)

Wrap the same tool implementations in an MCP server. The orchestrator connects to the MCP server instead of calling tools directly.

```
// With MCP, the Claude API call changes to:

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-5-20250514",
  max_tokens: 1024,
  system: buildSystemPrompt(message.propertyId),
  messages: claudeMessages,
  // Instead of inline tool definitions:
  mcp_servers: [{
    type: "url",
    url: "https://your-domain.com/mcp/leasing",
    name: "vettdre-leasing"
  }]
})
```

The MCP server exposes the same 14 tools but as a standalone service. Claude discovers the tools via the MCP protocol, calls them the same way, gets results the same way.

**Pros:** 
- Tools are decoupled from the orchestrator
- Other MCP clients (Claude Desktop, Cursor) can use the same tools
- You can add third-party MCP servers (Google Maps for commute answers, etc.)
- Foundation for the white-label API play

**Cons:**
- Extra infrastructure to maintain
- Network hop adds latency
- Overkill for a single-building deployment

### Recommendation: Start Direct, Migrate to MCP

Build Option A first. Get the leasing agent working end-to-end with direct tool calls. Once it's proven and you want multi-building support or external consumers, wrap the tool layer in an MCP server. The tool implementations don't change — only the transport layer.

---

## The System Prompt is Parameterized

The system prompt isn't hardcoded for Sky Three. It's built dynamically:

```
function buildSystemPrompt(propertyId: string): string {
  // Load building-specific knowledge
  const building = BUILDING_REGISTRY[propertyId]
  
  return `
    ${CORE_LEASING_PERSONALITY}
    
    ## BUILDING YOU'RE LEASING
    ${building.name} at ${building.address}
    ${building.description}
    
    ## UNIT TYPES & PRICING RANGES
    ${building.pricingRanges}
    
    ## AMENITIES
    ${building.amenities}
    
    ## LEASE TERMS
    ${building.leaseTerms}
    
    ## NEIGHBORHOOD & TRANSIT
    ${building.neighborhood}
    
    ## COMPETITIVE POSITIONING
    ${building.positioning}
    
    ${CORE_QUALIFICATION_FRAMEWORK}
    ${CORE_ESCALATION_RULES}
    ${CORE_FOLLOW_UP_CADENCE}
    ${CORE_SAFETY_RULES}
  `
}
```

This means adding a second building is:
1. Create a `BmsProperty` record
2. Fill in the building knowledge object
3. Assign a Twilio number (or email) to the property
4. The orchestrator routes based on which number/email received the message

Same AI, same tools, same logic — different building context.

---

## Conversation State Machine

The conversation has a `state` field that controls AI behavior:

```
State Transitions:

  NEW_INQUIRY
    → QUALIFYING       (after first exchange)
    → ESCALATED        (if complex situation immediately)
  
  QUALIFYING  
    → SHOWING_BOOKED   (showing scheduled)
    → NURTURE          (prospect not ready, enters follow-up cadence)
    → ESCALATED        (needs human)
  
  SHOWING_BOOKED
    → SHOWING_COMPLETED (agent marks tour done)
    → NURTURE          (no-show, reschedule attempts)
    → ESCALATED        (prospect wants to negotiate)
  
  SHOWING_COMPLETED
    → APPLICATION      (escalate to human for app processing)
    → NURTURE          (not ready yet, follow-up)
    → CLOSED_LOST      (went elsewhere)
  
  NURTURE
    → QUALIFYING       (re-engaged from follow-up)
    → CLOSED_LOST      (3 unanswered follow-ups)
  
  ESCALATED
    → Any state        (human agent can set any state)
    → AI_RESUME        (human hands back to AI)
  
  APPLICATION → CLOSED_WON or CLOSED_LOST  (human-managed)
```

The AI reads the state and adjusts behavior:
- **QUALIFYING**: Ask qualifying questions, suggest showings
- **SHOWING_BOOKED**: Focus on confirmation, logistics, "what to bring"
- **SHOWING_COMPLETED**: Ask how it went, address objections, nudge toward application
- **NURTURE**: Light touch, inventory alerts, no hard sells

---

## Follow-Up Engine

Follow-ups run on a cron job (every 15 minutes):

```
// Pseudocode — follow-up processor

async function processFollowUps() {
  const pending = await prisma.followUpReminder.findMany({
    where: {
      status: "pending",
      scheduledAt: { lte: new Date() },
      source: "ai_leasing",
    },
    include: { conversation: true },
  })
  
  for (const followUp of pending) {
    // Check if prospect replied since this was scheduled
    const recentMessage = await prisma.leasingMessage.findFirst({
      where: {
        conversationId: followUp.conversationId,
        direction: "inbound",
        createdAt: { gt: followUp.createdAt },
      },
    })
    
    if (recentMessage && followUp.cancelIfReplied) {
      await prisma.followUpReminder.update({
        where: { id: followUp.id },
        data: { status: "superseded" },
      })
      continue
    }
    
    // Check follow-up count — stop after 3 unanswered
    const unansweredCount = await prisma.followUpReminder.count({
      where: {
        conversationId: followUp.conversationId,
        status: "sent",
        // No inbound message after this follow-up
      },
    })
    
    if (unansweredCount >= 3) {
      await prisma.leasingConversation.update({
        where: { id: followUp.conversationId },
        data: { state: "CLOSED_LOST", interestLevel: "cold" },
      })
      continue
    }
    
    // Send the follow-up
    if (followUp.channel === "sms") {
      await sendTwilioSms(followUp.contact.phone, followUp.message)
    } else {
      await sendGmailEmail({ to: followUp.contact.email, ... })
    }
    
    await prisma.followUpReminder.update({
      where: { id: followUp.id },
      data: { status: "sent", sentAt: new Date() },
    })
  }
}
```

---

## Files to Create

```
src/app/api/leasing/
  sms/route.ts              — Twilio webhook for leasing SMS
  email/route.ts            — Email processor trigger
  cron/route.ts             — Follow-up cron endpoint

src/lib/leasing/
  orchestrator.ts           — The core handleInbound function
  tool-executor.ts          — executeTool switch/dispatcher
  system-prompt.ts          — buildSystemPrompt + building knowledge
  tool-definitions.ts       — LEASING_TOOLS array (Claude tool schemas)
  state-machine.ts          — Conversation state transitions
  follow-up-processor.ts    — Cron job for scheduled follow-ups
  building-registry.ts      — Per-building knowledge configs

src/app/(dashboard)/brokerage/
  leasing/
    page.tsx                — Leasing dashboard (conversations, stats)
    actions.ts              — Server actions for leasing UI
    [conversationId]/
      page.tsx              — Individual conversation view
```

---

## Key Design Decisions

**Why Claude Sonnet and not Opus?**
Sonnet is fast enough (1-2s response) and cheap enough ($0.003/1K input tokens) for high-volume leasing conversations. Opus would be 5x the cost with marginal quality improvement for this use case. The system prompt does the heavy lifting — the model just needs to follow instructions and call tools correctly.

**Why async SMS responses?**
Twilio gives you 15 seconds to respond to a webhook. Tool calls (especially calendar lookups) can take 3-5 seconds. Responding async via the Twilio REST API (instead of inline TwiML) gives unlimited time and avoids timeouts.

**Why store full conversation in the database?**
Claude's API is stateless — it doesn't remember previous conversations. You must send the full history with each request. Storing messages in `LeasingMessage` gives you the history to send, plus analytics on response times, tool usage, and conversion patterns.

**Why 20 messages of context?**
Balance between giving Claude enough context to maintain conversation continuity and keeping token costs low. 20 messages is roughly 2,000-4,000 tokens of context — enough for a multi-day leasing conversation without blowing up costs.

**Why not use OpenAI / GPT-4?**
Claude's tool use is more reliable, the system prompt following is stronger, and Anthropic's API is what VettdRE already uses. Plus the MCP ecosystem is Anthropic-native.
