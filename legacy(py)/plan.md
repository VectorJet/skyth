# Fixing Wikipedia widget dark mode and scrolling

**Session ID:** ses_4439c3f21ffeFnZi2U9bXgCNtP
**Created:** 1/14/2026, 5:33:32 PM
**Updated:** 1/14/2026, 6:13:46 PM

---



## User

the currunt version of skyth uses litellm as a provider the
  older version uses gemini api and built around gemini api(at
  skyth-old) but is more mature i was wondering if we could add
  openai compatible api support in skyth-old i was also wondering if it was feasable

---

## Assistant (Plan · antigravity-claude-sonnet-4-5-thinking · 230.4s)

_Thinking:_

The user wants to know if we can add OpenAI-compatible API support to the skyth-old version, and if it's feasible. They mention:
1. Current version uses LiteLLM
2. Older version (skyth-old) uses Gemini API and is built around it
3. skyth-old is more mature/refined
4. They want to add OpenAI-compatible API support to skyth-old

I'm in Plan Mode (READ-ONLY), so I need to:
1. Understand the current architecture better
2. Research what it would take to add OpenAI-compatible API support
3. Assess feasibility
4. Present options/tradeoffs to the user
5. Create a comprehensive plan if they want to proceed

Let me explore both versions more to understand:
- How LiteLLM works in the current version
- The Gemini-specific features in skyth-old
- What would need to change to support OpenAI-compatible APIs
- Whether we should use LiteLLM or direct OpenAI SDK

I should also ask clarifying questions about what they want.

I'll help you assess the feasibility of adding OpenAI-compatible API support to skyth-old and create a plan. Let me gather more information about both versions to understand what this would entail.

```
Tool: read

**Input:**
```json
{
  "filePath": "/home/tammy/tests/Skyth/skyth-old/backend/agents/master_agent/agent.py",
  "offset": 130,
  "limit": 50
}
```
**Output:**
```
<file>
00131|                     "step",
00132|                     {"status": "thinking", "text": f"Planning step {turn + 1}..."},
00133|                 )
00134| 
00135|                 config = self._get_model_config(
00136|                     model_name, tool_declarations, system_instruction=system_prompt
00137|                 )
00138| 
00139|                 # ASYNC CLIENT AIO
00140|                 response_stream = self.client.aio.models.generate_content_stream(
00141|                     model=model_name, contents=conversation, config=config
00142|                 )
00143| 
00144|                 function_calls, current_turn_text = [], ""
00145| 
00146|                 # ASYNC FOR LOOP
00147|                 async for chunk in response_stream:
00148|                     if (
00149|                         not chunk.candidates
00150|                         or not chunk.candidates[0].content
00151|                         or not chunk.candidates[0].content.parts
00152|                     ):
00153|                         continue
00154| 
00155|                     for part in chunk.candidates[0].content.parts:
00156|                         if hasattr(part, "thought") and part.thought:
00157|                             step = {"type": "thought", "content": part.text}
00158|                             agent_steps.append(step)
00159|                             yield yield_data("thought", step)
00160|                         elif hasattr(part, "function_call") and part.function_call:
00161|                             function_calls.append(part.function_call)
00162|                         elif part.text:
00163|                             current_turn_text += part.text
00164| 
00165|                 if not function_calls:
00166|                     final_text_response = current_turn_text
00167|                     break
00168| 
00169|                 conversation.append(
00170|                     {
00171|                         "role": "model",
00172|                         "parts": [
00173|                             types.Part(function_call=fc) for fc in function_calls
00174|                         ],
00175|                     }
00176|                 )
00177|                 tool_response_parts = []
00178| 
00179|                 for call in function_calls:
00180|                     capability_name, args = call.name, dict(call.args)

(File has more lines. Use 'offset' parameter to read beyond line 180)
</file>
```
```

