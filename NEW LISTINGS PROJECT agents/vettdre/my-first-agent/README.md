# Your First Claude Agent — Real Estate Edition

## What is an Agent?

An agent is a program that gives Claude a **loop + tools**. Instead of just answering a question, Claude can:

1. **Think** about what to do
2. **Use a tool** (read a file, run a command, search the web, call an API)
3. **See the result**
4. **Decide what to do next** — and repeat until the task is done

This is the same loop that powers Claude Code and Cowork.

---

## How the SDK Works (Mental Model)

```
┌─────────────────────────────────────┐
│  YOUR CODE                          │
│                                     │
│  1. You call query() with a prompt  │
│  2. SDK sends it to Claude          │
│  3. Claude decides to use a tool    │
│  4. SDK executes the tool for you   │
│  5. Result goes back to Claude      │
│  6. Repeat until Claude is done     │
│  7. You get the final answer        │
└─────────────────────────────────────┘
```

**Key insight:** You don't write the logic for "what tool to use when." Claude figures that out. You just define *which tools are available* and *what the task is*.

---

## The 5 Building Blocks

| Concept | What it does | Real estate example |
|---------|-------------|-------------------|
| **Prompt** | The task you give the agent | "Analyze this building's comp set" |
| **Tools** | Actions the agent can take | Read files, run scripts, search web |
| **System prompt** | Personality + rules | "You are a real estate analyst..." |
| **Subagents** | Specialized mini-agents | A "research" agent + a "copywriter" agent |
| **Hooks** | Custom code at lifecycle points | Log every tool call, block certain actions |

---

## Files in This Folder

| File | What it teaches |
|------|----------------|
| `01_hello_agent.py` | Bare minimum — your first working agent |
| `02_real_estate_agent.py` | Domain agent with system prompt, tools, and subagents |
| `cheatsheet.md` | Quick reference for the SDK |

---

## Quick Start

```bash
# 1. Install the SDK
pip install claude-agent-sdk

# 2. Set your API key
export ANTHROPIC_API_KEY=your-key-here

# 3. Run your first agent
python 01_hello_agent.py
```

---

## What to Build Next (Ideas for Your Stack)

- **Lease-up research agent** — feeds into StoreyHaus campaign briefs
- **Comp scraper agent** — pulls building data and formats it for pitch decks
- **PR angle finder** — reads a building's details and suggests press angles
- **Permit monitor** — checks NYC OpenData for new filings in target neighborhoods
- **Ad copy generator** — takes a building brief and outputs Meta ad variations
- **Brand audit agent** — analyzes a comp set's branding and finds white space
