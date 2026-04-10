# backend/agents/master_agent/agent.py

import json
import traceback
import base64
from google import genai
from google.genai import types
from typing import List, Dict, AsyncGenerator
from backend.utils import yield_data
from backend.tool_registry import ToolRegistry
from backend.mcp_manager import MCPManager
from backend.pipeline_registry import PipelineRegistry
from backend.base_agent import BaseAgent


class MasterAgent(BaseAgent):
    """
    The primary, general-purpose agent for complex tasks involving multiple tools and pipelines.
    """

    def __init__(
        self,
        tool_registry: ToolRegistry,
        mcp_manager: MCPManager,
        pipeline_registry: PipelineRegistry,
        api_key: str,
        image_api_key: str,
        image_model: str,
        utility_model: str,
        **kwargs,
    ):
        self.tool_registry = tool_registry
        self.mcp_manager = mcp_manager
        self.pipeline_registry = pipeline_registry
        self.api_key = api_key
        self.image_api_key = image_api_key
        self.image_model = image_model
        self.utility_model = utility_model
        if not self.api_key:
            raise RuntimeError("MasterAgent requires an API key.")
        self.client = genai.Client(api_key=self.api_key)

    @property
    def name(self) -> str:
        return "master_agent"

    @property
    def description(self) -> str:
        return "A general-purpose agent for complex, multi-step tasks that require combining multiple tools or executing pipelines. Use for tasks like in-depth research, file manipulation, and image generation."

    @property
    def ui_component(self) -> str:
        return "AgentProcess"

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
                    include_thoughts=True, thinking_budget=16384
                )
            else:
                config_dict["thinking_config"] = types.ThinkingConfig(
                    include_thoughts=True, thinking_budget=8192
                )

        if system_instruction:
            config_dict["system_instruction"] = system_instruction

        return types.GenerateContentConfig(**config_dict)

    # ASYNC EXECUTE
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

        # --- FIX: Kickoff Prompt ---
        if conversation and conversation[-1].get("role") == "model":
            kickoff_message = f"Please handle this request: {query}"
            conversation.append(
                {"role": "user", "parts": [types.Part(text=kickoff_message)]}
            )
        # ---------------------------

        agent_steps, final_text_response, max_turns = [], "", 10

        try:
            for turn in range(max_turns):
                yield yield_data(
                    "step",
                    {"status": "thinking", "text": f"Planning step {turn + 1}..."},
                )

                config = self._get_model_config(
                    model_name, tool_declarations, system_instruction=system_prompt
                )

                # ASYNC CLIENT AIO
                response_stream = self.client.aio.models.generate_content_stream(
                    model=model_name, contents=conversation, config=config
                )

                function_calls, current_turn_text = [], ""

                # ASYNC FOR LOOP
                async for chunk in response_stream:
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
                        elif hasattr(part, "function_call") and part.function_call:
                            function_calls.append(part.function_call)
                        elif part.text:
                            current_turn_text += part.text

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
                    capability_name, args = call.name, dict(call.args)

                    if capability_name == "image_editor" and "image_data" not in args:
                        last_image_bytes = None
                        for message in reversed(conversation):
                            if "parts" in message:
                                for part in reversed(message["parts"]):
                                    if (
                                        hasattr(part, "inline_data")
                                        and part.inline_data
                                        and "image" in part.inline_data.mime_type
                                    ):
                                        last_image_bytes = part.inline_data.data
                                        break
                            if last_image_bytes:
                                break

                        if last_image_bytes:
                            args["image_data"] = base64.b64encode(
                                last_image_bytes
                            ).decode("utf-8")
                        else:
                            result = {
                                "error": "The model tried to edit an image, but no image was found in the recent conversation history."
                            }
                            result_str = json.dumps(result, default=str)
                            tool_response_parts.append(
                                types.Part(
                                    function_response=types.FunctionResponse(
                                        name=capability_name,
                                        response={"content": result_str},
                                    )
                                )
                            )
                            continue

                    if self.pipeline_registry.get_pipeline(capability_name):
                        yield yield_data(
                            "step",
                            {
                                "status": "acting",
                                "text": f"Executing pipeline: {capability_name}...",
                            },
                        )
                        pipeline_generator = self.pipeline_registry.execute_pipeline(
                            name=capability_name,
                            query=args.get("query"),
                            user_id=user_id,
                            model_name=model_name,
                            api_key=self.api_key,
                            utility_model=self.utility_model,
                        )
                        for event in pipeline_generator:
                            yield event
                        return

                    step = {"type": "tool_call", "tool": capability_name, "args": args}
                    agent_steps.append(step)
                    yield yield_data("tool_call", step)

                    tool_kwargs = {"user_id": user_id, **args}

                    if capability_name in ["image_generator", "image_editor"]:
                        tool_kwargs["api_key"], tool_kwargs["model_name"] = (
                            self.image_api_key,
                            self.image_model,
                        )

                    if self.tool_registry.get_tool(capability_name):
                        result = self.tool_registry.execute_tool(
                            capability_name, **tool_kwargs
                        )
                    elif capability_name in self.mcp_manager.tools:
                        result = self.mcp_manager.execute_tool(
                            capability_name, args, user_id=user_id
                        )
                    else:
                        result = {
                            "error": f"Capability '{capability_name}' was called but does not exist."
                        }

                    result_str = json.dumps(result, default=str)

                    step = {
                        "type": "tool_result",
                        "tool": capability_name,
                        "result": result_str,
                    }
                    agent_steps.append(step)
                    yield yield_data("tool_result", step)

                    tool_response_parts.append(
                        types.Part(
                            function_response=types.FunctionResponse(
                                name=capability_name, response={"content": result_str}
                            )
                        )
                    )

                conversation.append({"role": "user", "parts": tool_response_parts})

            if not final_text_response:
                yield yield_data(
                    "step",
                    {"status": "thinking", "text": "Synthesizing final answer..."},
                )
                synthesis_prompt = "Based on the previous steps, provide a concise, final answer to the user's original query. Remember to follow the 'Final Answer Formatting' rules from your system prompt."
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

            if not final_text_response:
                final_text_response = "Agent could not generate a final response. Please try rephrasing your query."

            for char in final_text_response:
                yield yield_data("answer_chunk", char)

            yield yield_data("step", {"status": "done", "text": "Agent finished."})

        except Exception as e:
            error_msg = f"An error occurred in the agent loop: {e}"
            print(f"🔴 {error_msg}")
            traceback.print_exc()
            yield yield_data(
                "error", {"message": str(error_msg), "agentSteps": agent_steps}
            )
