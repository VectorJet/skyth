# shared.py
import json
from config import app
from backend.services.memory_manager import MemoryManager
from backend.router import Router
from backend.agent_registry import AgentRegistry
from backend.app_registry import AppRegistry
from backend.tool_registry import ToolRegistry
from backend.pipeline_registry import PipelineRegistry
from backend.mcp_manager import MCPManager
from quart_rate_limiter import RateLimiter
from quart import request, jsonify, g
from functools import wraps
import jwt
import os
from google.genai import types
from google import genai

# ==============================================================================
# INITIALIZE SERVICES
# ==============================================================================

memory_manager = MemoryManager()
limiter = RateLimiter(app)
global_genai_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

mcp_manager = MCPManager()
tool_registry = ToolRegistry()
pipeline_registry = PipelineRegistry(mcp_manager=mcp_manager)
app_registry = AppRegistry()
agent_registry = AgentRegistry(
    tool_registry=tool_registry,
    mcp_manager=mcp_manager,
    pipeline_registry=pipeline_registry,
    app_registry=app_registry,
    api_key=os.getenv("GEMINI_API_KEY"),
    image_api_key=os.getenv("IMAGE_GENERATION_API_KEY"),
    image_model="models/gemini-2.0-preview-image-generation",
    utility_model="models/gemma-3-27b-it",
)

router = Router(
    agent_registry=agent_registry,
    app_registry=app_registry,
    memory_manager=memory_manager,
    client=global_genai_client,
    utility_model="models/gemma-3-27b-it",
)

# LOAD PLUGINS
# Now we explicitly load agent configs too
mcp_manager.load_servers(
    base_config=(
        json.load(open("mcp_config/mcp_config.json"))
        if os.path.exists("mcp_config/mcp_config.json")
        else {}
    ),
    app_configs=app_registry.get_all_mcp_server_configs(),
    agent_configs=agent_registry.get_all_mcp_server_configs(),  # <--- ADDED THIS
)

for app_module in app_registry.get_all_apps():
    tool_registry.discover_app_plugins(app_module.name, str(app_module.path / "tools"))
    pipeline_registry.discover_app_plugins(
        app_module.name, str(app_module.path / "pipelines")
    )

# ==============================================================================
# SHARED CONSTANTS
# ==============================================================================
ALLOWED_EXTENSIONS = {
    "txt",
    "pdf",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "py",
    "js",
    "html",
    "css",
    "md",
    "json",
    "csv",
}
ALLOWED_AVATAR_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}

PERSONAS = {
    "default": {
        "name": "Skyth (Default)",
        "prompt": "You are Skyth, a helpful, intelligent, and versatile AI assistant.",
    },
    "professional": {
        "name": "Professional",
        "prompt": "You are a highly professional, concise, and formal executive assistant. Focus on efficiency and clarity.",
    },
    "friendly": {
        "name": "Friendly",
        "prompt": "You are a warm, empathetic, and cheerful companion. Use emojis occasionally and be encouraging.",
    },
    "creative": {
        "name": "Creative",
        "prompt": "You are a creative muse. Think outside the box, use vivid imagery, and encourage artistic expression.",
    },
    "coder": {
        "name": "Coder",
        "prompt": "You are a senior software engineer. Be technical, precise, and prefer showing code solutions over explaining them.",
    },
    "academic": {
        "name": "Academic",
        "prompt": "You are a research professor. Be rigorous, cite sources where possible, and use academic terminology.",
    },
    "simple": {
        "name": "ELI5",
        "prompt": "Explain everything as if the user is 5 years old. Use simple analogies and simple language.",
    },
    "unhinged": {
        "name": "Unhinged",
        "prompt": "You are chaotic, unpredictable, and extremely informal. Use slang, internet humor, and be wildly expressive.",
    },
    "nerd": {
        "name": "Nerd",
        "prompt": "You are a hardcore geek. Make references to sci-fi, fantasy, video games, and tech culture constantly.",
    },
}


def allowed_file(filename, allowed_set=ALLOWED_EXTENSIONS):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_set


def token_required(f):
    @wraps(f)
    async def decorated(*args, **kwargs):
        token = None
        if "Authorization" in request.headers:
            auth_header = request.headers["Authorization"]
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]

        if not token:
            return jsonify({"message": "Token is missing!"}), 401

        try:
            data = jwt.decode(token, app.config["JWT_SECRET_KEY"], algorithms=["HS256"])
            current_user = memory_manager.get_user_with_profile(data["sub"])
            if not current_user:
                return jsonify({"message": "User not found!"}), 401
            g.user = current_user
        except jwt.ExpiredSignatureError:
            return jsonify({"message": "Token has expired!"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"message": "Invalid token!"}), 401

        return await f(*args, **kwargs)

    return decorated


def convert_capabilities_to_gemini_declarations(capabilities):
    declarations = []

    for cap in capabilities:
        properties = {}
        required = []

        if hasattr(cap, "parameters"):
            for param in cap.parameters:
                param_name = param.get("name")
                param_type = param.get("type", "string").upper()
                param_desc = param.get("description", "")

                # Create Schema object for the property
                prop_schema = types.Schema(type=param_type, description=param_desc)

                # Handle array type with items
                if param_type == "ARRAY":
                    prop_schema.items = types.Schema(type="STRING")

                properties[param_name] = prop_schema

                if param.get("required", True):
                    required.append(param_name)

        # Use parameters with Schema object
        declarations.append(
            types.FunctionDeclaration(
                name=cap.name,
                description=cap.description,
                parameters=types.Schema(
                    type="OBJECT", properties=properties, required=required
                ),
            )
        )

    return declarations
