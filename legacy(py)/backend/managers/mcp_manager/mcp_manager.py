import json
import os
import asyncio
from typing import Dict, Any, List, Optional
from pathlib import Path
from contextlib import asynccontextmanager

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.types import CallToolResult, ListToolsResult

# Calculate Absolute Project Root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent

class MCPManager:
    _servers: Dict[str, Dict[str, Any]] = {}
    _tools_cache: Dict[str, Dict[str, Any]] = {} # Cache for tool definitions
    _sessions: Dict[str, Any] = {} # Active session store (Not used for async context, but for persistent if needed)

    @classmethod
    def discover(cls):
        """
        Scans for MCP configurations in:
        1. config/mcp_config/*.json (Global)
        2. backend/agents/*/mcp_config.json (Agent-specific)
        """
        print("[MCPManager] Starting discovery...")
        cls._servers.clear()
        
        # 1. Global Configs
        global_config_path = PROJECT_ROOT / "config" / "mcp_config"
        if global_config_path.exists():
            for file_path in global_config_path.glob("*.json"):
                cls._load_config(file_path, context="global")

        # 2. Agent Specific Configs
        agents_path = PROJECT_ROOT / "backend" / "agents"
        if agents_path.exists():
            for agent_dir in agents_path.iterdir():
                if agent_dir.is_dir():
                    config_path = agent_dir / "mcp_config.json"
                    if config_path.exists():
                        cls._load_config(config_path, context=f"agent:{agent_dir.name}")

    @classmethod
    def _load_config(cls, file_path: Path, context: str):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            servers = data.get("mcpServers", {})
            for name, config in servers.items():
                server_id = f"{context}.{name}" if "agent:" in context else name
                
                cls._servers[server_id] = {
                    "config": config,
                    "context": context,
                    "source": str(file_path)
                }
                print(f"[MCPManager] Discovered server: {server_id} from {context}")
                
        except Exception as e:
            print(f"[MCPManager] Failed to load config {file_path}: {e}")

    @classmethod
    def get_server_config(cls, server_id: str) -> Optional[Dict[str, Any]]:
        return cls._servers.get(server_id)
    
    @classmethod
    def list_servers(cls) -> List[str]:
        return list(cls._servers.keys())

    @classmethod
    @asynccontextmanager
    async def get_session(cls, server_id: str):
        """
        Returns an async context manager that yields a ClientSession.
        Currently supports Stdio transport.
        """
        info = cls._servers.get(server_id)
        if not info:
            raise ValueError(f"Server {server_id} not found in registry.")

        config = info["config"]
        command = config.get("command")
        args = config.get("args", [])
        env_vars = config.get("env", {})
        
        # Merge current env with config env
        env = os.environ.copy()
        env.update(env_vars)

        # Stdio Client
        server_params = StdioServerParameters(
            command=command,
            args=args,
            env=env
        )

        try:
            async with stdio_client(server_params) as (read, write):
                async with ClientSession(read, write) as session:
                    yield session
        except Exception as e:
             print(f"[MCPManager] Error connecting to {server_id}: {e}")
             raise

    @classmethod
    async def discover_tools(cls):
        """
        Connects to all registered servers and caches their tools.
        This is expensive and should probably be done on demand or async background.
        """
        print("[MCPManager] Discovering tools from all servers...")
        cls._tools_cache.clear()
        
        for server_id in cls.list_servers():
            try:
                async with cls.get_session(server_id) as session:
                    await session.initialize()
                    result: ListToolsResult = await session.list_tools()
                    
                    if result and result.tools:
                        for tool in result.tools:
                            # Namespace the tool to avoid collisions? or just flat?
                            # Flat for now, maybe prefix if collision?
                            tool_name = tool.name
                            cls._tools_cache[tool_name] = {
                                "server_id": server_id,
                                "name": tool.name,
                                "description": tool.description,
                                "input_schema": tool.inputSchema
                            }
                            print(f"[MCPManager] Found tool '{tool_name}' on '{server_id}'")
            except Exception as e:
                print(f"[MCPManager] Failed to discover tools for {server_id}: {e}")

    @classmethod
    def get_tool_definition(cls, tool_name: str) -> Optional[Dict[str, Any]]:
        return cls._tools_cache.get(tool_name)
    
    @classmethod
    def list_tools(cls) -> Dict[str, Dict[str, Any]]:
        return cls._tools_cache

    @classmethod
    async def execute_tool(cls, tool_name: str, arguments: Dict[str, Any]) -> Any:
        tool_def = cls.get_tool_definition(tool_name)
        if not tool_def:
            raise ValueError(f"Tool {tool_name} not found.")
        
        server_id = tool_def["server_id"]
        
        async with cls.get_session(server_id) as session:
             await session.initialize()
             result: CallToolResult = await session.call_tool(tool_name, arguments)
             
             # Format output
             if result.isError:
                 return f"Error executing tool: {result.content}"
             
             output = []
             for content in result.content:
                 if content.type == "text":
                     output.append(content.text)
                 # Handle image/resource types if needed
             
             return "\n".join(output)

    # --- Converter Logic (Ported from Skyth-Old) ---
    
    @classmethod
    def get_openai_tools(cls) -> List[Dict[str, Any]]:
        """
        Converts cached MCP tools to OpenAI function format.
        """
        openai_tools = []
        for name, tool_def in cls._tools_cache.items():
            openai_tools.append({
                "type": "function",
                "function": {
                    "name": name,
                    "description": tool_def.get("description", ""),
                    "parameters": tool_def.get("input_schema", {})
                }
            })
        return openai_tools