```
Tool: read

**Input:**
```json
{
  "filePath": "/home/tammy/tests/Skyth/skyth-old/backend/tools.py",
  "offset": 155,
  "limit": 40
}
```
**Output:**
```
<file>
00156| async def async_call_llm(
00157|     client: genai.Client,
00158|     prompt_content: str,
00159|     model_name: str,
00160|     chat_history: list = None,
00161|     system_prompt: str = None,
00162|     generation_config: Optional[types.GenerateContentConfig] = None,
00163| ):
00164|     """
00165|     Asynchronous version of call_llm using the google-genai SDK.
00166|     Returns an async generator.
00167|     """
00168| 
00169|     # Prepare contents
00170|     contents = chat_history if chat_history else []
00171|     if prompt_content:
00172|         if contents and contents[-1].get("role") == "user":
00173|             contents[-1]["parts"].append(types.Part(text=prompt_content))
00174|         else:
00175|             contents.append(
00176|                 {"role": "user", "parts": [types.Part(text=prompt_content)]}
00177|             )
00178| 
00179|     # --- FIX FOR GEMMA: Inject System Prompt into History ---
00180|     if "gemma" in model_name.lower() and system_prompt:
00181|         is_prompt_already_present = False
00182|         for msg in contents:
00183|             if msg.get("role") == "user":
00184|                 for part in msg.get("parts", []):
00185|                     if (
00186|                         hasattr(part, "text")
00187|                         and part.text
00188|                         and part.text.startswith(system_prompt[:20])
00189|                     ):
00190|                         is_prompt_already_present = True
00191|                         break
00192|             if is_prompt_already_present:
00193|                 break
00194| 
00195|         if not is_prompt_already_present:

(File has more lines. Use 'offset' parameter to read beyond line 195)
</file>
```
```

```
Tool: task

**Input:**
```json
{
  "description": "Find LiteLLM usage in current",
  "prompt": "In the current Skyth directory (NOT skyth-old), find how LiteLLM is being used:\n\n1. Where is LiteLLM imported and initialized?\n2. How does it handle different providers (OpenAI, Anthropic, Gemini, etc.)?\n3. What's the configuration structure?\n4. How does streaming work with LiteLLM?\n5. How are tools/function calling handled?\n\nFocus on backend files. Return specific file paths and code examples.\n\nThoroughness: medium",
  "subagent_type": "explore"
}
```
**Output:**
```
Perfect! Now I have comprehensive information about LiteLLM usage in Skyth. Let me compile the findings:

## LiteLLM Usage in Skyth - Complete Analysis

Based on my search through the Skyth backend, here's how LiteLLM is being used:

---

### 1. **Where LiteLLM is Imported and Initialized**

**File:** `/home/tammy/tests/Skyth/backend/converters/provider.py`

**Import (Line 330):**
```python
from litellm import acompletion
```

**Key Points:**
- LiteLLM is imported **lazily** inside the `generate_response()` function, not at module level
- Only the `acompletion` async function is imported
- Import is wrapped in try/except to provide a clear error if litellm is not installed

---

### 2. **How It Handles Different Providers**

**Multi-layered provider handling approach:**

#### A. **Provider Mapping (Lines 302-316)**
```python
# Known LiteLLM providers (native support)
LITELLM_KNOWN_PROVIDERS = {
    "openai", "anthropic", "azure", "bedrock", "google", "vertex_ai", "palm", 
    "gemini", "cohere", "huggingface", "together_ai", "openrouter", "deepseek",
    "ollama", "replicate", "mistral", "clarifai", "ai21", "baseten", "voyage"
}

# Explicit mapping for custom provider IDs to LiteLLM format
LITELLM_PROVIDER_MAPPING = {
    "google": "gemini",
    "google-vertex": "vertex_ai",
    "google-vertex-anthropic": "vertex_ai",
    "ollama-cloud": "openai",
    "gemini-cli": "openai",  # Uses OpenAI-compatible endpoint
    "mistral": "mistral"
}
```

#### B. **Custom Provider Configurations (Lines 57-101)**
```python
CUSTOM_PROVIDERS = {
    "anthropic": {
        "options": {
            "headers": {
                "anthropic-beta": "claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14"
            }
        }
    },
    "cerebras": {
        "options": {
            "headers": {
                "X-Cerebras-3rd-Party-Integration": "opencode"
            }
        }
    },
    "openrouter": {
        "options": {
            "headers": {
                "HTTP-Referer": "https://skyth.ai/",
                "X-Title": "Skyth"
            }
        }
    }
}
```

