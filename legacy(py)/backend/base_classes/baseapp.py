import json
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

class BaseApp(ABC):
    """
    Base class for Apps.
    An App is a set of tools with an interactive widget interface on the frontend.
    
    Discovery:
        Discovered by AppRegistry via `app_manifest.json` in the app folder.
    """

    def __init__(self, manifest_path: str, dependencies: Optional[Dict[str, Any]] = None, **kwargs):
        """
        Initialize the App.
        
        Args:
            manifest_path: Absolute path to the `app_manifest.json` file.
            dependencies: Injected dependencies.
        """
        self.manifest_path = manifest_path
        self.dependencies = dependencies or {}
        self._kwargs = kwargs
        
        # Load configuration and instructions immediately upon initialization
        self.manifest = self._load_manifest()
        self.instructions = self._load_instructions()

    def _load_manifest(self) -> Dict[str, Any]:
        """Parses the app_manifest.json file."""
        if not os.path.exists(self.manifest_path):
            raise FileNotFoundError(f"App manifest not found at {self.manifest_path}")
        
        with open(self.manifest_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def _load_instructions(self) -> str:
        """Loads instructions from INSTRUCTIONS.md in the app directory."""
        directory = os.path.dirname(self.manifest_path)
        instructions_path = os.path.join(directory, "INSTRUCTIONS.md")
        
        if os.path.exists(instructions_path):
            with open(instructions_path, 'r', encoding='utf-8') as f:
                return f.read()
        return ""

    # Metadata properties from manifest
    @property
    def name(self) -> str:
        return self.manifest.get("app_name", "Unknown App")

    @property
    def icon_url(self) -> Optional[str]:
        return self.manifest.get("app_icon_url")
    
    @property
    def description(self) -> str:
        return self.manifest.get("description", "")

    @property
    def use_mcp(self) -> bool:
        return self.manifest.get("use_mcp", False)
        
    @property
    def global_capabilities(self) -> bool:
        return self.manifest.get("global_capabilities", False)