# backend/mcp_manager.py

import json
import requests
import uuid
from pathlib import Path
from typing import Dict, Any, List
from google.genai import types


class MCPManager:
    """Manages connection and tool discovery for all MCP servers."""

    def __init__(self, config_path: str = "mcp_config/mcp_config.json"):
        self.config_path = Path(config_path)
        self.clients: Dict[str, "HTTPMCPClient"] = {}
        self.tools: Dict[str, Dict[str, Any]] = {}
        self.base_port = 13370  # Synchronized with launcher

    def load_servers(self, base_config: Dict, app_configs: Dict, agent_configs: Dict):
        """Loads servers from base, app, and agent configs."""
        print("🔵 [MCP Manager] Initializing MCP connections...")

        # Combine configs, with app/agent configs potentially overriding base ones
        all_server_configs = {**base_config, **app_configs, **agent_configs}

        if not all_server_configs:
            print("🟡 [MCP Manager] No MCP servers configured.")
            return

        for i, (name, server_config) in enumerate(all_server_configs.items()):
            port = self.base_port + i
            try:
                client = HTTPMCPClient(f"http://127.0.0.1:{port}")
                self.clients[name] = client
                self._discover_tools(name, client)
            except Exception as e:
                print(f"🔴 [MCP Manager] Failed to connect to server '{name}': {e}")

        print(
            f"✅ [MCP Manager] Discovery complete. Found {len(self.tools)} tools across {len(self.clients)} servers."
        )

    def _discover_tools(self, server_name: str, client: "HTTPMCPClient"):
        """Discovers tools from a single server."""
        try:
            response_data = client.call_jsonrpc("tools/list")
            if "result" in response_data and "tools" in response_data["result"]:
                for tool in response_data["result"]["tools"]:
                    if tool_name := tool.get("name"):
                        self.tools[tool_name] = {
                            "server_name": server_name,
                            "description": tool.get("description", ""),
                            "input_schema": tool.get("inputSchema", {}),
                        }
        except Exception as e:
            print(f"🔴 [MCP Manager] Could not discover tools from {server_name}: {e}")

    def execute_tool(self, tool_name: str, arguments: dict, user_id: int = None) -> Any:
        if tool_name not in self.tools:
            return {"error": f"Tool '{tool_name}' not found."}

        server_name = self.tools[tool_name]["server_name"]
        client = self.clients.get(server_name)
        if not client:
            return {
                "error": f"Server '{server_name}' for tool '{tool_name}' is not connected."
            }

        if server_name == "google_workspace":
            arguments["user_id"] = user_id

        try:
            response = client.call_jsonrpc(
                "tools/call", {"name": tool_name, "arguments": arguments}
            )

            if "result" in response:
                result_data = response["result"]
                content = result_data.get("content")

                # Check for widget metadata as per MCP spec
                if (
                    "_meta" in result_data
                    and "openai/outputTemplate" in result_data["_meta"]
                ):
                    return {
                        "widget_html": result_data["_meta"]["openai/outputTemplate"],
                        "widget_data": content,
                    }

                # Standard content return
                if content and isinstance(content, list) and len(content) > 0:
                    # If content is text, return it directly
                    if content[0].get("type") == "text":
                        return content[0].get("text")
                    return content

                return result_data

            return response

        except Exception as e:
            return {"error": f"Error executing {tool_name}: {str(e)}"}

    def get_gemini_tools(self) -> List[types.FunctionDeclaration]:
        """Generates a list of FunctionDeclarations for all tools from all servers."""
        return [
            types.FunctionDeclaration(
                name=name,
                description=tool_def["description"],
                parameters=self._convert_schema(tool_def["input_schema"]),
            )
            for name, tool_def in self.tools.items()
        ]

    def get_gemini_tools_for_server(
        self, server_name: str
    ) -> List[types.FunctionDeclaration]:
        """Generates a list of FunctionDeclarations for a specific MCP server."""
        declarations = []
        for name, tool_def in self.tools.items():
            if tool_def["server_name"] == server_name:
                declarations.append(
                    types.FunctionDeclaration(
                        name=name,
                        description=tool_def["description"],
                        parameters=self._convert_schema(tool_def["input_schema"]),
                    )
                )
        return declarations

    def _convert_schema(self, mcp_schema: Dict) -> types.Schema:
        if not mcp_schema or "properties" not in mcp_schema:
            return types.Schema(type="OBJECT", properties={})

        properties = {}

        for prop_name, prop_def in mcp_schema.get("properties", {}).items():
            prop_type = prop_def.get("type", "string").upper()

            prop_schema = types.Schema(
                type=prop_type, description=prop_def.get("description", "")
            )

            if prop_type == "ARRAY":
                items_def = prop_def.get("items", {})
                items_type = items_def.get("type", "string").upper()
                prop_schema.items = types.Schema(type=items_type)

            properties[prop_name] = prop_schema

        return types.Schema(
            type="OBJECT",
            properties=properties,
            required=mcp_schema.get("required", []),
        )


class HTTPMCPClient:
    """Simple HTTP client for MCP servers"""

    def __init__(self, base_url: str, timeout: int = 10):
        self.base_url = base_url
        self.timeout = timeout
        self.session = requests.Session()

    def call_jsonrpc(self, method: str, params: dict = None):
        try:
            response = self.session.post(
                f"{self.base_url}/mcp",
                json={
                    "jsonrpc": "2.0",
                    "id": str(uuid.uuid4()),
                    "method": method,
                    "params": params or {},
                },
                headers={"Content-Type": "application/json"},
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"Failed to call MCP method '{method}': {str(e)}")