#### C. **Native REST Clients (Bypass LiteLLM)**
For `gemini-cli` and `qwen-code` providers, Skyth uses **custom REST clients** instead of LiteLLM:

**Lines 353-367 (Gemini CLI):**
```python
if model.providerID == "gemini-cli":
    api_key, project_id = GeminiCliStorage.load_auth_info()
    if not api_key:
        raise ValueError("No Gemini CLI authentication found...")
    
    # Use native REST client instead of LiteLLM
    return GeminiRestClient.generate_content_stream(
        model_id=model.id,
        messages=messages,
        api_key=api_key,
        project_id=project_id,
        system_instruction=system,
        tools=tools
    )
```

**Lines 370-388 (Qwen Code):**
```python
elif model.providerID == "qwen-code":
    api_key, _ = QwenCodeStorage.load_auth_info()
    if not api_key:
        raise ValueError("No Qwen Code authentication found...")
    
    return await QwenRestClient.generate_content_stream(
        model_id=model.id,
        messages=messages,
        api_key=api_key,
        resource_url=resource_url,
        system_instruction=system,
        tools=tools,
        stream=stream
    )
```

---

### 3. **Configuration Structure**

**Configuration File:** `/home/tammy/tests/Skyth/config.yml`

```yaml
model: qwen-code/coder-model
small_model: qwen-code/coder-model
provider:
  openai:
    options:
      timeout: 60000
  anthropic:
    options:
      headers:
        anthropic-beta: max-tokens-3-5-sonnet-2024-07-15
  ollama-cloud: {}
  groq: {}
  google:
    options: {}
  openrouter: {}
  gemini-cli: {}
  qwen-code: {}
disabled_providers: []
```

**Model Resolution (Lines 218-252):**
```python
@staticmethod
def get_model(model_str: str) -> Optional[Model]:
    """
    Resolves a model string (e.g. 'openai/gpt-4o' or just 'gpt-4o')
    to a Model object with API keys and URLs resolved.
    """
    providers = Provider.get_all()
    config = Provider.load_config()

    if "/" not in model_str:
        # Scan all providers for the model
        for pid, p in providers.items():
            if model_str in p.models:
                return Provider._build_model(pid, model_str, p)
        return None

    provider_id, model_id = model_str.split("/", 1)
    # ... resolve and build model
```

**Dynamic Model Data:** Models are fetched from `https://models.dev/api.json` and cached locally in `~/.cache/skyth/models.json`

---

### 4. **How Streaming Works with LiteLLM**

**Main Streaming Call (Lines 460-468):**
```python
response = await acompletion(
    model=litellm_model,
    messages=msgs,
    stream=stream,  # Boolean flag
    api_key=model.api_key,
    base_url=api_base,
    tools=tools,
    extra_body=extra_body
)
```

**Streaming Response Handling Example** (`/home/tammy/tests/Skyth/backend/pipelines/stock_pipeline.py`, Lines 237-247):
```python
response_gen = await generate_response(
    model_id=model_id,
    messages=[{"role": "user", "content": summary_prompt}],
    stream=True
)

async for chunk in response_gen:
    if hasattr(chunk, 'choices') and chunk.choices:
        delta = chunk.choices[0].delta
        if hasattr(delta, 'content') and delta.content:
            yield delta.content
```

**Streaming in Master Agent** (`/home/tammy/tests/Skyth/backend/agents/master_agent/agent.py`, Lines 93-102):
```python
async for chunk in response_gen:
    if not hasattr(chunk, 'choices') or not chunk.choices:
        continue
    
    delta = chunk.choices[0].delta
    
    # Stream content to frontend
    if hasattr(delta, 'content') and delta.content:
        full_content += delta.content
        yield chunk
    
    # Accumulate tool calls
    if hasattr(delta, 'tool_calls') and delta.tool_calls:
        # ... handle tool call streaming
```

---

### 5. **How Tools/Function Calling Are Handled**

#### A. **Tool Schema Conversion**

**File:** `/home/tammy/tests/Skyth/backend/converters/tool_converter.py`

```python
class ToolConverter:
    @staticmethod
    def to_openai_tool(component: Any) -> Dict[str, Any]:
        """Converts a BaseTool OR BasePipeline to OpenAI tool definition."""
        return {
            "type": "function",
            "function": {
                "name": component.name,
                "description": component.description,
                "parameters": component.parameters  # JSON Schema
            }
        }
```

