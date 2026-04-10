# backend/agents/research_agent/agent.py

import json
import traceback
from google import genai
from google.genai import types
from typing import List, Dict, AsyncGenerator

from backend.utils import yield_data
from backend.tool_registry import ToolRegistry
from backend.mcp_manager import MCPManager
from backend.pipeline_registry import PipelineRegistry
from backend.base_agent import BaseAgent


class ResearchAgent(BaseAgent):
    """
    A specialized agent for conducting in-depth research.
    """

    def __init__(
        self,
        tool_registry: ToolRegistry,
        mcp_manager: MCPManager,
        pipeline_registry: PipelineRegistry,
        api_key: str,
        utility_model: str,
        **kwargs,
    ):
        self.tool_registry = tool_registry
        self.mcp_manager = mcp_manager
        self.pipeline_registry = pipeline_registry
        self.api_key = api_key
        self.utility_model = utility_model
        if not self.api_key:
            raise RuntimeError("ResearchAgent requires an API key.")
        self.client = genai.Client(api_key=self.api_key)

    @property
    def name(self) -> str:
        return "research_agent"

    @property
    def description(self) -> str:
        return "Performs in-depth research on a topic by searching the web, reading sources, and synthesizing information into a comprehensive report."

    @property
    def ui_component(self) -> str:
        return "ResearchTimeline"

    def _get_model_config(
        self,
        model_name: str,
        tool_declarations: List[types.FunctionDeclaration],
        system_instruction: str = None,
    ) -> types.GenerateContentConfig:
        model_lower = model_name.lower()
        is_flash_lite = "lite" in model_lower or "flash-lite" in model_lower
        is_pro = "pro" in model_lower and "lite" not in model_lower
        is_flash = (
            "flash" in model_lower
            and "lite" not in model_lower
            and "pro" not in model_lower
        )

        config_dict = {}
        if tool_declarations:
            config_dict["tools"] = [types.Tool(function_declarations=tool_declarations)]

        # Only use ThinkingConfig if available in this version of google-genai
        if hasattr(types, "ThinkingConfig"):
            if is_flash_lite:
                config_dict["thinking_config"] = types.ThinkingConfig(
                    include_thoughts=True, thinking_budget=8192
                )
            elif is_flash:
                config_dict["thinking_config"] = types.ThinkingConfig(
                    include_thoughts=True, thinking_budget=16384
                )
            elif is_pro:
                config_dict["thinking_config"] = types.ThinkingConfig(
                    include_thoughts=True, thinking_budget=24576
                )
            else:
                config_dict["thinking_config"] = types.ThinkingConfig(
                    include_thoughts=True, thinking_budget=16384
                )

        if system_instruction:
            config_dict["system_instruction"] = system_instruction

        return types.GenerateContentConfig(**config_dict)

    # --- ASYNC EXECUTE ---
    async def execute(
        self,
        query: str,
        chat_history: List[Dict],
        user_id: int,
        model_name: str,
        system_prompt: str,
        tool_declarations: List[types.FunctionDeclaration],
        personalization_prompt: str = "",
        router_response: str = "",
        original_user_query: str = "",
    ) -> AsyncGenerator[str, None]:
        conversation = list(chat_history)

        if router_response:
            conversation.append(
                {"role": "model", "parts": [types.Part(text=router_response)]}
            )

        # --- KICKOFF PROMPT ---
        if conversation and conversation[-1].get("role") == "model":
            kickoff_message = f"Proceed with the research request: {query}"
            conversation.append(
                {"role": "user", "parts": [types.Part(text=kickoff_message)]}
            )
        # ----------------------

        allowed_tool_names = {t.name for t in tool_declarations}

        agent_steps, final_text_response, max_turns = [], "", 15

        try:
            for turn in range(max_turns):
                yield yield_data(
                    "step",
                    {
                        "status": "thinking",
                        "text": f"Research step {turn + 1}/{max_turns}...",
                    },
                )

                config = self._get_model_config(
                    model_name, tool_declarations, system_instruction=system_prompt
                )

                response_stream = self.client.aio.models.generate_content_stream(
                    model=model_name, contents=conversation, config=config
                )

                function_calls, current_turn_text = [], ""
                has_thoughts = False

                async for chunk in response_stream:
                    if (
                        not chunk.candidates
                        or not chunk.candidates[0].content
                        or not chunk.candidates[0].content.parts
                    ):
                        continue

                    for part in chunk.candidates[0].content.parts:
                        if hasattr(part, "thought") and part.thought:
                            has_thoughts = True
                            step = {"type": "thought", "content": part.text}
                            agent_steps.append(step)
                            yield yield_data("thought", step)

                        elif hasattr(part, "function_call") and part.function_call:
                            function_calls.append(part.function_call)

                        elif part.text:
                            current_turn_text += part.text
                            # --- REAL-TIME STREAMING FIX ---
                            yield yield_data("answer_chunk", part.text)

                # --- HANDLING THE "THOUGHTS ONLY" CASE ---
                if not function_calls and not current_turn_text.strip():
                    if has_thoughts:
                        # If the model thought but didn't act, prompt it to continue
                        conversation.append(
                            {
                                "role": "user",
                                "parts": [
                                    types.Part(
                                        text="You have analyzed the situation. Now, please execute the necessary tool call or provide the final answer."
                                    )
                                ],
                            }
                        )
                        continue
                    else:
                        break

                if not function_calls:
                    final_text_response = current_turn_text
                    break

                conversation.append(
                    {
                        "role": "model",
                        "parts": [
                            types.Part(function_call=fc) for fc in function_calls
                        ],
                    }
                )
                tool_response_parts = []

                for call in function_calls:
                    tool_name, args = call.name, dict(call.args)

                    # Security Check
                    if tool_name not in allowed_tool_names:
                        error_msg = f"Security Error: You are not authorized to use the tool '{tool_name}'. You may only use: {', '.join(list(allowed_tool_names)[:5])}..."
                        step = {
                            "type": "tool_result",
                            "tool": tool_name,
                            "result": error_msg,
                        }
                        agent_steps.append(step)
                        yield yield_data("tool_result", step)
                        tool_response_parts.append(
                            types.Part(
                                function_response=types.FunctionResponse(
                                    name=tool_name, response={"content": error_msg}
                                )
                            )
                        )
                        continue

                    if self.pipeline_registry.get_pipeline(tool_name):
                        yield yield_data(
                            "step",
                            {
                                "status": "acting",
                                "text": f"Executing pipeline: {tool_name}...",
                            },
                        )
                        pipeline_kwargs = {
                            **args,
                            "user_id": user_id,
                            "model_name": model_name,
                            "api_key": self.api_key,
                            "utility_model": self.utility_model,
                        }
                        pipeline_generator = self.pipeline_registry.execute_pipeline(
                            name=tool_name, **pipeline_kwargs
                        )
                        for event in pipeline_generator:
                            yield event
                        return

                    step = {"type": "tool_call", "tool": tool_name, "args": args}
                    agent_steps.append(step)
                    yield yield_data("tool_call", step)

                    tool_kwargs = {"user_id": user_id, **args}

                    result = None
                    if self.tool_registry.get_tool(tool_name):
                        result = self.tool_registry.execute_tool(
                            tool_name, **tool_kwargs
                        )
                    elif tool_name in self.mcp_manager.tools:
                        result = self.mcp_manager.execute_tool(
                            tool_name, args, user_id=user_id
                        )
                    else:
                        result = {
                            "error": f"Tool '{tool_name}' was called but does not exist."
                        }

                    result_str = json.dumps(result, default=str)

                    step = {
                        "type": "tool_result",
                        "tool": tool_name,
                        "result": result_str,
                    }
                    agent_steps.append(step)
                    yield yield_data("tool_result", step)

                    tool_response_parts.append(
                        types.Part(
                            function_response=types.FunctionResponse(
                                name=tool_name, response={"content": result_str}
                            )
                        )
                    )

                conversation.append({"role": "user", "parts": tool_response_parts})

            if not final_text_response:
                yield yield_data(
                    "step",
                    {"status": "thinking", "text": "Synthesizing final answer..."},
                )

                synthesis_prompt = "Based on all the information gathered, provide a comprehensive final answer."
                conversation.append(
                    {"role": "user", "parts": [{"text": synthesis_prompt}]}
                )

                config = self._get_model_config(
                    model_name, [], system_instruction=system_prompt
                )

                synthesis_stream = self.client.aio.models.generate_content_stream(
                    model=model_name, contents=conversation, config=config
                )

                async for chunk in synthesis_stream:
                    if (
                        not chunk.candidates
                        or not chunk.candidates[0].content
                        or not chunk.candidates[0].content.parts
                    ):
                        continue

                    for part in chunk.candidates[0].content.parts:
                        if hasattr(part, "thought") and part.thought:
                            step = {"type": "thought", "content": part.text}
                            agent_steps.append(step)
                            yield yield_data("thought", step)
                        elif part.text:
                            final_text_response += part.text
                            # --- REAL-TIME STREAMING FIX ---
                            yield yield_data("answer_chunk", part.text)

            yield yield_data("step", {"status": "done", "text": "Research finished."})

        except Exception as e:
            error_msg = f"An error occurred in the research agent: {e}"
            print(f"🔴 {error_msg}")
            traceback.print_exc()
            yield yield_data(
                "error", {"message": str(error_msg), "agentSteps": agent_steps}
            )
