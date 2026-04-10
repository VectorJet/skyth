import sys
import importlib.util
import inspect
from typing import Dict, Any, Optional, List, Union, AsyncGenerator
from pathlib import Path

# Calculate Absolute Project Root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from backend.base_classes.baseagent import BaseAgent
from backend.converters.provider import generate_response, Provider

# Concrete implementation for discovery purposes
class GenericAgent(BaseAgent):
    async def run_task(self, task: str, history: List[Dict[str, str]] = None, stream: bool = False) -> Union[str, AsyncGenerator[Any, None]]:
        try:
            config = Provider.load_config()
            model_id = config.get("model", "openai/gpt-4o")
            
            messages = []
            if history:
                messages.extend(history)
            
            messages.append({"role": "user", "content": task})
            
            # Use instructions from AGENTS.md as system prompt
            system_prompt = self.instructions
            
            # Fallback if no instructions found?
            if not system_prompt and self.name == "Generalist Agent":
                from backend.converters.gemini.prompts import GeminiPrompts
                system_prompt = GeminiPrompts.get_system_prompt()
            
            response = await generate_response(
                model_id=model_id,
                messages=messages,
                system=system_prompt,
                stream=stream
            )
            
            if stream:
                return response
            
            if hasattr(response, "choices"):
                return response.choices[0].message.content
            return str(response)
            
        except Exception as e:
            err = f"Error in GenericAgent: {e}"
            if stream:
                async def err_gen():
                    yield err
                return err_gen()
            return err

class AgentRegistry:
    _agents: Dict[str, BaseAgent] = {}

    @classmethod
    def register(cls, manifest_path: str):
        """Register an agent from its manifest path, optionally loading custom logic."""
        path_obj = Path(manifest_path)
        agent_dir = path_obj.parent
        custom_agent_path = agent_dir / "agent.py"
        
        agent_class = GenericAgent
        
        # Check for custom agent implementation
        if custom_agent_path.exists():
            try:
                # Dynamic import
                module_name = f"backend.agents.{agent_dir.name}.agent"
                spec = importlib.util.spec_from_file_location(module_name, custom_agent_path)
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    sys.modules[module_name] = module
                    spec.loader.exec_module(module)
                    
                    # Find subclass of BaseAgent
                    for name, obj in inspect.getmembers(module):
                        if (inspect.isclass(obj) and 
                            issubclass(obj, BaseAgent) and 
                            obj is not BaseAgent and
                            obj is not GenericAgent):
                            agent_class = obj
                            print(f"[AgentRegistry] Found custom agent class: {name} for {agent_dir.name}")
                            break
            except Exception as e:
                print(f"[AgentRegistry] Failed to load custom agent from {custom_agent_path}: {e}")

        try:
            # Instantiate the agent
            agent = agent_class(manifest_path=manifest_path)
            cls._agents[agent.name] = agent
            print(f"[AgentRegistry] Registered: {agent.name} (Class: {agent_class.__name__})")
        except Exception as e:
            print(f"[AgentRegistry] Failed to register agent at {manifest_path}: {e}")

    @classmethod
    def discover(cls, root_dir: str = "backend"):
        """
        Recursively searches for 'agent_manifest.json'.
        """
        scan_path = (PROJECT_ROOT / root_dir).resolve()
        print(f"[AgentRegistry] Scanning {scan_path} for agents...")
        
        if not scan_path.exists():
            return

        for file_path in scan_path.rglob("agent_manifest.json"):
            # Pass absolute string path to register
            cls.register(str(file_path.resolve()))

    @classmethod
    def get_agent(cls, name: str) -> Optional[BaseAgent]:
        return cls._agents.get(name)

    @classmethod
    def list_agents(cls) -> Dict[str, Any]:
        return {name: {"global": agent.global_capabilities, "desc": agent.description} for name, agent in cls._agents.items()}
