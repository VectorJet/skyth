from abc import ABC, abstractmethod
from typing import Any, Dict, List, Generator, Optional


class BasePipeline(ABC):
    """
    An abstract base class for all multi-step pipeline plugins.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """
        Returns the unique, machine-readable name of the pipeline.
        e.g., "generic_research"
        """
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """
        Returns a detailed, natural language description of what the pipeline does.
        This is used by the agent to decide when to use this pipeline.
        """
        pass

    @property
    @abstractmethod
    def parameters(self) -> List[Dict[str, Any]]:
        """
        Returns a schema describing the primary inputs the pipeline accepts.
        For many pipelines, this will just be a single "query" parameter.
        """
        pass

    @abstractmethod
    def execute(
        self, query: str, instructions: Optional[Dict[str, Any]] = None, **kwargs: Any
    ) -> Generator[str, None, None]:
        """
        Executes the pipeline's logic. This method MUST be a generator that yields
        Server-Sent Events (SSE) formatted strings for the frontend.

        Args:
            query (str): The primary user query for the pipeline.
            instructions (Optional[Dict[str, Any]]): A dictionary of specific directives
                that can modify the pipeline's behavior (e.g., {'chart_type': 'candle'}).
                Defaults to None.
            **kwargs: Additional keyword arguments passed from the agent, such as
                api_key, utility_model, user_id, etc.
        """
        pass
