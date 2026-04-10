import os
import json
import time
import yaml
import requests
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
from pydantic import BaseModel, Field
import logging
from .transform import ProviderTransform
from .gemini.client import (
    GeminiCliConfig,
    GeminiCliContext,
    GeminiRestClient,
    GeminiCliStorage,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("provider")

# Constants
MODELS_DEV_URL = "https://models.dev/api.json"
CACHE_DIR = Path.home() / ".cache" / "skyth"
MODELS_CACHE_FILE = CACHE_DIR / "models.json"
# Resolve config.yml relative to project root (backend/converters/../../config.yml)
CONFIG_FILE = Path(__file__).resolve().parent.parent.parent / "config.yml"


class ModelCost(BaseModel):
    input: float = 0
    output: float = 0
    cache_read: float = Field(default=0, alias="cache.read")
    cache_write: float = Field(default=0, alias="cache.write")


class ModelCapabilities(BaseModel):
    reasoning: bool = False
    toolcall: bool = True
    image: bool = False


class Model(BaseModel):
    id: str
    providerID: str
    name: str
    capabilities: ModelCapabilities
    cost: ModelCost
    context_window: int = 0
    output_limit: int = 0
    api_url: Optional[str] = None
    api_key: Optional[str] = None
    npm: Optional[str] = None


class ProviderInfo(BaseModel):
    id: str
    name: str
    models: Dict[str, Any]
    env: List[str] = []
    api: Optional[str] = None
    npm: Optional[str] = None


# Custom provider configurations matching opencode's logic
CUSTOM_PROVIDERS = {
    "anthropic": {
        "options": {
            "headers": {
                "anthropic-beta": "claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14"
            }
        }
    },
    "azure-cognitive-services": {
        "env": ["AZURE_COGNITIVE_SERVICES_RESOURCE_NAME"],
        "base_url_template": "https://{}.cognitiveservices.azure.com/openai",
    },
    "amazon-bedrock": {
        "env": [
            "AWS_PROFILE",
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "AWS_REGION",
        ],
        "region_prefix_logic": True,
    },
    "google-vertex": {
        "env": ["GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION"],
        "defaults": {"GOOGLE_CLOUD_LOCATION": "us-east5"},
    },
    "google-vertex-anthropic": {
        "env": ["GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION"],
        "defaults": {"GOOGLE_CLOUD_LOCATION": "global"},
    },
    "sap-ai-core": {
        "env": ["AICORE_SERVICE_KEY", "AICORE_DEPLOYMENT_ID", "AICORE_RESOURCE_GROUP"]
    },
    "cerebras": {
        "options": {"headers": {"X-Cerebras-3rd-Party-Integration": "opencode"}}
    },
    "openrouter": {
        "options": {
            "headers": {
                "HTTP-Referer": "https://skyth.ai/",  # Changed from opencode
                "X-Title": "Skyth",
            }
        }
    },
    "gemini-cli": GeminiCliConfig.get_provider_config(),  # Dynamic config from gemini-cli logic
}


class ModelsDev:
    @staticmethod
    def get() -> Dict[str, ProviderInfo]:
        ModelsDev.refresh()
        if MODELS_CACHE_FILE.exists():
            try:
                with open(MODELS_CACHE_FILE, "r") as f:
                    data = json.load(f)

                # Load gemini-cli settings if available
                try:
                    # Logic is now encapsulated in GeminiCliConfig, called via CUSTOM_PROVIDERS
                    pass
                except Exception:
                    pass

                # Start with the data from models.dev
                providers_data = data

                # Now, merge/override with our custom provider configs.
                for pid, custom_config in CUSTOM_PROVIDERS.items():
                    base_config = providers_data.get(pid, {})
                    base_config.update(custom_config)
                    providers_data[pid] = base_config

                providers = {}
                for k, v in providers_data.items():
                    try:
                        providers[k] = ProviderInfo(**v)
                    except Exception as e:
                        logger.warning(f"Could not load provider '{k}': {e}")

                return providers
            except Exception as e:
                logger.error(f"Failed to load cached models: {e}")

        return ModelsDev._fetch()

    @staticmethod
    def _fetch() -> Dict[str, ProviderInfo]:
        try:
            response = requests.get(MODELS_DEV_URL, timeout=10)
            response.raise_for_status()
            data = response.json()

            # Cache the result
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            with open(MODELS_CACHE_FILE, "w") as f:
                json.dump(data, f)

            # Re-read to apply custom logic (reuse get() logic effectively)
            return ModelsDev.get()
        except Exception as e:
            logger.error(f"Failed to fetch models.dev: {e}")
            return {}

    @staticmethod
    def refresh():
        # Simple cache expiry (1 hour)
        if MODELS_CACHE_FILE.exists():
            mtime = MODELS_CACHE_FILE.stat().st_mtime
            if time.time() - mtime < 3600:
                return
        ModelsDev._fetch()


class Provider:
    @staticmethod
    def load_config() -> Dict[str, Any]:
        if not CONFIG_FILE.exists():
            return {}
        try:
            with open(CONFIG_FILE, "r") as f:
                return yaml.safe_load(f) or {}
        except Exception as e:
            logger.error(f"Failed to load config.yml: {e}")
            return {}

    @staticmethod
    def get_all() -> Dict[str, ProviderInfo]:
        models_dev = ModelsDev.get()
        config = Provider.load_config()

        # Merge config providers into models_dev
        config_providers = config.get("provider", {})

        # Filter enabled/disabled
        disabled = set(config.get("disabled_providers", []))
        enabled = (
            set(config.get("enabled_providers", []))
            if "enabled_providers" in config
            else None
        )

        active_providers = {}

        # Combined list of keys
        all_keys = set(models_dev.keys()) | set(config_providers.keys())

        for pid in all_keys:
            if enabled is not None and pid not in enabled:
                continue
            if pid in disabled:
                continue

            # Start with models.dev data or empty
            base = models_dev.get(pid)
            if not base:
                # If custom provider from config
                base = ProviderInfo(id=pid, name=pid, models={})

            # Merge config overrides
            conf = config_providers.get(pid, {})
            # Here we would do a deep merge, for now simple override
            # TODO: Implement deep merge for options/models

            active_providers[pid] = base

        return active_providers

    @staticmethod
    def get_model(model_str: str) -> Optional[Model]:
        """
        Resolves a model string (e.g. 'openai/gpt-4o' or just 'gpt-4o' if default)
        to a Model object with API keys and URLs resolved.
        """
        providers = Provider.get_all()
        config = Provider.load_config()

        if "/" not in model_str:
            # Try to resolve as default or find in available models
            default_model = config.get("model")
            if default_model and "/" in default_model:
                # If input is just "model", maybe they meant the configured default?
                # Or we scan for it. opencode scans.
                pass

            # Simple scan
            for pid, p in providers.items():
                if model_str in p.models:
                    return Provider._build_model(pid, model_str, p)
            return None

        provider_id, model_id = model_str.split("/", 1)

        if provider_id not in providers:
            return None

        provider = providers[provider_id]
        if model_id not in provider.models:
            # It might be a custom model in config not yet in the object
            # For now, strictly require it to be in the merged list
            return None

        return Provider._build_model(provider_id, model_id, provider)

    @staticmethod
    def _build_model(provider_id: str, model_id: str, provider: ProviderInfo) -> Model:
        raw_model = provider.models.get(model_id, {})

        # Resolve API Key
        api_key = None
        # Check env vars defined in models.dev
        for env_var in provider.env:
            if env_var in os.environ:
                api_key = os.environ[env_var]
                break

        # Check config (not implemented deep retrieval yet, but would be here)

        # Map capabilities
        caps = raw_model.get("capabilities", {})

        # Resolve npm package logic (opencode compat)
        # 1. raw_model.provider.npm
        # 2. provider.npm
        # 3. provider.id (fallback)
        raw_model_provider = raw_model.get("provider", {})
        if raw_model_provider is None:
            raw_model_provider = {}  # Handle null/None case from JSON

        npm = raw_model_provider.get("npm") or provider.npm or provider.id

        return Model(
            id=raw_model.get("id", model_id),
            providerID=provider_id,
            name=raw_model.get("name", model_id),
            capabilities=ModelCapabilities(
                reasoning=caps.get("reasoning", False),
                toolcall=caps.get("toolcall", True),
                image=False,  # Simplified
            ),
            cost=ModelCost(
                input=raw_model.get("cost", {}).get("input", 0),
                output=raw_model.get("cost", {}).get("output", 0),
            ),
            context_window=raw_model.get("limit", {}).get("context", 0),
            output_limit=raw_model.get("limit", {}).get("output", 0),
            api_url=provider.api,  # Base URL
            api_key=api_key,
            npm=npm,
        )


# List of providers explicitly supported by LiteLLM that don't need remapping
LITELLM_KNOWN_PROVIDERS = {
    "openai",
    "anthropic",
    "azure",
    "bedrock",
    "google",
    "vertex_ai",
    "palm",
    "gemini",
    "cohere",
    "huggingface",
    "together_ai",
    "openrouter",
    "deepseek",
    "ollama",
    "replicate",
    "mistral",
    "clarifai",
    "ai21",
    "baseten",
    "voyage",
}

# Explicit mapping for opencode provider IDs to LiteLLM provider keys
LITELLM_PROVIDER_MAPPING = {
    "google": "gemini",
    "google-vertex": "vertex_ai",
    "google-vertex-anthropic": "vertex_ai",
    "ollama-cloud": "openai",  # Use OpenAI format for Cloud, as Ollama native is often local-specific
    "gemini-cli": "openai",  # Use OpenAI-compatible endpoint for Google Generative Language
    "mistral": "mistral",
}


async def generate_response(
    model_id: str,
    messages: List[Dict[str, str]],
    system: Optional[str] = None,
    stream: bool = False,
    tools: Optional[List[Dict[str, Any]]] = None,
) -> Any:
    """
    Generates a response from the specified model using LiteLLM.
    Supports tool calling and provider-specific transformations.
    """
    try:
        from litellm import acompletion
    except ImportError:
        raise ImportError("litellm package is required. Please install it.")

    model = Provider.get_model(model_id)
    if not model:
        raise ValueError(f"Model {model_id} not found or not configured.")

    # Load config at the top to make it available for all provider blocks
    config = Provider.load_config()

    # Prepare messages
    msgs = []

    # Inject Gemini CLI context (GEMINI.md) if this is the gemini-cli provider
    if model.providerID == "gemini-cli":
        context_instruction = GeminiCliContext.get_system_instruction()
        if system:
            system = context_instruction + "\n\n" + system
        else:
            system = context_instruction

    # Use native Gemini REST client if provider is gemini-cli to support Cloud Code API
    if model.providerID == "gemini-cli":
        api_key, project_id = GeminiCliStorage.load_auth_info()
        if not api_key:
            raise ValueError(
                "No Gemini CLI authentication found. Please run 'opencode auth login' or set GEMINI_API_KEY."
            )

        # Normalize messages for our REST client
        # System instruction is passed separately
        return GeminiRestClient.generate_content_stream(
            model_id=model.id,
            messages=messages,
            api_key=api_key,
            project_id=project_id,
            system_instruction=system,
            tools=tools,
        )

    if system:
        msgs.append({"role": "system", "content": system})
    msgs.extend(messages)

    # Apply ProviderTransform to messages
    msgs = ProviderTransform.normalize_messages(msgs, model)

    # Determine LiteLLM provider
    litellm_provider = LITELLM_PROVIDER_MAPPING.get(model.providerID, model.providerID)
    litellm_model = f"{litellm_provider}/{model.id}"

    api_base = model.api_url

    # Logic to map opencode-style provider NPM packages to LiteLLM-compatible strings
    is_openai_compatible = False
    if model.npm:
        # Check for openai-compatible OR ai-sdk-ollama (which often behaves like openai for tools in cloud)
        if (
            "@ai-sdk/openai" in model.npm
            or "openai-compatible" in model.npm
            or "ai-sdk-ollama" in model.npm
        ):
            is_openai_compatible = True

    # If explicitly OpenAI compatible, OR if it's unknown to LiteLLM but has a custom URL, map to OpenAI
    # Also handle gemini-cli explicitly if mapped to openai
    if (
        is_openai_compatible
        or (litellm_provider not in LITELLM_KNOWN_PROVIDERS and api_base)
        or model.providerID == "gemini-cli"
    ):
        if api_base:
            litellm_model = f"openai/{model.id}"

    # Special handling for ollama-cloud to ensure it hits the public API if not overridden
    if model.providerID == "ollama-cloud" and not api_base:
        api_base = "https://ollama.com/v1"
        # LiteLLM's ollama provider uses 'base_url' differently (often for local).
        # But if we use the 'ollama' provider with a remote URL, it should work.

    # Apply tool schema transformation
    if tools:
        for tool in tools:
            if "function" in tool and "parameters" in tool["function"]:
                tool["function"]["parameters"] = ProviderTransform.transform_schema(
                    tool["function"]["parameters"], model
                )

    # Prepare extra options (Thinking/Reasoning)
    extra_body = {}

    # Load config for overrides
    config = Provider.load_config()
    provider_config = config.get("provider", {}).get(model.providerID, {})

    # Merge options from config
    if provider_config and "options" in provider_config:
        options = provider_config["options"]
        if options:  # Ensure options is not None
            extra_body.update(options)

    # Ported logic from opencode transform.ts options()
    if model.providerID == "google" or "gemini" in model.id:
        # Enable thinking for Google models if supported
        if model.capabilities.reasoning:
            # Google API uses camelCase for these config fields
            if "thinkingConfig" not in extra_body:
                extra_body["thinkingConfig"] = {"includeThoughts": True}
            else:
                extra_body["thinkingConfig"]["includeThoughts"] = True

            if "gemini-3" in model.id:
                extra_body["thinkingConfig"]["thinkingLevel"] = "high"

    if model.providerID == "anthropic" and model.capabilities.reasoning:
        if "thinking" not in extra_body:
            extra_body["thinking"] = {"type": "enabled", "budget_tokens": 1024}

    response = await acompletion(
        model=litellm_model,
        messages=msgs,
        stream=stream,
        api_key=model.api_key,
        base_url=api_base,
        tools=tools,
        extra_body=extra_body,  # Pass dict directly (it is initialized as {})
    )

    return response
