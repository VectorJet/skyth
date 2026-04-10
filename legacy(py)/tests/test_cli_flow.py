import asyncio
import sys
import os
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from backend.router import Router
from backend.registries.agent_registry import AgentRegistry

async def test_cli_flow():
    print("--- Testing CLI/Router Flow ---")
    
    # 1. Test Browser Routing
    print("\nQuery: 'Navigate to google.com'")
    agent = await Router.route("Navigate to google.com")
    if agent and agent.name == "Browser Agent":
        print("PASS: Routed to Browser Agent")
    else:
        print(f"FAIL: Routed to {agent.name if agent else 'None'}")

    # 2. Test General Routing
    print("\nQuery: 'Hello, who are you?'")
    agent = await Router.route("Hello, who are you?")
    if agent and (agent.name == "Generalist Agent" or agent.name == "Skyth Demo Agent"):
        print(f"PASS: Routed to {agent.name}")
        
        # Test Generic Run
        print("Testing Generic Run...")
        response = await agent.run_task("Hello, who are you?")
        print(f"Response: {response[:100]}...") # Truncate
    else:
        print(f"FAIL: Routed to {agent.name if agent else 'None'}")

if __name__ == "__main__":
    asyncio.run(test_cli_flow())
