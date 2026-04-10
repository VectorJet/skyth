import inspect
from typing import Dict, List, Any, Type

try:
    from backend.base_classes.basetool import BaseTool
    from backend.base_classes.basepipeline import BasePipeline
except ImportError:
    import sys
    from pathlib import Path
    sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
    from backend.base_classes.basetool import BaseTool
    from backend.base_classes.basepipeline import BasePipeline

class ToolConverter:
    """
    Converts Skyth components into OpenAI/Litellm compatible function schemas.
    """

    @staticmethod
    def to_openai_tool(component: Any) -> Dict[str, Any]:
        """
        Converts a BaseTool OR BasePipeline instance to an OpenAI tool definition.
        """
        name = component.name
        description = component.description
        
        # Check for explicit parameters property
        if hasattr(component, "parameters") and component.parameters:
            parameters = component.parameters
        else:
            # Default generic input for pipelines/tools without schemas
            parameters = {
                "type": "object",
                "properties": {
                    "input_data": {
                        "type": "string", 
                        "description": "The input data for this action."
                    }
                },
                "required": ["input_data"]
            }

        return {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": parameters
            }
        }

    @staticmethod
    def convert_registry_tools(registry_dict: Dict[str, BaseTool]) -> List[Dict[str, Any]]:
        return [ToolConverter.to_openai_tool(tool) for tool in registry_dict.values()]

    @staticmethod
    def convert_registry_pipelines(registry_dict: Dict[str, BasePipeline]) -> List[Dict[str, Any]]:
        return [ToolConverter.to_openai_tool(pipeline) for pipeline in registry_dict.values()]