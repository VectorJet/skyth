# Phase 1: Completion Checklist

**Status:** In Progress (88% Complete)  
**Based on:** Q1.4 / A1.4  
**Date:** 2026-01-31

---

## Core Requirements

### Onboarding System

- [x] **Onboarding CLI command** (`skyth run onboarding` OR `skyth init`)
  - [x] Interactive TUI mode
  - [x] Non-interactive flag mode
  - [x] Username prompt
  - [x] Agent nickname prompt
  - [x] Provider selection with arrow keys
  - [x] Search box for providers
  - [x] API key input with validation
  - [x] Model selection from provider API
  - [x] Secondary model configuration (optional)
  - [x] Router model configuration (optional)
  - [x] Watcher mode toggle
  - [x] MCP server setup (optional)
  - [x] MCP registry browser integration (`registry.modelcontextprotocol.io`)
  - [x] MCP additional registries integration (`toolsdk-ai.github.io/toolsdk-mcp-registry`, `remote-mcp-servers.com`)
  - [x] MCP searchable multi-select UX (type to search, space to toggle, enter to continue)
  - [x] MCP config writer (writes runnable `mcpServers` configs under `~/.skyth/config/mcp/`)
  - [x] Skip/resume logic
  - [ ] OAuth flow support (Anthropic, Google)

---

### Configuration Management

- [x] **Config.yml writer**
  - [x] Write to `~/.skyth/config/config.yml`
  - [x] Schema validation
  - [x] Required field enforcement
  - [x] Model format validation (`{provider}/{model}`)
  - [x] Default value handling
  - [x] Cross-platform path support (Linux/macOS/Windows)

- [x] **Config validation on startup**
  - [x] Load and parse config.yml
  - [x] Validate required fields exist
  - [x] Verify model format
  - [x] Check provider availability (models.dev API)
  - [x] Validate secondary model dependencies
  - [x] Validate router model dependencies
  - [x] Handle missing or corrupted config

---

### Authentication

- [x] **Password hashing (Argon2)**
  - [x] Generate password hash during onboarding
  - [x] Store hash in `~/.skyth/auth/pass.json`
  - [x] Generate unique salt per user
  - [x] Use Argon2id with secure parameters
  - [x] Never store plaintext passwords

- [ ] **Password verification**
  - [x] Verify password on onboarding when password already exists
  - [ ] Verify password on destructive commands
  - [x] Constant-time comparison
  - [ ] Failed attempt tracking
  - [ ] Lockout after 3 failed attempts
  - [ ] Reset password functionality

- [x] **API Key management**
  - [x] Generate API keys (`skyth auth create-key`)
  - [x] Store encrypted keys in `~/.skyth/auth/api_keys.json`
  - [x] List active keys (`skyth auth list-keys`)
  - [x] Revoke keys (`skyth auth revoke-key`)
  - [x] Track key usage (last_used, usage_count)
  - [x] Reuse previously stored provider credentials during onboarding (secondary/router providers)

---

### Session Management (defered)

- [ ] **User session tracking (UUIDs for Phase 1)**
  - [ ] Generate UUID on session start
  - [ ] Store session metadata
  - [ ] Track last activity timestamp
  - [ ] Session timeout (30 minutes inactivity)
  - [ ] Explicit session end (`/exit`, `Ctrl+D`)
  - [ ] Link session to Quasar event logs

- [ ] **Session persistence**
  - [ ] Save session on end
  - [ ] Archive to Quasar
  - [ ] Cleanup expired sessions

---

### Model Validation

- [x] **Provider validation during onboarding**
  - [x] Verify provider exists
  - [x] Fetch available models
  - [x] Display model list
  - [x] Validate API key format
  - [x] Ping provider `/models` endpoint when available (fallback to models.dev)

