# Claude Agent SDK — Quick Reference

## Install & Setup

```bash
pip install claude-agent-sdk
export ANTHROPIC_API_KEY=your-key-here
```

## Minimal Agent

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    async for msg in query(
        prompt="Your task here",
        options=ClaudeAgentOptions(
            allowed_tools=["Read", "Write", "Bash", "WebSearch"],
            model="sonnet",
        ),
    ):
        print(msg)

asyncio.run(main())
```

## Available Built-in Tools

| Tool | What it does |
|------|-------------|
| `Read` | Read files |
| `Write` | Create files |
| `Edit` | Modify existing files |
| `Bash` | Run shell commands |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents |
| `WebSearch` | Search the web |
| `WebFetch` | Fetch a URL's content |
| `AskUserQuestion` | Prompt the user for input |

## Models

| Model | Best for | Speed |
|-------|---------|-------|
| `"sonnet"` | Most tasks, fast + capable | Fast |
| `"opus"` | Complex reasoning, planning | Slower |
| `"haiku"` | Simple tasks, low cost | Fastest |

## Subagents

```python
from claude_agent_sdk import AgentDefinition

agents = {
    "my-subagent": AgentDefinition(
        description="What this agent does (shown to main agent)",
        prompt="Detailed instructions for the subagent",
        tools=["WebSearch", "Read"],
        model="sonnet",
    ),
}
```

## Hooks

```python
from claude_agent_sdk import Hook

hooks = [
    Hook(event="PreToolUse", callback=my_before_fn),
    Hook(event="PostToolUse", callback=my_after_fn),
    Hook(event="Stop", callback=my_done_fn),
]
```

Hook events: `SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `Stop`

## Permissions

```python
ClaudeAgentOptions(
    # Auto-approve file edits (no prompts)
    accept_edits=True,
    # Deny anything not explicitly allowed
    dont_ask=True,
    # Skip all permission prompts (sandboxed only!)
    bypass_permissions=True,
)
```

## Key Links

- Docs: https://code.claude.com/docs/en/agent-sdk/overview
- Quickstart: https://code.claude.com/docs/en/agent-sdk/quickstart
- Examples: https://github.com/anthropics/claude-agent-sdk-demos
- Python SDK: https://github.com/anthropics/claude-agent-sdk-python
