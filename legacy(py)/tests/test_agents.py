#!/usr/bin/env python3
import asyncio
import sys
import os
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT))

from backend.registries.agent_registry import AgentRegistry

async def test_agents():
    print("\n--- Testing Agent Registry ---")
    
    # 1. Discover
    print("🔍 Scanning for agents...")
    AgentRegistry.discover("backend")
    
    agents = AgentRegistry.list_agents()
    if not agents:
        print("❌ No agents found! Ensure 'backend/agents/' has 'agent_manifest.json' files.")
        return

    print(f"✅ Found {len(agents)} agents: {list(agents.keys())}")
    
    # 2. Verify Demo Agent
    target_agent = "Skyth Demo Agent"
    if target_agent in agents:
        print(f"\n🕵️ Inspecting '{target_agent}'...")
        agent_obj = AgentRegistry.get_agent(target_agent)
        
        print(f"  -> Name: {agent_obj.name}")
        print(f"  -> Global Capable: {agent_obj.global_capabilities}")
        
        # Check instructions
        instruction_preview = agent_obj.instructions[:50].replace("\n", " ") + "..."
        print(f"  -> Instructions: {instruction_preview}")
        
        if len(agent_obj.instructions) > 10:
            print(f"✅ Agent '{target_agent}' loaded successfully with instructions.")
        else:
            print(f"⚠️ Agent '{target_agent}' loaded but INSTRUCTIONS.md seems empty/missing.")
    else:
        print(f"⚠️ Agent '{target_agent}' not found in registry.")

if __name__ == "__main__":
    asyncio.run(test_agents())