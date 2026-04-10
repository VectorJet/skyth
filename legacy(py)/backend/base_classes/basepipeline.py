from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, AsyncGenerator
from .basetool import BaseTool

class BasePipeline(ABC):
    """
    Base class for Pipelines.
    Pipelines are a set of tools and logic that trigger one by one.
    
    Discovery:
        Registered by PipelineRegistry which looks for `_pipeline.py`.
    """

    def __init__(self, dependencies: Optional[Dict[str, Any]] = None, **kwargs):
        """
        Initialize the pipeline with dependency injection.
        """
        self.dependencies = dependencies or {}
        self._kwargs = kwargs
        # Pipelines can hold a list of tools used in their execution flow
        self.tools: List[BaseTool] = []

    @property
    @abstractmethod
    def name(self) -> str:
        """The unique identifier for this pipeline."""
        pass
    
    @property
    def description(self) -> str:
        """Description of the pipeline's purpose."""
        return self.__doc__ or "No description provided."

    @abstractmethod
    async def run(self, initial_input: Any) -> AsyncGenerator[Any, None]:
        """
        Trigger the pipeline logic.
        
        The LLM's job is to trigger this pipeline and provide `initial_input`.
        Logic should handle passing outputs from one tool to the next if needed.
        """
        # Yielding allows for streaming updates back to the UI
        if False: yield None
        pass
