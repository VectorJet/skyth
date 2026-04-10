import asyncio
import json
import os
from typing import Any, Dict, List, Optional
from backend.base_classes.baseagent import BaseAgent
from backend.managers.mcp_manager.mcp_manager import MCPManager
from backend.converters.provider import generate_response, Provider
from mcp import ClientSession

class BrowserAgent(BaseAgent):
    def __init__(self, manifest_path: str, dependencies: Optional[Dict[str, Any]] = None, **kwargs):
        super().__init__(manifest_path, dependencies, **kwargs)
        self.server_id = f"agent:browser_agent.playwright"

    async def run_task(self, task: str, history: List[Dict[str, str]] = None) -> str:
        """
        Executes a task using the Browser MCP tools.
        """
        print(f"[{self.name}] Received task: {task}")
        
        # Ensure MCP Manager has discovered servers
        MCPManager.discover()
        
        # Check if server exists
        if self.server_id not in MCPManager.list_servers():
            return f"Error: MCP Server {self.server_id} not found."

        # Get configured model
        config = Provider.load_config()
        model_id = config.get("model", "openai/gpt-4o")

        try:
            async with MCPManager.get_session(self.server_id) as session:
                await session.initialize()
                
                # List tools
                tools_result = await session.list_tools()
                mcp_tools = tools_result.tools
                
                # Convert to OpenAI Tools format
                openai_tools = self._convert_mcp_tools(mcp_tools)
                
                # Construct messages with history
                messages = [{"role": "system", "content": f"You are a browser automation agent. {self.instructions}"}]
                
                if history:
                    messages.extend(history)
                
                messages.append({"role": "user", "content": task})
                
                # Simple ReAct-like loop (single turn for simplicity or max 1000 turns)
                for i in range(1000):
                    print(f"[{self.name}] Step {i+1}...")
                    
                    try:
                        response = await generate_response(
                            model_id=model_id,
                            messages=messages,
                            tools=openai_tools,
                            stream=False
                        )
                    except Exception as llm_err:
                        return f"LLM Error: {llm_err}"

                    # Handle different response types (Streaming vs Non-streaming vs Qwen/Gemini Custom)
                    if hasattr(response, "choices"):
                        msg = response.choices[0].message
                    else:
                        # Fallback for custom clients if they return dict or other format
                        # (The provider.py implementation seems to return standard-ish objects)
                        msg = response
                    
                    # Append assistant message
                    # Ensure we convert tool_calls to dict if necessary for subsequent calls
                    msg_dict = {"role": "assistant", "content": msg.content}
                    if hasattr(msg, "tool_calls") and msg.tool_calls:
                         msg_dict["tool_calls"] = [
                             {
                                 "id": tc.id,
                                 "type": tc.type,
                                 "function": {
                                     "name": tc.function.name,
                                     "arguments": tc.function.arguments
                                 }
                             } for tc in msg.tool_calls
                         ]
                    messages.append(msg_dict)
                    
                    if hasattr(msg, "tool_calls") and msg.tool_calls:
                        tool_names = [tc.function.name for tc in msg.tool_calls]
                        print(f"[{self.name}] Tool Calls: {tool_names}")
                        
                        for tool_call in msg.tool_calls:
                            fn_name = tool_call.function.name
                            fn_args = json.loads(tool_call.function.arguments)
                            
                            # Execute via MCP
                            print(f"[{self.name}] Executing {fn_name} with {fn_args}")
                            try:
                                result = await session.call_tool(fn_name, fn_args)
                                content = result.content
                                
                                # Format result for LLM
                                tool_output = ""
                                for item in content:
                                    if item.type == "text":
                                        tool_output += item.text
                                    elif item.type == "image":
                                        tool_output += "[Image Content]"
                                
                                messages.append({
                                    "role": "tool",
                                    "tool_call_id": tool_call.id,
                                    "content": tool_output,
                                    "name": fn_name 
                                })
                                print(f"[{self.name}] Tool Output (truncated): {tool_output[:100]}...")
                                
                            except Exception as tool_err:
                                messages.append({
                                    "role": "tool",
                                    "tool_call_id": tool_call.id,
                                    "content": f"Error executing tool: {tool_err}",
                                     "name": fn_name 
                                })
                    else:
                        # No tool calls, final answer
                        print(f"[{self.name}] Final Answer: {msg.content}")
                        return msg.content
                
                return "Max steps reached."

        except Exception as e:
            import traceback
            traceback.print_exc()
            return f"Agent Runtime Error: {e}"

    def _convert_mcp_tools(self, mcp_tools: List[Any]) -> List[Dict[str, Any]]:
        """
        Converts MCP Tool objects to OpenAI tool definitions.
        """
        openai_tools = []
        for tool in mcp_tools:
            openai_tools.append({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.inputSchema
                }
            })
        return openai_tools
