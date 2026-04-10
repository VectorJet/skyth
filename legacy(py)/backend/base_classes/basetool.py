from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

class BaseTool(ABC):
    """
    Base class for all tools in the Skyth system.
    A tool is a native Python function or API wrapper that can be called by an LLM.
    
    Inheritance:
        Inherits from BaseTool.
    
    Discovery:
        Registered by ToolRegistry which looks for files ending with `_tool.py`.
    """

    def __init__(self, dependencies: Optional[Dict[str, Any]] = None, **kwargs):
        """
        Initialize the tool with dependency injection.
        
        Args:
            dependencies: A dictionary of injected dependencies (e.g., database connections, config).
            **kwargs: Additional arguments.
        """
        self.dependencies = dependencies or {}
        self._kwargs = kwargs

    @property
    @abstractmethod
    def name(self) -> str:
        """The unique name of the tool (used by LLM to call it)."""
        pass

    @property
    def description(self) -> str:
        """
        Description of the tool's functionality. 
        Defaults to the class docstring if not overridden.
        """
        return self.__doc__ or "No description provided."

    @property
    def instructions(self) -> str:
        """
        Specific instructions for the LLM on how/when to use this tool.
        Defaults to the class docstring.
        """
        return self.__doc__ or ""

    @abstractmethod
    async def run(self, input_data: Any) -> Any:
        """
        Execute the tool action.
        
        Args:
            input_data: The input provided by the LLM or previous pipeline step.
            
        Returns:
            The output of the tool execution.
        """
        pass