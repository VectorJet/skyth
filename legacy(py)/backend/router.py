import json
from typing import Optional, List
from backend.registries.agent_registry import AgentRegistry
from backend.base_classes.baseagent import BaseAgent
from backend.converters.provider import generate_response, Provider

class Router:
    """
    Routes user queries to the appropriate agent.
    """
    
    @classmethod
    async def route(cls, query: str, history: Optional[List[dict]] = None) -> Optional[BaseAgent]:
        """
        Determines the best agent for the given query.
        """
        # Ensure agents are discovered
        AgentRegistry.discover()
        
        agents_map = AgentRegistry.list_agents()
        # agents_map is {name: {"global": bool, "desc": str}}
        
        if not agents_map:
            return None
            
        # If only one agent, return it (or maybe Generalist if available?)
        # But here we want intelligence.
        
        # Prepare prompt
        agent_descriptions = "\n".join([f"- {name}: {info['desc']}" for name, info in agents_map.items()])
        
        system_prompt = (
            "You are an intelligent router for an AI agent system. "
            "Your goal is to select the most appropriate agent for the user's request.\n"
            "Available Agents:\n"
            f"{agent_descriptions}\n\n"
            "Return ONLY the exact name of the agent to use. If no specific agent fits well, "
            "return 'Generalist Agent' (if available) or the most general one."
        )
        
        # Construct messages with context
        messages = []
        
        # Include a few recent history items for context (e.g., last 2 turns)
        if history:
            # We filter out large tool outputs if any, keeping it simple for routing
            recent_history = history[-4:] 
            for msg in recent_history:
                # Only include user and assistant text messages
                if msg.get("role") in ["user", "assistant"] and isinstance(msg.get("content"), str):
                    messages.append({"role": msg["role"], "content": msg["content"]})
        
        messages.append({"role": "user", "content": query})
        
        config = Provider.load_config()
        model_id = config.get("small_model") or config.get("model") or "openai/gpt-4o-mini"
        
        try:
            response = await generate_response(
                model_id=model_id,
                messages=messages,
                system=system_prompt,
                stream=False
            )
            
            # Handle response format (Provider returns object or dict)
            if hasattr(response, "choices"):
                content = response.choices[0].message.content.strip()
            else:
                content = str(response).strip()
            
            # Clean up content (remove quotes etc)
            selected_agent_name = content.replace('"', '').replace("'", '').strip()
            
            # Look up agent
            agent = AgentRegistry.get_agent(selected_agent_name)
            
            if agent:
                return agent
            else:
                # Fallback fuzzy match or default
                print(f"[Router] Exact match failed for '{selected_agent_name}'. Defaulting to Generalist.")
                return AgentRegistry.get_agent("Generalist Agent")

        except Exception as e:
            print(f"[Router] Error during routing: {e}")
            return AgentRegistry.get_agent("Generalist Agent")
