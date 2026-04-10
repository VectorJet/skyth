# backend/pipeline_registry.py

import os
import importlib
import inspect
from typing import Dict, List, Optional, Generator
from backend.baseline import BasePipeline


class PipelineRegistry:
    """
    A registry for discovering and managing pipeline plugins from the global
    pipelines directory and from individual app/agent modules.
    Supports dependency injection for MCP manager and other services.
    """

    def __init__(self, plugins_dir: str = "backend/pipelines", mcp_manager=None):
        self.pipelines: Dict[str, BasePipeline] = {}
        self.mcp_manager = mcp_manager
        # Discover global pipelines on initialization
        self._discover_plugins(plugins_dir, "global")

    def discover_app_plugins(self, app_name: str, app_plugins_dir: str):
        """Discovers pipelines from a specific app's plugin directory."""
        self._discover_plugins(app_plugins_dir, app_name)

    def discover_agent_plugins(self, agent_name: str, agent_plugins_dir: str):
        """Discovers pipelines from a specific agent's plugin directory."""
        self._discover_plugins(agent_plugins_dir, agent_name)

    def _discover_plugins(self, plugins_dir: str, owner_name: str):
        """
        Discovers and loads pipeline plugins from a specified directory.
        Injects dependencies like mcp_manager during instantiation.
        """
        if not os.path.exists(plugins_dir):
            return

        for filename in os.listdir(plugins_dir):
            if filename.endswith("_pipeline.py"):
                module_name = filename[:-3]

                try:
                    backend_index = plugins_dir.rfind("backend")
                    if backend_index == -1:
                        module_base = plugins_dir.replace(os.sep, ".")
                    else:
                        relative_path = plugins_dir[backend_index:]
                        module_base = relative_path.replace(os.sep, ".")

                    module_path = f"{module_base}.{module_name}"
                    module = importlib.import_module(module_path)

                    for attr_name in dir(module):
                        attr = getattr(module, attr_name)

                        # Check if it's already an instance or a class that needs instantiation
                        if isinstance(attr, BasePipeline) or (
                            isinstance(attr, type)
                            and issubclass(attr, BasePipeline)
                            and attr is not BasePipeline
                            and not inspect.isabstract(attr)
                        ):

                            if isinstance(
                                attr, type
                            ):  # If it's a class, instantiate it
                                sig = inspect.signature(attr.__init__)
                                if "mcp_manager" in sig.parameters:
                                    instance = attr(mcp_manager=self.mcp_manager)
                                else:
                                    instance = attr()
                            else:  # It's already an instance
                                instance = attr

                            setattr(instance, "owner_name", owner_name)
                            self.pipelines[instance.name] = instance
                            print(
                                f"   - Loaded Pipeline: {instance.name} (from owner: {owner_name})"
                            )

                except Exception as e:
                    print(
                        f"🔴 [PipelineRegistry] Failed to load pipeline from {plugins_dir}/{filename}: {e}"
                    )
                    import traceback

                    traceback.print_exc()

    def get_pipeline(self, name: str) -> Optional[BasePipeline]:
        """Retrieves a pipeline by its name."""
        return self.pipelines.get(name)

    def get_all_pipelines(self, owner_name: Optional[str] = None) -> List[BasePipeline]:
        """
        Returns a list of pipelines. If owner_name is provided, returns pipelines
        only for that app or agent. Otherwise, returns all pipelines.
        """
        if owner_name:
            return [
                p
                for p in self.pipelines.values()
                if getattr(p, "owner_name", None) == owner_name
            ]
        return list(self.pipelines.values())

    def execute_pipeline(self, name: str, **kwargs) -> Generator[str, None, None]:
        """Executes a pipeline's generator method."""
        pipeline = self.get_pipeline(name)
        if not pipeline:
            raise ValueError(f"Pipeline '{name}' not found.")

        return pipeline.execute(**kwargs)