#### B. **Tool Schema Transformation for Providers**

**File:** `/home/tammy/tests/Skyth/backend/converters/provider.py` (Lines 422-428):

```python
# Apply tool schema transformation
if tools:
    for tool in tools:
        if "function" in tool and "parameters" in tool["function"]:
            tool["function"]["parameters"] = ProviderTransform.transform_schema(
                tool["function"]["parameters"], model
            )
```

**Provider-Specific Transformations** (`/home/tammy/tests/Skyth/backend/converters/transform.py`, Lines 57-69):

```python
@staticmethod
def transform_schema(schema: Dict[str, Any], model_info: Any) -> Dict[str, Any]:
    """Transforms tool schemas for specific providers (e.g. Gemini)."""
    provider_id = model_info.providerID
    model_id = model_info.id.lower()

    # Google/Gemini: Convert integer enums to strings
    if provider_id == "google" or "gemini" in model_id:
        return ProviderTransform._sanitize_gemini_schema(schema)
    
    return schema
```

**Gemini Schema Sanitization** (Lines 72-99):
- Converts integer enums to strings
- Ensures `required` fields exist in `properties`
- Recursively processes nested schemas

#### C. **Tool Execution Flow**

**Master Agent Tool Execution** (`/home/tammy/tests/Skyth/backend/agents/master_agent/agent.py`, Lines 161-190):

```python
async def _execute_tool(self, tool_call) -> Any:
    name = tool_call.function.name
    try:
        args = json.loads(tool_call.function.arguments)
    except:
        args = tool_call.function.arguments
    
    # 1. Check Native Tools
    tool = ToolRegistry.get_tool(name)
    if tool:
        return await tool.run(args)
    
    # 2. Check Pipelines
    pipeline = PipelineRegistry.get_pipeline(name)
    if pipeline:
        results = []
        async for chunk in pipeline.run(args):
            results.append(chunk)
        return "".join(results)
    
    # 3. Check MCP Tools
    try:
        return await MCPManager.execute_tool(name, args)
    except:
        pass
        
    return {"error": f"Tool '{name}' not found or failed."}
```

#### D. **Reasoning/Thinking Configuration**

**Lines 430-458:**
```python
extra_body = {}

# Google/Gemini Reasoning
if model.providerID == "google" or "gemini" in model.id:
    if model.capabilities.reasoning:
        if "thinkingConfig" not in extra_body:
            extra_body["thinkingConfig"] = {"includeThoughts": True}
        
        if "gemini-3" in model.id:
            extra_body["thinkingConfig"]["thinkingLevel"] = "high"

# Anthropic Reasoning
if model.providerID == "anthropic" and model.capabilities.reasoning:
    if "thinking" not in extra_body:
        extra_body["thinking"] = {"type": "enabled", "budget_tokens": 1024}
```

---

## Summary

**Key Files:**
1. **`/home/tammy/tests/Skyth/backend/converters/provider.py`** - Main LiteLLM integration
2. **`/home/tammy/tests/Skyth/backend/converters/tool_converter.py`** - Tool schema conversion
3. **`/home/tammy/tests/Skyth/backend/converters/transform.py`** - Provider-specific transformations
4. **`/home/tammy/tests/Skyth/backend/converters/gemini/client.py`** - Native Gemini REST client
5. **`/home/tammy/tests/Skyth/backend/converters/qwen_code.py`** - Native Qwen REST client
6. **`/home/tammy/tests/Skyth/config.yml`** - Provider configuration

**Architecture Highlights:**
- Lazy import of LiteLLM in `generate_response()`
- Hybrid approach: LiteLLM for most providers, native REST clients for Gemini CLI and Qwen
- Dynamic model discovery from models.dev
- Provider-specific message and schema transformations
- Streaming support with delta-based content accumulation
- Multi-layered tool execution (Native → Pipelines → MCP)

<task_metadata>
session_id: ses_4437e3202ffeYdj4DtAT0OFgjb
</task_metadata>
```
```

---

## Assistant (Plan · antigravity-claude-sonnet-4-5-thinking · 124.3s)

