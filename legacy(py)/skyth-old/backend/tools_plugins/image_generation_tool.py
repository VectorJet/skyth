import base64
from typing import Dict, Any, List
from google import genai as google_genai
from google.genai import types as google_types

from backend.basetool import BaseTool


class ImageGenerationTool(BaseTool):
    """A tool for generating images from a text prompt using Gemini."""

    @property
    def name(self) -> str:
        return "image_generator"

    @property
    def description(self) -> str:
        return "Generates a new image from a textual description. Use this for requests like 'create a picture of...' or 'draw an image of...'."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "prompt",
                "type": "string",
                "description": "The text prompt to generate the image from.",
            }
        ]

    @property
    def output_type(self) -> str:
        return "generated_image"

    def execute(
        self, prompt: str, api_key: str, model_name: str, **kwargs
    ) -> Dict[str, Any]:
        """Generates an image from a text prompt using the provided API key and model."""
        try:
            if not api_key:
                raise ValueError("API key for image generation is not configured.")

            print(
                f"🔵 [Gemini Image Gen] Calling model '{model_name}' for prompt: '{prompt}'"
            )
            image_client = google_genai.Client(api_key=api_key)

            response = image_client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=google_types.GenerateContentConfig(
                    response_modalities=["TEXT", "IMAGE"]
                ),
            )

            image_bytes = None
            for part in response.candidates[0].content.parts:
                if part.inline_data is not None:
                    image_bytes = part.inline_data.data
                    break

            if image_bytes:
                img_base64 = base64.b64encode(image_bytes).decode("utf-8")
                print("   - Image generation successful.")
                return {
                    "type": "generated_image",
                    "base64_data": img_base64,
                    "prompt": prompt,
                }
            else:
                text_response = (
                    response.candidates[0].content.parts[0].text
                    if response.candidates[0].content.parts
                    else "Model did not return an image."
                )
                print(f"🔴 [Gemini Image Gen] Failed: {text_response}")
                return {
                    "error": f"Gemini model refused to generate the image. Reason: {text_response}"
                }

        except Exception as e:
            print(f"🔴 [Gemini Image Gen] API connection error: {e}")
            return {"error": f"Gemini API connection error: {str(e)}"}


# Instantiate the tool so the registry can find it
image_generator = ImageGenerationTool()
