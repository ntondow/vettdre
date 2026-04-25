"""
01_hello_agent.py — Your First Claude Agent
=============================================

This is the absolute simplest agent you can build.
It sends a prompt to Claude with access to basic tools,
and streams back the results.

Run it:
    pip install claude-agent-sdk
    export ANTHROPIC_API_KEY=your-key-here
    python 01_hello_agent.py
"""

import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions


async def main():
    # ──────────────────────────────────────────────
    # This is the entire agent. That's it.
    #
    # query() starts Claude in an autonomous loop:
    #   - Claude reads your prompt
    #   - Decides which tools to use
    #   - Executes them (the SDK handles this)
    #   - Keeps going until the task is complete
    #   - Streams messages back to you
    # ──────────────────────────────────────────────

    async for message in query(
        prompt="What are the 3 most recent residential building permits filed in Brooklyn? Search the web and summarize them.",
        options=ClaudeAgentOptions(
            # These are the tools Claude can use.
            # "WebSearch" and "WebFetch" let it search & read websites.
            # "Bash" lets it run shell commands.
            # "Read" and "Write" let it work with files.
            allowed_tools=["WebSearch", "WebFetch", "Read", "Write"],

            # Which Claude model to use.
            # "sonnet" is fast and capable — great for most tasks.
            # "opus" is the most intelligent — use for complex reasoning.
            model="sonnet",
        ),
    ):
        # Each message is either:
        #   - An "assistant" message (Claude thinking/responding)
        #   - A "tool_use" message (Claude using a tool)
        #   - A "tool_result" message (the tool's output)
        print(message)


if __name__ == "__main__":
    asyncio.run(main())
