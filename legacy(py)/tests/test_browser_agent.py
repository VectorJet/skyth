import asyncio
import sys
import os
import json
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from backend.registries.agent_registry import AgentRegistry
from backend.converters import provider 

async def test_agent_task():
    print("--- Testing Browser Agent Task Execution (REAL Provider) ---")
    
    # 1. Discover Agents
    AgentRegistry.discover()
    
    agent = AgentRegistry.get_agent("Browser Agent")
    if not agent:
        print("FAIL: Browser Agent not found in registry.")
        return

    print(f"PASS: Found Agent: {agent.name}")
    
    # Check for API keys (just a warning, we proceed to let the provider fail naturally if needed)
    if "OPENAI_API_KEY" not in os.environ and "GEMINI_API_KEY" not in os.environ:
        print("WARNING: No OPENAI_API_KEY or GEMINI_API_KEY found. Real LLM call may fail.")

    # 2. Run Task
    # We use a task that implies navigation
    task = "Navigate to https://example.com and get the title."
    
    if hasattr(agent, "run_task"):
        print(f"Executing task: {task}")
        # This will trigger the REAL loop:
        # 1. Agent calls Real Provider (LiteLLM) -> returns browser_navigate (hopefully)
        # 2. Agent calls MCP -> Playwright navigates
        # 3. Agent calls Real Provider with result -> returns final answer
        result = await agent.run_task(task)
        print("\n--- Agent Result ---")
        print(result)
    else:
        print("FAIL: Agent does not have run_task method.")

if __name__ == "__main__":
    asyncio.run(test_agent_task())
