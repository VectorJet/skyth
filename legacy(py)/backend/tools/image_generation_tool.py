import base64
from typing import Dict, Any, List
from google import genai as google_genai
from google.genai import types as google_types

from backend.base_classes.basetool import BaseTool

class ImageGenerationTool(BaseTool):
    """A tool for generating images from a text prompt using Gemini."""

    @property
    def name(self) -> str: return "image_generator"

    async def run(self, input_data: Any) -> Any:
        """Generates an image from a text prompt."""
        # input_data is expected to be a dict from the LLM tool call
        prompt = input_data.get("prompt")
        
        # Dependencies injected by the agent/pipeline
        # Or fall back to environment variable if dependencies empty
        api_key = self.dependencies.get("google_api_key")
        model_name = self.dependencies.get("image_model", "imagen-3.0-generate-001")
        
        try:
            if not api_key:
                 # Fallback
                 import os
                 api_key = os.environ.get("GOOGLE_API_KEY")
                 
            if not api_key:
                return {"error": "API key for image generation is not configured."}
            
            print(f"🔵 [Gemini Image Gen] Calling model '{model_name}' for prompt: '{prompt}'")
            # This client call is synchronous, but we are in an async run.
            # Ideally we should run this in an executor, but for now this is okay.
            image_client = google_genai.Client(api_key=api_key)
            
            response = image_client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=google_types.GenerateContentConfig(response_modalities=['TEXT', 'IMAGE'])
            )
            
            image_bytes = None
            for part in response.candidates[0].content.parts:
                if part.inline_data is not None:
                    image_bytes = part.inline_data.data
                    break
            
            if image_bytes:
                img_base64 = base64.b64encode(image_bytes).decode('utf-8')
                print("   - Image generation successful.")
                return {"type": "generated_image", "base64_data": img_base64, "prompt": prompt}
            else:
                text_response = response.candidates[0].content.parts[0].text if response.candidates[0].content.parts else "Model did not return an image."
                print(f"🔴 [Gemini Image Gen] Failed: {text_response}")
                return {"error": f"Gemini model refused to generate the image. Reason: {text_response}"}
                
        except Exception as e:
            print(f"🔴 [Gemini Image Gen] API connection error: {e}")
            return {"error": f"Gemini API connection error: {str(e)}"}
