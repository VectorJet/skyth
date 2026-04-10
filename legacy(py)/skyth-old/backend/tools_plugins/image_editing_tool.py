import base64
from typing import Dict, Any, List
from google import genai as google_genai
from google.genai import types as google_types
from PIL import Image as PIL_Image
from io import BytesIO as IO_BytesIO

from backend.basetool import BaseTool


class ImageEditingTool(BaseTool):
    """A tool for editing images based on a text prompt using Gemini."""

    @property
    def name(self) -> str:
        return "image_editor"

    @property
    def description(self) -> str:
        return "Edits a given image based on a textual description. The user must have provided an image previously."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "prompt",
                "type": "string",
                "description": "The text prompt describing the edit.",
            },
            {
                "name": "image_data",
                "type": "string",
                "description": "The base64 encoded string of the image to edit.",
            },
        ]

    @property
    def output_type(self) -> str:
        return "edited_image"

    def execute(
        self, prompt: str, image_data: str, api_key: str, model_name: str, **kwargs
    ) -> Dict[str, Any]:
        """Edits an image using the provided API key and model."""
        try:
            if not api_key:
                raise ValueError("API key for image editing is not configured.")
            if not image_data:
                return {"error": "No image data provided for editing."}

            print(
                f"🔵 [Gemini Image Edit] Calling model '{model_name}' for prompt: '{prompt}'"
            )
            image_client = google_genai.Client(api_key=api_key)

            image_bytes = base64.b64decode(image_data)
            source_image = PIL_Image.open(IO_BytesIO(image_bytes))

            response = image_client.models.generate_content(
                model=model_name,
                contents=[prompt, source_image],
                config=google_types.GenerateContentConfig(
                    response_modalities=["TEXT", "IMAGE"]
                ),
            )

            edited_image_bytes = None
            text_response_from_model = "The image has been edited as you requested."

            for part in response.candidates[0].content.parts:
                if part.text is not None:
                    text_response_from_model = part.text
                elif part.inline_data is not None:
                    edited_image_bytes = part.inline_data.data

            if edited_image_bytes:
                edited_image_base64 = base64.b64encode(edited_image_bytes).decode(
                    "utf-8"
                )
                print("   - Image editing successful.")
                return {
                    "type": "edited_image",
                    "base64_data": edited_image_base64,
                    "prompt": prompt,
                }
            else:
                error_msg = (
                    text_response_from_model
                    or "The model did not return an edited image. It might have refused the request."
                )
                print(f"🔴 [Gemini Image Edit] Failed: {error_msg}")
                return {"error": error_msg}

        except Exception as e:
            print(f"🔴 [Gemini Image Edit] API connection error: {e}")
            return {"error": f"Gemini API connection error: {str(e)}"}


# Instantiate the tool so the registry can find it
image_editor = ImageEditingTool()
