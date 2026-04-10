import importlib
import inspect
import sys
from typing import Dict, Type, Any, Optional
from pathlib import Path

# Calculate Absolute Project Root
# backend/registries/tool_registry.py -> up 3 levels -> Project Root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from backend.base_classes.basetool import BaseTool

class ToolRegistry:
    _tools: Dict[str, BaseTool] = {}
    _tool_classes: Dict[str, Type[BaseTool]] = {}

    @classmethod
    def register(cls, tool_class: Type[BaseTool]):
        """Manually register a tool class."""
        tool_instance = tool_class() # Instantiate to get metadata (name)
        cls._tool_classes[tool_instance.name] = tool_class
        cls._tools[tool_instance.name] = tool_instance
        print(f"[ToolRegistry] Registered: {tool_instance.name}")

    @classmethod
    def discover(cls, root_dir: str = "backend"):
        """
        Recursively searches for files ending in '_tool.py'.
        """
        # Resolve root_dir to an absolute path
        scan_path = (PROJECT_ROOT / root_dir).resolve()
        
        print(f"[ToolRegistry] Scanning {scan_path} for tools...")
        
        if not scan_path.exists():
            print(f"[ToolRegistry] Warning: Directory {scan_path} does not exist.")
            return

        for file_path in scan_path.rglob("*_tool.py"):
            try:
                module_name = cls._get_module_name(file_path)
                module = importlib.import_module(module_name)
                for name, obj in inspect.getmembers(module):
                    if (inspect.isclass(obj) and 
                        issubclass(obj, BaseTool) and 
                        obj is not BaseTool):
                        cls.register(obj)
            except Exception as e:
                print(f"[ToolRegistry] Error loading {file_path}: {e}")

    @classmethod
    def get_tool(cls, name: str, dependencies: Optional[Dict[str, Any]] = None) -> Optional[BaseTool]:
        """Returns an instantiated tool with injected dependencies."""
        tool_class = cls._tool_classes.get(name)
        if tool_class:
            return tool_class(dependencies=dependencies)
        return None

    @classmethod
    def list_tools(cls) -> Dict[str, str]:
        """Returns a dict of tool names and descriptions."""
        return {name: tool.description for name, tool in cls._tools.items()}

    @staticmethod
    def _get_module_name(file_path: Path) -> str:
        """Converts absolute file path to dotted module path."""
        # Ensure file_path is absolute
        abs_path = file_path.resolve()
        # Get path relative to PROJECT_ROOT (both are absolute now)
        relative_path = abs_path.relative_to(PROJECT_ROOT)
        # Convert to module dot notation
        return ".".join(relative_path.with_suffix("").parts)