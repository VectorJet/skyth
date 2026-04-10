import os
import json
import requests
import asyncio
import time
from pathlib import Path
from typing import Optional, Dict, Any, AsyncGenerator, List, Tuple

# Constants from opencode-gemini-auth/src/constants.ts
# TODO: Replace with your own credentials
GEMINI_CLIENT_ID = "YOUR_CLIENT_ID"
GEMINI_CLIENT_SECRET = "YOUR_CLIENT_SECRET"
GEMINI_CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com"
CODE_ASSIST_HEADERS = {
    "User-Agent": "google-api-nodejs-client/9.15.1",
    "X-Goog-Api-Client": "gl-node/22.17.0",
    "Client-Metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
}


class GeminiCliStorage:
    @staticmethod
    def get_global_gemini_dir() -> Path:
        return Path.home() / ".gemini"

    @staticmethod
    def get_global_settings_path() -> Path:
        return GeminiCliStorage.get_global_gemini_dir() / "settings.json"

    @staticmethod
    def get_oauth_creds_path() -> Path:
        return GeminiCliStorage.get_global_gemini_dir() / "oauth_creds.json"

    @staticmethod
    def load_auth_info() -> Tuple[Optional[str], Optional[str]]:
        """
        Returns (api_key_or_token, project_id).
        """
        # 1. OAuth Token from Login (Prioritize CLI Auth)
        token, project_id = GeminiCliStorage.get_valid_oauth_token_and_project()
        if token:
            return token, project_id

        # 2. Environment Variable Specific to Gemini CLI
        if "GEMINI_API_KEY" in os.environ:
            return os.environ["GEMINI_API_KEY"], None

        # 3. Fallback to standard Google API Key
        if "GOOGLE_API_KEY" in os.environ:
            return os.environ["GOOGLE_API_KEY"], None

        return None, None

    @staticmethod
    def load_api_key() -> Optional[str]:
        # Backward compatibility helper
        token, _ = GeminiCliStorage.load_auth_info()
        return token

    @staticmethod
    def get_valid_oauth_token_and_project() -> Tuple[Optional[str], Optional[str]]:
        """
        Loads the OAuth token, checks expiry, refreshes if necessary.
        Also extracts project_id from the refresh token if present, or resolves it via API.
        """
        creds_path = GeminiCliStorage.get_oauth_creds_path()
        if not creds_path.exists():
            return None, None

        try:
            with open(creds_path, "r") as f:
                data = json.load(f)

            # Normalize structure
            creds = data.get("tokens", data)

            access_token = creds.get("access_token")
            refresh_token_raw = creds.get("refresh_token")
            expiry_date = creds.get("expiry_date")  # Epoch ms

            if not access_token:
                return None, None

            # Parse project_id from refresh token (format: token|project|managed)
            project_id = None
            refresh_token = refresh_token_raw

            if refresh_token_raw and "|" in refresh_token_raw:
                parts = refresh_token_raw.split("|")
                refresh_token = parts[0]
                if len(parts) > 1 and parts[1]:
                    project_id = parts[1]
                # If there's a managed project ID (3rd part), prioritize that?
                # opencode uses 2nd part as user-selected project, 3rd as managed.
                # ensureProjectContext logic: if projectId OR managedProjectId, use it.
                if len(parts) > 2 and parts[2]:
                    project_id = parts[2]  # Prefer managed project if available

            # Check expiry (buffer of 60s)
            is_expired = False
            if expiry_date:
                if (expiry_date / 1000) < (time.time() + 60):
                    is_expired = True

            if is_expired and refresh_token:
                # print("Gemini CLI: Access token expired, refreshing...")
                new_tokens = GeminiCliStorage.refresh_access_token(refresh_token)
                if new_tokens:
                    creds["access_token"] = new_tokens["access_token"]
                    creds["expiry_date"] = int(time.time() * 1000) + (
                        new_tokens["expires_in"] * 1000
                    )

                    if "tokens" in data:
                        data["tokens"] = creds
                    else:
                        data.update(creds)

                    try:
                        with open(creds_path, "w") as f:
                            json.dump(data, f, indent=2)
                    except Exception as e:
                        print(f"Gemini CLI: Failed to save refreshed tokens: {e}")

                    access_token = new_tokens["access_token"]
                else:
                    print("Gemini CLI: Failed to refresh token.")
                    return None, None

            # Resolve Project ID if missing
            if not project_id and access_token:
                print("Gemini CLI: Resolving managed project...")
                project_id = GeminiCliStorage.resolve_managed_project(access_token)
                if project_id:
                    print(f"Gemini CLI: Resolved project {project_id}")
                    # Update refresh token with project ID to persist it
                    # Format: token|project_id|project_id (assuming managed is same or we just store as managed)
                    # opencode format: token|userProject|managedProject
                    # If we resolved it via loadCodeAssist, it's likely a managed project.
                    # We'll stick to a simple format or match opencode: token||project_id
                    new_refresh_string = f"{refresh_token}||{project_id}"
                    creds["refresh_token"] = new_refresh_string

                    if "tokens" in data:
                        data["tokens"] = creds
                    else:
                        data.update(creds)

                    try:
                        with open(creds_path, "w") as f:
                            json.dump(data, f, indent=2)
                    except Exception as e:
                        print(f"Gemini CLI: Failed to save resolved project: {e}")

            return access_token, project_id

        except Exception as e:
            print(f"Warning: Failed to load/refresh OAuth creds from {creds_path}: {e}")
            return None, None

    @staticmethod
    def resolve_managed_project(access_token: str) -> Optional[str]:
        """
        Calls loadCodeAssist to get the effective project.
        """
        url = f"{GEMINI_CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            **CODE_ASSIST_HEADERS,
        }
        body = {
            "metadata": {
                "ideType": "IDE_UNSPECIFIED",
                "platform": "PLATFORM_UNSPECIFIED",
                "pluginType": "GEMINI",
            }
        }

        try:
            response = requests.post(url, headers=headers, json=body, timeout=10)
            if response.status_code == 200:
                data = response.json()
                # Check for cloudaicompanionProject
                if "cloudaicompanionProject" in data:
                    return data["cloudaicompanionProject"]
                # Also check payload.response.cloudaicompanionProject if wrapped
            else:
                print(
                    f"Gemini CLI: Failed to resolve project HTTP {response.status_code}: {response.text}"
                )
        except Exception as e:
            print(f"Gemini CLI: Failed to resolve managed project: {e}")
        return None

    @staticmethod
    def refresh_access_token(refresh_token: str) -> Optional[Dict[str, Any]]:
        url = "https://oauth2.googleapis.com/token"
        payload = {
            "client_id": GEMINI_CLIENT_ID,
            "client_secret": GEMINI_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }

        try:
            response = requests.post(url, data=payload)
            if response.status_code == 200:
                return response.json()
            else:
                print(
                    f"Gemini CLI: Refresh failed HTTP {response.status_code}: {response.text}"
                )
                return None
        except Exception as e:
            print(f"Gemini CLI: Refresh request failed: {e}")
            return None