Perfect! Now I have a comprehensive understanding of both versions. Let me ask you some clarifying questions before creating the plan:

```
Tool: question

**Input:**
```json
{
  "questions": [
    {
      "options": [
        {
          "label": "Use LiteLLM (like current version)",
          "description": "Add litellm package to handle OpenAI/Anthropic/other providers. Simpler, more providers out-of-box, but adds dependency."
        },
        {
          "label": "Use OpenAI SDK directly",
          "description": "Add official openai Python package. More lightweight, OpenAI-compatible only, requires adapter layer."
        },
        {
          "label": "Build custom abstraction",
          "description": "Create provider abstraction that supports both Gemini and OpenAI APIs natively. Most control, most work."
        },
        {
          "label": "Recommend best approach",
          "description": "Let me analyze and recommend the best option based on your goals."
        }
      ],
      "multiple": false,
      "header": "Approach",
      "question": "Which approach would you prefer for adding OpenAI-compatible API support to skyth-old?"
    },
    {
      "header": "Features",
      "question": "Which features from Gemini API do you want to preserve/prioritize?",
      "options": [
        {
          "description": "ThinkingConfig with budget tokens for extended reasoning",
          "label": "Thinking/reasoning config"
        },
        {
          "description": "The async streaming with function calling in loops",
          "label": "Multi-turn agentic loops"
        },
        {
          "description": "Gemini's native image generation capabilities",
          "label": "Image generation"
        },
        {
          "description": "Keep full compatibility with Gemini while adding OpenAI support",
          "label": "All existing features"
        }
      ],
      "multiple": true
    },
    {
      "question": "What's your target scope for this integration?",
      "options": [
        {
          "description": "Just add official OpenAI API support",
          "label": "OpenAI only"
        },
        {
          "label": "OpenAI-compatible APIs",
          "description": "OpenAI + any compatible endpoints (Ollama, LM Studio, etc.)"
        },
        {
          "description": "OpenAI + Anthropic + others (more like current Skyth)",
          "label": "Multiple major providers"
        },
        {
          "description": "Let me suggest based on effort/benefit analysis",
          "label": "Flexible - your recommendation"
        }
      ],
      "multiple": false,
      "header": "Scope"
    },
    {
      "options": [
        {
          "label": "Environment variable",
          "description": "Add PROVIDER env var (GEMINI, OPENAI, etc.)"
        },
        {
          "label": "Config file",
          "description": "Add provider settings to config.py"
        },
        {
          "label": "Runtime selection",
          "description": "Allow per-request provider/model selection like current Skyth"
        },
        {
          "label": "Your recommendation",
          "description": "Suggest best UX based on skyth-old architecture"
        }
      ],
      "multiple": false,
      "header": "User Config",
      "question": "How should users configure which provider to use?"
    }
  ]
}
```
**Output:**
```
User has answered your questions: "Which approach would you prefer for adding OpenAI-compatible API support to skyth-old?"="Use LiteLLM (like current version)", "Which features from Gemini API do you want to preserve/prioritize?"="All existing features", "What's your target scope for this integration?"="OpenAI-compatible APIs", "How should users configure which provider to use?"="GUI Based approach". You can now continue with the user's answers in mind.
```
```

---

## Assistant (Plan · antigravity-claude-sonnet-4-5-thinking · 5.0s)

Excellent! Based on your answers, let me read a bit more about the current Skyth's provider system and then create a comprehensive plan:

