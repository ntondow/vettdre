"""
02_real_estate_agent.py — Real Estate Research Agent
=====================================================

This agent demonstrates the SDK's key features using your domain:
  - System prompts (giving the agent a persona + rules)
  - Multiple tools working together
  - Subagents (specialized mini-agents for focused tasks)
  - Hooks (custom code that runs at lifecycle points)

This agent takes a building address or name and produces a
mini research brief — the kind of thing that could feed into
a StoreyHaus campaign brief, a First to Live post, or a PR pitch.

Run it:
    pip install claude-agent-sdk
    export ANTHROPIC_API_KEY=your-key-here
    python 02_real_estate_agent.py
"""

import asyncio
from claude_agent_sdk import (
    query,
    ClaudeAgentOptions,
    AgentDefinition,    # For creating subagents
    Hook,               # For lifecycle hooks
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SYSTEM PROMPT — This is the agent's "personality"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SYSTEM_PROMPT = """You are a real estate research analyst for a NYC-focused
multifamily media and marketing company. Your work supports three teams:

1. **First to Live** — organic content & social media about new buildings
2. **StoreyHaus** — paid media campaigns for lease-up clients
3. **PR/Publicist** — earned media pitches to outlets like Curbed, The Real Deal, 6sqft

When given a building name or address, you produce a concise research brief with:
- Building basics (address, developer, architect, unit count, expected delivery)
- Neighborhood context (what's nearby, transit, vibe)
- Competitive set (2-3 similar buildings in the area)
- Story angles (what makes this building newsworthy or marketable)
- Suggested next steps for each team

Be specific. Use real data. Cite your sources. Write in a punchy, editorial tone —
not corporate speak. Think Curbed, not StreetEasy listing copy."""


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SUBAGENTS — Specialized mini-agents
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# The main agent can delegate tasks to these.
# Each subagent has its own tools and instructions.
# Think of them as team members with different skills.

SUBAGENTS = {
    # This subagent handles web research
    "researcher": AgentDefinition(
        description="Web research specialist for real estate data",
        prompt="""You are a research assistant. When given a query about a
        NYC building or neighborhood, search the web thoroughly and return
        structured findings. Always include sources/URLs.""",
        tools=["WebSearch", "WebFetch"],
        model="sonnet",  # Fast model for research
    ),

    # This subagent handles writing/formatting
    "writer": AgentDefinition(
        description="Editorial writer for real estate content",
        prompt="""You are an editorial writer. Take raw research notes and
        transform them into polished, punchy copy. Write like Curbed or
        6sqft — authoritative but accessible. Never use corporate jargon.""",
        tools=["Read", "Write"],
        model="sonnet",
    ),
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HOOKS — Custom code at lifecycle points
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Hooks let you run your own code when things happen.
# Use cases: logging, cost tracking, guardrails, notifications.

def on_tool_use(tool_name: str, tool_input: dict) -> None:
    """Runs BEFORE every tool call. Great for logging or blocking."""
    print(f"  🔧 Using tool: {tool_name}")


def on_tool_result(tool_name: str, result: str) -> None:
    """Runs AFTER every tool call. Great for cost tracking."""
    # Example: you could log this to a database, send to Slack, etc.
    result_preview = result[:100] + "..." if len(result) > 100 else result
    print(f"  ✅ {tool_name} returned: {result_preview}")


def on_stop(final_message: str) -> None:
    """Runs when the agent finishes. Great for post-processing."""
    print("\n━━━ Agent finished ━━━")
    print(f"Final output length: {len(final_message)} chars")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MAIN — Put it all together
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def main():
    # Change this to any building you want to research
    building = "The Laney at 22-22 Jackson Ave, Long Island City"

    print(f"🏢 Researching: {building}\n")

    async for message in query(
        # The task
        prompt=f"""Research this building and produce a brief:
        {building}

        Save the final brief as 'brief.md' in the current directory.""",

        options=ClaudeAgentOptions(
            # System prompt sets the persona
            system_prompt=SYSTEM_PROMPT,

            # Tools available to the main agent
            # (subagents have their own tool lists above)
            allowed_tools=[
                "WebSearch",    # Search the web
                "WebFetch",     # Read web pages
                "Read",         # Read local files
                "Write",        # Write local files
                "Bash",         # Run commands
            ],

            # Register our subagents
            agents=SUBAGENTS,

            # Model for the main orchestrator
            model="sonnet",

            # Hooks for lifecycle events
            hooks=[
                Hook(event="PreToolUse", callback=on_tool_use),
                Hook(event="PostToolUse", callback=on_tool_result),
                Hook(event="Stop", callback=on_stop),
            ],
        ),
    ):
        # Print Claude's thinking and responses
        if hasattr(message, "content"):
            print(message.content)


if __name__ == "__main__":
    asyncio.run(main())
