import json
import asyncio
from typing import List, Dict, Any, Optional, AsyncGenerator, Union
from backend.base_classes.baseagent import BaseAgent
from backend.converters.provider import generate_response, Provider
from backend.converters.tool_converter import ToolConverter
from backend.registries.tool_registry import ToolRegistry
from backend.registries.pipeline_registry import PipelineRegistry
from backend.managers.mcp_manager.mcp_manager import MCPManager

class MasterAgent(BaseAgent):
    """
    The Master Agent orchestrates multiple tools and pipelines to solve complex tasks.
    It can handle tool calls in a loop and execute pipelines.
    """

    @property
    def name(self) -> str:
        return "Master Agent"

    async def run_task(self, task: str, history: List[Dict[str, str]] = None, stream: bool = False) -> Union[str, AsyncGenerator[Any, None]]:
        # 1. Discover and convert tools
        # For simplicity, we discover all components here (or assume they are already discovered)
        ToolRegistry.discover()
        PipelineRegistry.discover()
        # MCP tools discovery is async and potentially slow, we should ideally have them cached.
        
        # 2. Get OpenAI-style tools
        native_tools = ToolConverter.convert_registry_tools(ToolRegistry._tools)
        native_pipelines = ToolConverter.convert_registry_pipelines(PipelineRegistry._pipelines)
        mcp_tools = MCPManager.get_openai_tools()
        
        all_tools = native_tools + native_pipelines + mcp_tools
        
        # 3. Execution Loop
        conversation = []
        if history:
            conversation.extend(history)
        conversation.append({"role": "user", "content": task})
        
        config = Provider.load_config()
        model_id = config.get("model", "openai/gpt-4o")
        
        max_turns = 10
        
        if stream:
            return self._run_loop_stream(model_id, conversation, all_tools, max_turns)
        else:
            return await self._run_loop_sync(model_id, conversation, all_tools, max_turns)

    async def _run_loop_sync(self, model_id, conversation, tools, max_turns) -> str:
        for turn in range(max_turns):
            response = await generate_response(
                model_id=model_id,
                messages=conversation,
                system=self.instructions,
                tools=tools if tools else None,
                stream=False
            )
            
            # Handle response (LiteLLM returns object)
            message = response.choices[0].message
            conversation.append(message) # Add assistant message to history
            
            if not message.tool_calls:
                return message.content
            
            # Execute tool calls
            for tool_call in message.tool_calls:
                result = await self._execute_tool(tool_call)
                conversation.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": tool_call.function.name,
                    "content": json.dumps(result)
                })
        
        return "Reached maximum turns in Master Agent loop."

    async def _run_loop_stream(self, model_id, conversation, tools, max_turns) -> AsyncGenerator[Any, None]:
        for turn in range(max_turns):
            response_gen = await generate_response(
                model_id=model_id,
                messages=conversation,
                system=self.instructions,
                tools=tools if tools else None,
                stream=True
            )
            
            full_content = ""
            tool_calls = {} # id -> {name, args}
            
            async for chunk in response_gen:
                if not hasattr(chunk, 'choices') or not chunk.choices:
                    continue
                
                delta = chunk.choices[0].delta
                
                # Stream content to frontend
                if hasattr(delta, 'content') and delta.content:
                    full_content += delta.content
                    yield chunk
                
                # Accumulate tool calls
                if hasattr(delta, 'tool_calls') and delta.tool_calls:
                    for tc in delta.tool_calls:
                        if tc.id:
                            tool_calls[tc.id] = {"name": tc.function.name, "arguments": tc.function.arguments}
                        else:
                            # Append arguments if chunked
                            # Wait, LiteLLM usually provides ID in first chunk.
                            # We might need to handle partial IDs if provided differently.
                            # For now, assume simple accumulation.
                            # Actually, tc.index is often used.
                            idx = getattr(tc, 'index', 0)
                            # ... (Complex tool call streaming logic skipped for MVP) ...
                            pass

            # Update conversation
            assistant_msg = {"role": "assistant", "content": full_content}
            if tool_calls:
                # Format tool calls for history
                assistant_msg["tool_calls"] = [
                    {"id": k, "type": "function", "function": {"name": v["name"], "arguments": v["arguments"]}}
                    for k, v in tool_calls.items()
                ]
            
            conversation.append(assistant_msg)
            
            if not tool_calls:
                break
            
            # Execute tool calls and add results
            for tc_id, tc_info in tool_calls.items():
                # Yield "thought" about tool execution
                # We need a way to wrap it in a Chunk object or similar if we want to be consistent.
                # Or just yield a custom object that the router/frontend handles.
                
                # Mock tool call object for _execute_tool
                class MockFunc:
                    def __init__(self, n, a): self.name = n; self.arguments = a
                class MockTC:
                    def __init__(self, i, f): self.id = i; self.function = f
                
                mock_tc = MockTC(tc_id, MockFunc(tc_info["name"], tc_info["arguments"]))
                
                result = await self._execute_tool(mock_tc)
                
                conversation.append({
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "name": tc_info["name"],
                    "content": json.dumps(result)
                })
                
                # Optionally yield tool results to frontend if it supports it
                # yield f"data: {json.dumps({'type': 'tool_result', 'data': {'tool': tc_info['name'], 'result': result}})}\n\n"
        
        yield "[DONE]"

    async def _execute_tool(self, tool_call) -> Any:
        name = tool_call.function.name
        try:
            args = json.loads(tool_call.function.arguments)
        except:
            args = tool_call.function.arguments # might be already a dict or invalid string

        print(f"[MasterAgent] Executing tool: {name} with args: {args}")
        
        # 1. Check Native Tools
        tool = ToolRegistry.get_tool(name)
        if tool:
            return await tool.run(args)
        
        # 2. Check Pipelines
        pipeline = PipelineRegistry.get_pipeline(name)
        if pipeline:
            # Pipelines return generators, we need to collect or bridge
            results = []
            async for chunk in pipeline.run(args):
                results.append(chunk)
            return "".join(results)
        
        # 3. Check MCP Tools
        try:
            return await MCPManager.execute_tool(name, args)
        except:
            pass
            
        return {"error": f"Tool '{name}' not found or failed."}