```
Tool: read

**Input:**
```json
{
  "filePath": "/home/tammy/tests/Skyth/skyth-old/config.py"
}
```
**Output:**
```
<file>
00001| import os
00002| from quart import Quart
00003| from dotenv import load_dotenv
00004| 
00005| # ==============================================================================
00006| # INITIAL SETUP
00007| # ==============================================================================
00008| load_dotenv()
00009| app = Quart(__name__)
00010| app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "a-secret-key-for-self-hosting")
00011| 
00012| # --- NEW: Secret key for signing JSON Web Tokens ---
00013| app.config["JWT_SECRET_KEY"] = os.getenv(
00014|     "JWT_SECRET_KEY", "a-super-secret-jwt-key-that-is-long-and-secure"
00015| )
00016| 
00017| # --- UPLOAD CONFIGURATION ---
00018| app.config["UPLOAD_FOLDER"] = os.getenv("UPLOAD_FOLDER", "uploads")
00019| app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB limit
00020| 
00021| # ==============================================================================
00022| # DATABASE SETUP (UPGRADED TO POSTGRESQL)
00023| # ==============================================================================
00024| DATABASE_URL = os.getenv("DATABASE_URL")
00025| if not DATABASE_URL:
00026|     print(
00027|         "🔴 CRITICAL WARNING: DATABASE_URL environment variable not found. App cannot connect to the database."
00028|     )
00029| 
00030| # ==============================================================================
00031| # REDIS SETUP (FOR CACHING ONLY)
00032| # ==============================================================================
00033| REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
00034| REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
00035| REDIS_DB_CACHE = int(os.getenv("REDIS_DB_CACHE", 0))  # For application caching
00036| 
00037| # ==============================================================================
00038| # AI MODEL CONFIGURATION
00039| # ==============================================================================
00040| GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
00041| if not GEMINI_API_KEY:
00042|     print("🔴 CRITICAL WARNING: GEMINI_API_KEY environment variable not found.")
00043| 
00044| IMAGE_GENERATION_API_KEY = os.getenv("IMAGE_GENERATION_API_KEY", GEMINI_API_KEY)
00045| 
00046| # --- FIX: Correct model names with 'models/' prefix for the Python SDK ---
00047| UTILITY_MODEL = "models/gemma-3-27b-it"
00048| 
00049| CONVERSATIONAL_MODELS = {
00050|     "lite": "models/gemini-2.5-flash-lite",
00051|     "flash": "models/gemini-2.5-flash",
00052|     "pro": "models/gemini-2.5-pro",
00053| }
00054| AGENT_MODEL = CONVERSATIONAL_MODELS["lite"]
00055| IMAGE_GENERATION_MODEL = "models/gemini-2.0-preview-image-generation"
00056| 
00057| print("✅ Config Loaded (Quart Async Mode):")
00058| print(f"   - JWT Key Loaded: {'Yes' if app.config['JWT_SECRET_KEY'] else 'NO'}")
00059| print(f"   - Utility/Routing Model: {UTILITY_MODEL}")
00060| print(f"   - Default Agent Model: {AGENT_MODEL}")
00061| print(f"   - Gemini Key Loaded: {'Yes' if GEMINI_API_KEY else 'NO'}")
00062| print(f"   - Database URL Loaded: {'Yes' if DATABASE_URL else 'NO'}")
00063| print(f"   - Redis for Cache: {REDIS_HOST}:{REDIS_PORT}/{REDIS_DB_CACHE}")
00064| print(f"   - Upload Folder: {app.config['UPLOAD_FOLDER']}")
00065| 

(End of file - total 65 lines)
</file>
```
```

```
Tool: grep

**Input:**
```json
{
  "pattern": "def.*model|select.*model|model.*select",
  "path": "/home/tammy/tests/Skyth/skyth-old/frontend",
  "include": "*.tsx,*.ts"
}
```
**Output:**
```
No files found
```
```

---

## Assistant (Plan · antigravity-claude-sonnet-4-5-thinking · 76.5s)

```
Tool: task

**Input:**
```json
{
  "prompt": "Find the model selection UI in the skyth-old frontend. Look for:\n\n1. Components that allow users to select which model to use (lite/flash/pro)\n2. Any dropdowns, buttons, or UI controls for changing models\n3. Settings or preferences pages\n4. How the selected model is stored and sent to the backend\n\nFocus on TSX/TS files in the frontend directory. Return file paths and code examples.\n\nThoroughness: medium",
  "subagent_type": "explore",
  "description": "Find model selection UI"
}
```
**Output:**
```
Perfect! Now I have all the information I need. Let me create a comprehensive summary of the model selection UI in the skyth-old frontend.

## Summary: Model Selection UI in Skyth-Old Frontend

Based on my analysis of the skyth-old frontend, here's what I found:

---

### 1. **Model Selection Component Location**

**File:** `/home/tammy/tests/Skyth/skyth-old/frontend/components/AppShell.tsx`

