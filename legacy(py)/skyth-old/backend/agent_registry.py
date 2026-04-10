# backend/agent_registry.py
import os
import json
import importlib
from pathlib import Path
from typing import Dict, List, Optional, Union, AsyncGenerator, Any
from datetime import datetime

from backend.base_agent import BaseAgent
from backend.basetool import BaseTool
from backend.baseline import BasePipeline


class AgentModule:
    """A data class representing a discovered agent module."""

    def __init__(
        self,
        path: Path,
        manifest: Dict,
        system_prompt_template: str,
        agent_instance: Optional[BaseAgent] = None,
    ):
        self.path = path
        self.manifest = manifest
        self.system_prompt_template = system_prompt_template
        self.instance = agent_instance
        self.name: str = manifest.get("name", "Unknown Agent")
        self.description: str = manifest.get("description", "")
        self.ui_component: str = manifest.get("ui_component", "AgentProcess")
        self.use_global_capabilities: bool = manifest.get(
            "use_global_capabilities", False
        )

        # Check for MCP config
        self.mcp_config_path = None
        possible_mcp_path = path / "mcp_config.json"
        if possible_mcp_path.exists():
            self.mcp_config_path = "mcp_config.json"


class AgentRegistry:
    """
    A registry for discovering and managing self-contained agent modules.
    """

    def __init__(self, plugins_dir: str = "backend/agents", **dependencies):
        self.plugins_dir = Path(plugins_dir).resolve()
        self.agents: Dict[str, AgentModule] = {}
        self.dependencies = dependencies
        self._discover_plugins()

    def _discover_plugins(self):
        if not self.plugins_dir.exists() or not self.plugins_dir.is_dir():
            print(
                f"🟡 [AgentRegistry] Warning: Directory not found at '{self.plugins_dir}'."
            )
            return

        for agent_path in self.plugins_dir.iterdir():
            if not agent_path.is_dir() or agent_path.name.startswith("__"):
                continue

            manifest_path = agent_path / "agent_manifest.json"
            prompt_path = agent_path / "agent.md"
            agent_file_path = agent_path / "agent.py"

            if (
                not manifest_path.exists()
                or not prompt_path.exists()
                or not agent_file_path.exists()
            ):
                continue

            try:
                with open(manifest_path, "r") as f:
                    manifest = json.load(f)
                agent_name = manifest.get("name")
                if not agent_name:
                    continue

                with open(prompt_path, "r") as f:
                    prompt_template = f.read()

                agent_instance = None
                if self.dependencies:
                    module_path_str = str(
                        agent_file_path.relative_to(Path.cwd())
                    ).replace(os.sep, ".")[:-3]
                    module = importlib.import_module(module_path_str)

                    for attr_name in dir(module):
                        attr = getattr(module, attr_name)
                        if (
                            isinstance(attr, type)
                            and issubclass(attr, BaseAgent)
                            and attr is not BaseAgent
                        ):
                            agent_instance = attr(**self.dependencies)
                            break

                agent_module = AgentModule(
                    agent_path, manifest, prompt_template, agent_instance
                )
                self.agents[agent_name] = agent_module
                print(f"   - Loaded & Instantiated Agent: {agent_name}")

            except Exception as e:
                print(f"🔴 [AgentRegistry] Failed to load agent from {agent_path}: {e}")

    def get_agent(self, name: str) -> Optional[AgentModule]:
        return self.agents.get(name)

    def get_all_agents(self) -> List[AgentModule]:
        return list(self.agents.values())

    def get_all_mcp_server_configs(self) -> Dict[str, Dict[str, Any]]:
        """Collects all MCP server configurations from discovered agents."""
        configs = {}
        for agent in self.agents.values():
            if agent.mcp_config_path:
                try:
                    config_full_path = agent.path / agent.mcp_config_path
                    with open(config_full_path, "r") as f:
                        agent_mcp_config = json.load(f).get("mcpServers", {})
                        configs.update(agent_mcp_config)
                except Exception as e:
                    print(
                        f"🔴 [AgentRegistry] Error loading MCP config for agent '{agent.name}': {e}"
                    )
        return configs

    def prepare_system_prompt(
        self,
        agent_name: str,
        personalization_prompt: str,
        capabilities: List[Union[BaseTool, BasePipeline]],
        **kwargs,
    ) -> str:
        agent_module = self.get_agent(agent_name)
        if not agent_module:
            return ""

        template = agent_module.system_prompt_template

        if capabilities:
            cap_list_str = "\n".join(
                [
                    f"- **{cap.name}**: {getattr(cap, 'description', 'N/A')}"
                    for cap in capabilities
                ]
            )
        else:
            cap_list_str = "No specific tools are available for this task."

        prompt = template.replace(
            "{current_date}", datetime.now().strftime("%A, %B %d, %Y at %I:%M %p UTC")
        )
        prompt = prompt.replace("{capabilities_list}", cap_list_str)

        if personalization_prompt:
            persona_block = (
                "**Your Persona & User Context**\n"
                "You MUST adopt the following persona and use the provided user context to tailor your final response. "
                "This defines your tone and style. All other instructions are about the process, but this is about *how you behave*.\n"
                f"{personalization_prompt}"
            )
            prompt = prompt.replace("{personalization_prompt}", persona_block)
        else:
            prompt = prompt.replace("{personalization_prompt}", "")

        for key, value in kwargs.items():
            prompt = prompt.replace(f"{{{key}}}", str(value))

        return prompt

    def execute_agent(self, name: str, **kwargs) -> AsyncGenerator[str, None]:
        agent_module = self.get_agent(name)
        if not agent_module or not agent_module.instance:
            raise ValueError(f"Agent '{name}' not found or not instantiated.")
        return agent_module.instance.execute(**kwargs)
