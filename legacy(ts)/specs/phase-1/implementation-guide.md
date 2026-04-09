# Phase 1 Onboarding - Implementation Guide

**Created:** 2026-02-07  
**Based on:** Analysis of OpenClaw, Nanobot, NanoClaw  
**Approach:** OpenClaw-style TUI wizard

---

## Strategy

**Hybrid of all three references:**
- **OpenClaw:** Interactive TUI wizard patterns, adapter architecture
- **Nanobot:** Pydantic config models, clean abstractions
- **NanoClaw:** Minimal dependencies, security-first design

---

## Week 1-2: Backend Foundation

### Config System (`core/backend/config/`)
- `schema.py` - Pydantic models for config.yml
- `loader.py` - Load/save/validate config
- `validator.py` - Provider/model validation
- `paths.py` - Cross-platform path utilities

### Auth System (`core/backend/auth/`)
- `password.py` - Argon2id hashing/verification
- `api_keys.py` - API key generation/storage/encryption
- `session.py` - UUID session tracking

### External APIs (`core/backend/services/`)
- `models_dev_client.py` - models.dev API integration
- `provider_client.py` - Generic provider API client
- `oauth_handler.py` - OAuth flows

### Directory Setup
- `ensure_skyth_directory()` - Creates ~/.skyth/ structure
- Auto-create: config/, auth/, sessions/, quasar/, agents/

---

## Week 3: CLI Wizard (`platforms/cli/`)

### Setup
- Initialize Bun TypeScript project
- Dependencies: `@inquirer/prompts`, `commander`, `yaml`, `chalk`

### Structure
```
platforms/cli/src/
├── commands/
│   ├── onboard.ts              # Entry point
│   └── onboard-non-interactive.ts
├── wizard/
│   ├── wizard.ts               # Main orchestrator
│   ├── prompts.ts              # Reusable prompts
│   ├── types.ts                # TypeScript interfaces
│   └── steps/
│       ├── welcome.ts          # Banner + security warning
│       ├── flow.ts             # QuickStart vs Advanced
│       ├── user-info.ts        # Username + nickname
│       ├── provider.ts         # Grouped provider selection
│       ├── auth.ts             # OAuth or API key
│       ├── model.ts            # Model selection
│       ├── secondary.ts        # Fallback model
│       ├── router.ts           # Router config
│       ├── password.ts         # Superuser password
│       └── finalize.ts         # Write config + health check
└── adapters/
    ├── anthropic.ts            # OAuth + API key
    ├── openai.ts               # API key
    ├── google.ts               # OAuth
    └── openrouter.ts           # API key
```

### Key Patterns

**Adapter Interface:**
```typescript
interface ProviderOnboardingAdapter {
  provider: string;
  getStatus(): Promise<ProviderStatus>;
  configure(prompter): Promise<ProviderConfig>;
  validateKey(apiKey: string): Promise<boolean>;
}
```

**Grouped Selection (OpenClaw pattern):**
```
? Select provider: (Use arrows or search)

──── Recommended ────
→ Anthropic (Claude)
  Google (Gemini)
  OpenAI (GPT)

──── API Key Providers ────
  OpenRouter (200+ models)
  Together AI
  Groq

──── Advanced ────
  Custom endpoint
  Local model
```

**QuickStart vs Advanced:**
- QuickStart: Minimal prompts, sane defaults
- Advanced: Full control over all options

---

## Week 4: Session Management

### Session System (`core/backend/sessions/`)
- `manager.py` - Session CRUD
- UUID generation on startup
- Metadata storage: `~/.skyth/sessions/{uuid}.json`
- 30min timeout tracking
- Cleanup expired sessions

### Startup Validation (`core/backend/config/startup_validator.py`)
- Check config.yml exists and valid
- Ping provider (quick check)
- Verify auth files exist
- Cache validation (24h TTL)

### Error Handling
- Network errors → cached provider list
- Invalid API key → re-prompt or skip
- Model unavailable → show alternatives
- Graceful Ctrl+C handling

---

## Week 5: API Keys & Testing

### API Key Commands
```bash
skyth auth create-key --name "..." --scopes "..."
skyth auth list-keys
skyth auth revoke-key {key_id}
```

### Testing
- **Unit:** Config validation, password hashing, API keys, session UUIDs
- **Integration:** Full flows (QuickStart, Advanced, non-interactive)
- **E2E:** Onboarding → config → session → chat

### Coverage Target: 70%+

---

## Key Takeaways from References

### OpenClaw
- ✅ Adapter pattern for extensibility
- ✅ Grouped auth provider selection
- ✅ QuickStart vs Advanced modes
- ✅ Post-config health checks
- ✅ WizardPrompter abstraction

### Nanobot
- ✅ Pydantic models with validation
- ✅ Channel/provider abstraction
- ✅ Priority-based credential resolution
- ✅ camelCase ↔ snake_case conversion

### NanoClaw
- ✅ External tamper-proof configs (~/.config/skyth/security.json)
- ✅ Minimal dependencies (keep under 15 runtime deps)
- ✅ Security-first design
- ✅ Container isolation patterns (defer to Phase 5)

---

## Directory Structure After Onboarding

```
~/.skyth/
├── config/
│   ├── config.yml
│   └── mcp/mcp_config.json
├── auth/
│   ├── pass.json (Argon2id hash)
│   ├── api_keys.json (AES-256 encrypted)
│   └── oauth_tokens.json
├── sessions/
│   └── {uuid}.json
├── identity/
│   └── device_auth/encryption_key
└── logs/skyth.log
```

---

## Non-Interactive Mode Example

```bash
skyth init \
  --username="tammy" \
  --nickname="Atlas" \
  --provider="anthropic" \
  --api-key="sk-ant-..." \
  --model="anthropic/claude-sonnet-4" \
  --password="..." \
  --accept-risk
```

---

## Dependencies

**Python (Backend):**
- argon2-cffi
- pyyaml
- cryptography
- uuid (stdlib)
- pydantic

**TypeScript (CLI):**
- @inquirer/prompts or @clack/prompts
- commander
- yaml
- chalk

**Keep total runtime dependencies under 15**

---

## Files to Reference

**OpenClaw:**
- `/src/commands/onboard.ts` - Entry point
- `/src/wizard/onboarding.ts` - Main orchestrator (452 lines)
- `/src/commands/auth-choice-prompt.ts` - Grouped selection
- `/extensions/*/src/onboarding.ts` - Adapter examples

**Nanobot:**
- `/nanobot/config/schema.py` - Pydantic models
- `/nanobot/config/loader.py` - Config management
- `/nanobot/channels/base.py` - Abstraction pattern

**NanoClaw:**
- `/.claude/skills/setup/SKILL.md` - AI-guided setup
- `/src/config.ts` - Minimal config approach
- `/src/security.ts` - External allowlist pattern

---

## Success Criteria

- [ ] `skyth init` completes successfully (interactive mode)
- [ ] Non-interactive mode works with all flags
- [ ] Config.yml written with valid schema
- [ ] Password hashed with Argon2id
- [ ] Sessions tracked with UUIDs
- [ ] All tests pass (70%+ coverage)
- [ ] Documentation complete

---

*Next: Update Progress.md, then start Week 1 implementation*
