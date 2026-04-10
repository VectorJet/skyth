# backend/tool_registry.py

import os
import importlib
import inspect
from typing import Dict, List, Optional
from backend.basetool import BaseTool


class ToolRegistry:
    """
    A registry for discovering and managing tool plugins from the global
    tools directory and from individual app/agent modules.
    """

    def __init__(self, plugins_dir: str = "backend/tools_plugins"):
        self.tools: Dict[str, BaseTool] = {}
        # Discover global tools on initialization
        self._discover_plugins(plugins_dir, "global")

    def discover_app_plugins(self, app_name: str, app_plugins_dir: str):
        """Discovers tools from a specific app's plugin directory."""
        self._discover_plugins(app_plugins_dir, app_name)

    def discover_agent_plugins(self, agent_name: str, agent_plugins_dir: str):
        """Discovers tools from a specific agent's plugin directory."""
        self._discover_plugins(agent_plugins_dir, agent_name)

    def _discover_plugins(self, plugins_dir: str, owner_name: str):
        """
        Discovers and loads tool plugins from a specified directory.
        """
        if not os.path.exists(plugins_dir):
            return

        for filename in os.listdir(plugins_dir):
            if filename.endswith("_tool.py"):
                module_name = filename[:-3]

                try:
                    # Robust import logic handling both global and nested app paths
                    backend_index = str(plugins_dir).rfind("backend")
                    if backend_index == -1:
                        module_base = str(plugins_dir).replace(os.sep, ".")
                    else:
                        relative_path = str(plugins_dir)[backend_index:]
                        module_base = relative_path.replace(os.sep, ".")

                    module_path = f"{module_base}.{module_name}"

                    # Attempt import
                    module = importlib.import_module(module_path)

                    loaded = False
                    for attr_name in dir(module):
                        attr = getattr(module, attr_name)

                        # Check if it's an INSTANCE of BaseTool (not the class itself)
                        if isinstance(attr, BaseTool):
                            setattr(attr, "owner_name", owner_name)
                            self.tools[attr.name] = attr
                            print(
                                f"   - Loaded Tool: {attr.name} (from owner: {owner_name})"
                            )
                            loaded = True

                    if not loaded:
                        print(
                            f"🟡 [ToolRegistry] Module {filename} loaded but no BaseTool instance found. Did you forget 'tool = MyTool()'? at the end?"
                        )

                except Exception as e:
                    print(
                        f"🔴 [ToolRegistry] CRITICAL: Failed to load tool from {plugins_dir}/{filename}: {e}"
                    )
                    import traceback

                    traceback.print_exc()

    def get_tool(self, name: str) -> Optional[BaseTool]:
        """Retrieves a tool by its name."""
        return self.tools.get(name)

    def get_all_tools(self, owner_name: Optional[str] = None) -> List[BaseTool]:
        """
        Returns a list of tools. If owner_name is provided, returns tools
        only for that app or agent. Otherwise, returns all tools.
        """
        if owner_name:
            return [
                tool
                for tool in self.tools.values()
                if getattr(tool, "owner_name", None) == owner_name
            ]
        return list(self.tools.values())

    def execute_tool(self, name: str, **kwargs) -> any:
        """Executes a tool with the given parameters."""
        tool = self.get_tool(name)
        if not tool:
            raise ValueError(f"Tool '{name}' not found.")

        sig = inspect.signature(tool.execute)
        has_var_keyword = any(
            p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()
        )

        if has_var_keyword:
            return tool.execute(**kwargs)
        else:
            # Filter kwargs to only what the tool accepts
            accepted_params = sig.parameters.keys()
            filtered_kwargs = {k: v for k, v in kwargs.items() if k in accepted_params}
            return tool.execute(**filtered_kwargs)
