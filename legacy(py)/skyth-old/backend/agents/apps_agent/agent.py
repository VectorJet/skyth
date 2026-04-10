# backend/agents/apps_agent/agent.py
import json
import traceback
import uuid
from google import genai
from google.genai import types
from typing import List, Dict, AsyncGenerator

from backend.base_agent import BaseAgent
from backend.utils import yield_data
from backend.mcp_manager import MCPManager
from backend.app_registry import AppModule, AppRegistry
from backend.tool_registry import ToolRegistry
from backend.pipeline_registry import PipelineRegistry


class AppsAgent(BaseAgent):
    """
    An agent that interacts with a specific, user-invoked App (MCP Server or native tools).
    """

    def __init__(
        self,
        mcp_manager: MCPManager,
        app_registry: AppRegistry,
        tool_registry: ToolRegistry,
        pipeline_registry: PipelineRegistry,
        api_key: str,
        utility_model: str,
        **kwargs,
    ):
        self.mcp_manager = mcp_manager
        self.app_registry = app_registry
        self.tool_registry = tool_registry
        self.pipeline_registry = pipeline_registry
        self.api_key = api_key
        self.utility_model = utility_model
        if not self.api_key:
            raise RuntimeError("AppsAgent requires an API key.")
        self.client = genai.Client(api_key=self.api_key)

    @property
    def name(self) -> str:
        return "apps_agent"

    @property
    def description(self) -> str:
        return "Handles user interactions with connected applications like Spotify, Wikipedia, etc. This agent is invoked via @app_name syntax."

    @property
    def ui_component(self) -> str:
        return "AppInteraction"

    def _get_model_config(
        self,
        model_name: str,
        tool_declarations: List[types.FunctionDeclaration],
        include_tools: bool = True,
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
        if include_tools and tool_declarations:
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

    def _convert_native_tool_to_gemini(self, tool) -> types.FunctionDeclaration:
        properties = {}
        required = []

        for param in tool.parameters:
            name = param["name"]
            p_type = param["type"].upper()
            desc = param["description"]

            prop_schema = types.Schema(type=p_type, description=desc)

            if p_type == "ARRAY":
                prop_schema.items = types.Schema(type="STRING")

            properties[name] = prop_schema
            required.append(name)

        return types.FunctionDeclaration(
            name=tool.name,
            description=tool.description,
            parameters=types.Schema(
                type="OBJECT", properties=properties, required=required
            ),
        )

    def _truncate_tool_response(self, result: any, max_length: int = 5000) -> str:
        if isinstance(result, dict):
            if "widget" in result or "widget_html" in result:
                widget_name = result.get("widget", "custom_view")
                summary = {
                    "widget": widget_name,
                    "status": "success",
                    "message": f"Widget '{widget_name}' generated.",
                }
                data_source = result.get("data", result.get("widget_data", {}))
                if isinstance(data_source, dict):
                    data_summary = {}
                    for key, value in data_source.items():
                        if key == "audio_data" and isinstance(value, dict):
                            data_summary[key] = f"<{len(value)} audio files>"
                        elif isinstance(value, list):
                            data_summary[key] = f"<list of {len(value)} items>"
                        elif isinstance(value, str) and len(value) > 200:
                            data_summary[key] = f"{value[:200]}..."
                        else:
                            data_summary[key] = value
                    summary["data_summary"] = data_summary
                return json.dumps(summary, default=str)

            truncated = {}
            for key, value in result.items():
                if isinstance(value, str) and len(value) > 1000:
                    truncated[key] = f"{value[:1000]}... (truncated)"
                elif isinstance(value, list) and len(value) > 10:
                    truncated[key] = value[:10] + [
                        f"... and {len(value) - 10} more items"
                    ]
                else:
                    truncated[key] = value
            return json.dumps(truncated, default=str)[:max_length]

        elif isinstance(result, str):
            if len(result) > max_length:
                return result[:max_length] + "... (truncated)"
            return result

        return str(result)[:max_length]

    # --- ASYNC EXECUTE ---
    async def execute(
        self,
        query: str,
        chat_history: List[Dict],
        user_id: int,
        model_name: str,
        app_name: str,
        system_prompt: str,
        tool_declarations: List[types.FunctionDeclaration],
        personalization_prompt: str = "",
        router_response: str = "",
        original_user_query: str = "",
    ) -> AsyncGenerator[str, None]:
        try:
            app_info: AppModule = self.app_registry.get_app(app_name)
            if not app_info:
                yield yield_data(
                    "error", {"message": f"Application '{app_name}' not found."}
                )
                return

            app_tools_declarations = []
            mcp_server_id = None

            if app_info.mcp_config_path:
                try:
                    with open(app_info.path / app_info.mcp_config_path, "r") as f:
                        config = json.load(f)
                        mcp_server_id = next(iter(config.get("mcpServers", {})), None)
                    if mcp_server_id:
                        app_tools_declarations.extend(
                            self.mcp_manager.get_gemini_tools_for_server(mcp_server_id)
                        )
                except Exception as e:
                    yield yield_data(
                        "error",
                        {"message": f"Could not load MCP config for '{app_name}': {e}"},
                    )
                    return

            native_tools = self.tool_registry.get_all_tools(owner_name=app_name)
            for tool in native_tools:
                app_tools_declarations.append(self._convert_native_tool_to_gemini(tool))

            native_pipelines = self.pipeline_registry.get_all_pipelines(
                owner_name=app_name
            )
            for pipeline in native_pipelines:
                app_tools_declarations.append(
                    self._convert_native_tool_to_gemini(pipeline)
                )

            if not app_tools_declarations:
                yield yield_data(
                    "error",
                    {
                        "message": f"No tools or pipelines found for application '{app_name}'. Is the app configured correctly?"
                    },
                )
                return

            conversation = list(chat_history)

            if router_response:
                conversation.append(
                    {"role": "model", "parts": [types.Part(text=router_response)]}
                )

            final_text_for_agent = f"@{app_name} {query}"
            if conversation and conversation[-1].get("role") == "user":
                conversation[-1]["parts"].append(types.Part(text=final_text_for_agent))
            else:
                conversation.append(
                    {"role": "user", "parts": [types.Part(text=final_text_for_agent)]}
                )

            final_text_response, max_turns = "", 10

            for turn in range(max_turns):
                config = self._get_model_config(
                    model_name,
                    app_tools_declarations,
                    include_tools=True,
                    system_instruction=system_prompt,
                )

                # ASYNC CLIENT AIO
                response_stream = self.client.aio.models.generate_content_stream(
                    model=model_name, contents=conversation, config=config
                )

                function_calls, current_turn_text = [], ""

                # ASYNC LOOP
                async for chunk in response_stream:
                    if (
                        not chunk.candidates
                        or not chunk.candidates[0].content
                        or not chunk.candidates[0].content.parts
                    ):
                        continue
                    for part in chunk.candidates[0].content.parts:
                        if hasattr(part, "thought") and part.thought:
                            yield yield_data("thought", {"content": part.text})
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
                    tool_name, args = call.name, dict(call.args)

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
                        tool_response_parts.append(
                            types.Part(
                                function_response=types.FunctionResponse(
                                    name=tool_name,
                                    response={
                                        "content": "Pipeline executed successfully."
                                    },
                                )
                            )
                        )
                        continue

                    result = None
                    if self.tool_registry.get_tool(tool_name):
                        result = self.tool_registry.execute_tool(tool_name, **args)
                    else:
                        result = self.mcp_manager.execute_tool(
                            tool_name, args, user_id=user_id
                        )

                    is_widget = False
                    widget_data = {}

                    if isinstance(result, dict):
                        if "widget" in result:
                            is_widget = True
                            widget_data = result
                        elif "widget_html" in result:
                            is_widget = True
                            widget_data = {
                                "widget": "mcp_html_render",
                                "data": result.get("widget_data", result),
                            }
                            if "widget_html" in result:
                                widget_data["data"]["html"] = result["widget_html"]

                    elif isinstance(result, str):
                        try:
                            parsed_result = json.loads(result)
                            if isinstance(parsed_result, dict) and (
                                "widget" in parsed_result
                                or "widget_html" in parsed_result
                            ):
                                is_widget = True
                                widget_data = parsed_result
                        except json.JSONDecodeError:
                            pass

                    if is_widget:
                        artifact = {
                            "id": f"widget_{widget_data.get('widget', 'app')}_{uuid.uuid4().hex[:8]}",
                            "type": "app_widget",
                            "content": {
                                "widget": widget_data.get("widget", "custom"),
                                "data": widget_data.get("data", {}),
                            },
                        }
                        yield yield_data("artifacts", [artifact])
                        result = widget_data

                    truncated_response = self._truncate_tool_response(result)
                    tool_response_parts.append(
                        types.Part(
                            function_response=types.FunctionResponse(
                                name=tool_name, response={"content": truncated_response}
                            )
                        )
                    )

                conversation.append({"role": "user", "parts": tool_response_parts})

            if not final_text_response:
                synthesis_prompt = "You have finished using tools. Now, you MUST provide a single, short confirmation sentence. Follow the CRITICAL FINAL RESPONSE INSTRUCTIONS from your system prompt exactly."
                conversation.append(
                    {"role": "user", "parts": [{"text": synthesis_prompt}]}
                )

                config = self._get_model_config(
                    model_name,
                    app_tools_declarations,
                    include_tools=False,
                    system_instruction=system_prompt,
                )

                # ASYNC CLIENT AIO
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
                            continue
                        elif part.text:
                            final_text_response += part.text

            for char in final_text_response:
                yield yield_data("answer_chunk", char)

        except Exception as e:
            error_msg = f"An error occurred while using the {app_name} app: {e}"
            print(f"🔴 {error_msg}")
            traceback.print_exc()
            yield yield_data("answer_chunk", f"Sorry, I ran into a problem: {str(e)}")
