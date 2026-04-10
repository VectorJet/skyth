import json
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, List, AsyncGenerator, Union

class BaseAgent(ABC):
    """
    Base class for Agents.
    Agents are defined by `agent_manifest.json` and can be self-contained or global.
    
    Discovery:
        Discovered by AgentRegistry via `agent_manifest.json`.
    """

    def __init__(self, manifest_path: str, dependencies: Optional[Dict[str, Any]] = None, **kwargs):
        """
        Initialize the Agent.
        
        Args:
            manifest_path: Absolute path to the `agent_manifest.json` file.
            dependencies: Injected dependencies.
        """
        self.manifest_path = manifest_path
        self.dependencies = dependencies or {}
        self._kwargs = kwargs
        
        # Load configuration and instructions
        self.manifest = self._load_manifest()
        self.instructions = self._load_instructions()

    def _load_manifest(self) -> Dict[str, Any]:
        """Parses the agent_manifest.json file."""
        if not os.path.exists(self.manifest_path):
            raise FileNotFoundError(f"Agent manifest not found at {self.manifest_path}")
        
        with open(self.manifest_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def _load_instructions(self) -> str:
        """Loads instructions from AGENTS.md in the agent directory."""
        directory = os.path.dirname(self.manifest_path)
        instructions_path = os.path.join(directory, "AGENTS.md")
        
        if os.path.exists(instructions_path):
            with open(instructions_path, 'r', encoding='utf-8') as f:
                return f.read()
        return ""

    # Metadata properties from manifest
    @property
    def name(self) -> str:
        return self.manifest.get("agent_name", "Unknown Agent")

    @property
    def global_capabilities(self) -> bool:
        return self.manifest.get("global_capabilities", False)

    @property
    def description(self) -> str:
        return self.manifest.get("description", "")

    @abstractmethod
    async def run_task(self, task: str, history: Optional[List[Dict[str, str]]] = None, stream: bool = False) -> Union[str, AsyncGenerator[Any, None]]:
        """
        Executes the agent's task.
        
        Args:
            task: The user's query or task description.
            history: Conversation history.
            stream: Whether to stream the response.
            
        Returns:
            A string (if not streaming) or an AsyncGenerator (if streaming).
        """
        pass
