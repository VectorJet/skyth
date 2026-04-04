# Phase 1: Configuration Schema

**Status:** Specification Complete  
**Based on:** Q1.2 / A1.2  
**Date:** 2026-01-31

---

## Overview

The `config.yml` file is the central configuration for Skyth, stored at `~/.skyth/config/config.yml` (or OS-equivalent paths).

---

## Complete Schema

```yaml
# User Information
username: string                    # User's name
nickname: string                    # Agent's nickname (e.g., "Skyth", "Assistant")

# Primary Model Configuration
primary_model_provider: string      # Must be valid provider (openai, anthropic, google, etc.)
primary_model: string               # Format: {providerID}/{modelID} (e.g., "openai/gpt-4o")

# Secondary/Fallback Model (Optional)
use_secondary_model: bool           # Enable fallback model
secondary_model_provider: string    # Secondary provider (optional)
secondary_model: string             # Secondary model (optional)

# Router Configuration (Optional)
use_router: bool                    # Enable router-based agent selection
router_model_provider: string       # Router provider (optional)
router_model: string                # Recommended: lightweight model (gpt-4o-mini, gemini-flash)

# Watcher Mode
watcher: bool                       # Enable background monitoring/processing

# MCP Configuration
mcp_config_path: string             # Path to MCP config
                                    # Default: ~/.skyth/config/mcp/
                                    # Agent-specific: ~/.skyth/agents/{agent_name}/config/mcp/
```

---

## Field Specifications

### User Information

**`username`**
- Type: `string`
- Required: Yes
- Description: Human user's name
- Example: `"tammy"`

**`nickname`**
- Type: `string`
- Required: Yes
- Description: Agent's display name
- Example: `"Skyth"`, `"Atlas"`, `"Assistant"`

---

### Model Configuration

**`primary_model_provider`**
- Type: `string`
- Required: Yes
- Validation: Must be valid provider from models.dev
- Examples: `"openai"`, `"anthropic"`, `"google"`, `"together"`, `"groq"`
- Error: Throws "Invalid provider" if not recognized

**`primary_model`**
- Type: `string`
- Required: Yes
- Format: `{providerID}/{modelID}`
- Validation: Must exist in provider's model list
- Examples:
  - `"openai/gpt-4o"`
  - `"anthropic/claude-sonnet-4"`
  - `"google/gemini-2.0-flash-exp"`
- Error: Throws "Invalid model" if not available

**`use_secondary_model`**
- Type: `bool`
- Required: No
- Default: `false`
- Description: Enable fallback model for rate limits or errors

**`secondary_model_provider`** & **`secondary_model`**
- Same validation as primary model
- Only required if `use_secondary_model: true`

---

### Router Configuration

**`use_router`**
- Type: `bool`
- Required: No
- Default: `false`
- Description: Enable router model for agent selection (see A2.1)
- Note: Default is generalist agent; router is optional

**`router_model_provider`** & **`router_model`**
- Only required if `use_router: true`
- Recommended models:
  - `"openai/gpt-4o-mini"` (cheap, fast)
  - `"google/gemini-2.0-flash-exp"` (free, fast)
- Purpose: Lightweight model for routing decisions

---

### Watcher Mode

**`watcher`**
- Type: `bool`
- Required: No
- Default: `false`
- Description: Enable always-listening background agents
- Details: See Phase 5 watcher-mode.md

---

### MCP Configuration

**`mcp_config_path`**
- Type: `string`
- Required: No
- Default: `~/.skyth/config/mcp/`
- Description: Path to MCP server configuration
- Agent-specific paths: `~/.skyth/agents/{agent_name}/config/mcp/`
- Format: JSON file with MCP server list

---

## Additional Answered Questions

### Q1.2.1: Password Storage

**Question:** Hash superuser_password before writing to config, or hash on-the-fly?

**Answer:** Passwords are NOT stored in `config.yml`. Instead:
- Location: `~/.skyth/auth/pass.json`
- Format: Hashed string (Argon2)
- Salt: Generated per-user
- Verification: Hash on-the-fly during authentication

**File Structure:**
```json
{
  "password_hash": "argon2id$v=19$m=65536,t=3,p=4$...",
  "salt": "...",
  "created_at": "2026-01-31T14:00:00Z"
}
```

---

### Q1.2.2: Model Format

**Question:** Use Skyth's format `{providerID}/{modelID}` or custom?

**Answer:** Yes, use `{providerID}/{modelID}` format.

**Examples:**
- `openai/gpt-4o`
- `anthropic/claude-sonnet-4`
- `google/gemini-2.0-flash-exp`

---

### Q1.2.3: Additional Fields Needed

**Tools:**
- NOT in config.yml
- Tools enabled/disabled per-agent in:
  - `~/.skyth/agents/{agent_name}/agent_manifest.json`
  - OR in `~/.skyth/agents/{agent_name}/config/tools/`

