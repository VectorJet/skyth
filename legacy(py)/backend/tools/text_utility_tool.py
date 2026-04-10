from backend.base_classes.basetool import BaseTool
from typing import Dict, Any, List

class TextUtilityTool(BaseTool):
    """
    A simple tool for performing various text manipulations.
    """

    @property
    def name(self) -> str:
        return "text_utility"

    @property
    def description(self) -> str:
        return "Performs text manipulations like reversing, word counting, character counting, or changing case. Use this when the user asks to perform a specific string operation."

    async def run(self, input_data: Any) -> Any:
        text_input = input_data.get("text_input")
        operation = input_data.get("operation")
        char_to_count = input_data.get("char_to_count")
        
        if not text_input or not operation:
             return {"error": "Missing 'text_input' or 'operation' parameter."}

        operation = operation.lower()
        
        if operation == 'reverse':
            result = text_input[::-1]
        elif operation == 'word_count':
            result = len(text_input.split())
        elif operation == 'uppercase':
            result = text_input.upper()
        elif operation == 'lowercase':
            result = text_input.lower()
        elif operation == 'char_count':
            if not char_to_count:
                return {"error": "The 'char_to_count' parameter is required for the 'char_count' operation."}
            # Perform a case-insensitive count for robustness
            result = text_input.lower().count(char_to_count.lower())
        else:
            return {"error": f"Invalid operation '{operation}'. Must be one of 'reverse', 'word_count', 'char_count', 'uppercase', 'lowercase'."}
            
        return {
            "operation": operation,
            "original_text": text_input,
            "result": result
        }
