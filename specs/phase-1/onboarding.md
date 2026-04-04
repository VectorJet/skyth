# Phase 1: Onboarding Flow Implementation

**Status:** Specification Complete  
**Based on:** Q1.1 / A1.1  
**Date:** 2026-01-31

---

## Overview

Skyth's onboarding flow is inspired by Moltbot (now OpenClaw) and provides both interactive and non-interactive configuration options.

## Reference Implementation

See `@refs/phase/phase-1/onboarding/` for implementation patterns.

---

## Onboarding Modes

### 1. Interactive Mode (Default)

Interactive TUI-based wizard using arrow keys and prompts.

**Command:**
```bash
skyth init
# or
skyth run onboarding
```

### 2. Non-Interactive Mode (CLI Flags)

Flag-based configuration for scripting and automation.

**Command:**
```bash
skyth init --username=tammy --model=openai/gpt-4o --skip-oauth
```

---

## Onboarding Flow Diagram

```
●
├─ Enter your username: string 
|
●
├─ Enter your agents nickname: string
●
├─ select primary model provider
|  // list of providers(↑ ↓)(use arrows)
|  [search box](or search)
|  // ping models.dev api here
●
|
●  // ask user to provide api key here
|
●
├─ // same for model selection 
●
├─ use secondary model: yes/no
●
├─ // and so on 
```

---

## Onboarding Steps

### Step 1: Username Configuration
- Prompt: "Enter your username"
- Validation: Non-empty string
- Storage: `~/.skyth/config/config.yml`

### Step 2: Agent Nickname
- Prompt: "Enter your agent's nickname"
- Default: "Skyth"
- Purpose: Personalization of AI assistant

### Step 3: Primary Model Provider Selection
- Display: List of supported providers (OpenAI, Anthropic, Google, etc.)
- Navigation: Arrow keys (↑ ↓) or search box
- Validation: Ping models.dev API to verify provider availability

### Step 4: API Key Configuration
- Prompt: "Enter your {provider} API key"
- Validation: Test API call to verify key
- Security: Stored securely in `~/.skyth/auth/` (hashed if needed)

### Step 5: Primary Model Selection
- Display: List of available models for selected provider
- Source: Fetch from provider's `/models` endpoint via models.dev
- Fallback: Cached list if API unavailable

### Step 6: Secondary Model (Optional)
- Prompt: "Use secondary/fallback model? (yes/no)"
- If yes: Repeat provider + model selection flow
- Purpose: Fallback for rate limits or API failures

### Step 7: Router Configuration (Optional)
- Prompt: "Enable router model for agent selection? (yes/no)"
- Default: No (generalist agent is default)
- If yes: Select lightweight model (recommended: gpt-4o-mini, gemini-flash)

### Step 8: Watcher Mode
- Prompt: "Enable watcher mode for background monitoring? (yes/no)"
- Default: No
- Purpose: Continuous background agent execution

### Step 9: MCP Server Configuration
- Prompt: "Configure MCP servers now? (yes/no)"
- Default: Skip (can configure later)
- Location: `~/.skyth/config/mcp/`

---

## Skip Behavior

### User Skips Onboarding

If user exits onboarding wizard (`Ctrl+C`, `Esc`, etc.):

**Option 1: Continue Later**
```
⚠ Onboarding incomplete. Choose an option:
  1. Continue onboarding now
  2. Configure manually later
  3. Use default configuration
```

**Option 2: Manual Configuration**
- System displays path: `~/.skyth/config/config.yml`
- Provides template or documentation link
- User must manually edit config file

**Option 3: Default Configuration**
- Creates minimal config with placeholders
- System errors on first usage if API keys missing
- Forces completion on next run

---

## OAuth Support

Similar to Moltbot/OpenClaw, Skyth supports OAuth flows for certain providers:

### Supported OAuth Providers
- Anthropic (if applicable)
- Google (Vertex AI)
- Azure OpenAI

### OAuth Flow
1. User selects OAuth-enabled provider
2. System generates OAuth URL
3. User opens browser and authorizes
4. Callback receives token
5. Token stored in `~/.skyth/auth/oauth_tokens.json`

---

## Model Validation

### Provider Validation
- Ping models.dev API during provider selection
- Verify provider is available and API key format is correct
- Display error if provider unavailable

### Model Validation
- Fetch available models from provider's API
- Display only compatible models (filter by capability)
- Test model with simple prompt during onboarding

---

## Configuration Output

After successful onboarding, system writes:

1. **Config file:** `~/.skyth/config/config.yml`
2. **Auth files:** `~/.skyth/auth/pass.json`, `~/.skyth/auth/api_keys.json`
3. **MCP config (if enabled):** `~/.skyth/config/mcp/mcp_config.json`

---

## Error Handling

### API Key Invalid
```
❌ Invalid API key for {provider}
   Would you like to:
   1. Re-enter API key
   2. Skip and configure later
   3. Choose different provider
```

### Network Error
```
⚠ Unable to connect to models.dev API
   Using cached provider list.
   You may need to validate configuration later.
```

### Model Unavailable
```
❌ Model {model_name} not available for {provider}
   Please select from available models:
   [list of models]
```

---

## Post-Onboarding

After onboarding completes:

```
✓ Onboarding complete!
  
  Configuration saved to: ~/.skyth/config/config.yml
  
  Next steps:
  1. Run: skyth chat
  2. Configure Quasar: skyth setup quasar
  3. Explore commands: skyth --help
```

---

## Testing Checklist

- [ ] Interactive mode completes successfully
- [ ] Non-interactive mode accepts all flags
- [ ] Skip behavior prompts correctly
- [ ] OAuth flow works for supported providers
- [ ] API keys validated before saving
- [ ] Models fetched from provider APIs
- [ ] Config file written correctly
- [ ] Error handling for network failures
- [ ] Error handling for invalid credentials
