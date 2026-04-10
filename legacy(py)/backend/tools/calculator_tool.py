import sys
from pathlib import Path
from typing import Any, Dict

# Add backend to path
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
from backend.base_classes.basetool import BaseTool

class CalculatorTool(BaseTool):
    """
    A basic calculator tool for demonstration.
    """

    @property
    def name(self) -> str:
        return "calculator_tool"

    @property
    def description(self) -> str:
        return "Performs basic arithmetic operations (add, subtract, multiply, divide). Input should be a JSON string with 'operation' and 'numbers'."

    @property
    def parameters(self) -> Dict[str, Any]:
        """JSON Schema for the tool arguments."""
        return {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["add", "subtract", "multiply", "divide"],
                    "description": "The math operation to perform."
                },
                "numbers": {
                    "type": "array",
                    "items": {"type": "number"},
                    "description": "List of numbers to operate on."
                }
            },
            "required": ["operation", "numbers"]
        }

    async def run(self, input_data: Any) -> Any:
        # In a real scenario, input_data might be a dict directly if processed by the converter
        if isinstance(input_data, str):
            import json
            try:
                data = json.loads(input_data)
            except:
                return "Error: Invalid JSON input"
        else:
            data = input_data

        op = data.get("operation")
        nums = data.get("numbers", [])

        if not nums:
            return "Error: No numbers provided"

        result = nums[0]
        try:
            if op == "add":
                for n in nums[1:]: result += n
            elif op == "subtract":
                for n in nums[1:]: result -= n
            elif op == "multiply":
                for n in nums[1:]: result *= n
            elif op == "divide":
                for n in nums[1:]: 
                    if n == 0: return "Error: Division by zero"
                    result /= n
            else:
                return f"Error: Unknown operation {op}"
        except Exception as e:
            return f"Error computing: {e}"

        return {"result": result}