**Memory Path:**
- NOT in config.yml
- Fixed paths:
  - Daily summaries: `~/.skyth/quasar/md/daily/`
  - Session summaries: `~/.skyth/quasar/md/session/`

**Quasar Layers:**
- NOT in config.yml
- Location: `~/.skyth/quasar/layers.txt`
- Format: Numbers 0-4 (or more for custom extensions)
- Setup: via `skyth setup quasar` command

**LGP Enabled:**
- NOT in config.yml
- Always enabled by default
- Must be manually disabled in code (not user-facing option)

**MCP Servers:**
- NOT in config.yml (separate file)
- Location: `{mcp_config_path}/mcp_config.json`
- Agent-specific: `~/.skyth/agents/{agent_name}/config/mcp/mcp_config.json`

---

### Q1.2.4: Config Validation

**Question:** Should we validate models exist on startup?

**Answer:** Yes, ping models.dev API during onboarding and optionally on startup.

**Validation Strategy:**
1. **During Onboarding:**
   - Validate provider exists
   - Fetch available models from provider
   - Verify API key works

2. **On Startup (Optional):**
   - Quick validation: Check if provider is accessible
   - Full validation: Fetch model list and verify model exists
   - Cache validation results (TTL: 24 hours)

3. **Error Handling:**
   - If validation fails on startup, warn user but don't block
   - Retry with cached config or prompt user to update

---

## Example Complete Configuration

```yaml
# User Configuration
username: "tammy"
nickname: "Atlas"

# Primary Model
primary_model_provider: "anthropic"
primary_model: "anthropic/claude-sonnet-4"

# Secondary Model (Fallback)
use_secondary_model: true
secondary_model_provider: "openai"
secondary_model: "openai/gpt-4o"

# Router (Disabled)
use_router: false
router_model_provider: ""
router_model: ""

# Features
watcher: false

# Paths
mcp_config_path: "~/.skyth/config/mcp/"
```

---

## Minimal Configuration

```yaml
username: "tammy"
nickname: "Skyth"
primary_model_provider: "openai"
primary_model: "openai/gpt-4o"
use_secondary_model: false
use_router: false
watcher: false
mcp_config_path: "~/.skyth/config/mcp/"
```

---

## Config File Locations

### Primary Config
- Linux/macOS: `~/.skyth/config/config.yml`
- Windows: `%USERPROFILE%\.skyth\config\config.yml`

### Related Files
- Password: `~/.skyth/auth/pass.json`
- API Keys: `~/.skyth/auth/api_keys.json`
- OAuth Tokens: `~/.skyth/auth/oauth_tokens.json`
- MCP Config: `~/.skyth/config/mcp/mcp_config.json`
- Quasar Layers: `~/.skyth/quasar/layers.txt`

---

## Validation Rules

### On Config Load

```python
def validate_config(config: dict) -> ValidationResult:
    """Validate configuration on load"""
    
    # Required fields
    assert config["username"], "Username required"
    assert config["primary_model_provider"], "Primary provider required"
    assert config["primary_model"], "Primary model required"
    
    # Model format
    assert "/" in config["primary_model"], "Model must be {provider}/{model}"
    
    # Secondary model dependencies
    if config.get("use_secondary_model"):
        assert config.get("secondary_model_provider"), "Secondary provider required"
        assert config.get("secondary_model"), "Secondary model required"
    
    # Router dependencies
    if config.get("use_router"):
        assert config.get("router_model_provider"), "Router provider required"
        assert config.get("router_model"), "Router model required"
    
    return ValidationResult(valid=True)
```

---

## Security Considerations

### Sensitive Data NOT in config.yml

The following are stored separately for security:

1. **Passwords:** `~/.skyth/auth/pass.json` (hashed with Argon2)
2. **API Keys:** `~/.skyth/auth/api_keys.json` (encrypted with AES-256)
3. **OAuth Tokens:** `~/.skyth/auth/oauth_tokens.json` (encrypted)

### Encryption

- Quasar DB: AES-256 encryption (Layer 0)
- Encryption keys: Stored in `~/.skyth/identity/device_auth/`
- No plaintext secrets in version-controlled files

---

## Configuration Updates

### Runtime Updates

```bash
# Update specific field
skyth config set primary_model "anthropic/claude-sonnet-4"

# Enable feature
skyth config set watcher true

# View current config
skyth config show
```

### Manual Editing

Users can manually edit `~/.skyth/config/config.yml`, but must restart Skyth for changes to take effect.

---

## Testing Checklist

- [ ] Config file validates correctly on load
- [ ] Invalid provider throws error
- [ ] Invalid model throws error
- [ ] Secondary model dependencies enforced
- [ ] Router model dependencies enforced
- [ ] Model format validation works
- [ ] Config updates persist correctly
- [ ] Sensitive data not in config.yml
