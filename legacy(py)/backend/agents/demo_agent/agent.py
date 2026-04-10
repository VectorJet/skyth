import json
import asyncio
from typing import Any, Dict, List, Optional, Union, AsyncGenerator
from backend.base_classes.baseagent import BaseAgent
from backend.registries.tool_registry import ToolRegistry
from backend.converters.provider import generate_response, Provider
from backend.converters.tool_converter import ToolConverter

class DemoAgent(BaseAgent):
    """
    A demo agent that can use all global tools.
    """

    async def run_task(self, task: str, history: List[Dict[str, str]] = None, stream: bool = False) -> Union[str, AsyncGenerator[Any, None]]:
        print(f"[{self.name}] Running task: {task}")
        
        # 1. Discover Global Tools
        ToolRegistry.discover()
        all_tools_objs = ToolRegistry._tools
        openai_tools = ToolConverter.convert_registry_tools(all_tools_objs)
        
        # 2. Setup Context
        messages = [{"role": "system", "content": f"You are Skyth Demo Agent. {self.instructions}"}]
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": task})
        
        # 3. Get Model
        config = Provider.load_config()
        model_id = config.get("model", "openai/gpt-4o")
        
        try:
            # For simplicity, we'll do one turn with tools or streaming
            # If we want a loop, we'd need more complex logic.
            # But the 'GenericAgent' already does basic chat. 
            # This agent demonstrates tool integration.
            
            response = await generate_response(
                model_id=model_id,
                messages=messages,
                tools=openai_tools if openai_tools else None,
                stream=stream
            )
            
            return response
            
        except Exception as e:
            err = f"DemoAgent Error: {e}"
            if stream:
                async def err_gen():
                    yield err
                return err_gen()
            return err