class GeminiCliContext:
    @staticmethod
    def get_gemini_md_content(target_dir: Path = Path.cwd()) -> Optional[str]:
        gemini_md = target_dir / "GEMINI.md"
        if gemini_md.exists():
            try:
                with open(gemini_md, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as e:
                print(f"Warning: Failed to read GEMINI.md: {e}")
        return None

    @staticmethod
    def get_system_instruction(target_dir: Path = Path.cwd()) -> str:
        base_instruction = "You are Gemini CLI, a helpful AI assistant in the terminal."
        context = GeminiCliContext.get_gemini_md_content(target_dir)
        if context:
            base_instruction += "\n\nCONTEXT FROM GEMINI.MD:\n" + context
        return base_instruction


# Helper Classes for OpenAI-style Chunks
class Chunk:
    def __init__(self, delta):
        self.choices = [Choice(delta)]


class Choice:
    def __init__(self, delta):
        self.delta = delta


class Delta:
    def __init__(self, content=None, tool_calls=None, reasoning_content=None):
        self.content = content
        self.tool_calls = tool_calls
        self.reasoning_content = reasoning_content


class ToolCall:
    def __init__(self, index, id, function):
        self.index = index
        self.id = id
        self.function = function


class Function:
    def __init__(self, name, arguments):
        self.name = name
        self.arguments = arguments


class GeminiRestClient:
    """
    Direct REST Client for Cloud Code Assist API (Gemini CLI backend).
    """

    @staticmethod
    async def generate_content_stream(
        model_id: str,
        messages: List[Dict[str, str]],
        api_key: str,
        project_id: Optional[str] = None,
        system_instruction: Optional[str] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
    ) -> AsyncGenerator[Any, None]:
        # Determine endpoint and headers
        is_cloud_code = api_key and not api_key.startswith("AIza") and project_id

        if is_cloud_code:
            url = f"{GEMINI_CODE_ASSIST_ENDPOINT}/v1internal:streamGenerateContent?alt=sse"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                **CODE_ASSIST_HEADERS,
            }
        else:
            # Fallback to public endpoint for API Keys
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:streamGenerateContent?alt=sse"
            headers = {"Content-Type": "application/json"}
            if api_key:
                if api_key.startswith("AIza"):
                    url += f"&key={api_key}"
                else:
                    headers["Authorization"] = f"Bearer {api_key}"

        # ------------------------------------------------------------------
        # BUILD PAYLOAD WITH TOOL SUPPORT
        # ------------------------------------------------------------------

        # 1. Pre-process: Map tool_call_id to function name
        #    OpenAI 'tool' messages only have ID. Gemini needs 'name'.
        tool_id_to_name = {}
        for msg in messages:
            if msg.get("role") == "assistant" and "tool_calls" in msg:
                for tc in msg["tool_calls"]:
                    if "id" in tc and "function" in tc:
                        tool_id_to_name[tc["id"]] = tc["function"]["name"]

        contents = []
        for msg in messages:
            parts = []
            role = "user"  # Default

            # 1. Handle Text Content (Safe Get)
            text = msg.get("content")
            if text:
                parts.append({"text": text})

            # 2. Handle Role Specifics
            if msg["role"] == "assistant":
                role = "model"

                # Cloud Code Fallback: Convert Assistant Tool Calls to Description Text
                # The internal API often mishandles tool call history, so we flatten it.
                if is_cloud_code and "tool_calls" in msg and msg["tool_calls"]:
                    descriptions = []
                    for tc in msg["tool_calls"]:
                        fn = tc.get("function", {})
                        descriptions.append(
                            f"Thought: I will call function '{fn.get('name')}' with args {fn.get('arguments')}"
                        )

                    if not text:
                        parts.append({"text": "\n".join(descriptions)})
                    else:
                        parts[-1]["text"] += "\n" + "\n".join(descriptions)

                # Standard API: Use functionCall
                elif "tool_calls" in msg and msg["tool_calls"]:
                    for tc in msg["tool_calls"]:
                        fn = tc.get("function", {})
                        args = {}
                        if "arguments" in fn:
                            try:
                                if isinstance(fn["arguments"], str):
                                    args = json.loads(fn["arguments"])
                                else:
                                    args = fn["arguments"]
                            except:
                                args = {}  # Fail safe

                        parts.append(
                            {"functionCall": {"name": fn.get("name"), "args": args}}
                        )

            elif msg["role"] == "tool":
                t_id = msg.get("tool_call_id")
                f_name = tool_id_to_name.get(t_id, "unknown_tool")

                if is_cloud_code:
                    # Cloud Code Fallback: Convert Tool Output to User Text
                    role = "user"
                    parts.append(
                        {"text": f"System Output from tool '{f_name}': {text}"}
                    )
                else:
                    # Standard API: Use functionResponse
                    role = "function"

                    # Try to ensure response is an object, or wrap string
                    response_obj = {"content": text}
                    if text:
                        try:
                            # If output is JSON-like, parse it
                            trimmed = text.strip()
                            if trimmed.startswith("{") or trimmed.startswith("["):
                                response_obj = json.loads(trimmed)
                        except:
                            pass

                    parts.append(
                        {"functionResponse": {"name": f_name, "response": response_obj}}
                    )

            elif msg["role"] == "user":
                role = "user"

            # Only append if we actually have parts
            if parts:
                contents.append({"role": role, "parts": parts})

        request_payload = {
            "contents": contents,
            "generationConfig": {"temperature": 0.0},
        }

        # Configure thinking if model supports it
        # Enable for gemini-3, thinking models, and gemini-2.5
        if "gemini-3" in model_id or "thinking" in model_id or "gemini-2.5" in model_id:
            if "gemini-3" in model_id:
                request_payload["generationConfig"]["thinkingConfig"] = {
                    "includeThoughts": True,
                    "thinkingLevel": "high",
                }
            elif "gemini-2.5" in model_id:
                # Enable thoughts for 2.5 Pro/Flash
                request_payload["generationConfig"]["thinkingConfig"] = {
                    "includeThoughts": True
                }
            else:
                # Default for other thinking models (e.g. old flash-thinking)
                request_payload["generationConfig"]["thinkingConfig"] = {
                    "includeThoughts": True,
                    "thinkingBudget": 8192,
                }

        if system_instruction:
            request_payload["systemInstruction"] = {
                "parts": [{"text": system_instruction}]
            }

        if tools:
            gemini_tools = []
            for t in tools:
                if t["type"] == "function":
                    gemini_tools.append(
                        {
                            "name": t["function"]["name"],
                            "description": t["function"]["description"],
                            "parameters": t["function"]["parameters"],
                        }
                    )
            if gemini_tools:
                request_payload["tools"] = [{"function_declarations": gemini_tools}]

        # Wrap body if Cloud Code
        if is_cloud_code:
            body = {
                "project": project_id,
                "model": model_id,  # e.g. gemini-3-pro-preview
                "request": request_payload,
            }
        else:
            body = request_payload

        loop = asyncio.get_event_loop()

        def blocking_request():
            return requests.post(url, headers=headers, json=body, stream=True)

        try:
            response = await loop.run_in_executor(None, blocking_request)

            if response.status_code != 200:
                print(f"Gemini Error {response.status_code}: {response.text}")
                response.raise_for_status()

            # Stateful index tracking for tool calls in stream
            tool_call_index = 0

            for line in response.iter_lines():
                if line:
                    decoded_line = line.decode("utf-8")
                    if decoded_line.startswith("data:"):
                        json_str = decoded_line[5:].strip()
                        if json_str:
                            try:
                                payload = json.loads(json_str)
                                # Cloud Code returns { response: { ... } } sometimes?
                                # request.ts: transformStreamingPayload checks for data: { response: ... }
                                if "response" in payload:
                                    payload = payload["response"]

                                # Inline _convert_chunk logic to handle stateful index
                                candidates = payload.get("candidates", [])
                                if candidates:
                                    candidate = candidates[0]
                                    content = candidate.get("content", {})
                                    parts = content.get("parts", [])

                                    text = ""
                                    tool_calls = []
                                    reasoning = ""

                                    for part in parts:
                                        # Handle thought/reasoning
                                        thought_val = part.get("thought")
                                        if isinstance(thought_val, str):
                                            reasoning += thought_val
                                        elif thought_val is True:
                                            reasoning += part.get("text", "")

                                        # Handle standard text
                                        elif "text" in part:
                                            text += part["text"]

                                        # Handle function calls
                                        if "functionCall" in part:
                                            fc = part["functionCall"]
                                            # Use stateful index
                                            tool_calls.append(
                                                ToolCall(
                                                    index=tool_call_index,
                                                    id="call_"
                                                    + fc.get("name", "unknown")
                                                    + str(tool_call_index),
                                                    function=Function(
                                                        name=fc.get("name"),
                                                        arguments=json.dumps(
                                                            fc.get("args", {})
                                                        ),
                                                    ),
                                                )
                                            )
                                            tool_call_index += 1

                                    yield Chunk(
                                        Delta(
                                            content=text if text else None,
                                            tool_calls=tool_calls
                                            if tool_calls
                                            else None,
                                            reasoning_content=reasoning
                                            if reasoning
                                            else None,
                                        )
                                    )

                            except json.JSONDecodeError:
                                pass
        except Exception as e:
            print(f"Gemini REST Error: {e}")
            raise e

    @staticmethod
    def _convert_chunk(chunk: Dict[str, Any]) -> Any:
        """
        Converts Gemini chunk to LiteLLM/OpenAI compatible chunk object.
        """

        # Mock class to behave like an object with .choices[0].delta
        class Chunk:
            def __init__(self, delta):
                self.choices = [Choice(delta)]

        class Choice:
            def __init__(self, delta):
                self.delta = delta

        class Delta:
            def __init__(self, content=None, tool_calls=None, reasoning_content=None):
                self.content = content
                self.tool_calls = tool_calls
                self.reasoning_content = reasoning_content

        class ToolCall:
            def __init__(self, index, id, function):
                self.index = index
                self.id = id
                self.function = function

        class Function:
            def __init__(self, name, arguments):
                self.name = name
                self.arguments = arguments

        candidates = chunk.get("candidates", [])
        if not candidates:
            return Chunk(Delta())

        candidate = candidates[0]
        content = candidate.get("content", {})
        parts = content.get("parts", [])

        text = ""
        tool_calls = []
        reasoning = ""

        for part in parts:
            # Handle thought/reasoning
            thought_val = part.get("thought")
            if isinstance(thought_val, str):
                reasoning += thought_val
            elif thought_val is True:
                reasoning += part.get("text", "")

            # Handle standard text (only if not a boolean thought, which consumes text)
            elif "text" in part:
                text += part["text"]

            # Handle function calls
            if "functionCall" in part:
                fc = part["functionCall"]
                tool_calls.append(
                    ToolCall(
                        index=0,
                        id="call_" + fc.get("name", "unknown"),
                        function=Function(
                            name=fc.get("name"),
                            arguments=json.dumps(fc.get("args", {})),
                        ),
                    )
                )

        return Chunk(
            Delta(
                content=text if text else None,
                tool_calls=tool_calls if tool_calls else None,
                reasoning_content=reasoning if reasoning else None,
            )
        )


