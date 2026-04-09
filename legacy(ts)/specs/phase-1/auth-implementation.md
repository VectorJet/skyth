# Phase 1: Authentication Implementation (OpenClaw-Based)

**Created:** 2026-02-07  
**Approach:** Copy OpenClaw's auth system + Skyth's onboarding flow  
**Status:** Implementation in progress

---

## Overview

**Hybrid Approach:**
- **Model/API Auth:** Copy OpenClaw's battle-tested system (setup-tokens, OAuth, API keys, profiles)
- **Onboarding Flow:** Skyth's custom flow (username, password, config, models)

---

## Authentication Types Supported

### From OpenClaw (Copied)

**Subscription-Based (No API key needed):**
1. **Anthropic Setup-Token** - Claude Pro/Max subscribers
2. **OpenAI Codex OAuth** - ChatGPT Plus/Pro subscribers
3. **Google OAuth** - Gemini/Antigravity (Phase 2)
4. **GitHub Copilot OAuth** - Copilot subscribers (Phase 2)

**API Keys:**
1. **Anthropic** - API key
2. **OpenAI** - API key
3. **Google Gemini** - API key
4. **OpenRouter** - Access 200+ models
5. **Together AI, Groq, Fireworks, etc.** - Additional providers

**Features:**
- ✅ Multiple profiles per provider (work + personal accounts)
- ✅ Automatic profile rotation on failure
- ✅ Cooldown tracking (5s → 30s → 5m exponential backoff)
- ✅ OAuth token refresh
- ✅ Environment variable detection
- ✅ VPS-aware OAuth (works over SSH)

### Skyth-Specific (Custom)

**Superuser Authentication:**
- **Argon2id password hashing** (m=65536, t=3, p=4)
- **32-byte salt** (256-bit)
- **Stored in:** `~/.skyth/auth/pass.json`
- **Used for:** Destructive commands, config changes

**API Key Management:**
- **Generate:** `skyth auth create-key --name "..." --scopes "..."`
- **Revoke:** `skyth auth revoke-key {key_id}`
- **List:** `skyth auth list-keys`
- **Storage:** AES-256 encrypted in `~/.skyth/auth/api_keys.json`

---

## Directory Structure

```
~/.skyth/
├── config/
│   └── config.yml                  # Main config (Skyth custom)
├── auth/
│   ├── pass.json                   # Superuser password (Argon2id)
│   ├── auth_profiles.json          # Model auth profiles (OpenClaw style)
│   ├── api_keys.json               # Skyth API keys (AES-256)
│   └── oauth_tokens.json           # OAuth tokens (OpenClaw style)
├── identity/
│   └── device_auth/
│       └── encryption_key          # Master encryption key
└── sessions/
    └── {uuid}.json                 # Session metadata
```

---

## Backend Structure

```
core/backend/services/auth_services/
├── __init__.py
│
├── profile_types.py                # Auth profile types (from OpenClaw)
├── profile_store.py                # Encrypted storage
├── profile_manager.py              # CRUD operations
├── profile_usage.py                # Cooldowns + failure tracking
│
├── handlers/
│   ├── __init__.py
│   ├── anthropic.py                # Setup-token + API key
│   ├── openai.py                   # Codex OAuth + API key
│   ├── google.py                   # Gemini API key
│   ├── openrouter.py               # OpenRouter API key
│   └── api_providers.py            # Generic API key handler
│
├── oauth_flow.py                   # OAuth PKCE implementation
├── provider_options.py             # Provider registry (24+ providers)
│
├── password.py                     # Argon2id hashing (Skyth)
├── api_keys.py                     # API key management (Skyth)
└── session.py                      # UUID session tracking (Skyth)
```

---

## CLI Structure

