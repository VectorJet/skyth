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
from backend.registries.pipeline_registry import PipelineRegistry
from backend.registries.agent_registry import AgentRegistry
from backend.converters.tool_converter import ToolConverter
from backend.converters.provider import Provider, generate_response

def load_env():
    env_file = PROJECT_ROOT / ".env"
    if env_file.exists():
        with open(env_file, "r") as f:
            for line in f:
                if line.strip() and "=" in line and not line.startswith("#"):
                    k, v = line.strip().split("=", 1)
                    os.environ[k] = v

async def execute_tool_call(tool_call, tools_map, pipelines_map):
    """
    Executes a tool call by looking up the tool/pipeline in the registries.
    """
    func_name = tool_call.function.name
    arguments_str = tool_call.function.arguments
    
    print(f"\n   ⚙️  Executing {func_name}...")
    
    try:
        args = json.loads(arguments_str)
    except json.JSONDecodeError:
        return f"Error: Invalid JSON arguments: {arguments_str}"

    if func_name in tools_map:
        return json.dumps(await ToolRegistry.get_tool(func_name).run(args))

    if func_name in pipelines_map:
        return str(await PipelineRegistry.get_pipeline(func_name).run(args))
    
    return f"Error: Function {func_name} not found."

def sanitize_tool_calls(tool_calls, available_tools):
    """
    Aggressively fixes merged tool calls from models like GLM-4.
    Handles:
    1. Merged JSON args: '{"a":1}{"b":2}'
    2. Merged Function Names: 'weather_toolstock_pipeline'
    """
    sanitized = []
    
    for tc in tool_calls:
        raw_args = tc.function.arguments.strip()
        raw_name = tc.function.name.strip()
        
        # CASE 1: Arguments are merged JSON objects (e.g. } {)
        if "}{" in raw_args:
            split_args = raw_args.replace("}{", "}|{").split("|")
            print(f"   ⚠️  Detected merged JSON arguments. Splitting...")
            
            # Try to infer names if the name is also merged
            names_to_assign = [raw_name] * len(split_args)
            
            # Logic to split mashed function name (e.g. "weather_toolstock_pipeline")
            # We check if the raw_name contains multiple known tool names
            found_names = []
            temp_name = raw_name
            for known_tool in available_tools:
                if known_tool in temp_name:
                    found_names.append(known_tool)
            
            # If we found multiple known names in the mashed string, assign them in order
            # This is a heuristic: assumes order of names matches order of args
            if len(found_names) == len(split_args):
                names_to_assign = found_names
            
            for i, arg_segment in enumerate(split_args):
                new_tc = type(tc)(
                    index=tc.index + i,
                    id=f"{tc.id}_{i}",
                    function=type(tc.function)(
                        name=names_to_assign[i] if i < len(names_to_assign) else raw_name,
                        arguments=arg_segment
                    )
                )
                sanitized.append(new_tc)
        else:
            sanitized.append(tc)
            
    return sanitized

async def run_agent_test():
    load_env()
    config = Provider.load_config()
    model_id = config.get("model")
    
    print(f"\n🤖 --- Generalist Agent Loop Test on {model_id} ---")

    # 1. Initialize Registries
    print("📂 Loading Registries...")
    ToolRegistry.discover("backend")
    PipelineRegistry.discover("backend")
    AgentRegistry.discover("backend")

    tools_map = ToolRegistry._tools
    pipelines_map = PipelineRegistry._pipelines
    
    # Create a list of all valid callable names for the sanitizer
    all_callable_names = list(tools_map.keys()) + list(pipelines_map.keys())
    
    agent = AgentRegistry.get_agent("Generalist Agent")
    if not agent:
        print("❌ Could not find 'Generalist Agent'")
        return

    # 2. Prepare Capabilities
    tools_schema = []
    if agent.global_capabilities:
        t_schemas = ToolConverter.convert_registry_tools(ToolRegistry._tools)
        p_schemas = ToolConverter.convert_registry_pipelines(PipelineRegistry._pipelines)
        tools_schema = t_schemas + p_schemas

    # 3. User Query
    user_query = "What is the weather in Paris right now AND what is the stock price of NVDA? Give me a summary."
    print(f"\n" + "="*60)
    print(f"💬 User: {user_query}")
    print("-" * 60)
    
    messages = [{"role": "user", "content": user_query}]
    turn_count = 0
    max_turns = 5

    # 4. Agent Loop
    while turn_count < max_turns:
        turn_count += 1
        print(f"\n🤖 Agent (Turn {turn_count}):")
        
        try:
            response = await generate_response(
                model_id=model_id,
                messages=messages,
                system=agent.instructions,
                stream=True,
                tools=tools_schema
            )

            raw_tool_calls = []
            content_buffer = ""
            
            async for chunk in response:
                if not chunk.choices: continue
                delta = chunk.choices[0].delta

                if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                    print(f"\033[90m{delta.reasoning_content}\033[0m", end="", flush=True)

                if delta.content:
                    print(delta.content, end="", flush=True)
                    content_buffer += delta.content

                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        while len(raw_tool_calls) <= tc.index:
                            placeholder = type(tc)(
                                index=len(raw_tool_calls),
                                id=tc.id or f"call_{len(raw_tool_calls)}",
                                function=type(tc.function)(name="", arguments="")
                            )
                            raw_tool_calls.append(placeholder)
                        
                        target = raw_tool_calls[tc.index]
                        if tc.id: target.id += tc.id
                        if tc.function.name: target.function.name += tc.function.name
                        if tc.function.arguments: target.function.arguments += tc.function.arguments

            if raw_tool_calls:
                # Sanitize using the registry list
                tool_calls = sanitize_tool_calls(raw_tool_calls, all_callable_names)
                
                print(f"\n\n   [⚡ Agent requested {len(tool_calls)} tool(s)]")
                
                # Append Assistant Message
                # Explicitly setting content to "" if None to satisfy some picky APIs
                messages.append({
                    "role": "assistant",
                    "content": content_buffer if content_buffer else "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {"name": tc.function.name, "arguments": tc.function.arguments}
                        } for tc in tool_calls
                    ]
                })

                # Execute & Append Results
                for tc in tool_calls:
                    output = await execute_tool_call(tc, tools_map, pipelines_map)
                    print(f"   ✅ Output: {output[:100]}...")

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": output
                    })
                continue 

            else:
                print(f"\n\n   [🏁 Agent finished with text response]")
                break
        
        except Exception as e:
            print(f"\n❌ Error in loop: {traceback.format_exc()}")
            break

if __name__ == "__main__":
    asyncio.run(run_agent_test())
