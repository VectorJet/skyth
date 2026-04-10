import re
from typing import List, Dict, Any, Union, Optional

class ProviderTransform:
    @staticmethod
    def normalize_messages(messages: List[Dict[str, Any]], model_info: Any) -> List[Dict[str, Any]]:
        """
        Normalizes messages for specific providers based on opencode logic.
        """
        provider_id = model_info.providerID
        model_id = model_info.id.lower()
        api_id = getattr(model_info, 'api_url', '').lower() if model_info.api_url else ''

        new_messages = []
        
        # Helper to clone message to avoid mutation
        def clone(msg):
            return msg.copy()

        for i, msg in enumerate(messages):
            msg = clone(msg)
            
            # Mistral Logic: Tool IDs must be alphanumeric, exactly 9 chars
            if provider_id == "mistral" or "mistral" in api_id:
                if msg.get("role") in ["assistant", "tool"] and isinstance(msg.get("tool_calls"), list):
                    new_tool_calls = []
                    for tc in msg["tool_calls"]:
                        if "id" in tc:
                            # Remove non-alphanumeric, take first 9, pad with 0
                            clean_id = re.sub(r'[^a-zA-Z0-9]', '', tc["id"])[:9].ljust(9, '0')
                            tc["id"] = clean_id
                        new_tool_calls.append(tc)
                    msg["tool_calls"] = new_tool_calls
                
                # Mistral: Tool message cannot be followed by User message
                # opencode inserts a "Done." assistant message.
                new_messages.append(msg)
                
                if msg.get("role") == "tool":
                    next_msg = messages[i + 1] if i + 1 < len(messages) else None
                    if next_msg and next_msg.get("role") == "user":
                        new_messages.append({
                            "role": "assistant",
                            "content": "Done."
                        })
                continue # Skip default append

            # DeepSeek / Reasoning Logic
            # opencode extracts 'reasoning' parts. LiteLLM handles some, but we might need manual extraction
            # depending on how the input message is structured.
            # Assuming input standard OpenAI format for now.
            
            new_messages.append(msg)

        return new_messages

    @staticmethod
    def transform_schema(schema: Dict[str, Any], model_info: Any) -> Dict[str, Any]:
        """
        Transforms tool schemas for specific providers (e.g. Gemini).
        """
        provider_id = model_info.providerID
        model_id = model_info.id.lower()

        # Google/Gemini: Convert integer enums to strings
        if provider_id == "google" or "gemini" in model_id:
            return ProviderTransform._sanitize_gemini_schema(schema)
        
        return schema

    @staticmethod
    def _sanitize_gemini_schema(obj: Any) -> Any:
        if not isinstance(obj, dict):
            return obj
        
        # Recurse for lists
        # (Not common in schema root but good practice)
        
        result = {}
        for key, value in obj.items():
            if key == "enum" and isinstance(value, list):
                # Convert all enum values to strings
                result[key] = [str(v) for v in value]
                # If type was integer/number, force to string
                if result.get("type") in ["integer", "number"]:
                    result["type"] = "string"
            elif isinstance(value, dict):
                result[key] = ProviderTransform._sanitize_gemini_schema(value)
            elif isinstance(value, list):
                result[key] = [ProviderTransform._sanitize_gemini_schema(v) if isinstance(v, dict) else v for v in value]
            else:
                result[key] = value
        
        # Filter required fields to ensure they exist in properties
        if result.get("type") == "object" and "properties" in result and "required" in result:
            props = result["properties"]
            result["required"] = [f for f in result["required"] if f in props]

        return result