```
platforms/cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Entry point
│   ├── commands/
│   │   ├── onboard.ts              # Main onboarding command
│   │   └── auth.ts                 # Auth management commands
│   │
│   ├── wizard/
│   │   ├── Wizard.tsx              # Main wizard component (Ink)
│   │   ├── steps/
│   │   │   ├── Welcome.tsx         # Banner + intro
│   │   │   ├── UserInfo.tsx        # Username + nickname
│   │   │   ├── Password.tsx        # Superuser password
│   │   │   ├── ProviderSelect.tsx  # Provider selection (OpenClaw style)
│   │   │   ├── AuthMethod.tsx      # Auth method (setup-token/OAuth/API key)
│   │   │   ├── ModelSelect.tsx     # Model selection
│   │   │   ├── SecondaryModel.tsx  # Optional fallback
│   │   │   ├── RouterModel.tsx     # Optional router
│   │   │   └── Finalize.tsx        # Write config + health check
│   │   └── components/
│   │       ├── Select.tsx          # Grouped select (OpenClaw pattern)
│   │       ├── TextInput.tsx       # Text input
│   │       ├── PasswordInput.tsx   # Masked password
│   │       └── Spinner.tsx         # Loading spinner
│   │
│   └── api/
│       └── client.ts               # Backend API client
│
└── tests/
```

---

## Profile Types (from OpenClaw)

### API Key Profile
```python
{
    "type": "api_key",
    "provider": "anthropic",
    "api_key": "sk-ant-...",
    "created_at": 1234567890,
    "last_used": 1234567890,
    "usage_count": 42
}
```

### OAuth Profile
```python
{
    "type": "oauth",
    "provider": "openai-codex",
    "access_token": "...",
    "refresh_token": "...",
    "expires_at": 1234567890,
    "account_id": "user@example.com",
    "created_at": 1234567890,
    "last_used": 1234567890
}
```

### Setup-Token Profile (Anthropic)
```python
{
    "type": "token",
    "provider": "anthropic",
    "token": "sk-ant-...",
    "created_at": 1234567890,
    "last_used": 1234567890
}
```

---

## Config Schema (Skyth Custom)

```yaml
# User Information (Skyth)
username: tammy
nickname: Atlas

# Primary Model (Skyth)
primary_model_provider: anthropic
primary_model: anthropic/claude-sonnet-4
primary_auth_profile: anthropic:default  # Links to auth_profiles.json

# Secondary Model (Optional)
use_secondary_model: true
secondary_model_provider: openai
secondary_model: openai/gpt-4o
secondary_auth_profile: openai-codex:personal

# Router (Optional)
use_router: false
router_model_provider: ""
router_model: ""
router_auth_profile: ""

# Features
watcher: false

# Auth Profile Order (OpenClaw style)
auth_profile_order:
  - anthropic:work
  - anthropic:personal
  - anthropic:default
  - openai-codex:work
  - openai:default
```

---

## Onboarding Flow

### Step 1: Welcome
- Display banner
- Show version
- Security warning for non-interactive mode

### Step 2: User Information
- Username (required, non-empty)
- Agent nickname (default: "Skyth")

### Step 3: Superuser Password
- Password input (masked)
- Confirmation
- Strength indicator
- Hash with Argon2id (m=65536, t=3, p=4)
- Generate 32-byte salt
- Store in `~/.skyth/auth/pass.json`

### Step 4: Provider Selection (OpenClaw Style)
```
? Select primary model provider: (Use arrows or search)

──── Recommended ────
→ Anthropic (Claude - setup-token or API key)
  OpenAI (ChatGPT - OAuth or API key)
  Google (Gemini - API key)

──── Multi-Model ────
  OpenRouter (200+ models via API key)

──── API Key Providers ────
  Together AI
  Groq
  Fireworks
  ...

[Type to search...]
```

### Step 5: Auth Method Selection
**Example: Anthropic selected**
```
? How would you like to authenticate with Anthropic?

→ Setup-token (Claude Pro/Max subscription)
  API key (Pay-as-you-go)
```

### Step 6: Credential Input

**If Setup-Token:**
```
Run in another terminal:
  $ claude setup-token

Paste your setup-token here:
sk-ant-█
```

**If API Key:**
```
Check for existing: ANTHROPIC_API_KEY
→ Found! Use existing key? [Y/n]:

Or enter new API key:
sk-ant-█
```