class GeminiCliConfig:
    MODELS = {
        "gemini-3-pro-preview": {
            "id": "gemini-3-pro-preview",
            "name": "Gemini 3 Pro Preview (CLI)",
            "capabilities": {"reasoning": True, "toolcall": True},
            "limit": {"context": 2000000, "output": 8192},
        },
        "gemini-2.5-pro": {
            "id": "gemini-2.5-pro",
            "name": "Gemini 2.5 Pro (CLI Default)",
            "capabilities": {"reasoning": True, "toolcall": True},
            "limit": {"context": 2000000, "output": 8192},
        },
        "gemini-2.5-flash": {
            "id": "gemini-2.5-flash",
            "name": "Gemini 2.5 Flash (CLI)",
            "capabilities": {"reasoning": True, "toolcall": True},
            "limit": {"context": 1000000, "output": 8192},
        },
    }

    @staticmethod
    def get_provider_config() -> Dict[str, Any]:
        api_key, project_id = GeminiCliStorage.load_auth_info()

        # We don't dynamically fetch models here because we use the hardcoded CLI set
        # to ensure compatibility with Cloud Code endpoint.

        env_vars = ["GEMINI_API_KEY", "GOOGLE_API_KEY"]

        return {
            "id": "gemini-cli",
            "name": "Gemini CLI",
            "api": GEMINI_CODE_ASSIST_ENDPOINT,
            "models": GeminiCliConfig.MODELS,
            "env": [] if api_key else env_vars,
            "options": {"source": "gemini-cli", "project_id": project_id},
        }
