#!/usr/bin/env python3
import asyncio
import os
import sys
import json
import traceback
import re
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT))

from backend.registries.tool_registry import ToolRegistry
from backend.converters.tool_converter import ToolConverter
from backend.converters.provider import Provider, generate_response

# --- SYSTEM PROMPT ---
SYSTEM_PROMPT = """You are a helpful assistant with access to tools.
1. If the user asks for a task that can be done with a tool, you MUST use the tool.
2. Do not just describe the tool call, actually invoke it using the available tool definitions.
3. If you need to perform multiple steps, you can call tools multiple times.
"""

def load_env():
    env_file = PROJECT_ROOT / ".env"
    if env_file.exists():
        print(f"Loading .env from {env_file}...")
        with open(env_file, "r") as f:
            for line in f:
                if line.strip() and "=" in line and not line.startswith("#"):
                    k, v = line.strip().split("=", 1)
                    os.environ[k] = v

async def test_tool_integration(model_id: str):
    print(f"\n--- Testing Tool Registry Integration with {model_id} ---")
    
    if not model_id:
        print("❌ No model configured.")
        return

    # 1. Discover Tools
    print("🔍 Discovering tools via Registry...")
    ToolRegistry.discover("backend")
    registered_tools = ToolRegistry._tools
    
    if not registered_tools:
        print("❌ No tools found! Ensure 'backend/tools/' has '_tool.py' files.")
        return
        
    print(f"✅ Found {len(registered_tools)} tools: {list(registered_tools.keys())}")

    # 2. Convert Tools
    print("🔄 Converting tools to OpenAI Schema...")
    api_tools = ToolConverter.convert_registry_tools(registered_tools)
    
    # 3. Test Interaction
    prompt = "Use the calculator to add 50 and 25, then divide the result by 3."
    messages = [{"role": "user", "content": prompt}]
    
    print(f"\nOUTGOING PROMPT: '{prompt}'")
    print(f"SYSTEM PROMPT: Loaded ({len(SYSTEM_PROMPT)} chars)")
    
    try:
        response = await generate_response(
            model_id=model_id,
            messages=messages,
            system=SYSTEM_PROMPT,  # <--- ADDED SYSTEM PROMPT
            stream=True,
            tools=api_tools
        )
        
        print("\n--- Response Stream ---")
        tool_calls = []
        collected_content = ""
        
        async for chunk in response:
            if not chunk.choices: continue
            
            delta = chunk.choices[0].delta
            
            # Print content
            if hasattr(delta, 'content') and delta.content:
                print(delta.content, end="", flush=True)
                collected_content += delta.content
            
            # Print reasoning (if any)
            if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                print(f"\033[90m{delta.reasoning_content}\033[0m", end="", flush=True)

            # Capture Standard Tool Calls
            if delta.tool_calls:
                print(".", end="", flush=True)
                for tc in delta.tool_calls:
                    if len(tool_calls) <= tc.index:
                        tool_calls.append({"id": "", "function": {"name": "", "arguments": ""}})
                    
                    if tc.id: tool_calls[tc.index]["id"] += tc.id
                    if tc.function.name: tool_calls[tc.index]["function"]["name"] += tc.function.name
                    if tc.function.arguments: tool_calls[tc.index]["function"]["arguments"] += tc.function.arguments

        print("\n\n--- Result Analysis ---")
        
        # Check for standard API tool calls
        if tool_calls:
            print(f"✅ SUCCESS: Model generated {len(tool_calls)} structured tool call(s).")
            for tc in tool_calls:
                print(f"  🔧 Tool: {tc['function']['name']}")
                print(f"  📝 Args: {tc['function']['arguments']}")

        # Check for "Raw Text" tool calls (Fallback for models like Cogito/Mistral that leak tokens)
        elif "<|tool" in collected_content or "```json" in collected_content:
            print("⚠️ PARTIAL SUCCESS: Model attempted to call tool but returned raw text (Driver parsing issue).")
            print("  -> Found raw tool tokens in content.")
            # Simple regex check to see if it got the logic right
            if "calculator" in collected_content and "50" in collected_content:
                 print("  -> Logic check: Looks like it tried the correct tool.")
        
        else:
            print("❌ FAILURE: Model did not call any tools.")
            print("  -> Suggestion: Check if model supports 'tools' parameter or requires specific prompt format.")

    except Exception as e:
        print("❌ CRITICAL FAILURE:")
        traceback.print_exc()

async def main():
    load_env()
    config = Provider.load_config()
    primary = config.get("model")
    await test_tool_integration(primary)

if __name__ == "__main__":
    asyncio.run(main())