**If OAuth (OpenAI Codex):**
```
Opening browser for authentication...
→ If remote (SSH): Open this URL in your LOCAL browser:
  https://auth.openai.com/authorize?...

Waiting for callback...
✓ Authenticated as: user@example.com
```

### Step 7: Profile Name (OpenClaw)
```
Name this profile (blank for "default"): work█

Creating profile: anthropic:work
```

### Step 8: Model Selection
```
? Select model:
→ claude-sonnet-4 (Latest, recommended)
  claude-opus-4.5 (Most capable)
  claude-3-5-sonnet-20241022 (Legacy)
```

### Step 9: Secondary Model (Optional)
```
? Use fallback model? (y/N): y

[Repeat provider + auth + model selection]
```

### Step 10: Router Model (Optional)
```
? Enable router for agent selection? (y/N): n

[If yes, select lightweight model like gpt-5-mini]
```

### Step 11: Finalization
- Write config.yml
- Write auth_profiles.json (encrypted)
- Write pass.json (Argon2id hashed)
- Create directory structure
- Health check (ping backend)
- Display next steps

---

## Key Differences: OpenClaw vs Skyth

| Feature | OpenClaw | Skyth |
|---------|----------|-------|
| **Model Auth** | ✅ (copied) | ✅ (copied from OpenClaw) |
| **Multiple Profiles** | ✅ | ✅ (copied) |
| **Setup-Token** | ✅ | ✅ (copied) |
| **OAuth** | ✅ | ✅ (copied) |
| **Superuser Password** | ❌ | ✅ (Argon2id, 32-byte salt) |
| **Username/Nickname** | ❌ | ✅ |
| **Secondary Model** | ❌ | ✅ |
| **Router Model** | ❌ | ✅ |
| **Config Schema** | JSON | YAML |
| **Backend** | TypeScript/Bun | Python/FastAPI |
| **CLI Framework** | @clack/prompts | Ink (React-based TUI) |

---

## Implementation Priority

### Week 1: Core Auth (Backend)
1. ✅ Auth profile types (profile_types.py)
2. ✅ Profile storage with AES-256 (profile_store.py)
3. ✅ Anthropic setup-token handler
4. ✅ Generic API key handler
5. ✅ Superuser password system (Argon2id)
6. ✅ Config schema (Pydantic)

### Week 2: OAuth + CLI Init
1. ✅ OpenAI Codex OAuth handler
2. ✅ OAuth PKCE implementation
3. ✅ Provider options registry
4. ✅ Initialize Bun CLI project
5. ✅ Set up Ink framework
6. ✅ Create wizard structure

### Week 3: CLI Wizard + Integration
1. ✅ Implement all wizard steps
2. ✅ Auth selection UI (OpenClaw style)
3. ✅ Backend API integration
4. ✅ Session management
5. ✅ Testing (unit + integration)
6. ✅ Documentation

---

## Dependencies

### Backend (Python)
```toml
[project]
dependencies = [
    "fastapi>=0.109.0",
    "pydantic>=2.5.0",
    "pyyaml>=6.0",
    "argon2-cffi>=23.1.0",
    "cryptography>=41.0.0",
    "httpx>=0.26.0",
    "python-jose>=3.3.0",  # JWT for OAuth
]
```

### CLI (TypeScript/Bun)
```json
{
  "dependencies": {
    "ink": "^4.4.1",
    "react": "^18.2.0",
    "ink-text-input": "^5.0.1",
    "ink-select-input": "^6.0.0",
    "ink-spinner": "^5.0.0",
    "commander": "^11.1.0",
    "chalk": "^5.3.0",
    "yaml": "^2.3.4",
    "axios": "^1.6.5"
  },
  "devDependencies": {
    "@types/react": "^18.2.48",
    "@types/node": "^20.11.5",
    "typescript": "^5.3.3"
  }
}
```

---

## Testing Strategy

### Backend Tests
- Unit: Password hashing, profile CRUD, encryption
- Integration: Auth handlers, OAuth flows
- E2E: Full onboarding flow via API

### CLI Tests
- Component: Ink component rendering
- Integration: Wizard flow
- E2E: Full onboarding with backend

### Coverage Target: 80%+

---

*Implementation starts 2026-02-07*