**Lines:** 118-128

```tsx
<Select value={selectedModel} onValueChange={setSelectedModel}>
  <SelectTrigger className="h-8 w-auto gap-2 border-0 bg-transparent text-sm font-bold text-primary-text hover:bg-[var(--sidebar-highlight-bg-color)] focus:ring-0 px-3 rounded-lg transition-colors">
    <SelectValue placeholder="Select Model" />
  </SelectTrigger>
  <SelectContent align="start">
    <SelectItem value="lite">Flash Lite</SelectItem>
    <SelectItem value="flash">Flash</SelectItem>
    <SelectItem value="pro">Pro</SelectItem>
  </SelectContent>
</Select>
```

**Location in UI:** The model selector is located in the **header section** of the AppShell component, positioned in the top-left area alongside the sidebar toggle button on mobile.

---

### 2. **Model Options Available**

The dropdown provides three model options:

- **`lite`** → Displayed as "Flash Lite"
- **`flash`** → Displayed as "Flash"  
- **`pro`** → Displayed as "Pro"

---

### 3. **State Management**

**Hook:** `/home/tammy/tests/Skyth/skyth-old/frontend/hooks/use-chat.ts`

**Line 30:** Initial state declaration
```typescript
const [selectedModel, setSelectedModel] = useState('lite');
```

**Lines 354-355:** Exported from hook
```typescript
selectedModel, 
setSelectedModel,
```

**Default Model:** `'lite'` (Flash Lite)

---

### 4. **How the Model is Stored and Sent to Backend**

**File:** `/home/tammy/tests/Skyth/skyth-old/frontend/hooks/use-chat.ts`

**Storage:** The selected model is stored in React state (no localStorage persistence currently)

**Backend Transmission (Line 225):**
```typescript
const queryData = {
  query: userInput,
  chat_id: currentChatId,
  model: selectedModel,  // <-- Model sent here
  parent_message_id: parentMessageId,
  edit_info: editInfo,
  regen_info: regenInfo
};
```

**API Endpoint:** `/search` (POST request)

**Data Format:** The model value is included in a FormData object as part of the `json_data` field:

```typescript
formData.append('json_data', JSON.stringify(queryData));

const response = await api('/search', {
  method: 'POST', 
  body: formData 
});
```

---

### 5. **Context Flow**

**Context:** `/home/tammy/tests/Skyth/skyth-old/frontend/context/ChatContext.tsx`

The `useChat` hook is wrapped in a `ChatProvider` and made available via `useChatContext()`:

```typescript
const ChatProvider = ({ children }: { children: ReactNode }) => {
  const chatState = useChat();
  // ...
  const contextValue = {
    ...chatState,  // includes selectedModel and setSelectedModel
    connectedApps,
  };
  
  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
};
```

**Usage in AppShell:**
```typescript
const { 
  selectedModel,
  setSelectedModel 
} = useChatContext();
```

---

### 6. **UI Component Library**

**Select Component:** `/home/tammy/tests/Skyth/skyth-old/frontend/components/ui/select.tsx`

Built using **Radix UI** primitives (`@radix-ui/react-select`) with custom shadcn/ui styling.

---

### 7. **No Settings/Preferences Page for Model**

The profile/settings page (`/app/profile/page.tsx`) does **NOT** include model selection preferences. Model selection is only available in the main chat interface header.

---

### Key Findings:

1. **Single Location:** Model selection UI only exists in the AppShell header
2. **No Persistence:** Model selection is not persisted (resets to 'lite' on page reload)
3. **Per-Request Basis:** The model is sent with each search query to the backend
4. **Simple Dropdown:** Uses shadcn/ui Select component with three hardcoded options
5. **No Model Settings:** No user preference storage for default model selection

---

Would you like me to investigate any specific aspect of the model selection in more detail, or look at how the backend handles these model values?

<task_metadata>
session_id: ses_4437971a0ffeCxZ0VPBBrC4Yzy
</task_metadata>
```
```

---

## Assistant (Plan · antigravity-claude-sonnet-4-5-thinking · 61.8s)

Perfect! Now I have all the information needed. Let me create a comprehensive plan for adding OpenAI-compatible API support to skyth-old.

---