- [ ] **Model validation on startup (optional)**
  - [ ] Quick check: provider accessible
  - [ ] Full check: model exists in provider list
  - [ ] Cache validation results (24 hour TTL)
  - [ ] Warn if validation fails (don't block)

---

## Additional Phase 1 Features

### Messaging App Integration (Optional)

- [ ] **Connection to messaging apps**
  - [ ] Telegram bot integration
  - [ ] WhatsApp integration
  - [ ] Unified session tracking across platforms
  - [ ] Reference: `@refs/apps/nanobot`

- [ ] **Platform-agnostic session management**
  - [ ] Same UUID system for all platforms
  - [ ] Quasar memory shared across platforms
  - [ ] User authentication per platform

---

### Agent & Skill Marketplace

- [ ] **Add Agents/Skills from repositories**
  - [ ] CLI command: `skyth install {agent_name}`
  - [ ] Download from Skyth Agent Repository (SAR)
  - [ ] Download from Skyth Skill Repository (SSR)
  - [ ] Install to `~/.skyth/agents/` or `~/.skyth/skills/`
  - [ ] Verify agent manifest
  - [ ] Update registry

---

## Security & Encryption(defered)

- [ ] **AES-256 encryption for Quasar** (defer to Phase 3)
  - Note: Not required in Phase 1
  - Will implement during Quasar development

- [ ] **Encryption key management**
  - [ ] Generate device-specific encryption key
  - [ ] Store in `~/.skyth/identity/device_auth/`
  - [ ] Encrypt sensitive auth files

---

## Testing Requirements

### Unit Tests

- [x] Config schema validation tests
- [x] Password hashing tests
- [x] Password verification tests
- [x] API key generation tests
- [x] Session UUID generation tests
- [x] Model format validation tests

### Integration Tests

- [x] Onboarding flow (interactive mode)
- [x] Onboarding flow (non-interactive mode)
- [x] Config file creation and loading
- [x] Auth file creation and verification
- [ ] Session creation and persistence(deferred)
- [ ] Provider API validation(deferred)

### End-to-End Tests (Deferred)

- [ ] Complete onboarding → config → session → chat flow
- [ ] Skip onboarding → manual config → resume
- [ ] Failed auth → lockout → reset flow
- [ ] API key creation → usage → revocation flow

---

## Documentation

- [x] User-facing onboarding guide
- [x] Config.yml schema documentation
- [x] Authentication setup guide
- [x] API key usage documentation
- [x] Troubleshooting guide

---

## Phase 1 Completion Criteria

### Must Have (Required for Phase 1 ✓)

1. ✅ Onboarding CLI command works (interactive + non-interactive)
2. ✅ Config.yml written correctly with validation
3. ✅ Password hashing and verification (Argon2)
4. ✅ User session management (UUID-based)
5. ✅ Config validation on startup

### Should Have (Nice to Have)

6. ⚠ Messaging app integration (optional, can defer)
7. ⚠ Agent/skill marketplace (optional, can defer)
8. ⚠ Config encryption for sensitive fields (defer to Phase 3)

### Won't Have (Phase 2+)

- Multi-user support → Phase 3 (with Quasar)
- JWT authentication → Phase 2 (for remote API)
- OAuth token management → Phase 2 (for remote providers)

---

## Implementation Order

### Week 1: Core Infrastructure

1. Config.yml schema and writer
2. Config validation
3. Directory structure setup (`~/.skyth/config/`, `~/.skyth/auth/`)

### Week 2: Authentication

4. Password hashing implementation (Argon2)
5. Password verification
6. Auth file management (`pass.json`)
7. Superuser approval pattern

### Week 3: Onboarding

8. Interactive TUI onboarding wizard
9. Non-interactive CLI flags
10. Provider validation (models.dev API)
11. Model selection and validation
12. OAuth flow support

### Week 4: Session Management

13. UUID generation
14. Session metadata storage
15. Session timeout logic
16. Session persistence to Quasar

### Week 5: API Keys & Testing

17. API key generation
18. API key storage and encryption
19. API key revocation
20. Comprehensive testing (unit, integration, E2E)

---

## Dependencies

### External Libraries

**Python:**

- `argon2-cffi` - Password hashing
- `pyyaml` - Config file parsing
- `cryptography` - Encryption (API keys, sensitive data)
- `uuid` - Session ID generation

**TypeScript (CLI):**

- `@inquirer/prompts` - TUI onboarding wizard
- `yaml` - Config parsing
- `bun:test` - Testing framework

### External APIs

- **models.dev** - Provider and model validation
- **Provider APIs** - Model list fetching (OpenAI, Anthropic, etc.)

---

## Known Issues / Technical Debt

### To Address in Phase 1

- [ ] Handle network failures during onboarding gracefully
- [ ] Cache provider/model lists for offline usage
- [ ] Implement config migration for schema changes
- [ ] Add config backup/restore functionality

### To Defer to Later Phases

- Multi-user support (Phase 3)
- Remote authentication (Phase 2)
- Advanced encryption (Phase 3 with Quasar)

---

## Definition of Done

Phase 1 is complete when:

1. ✅ User can run `skyth init` and complete onboarding
2. ✅ Config file is created with valid schema
3. ✅ Authentication works (password + API keys)
4. ✅ Sessions are tracked with UUIDs
5. ✅ All core tests pass (unit + integration)
6. ✅ Documentation is complete and accurate
7. ✅ No critical bugs in onboarding or auth flow

**Current Progress:** 85% Complete  
**Estimated Completion:** End of Phase 1 milestone

---

## Phase 1 → Phase 2 Transition

Before moving to Phase 2, ensure:

- [ ] All Phase 1 checklist items complete
- [ ] Config system stable and tested
- [ ] Auth system working for local usage
- [ ] Documentation published
- [ ] User testing completed (internal)

Phase 2 will build on this foundation to add:

- Modular agent architecture
- CLI interface (TypeScript)
- Backend API (FastAPI)
- Agent-to-agent calling
