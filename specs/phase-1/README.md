# Phase 1: Onboarding & Authentication

**Status:** 60% Complete  
**Priority:** High (Foundation for all subsequent phases)  
**Timeline:** Weeks 1-5

---

## Overview

Phase 1 establishes the foundational user experience and security layer for Skyth. It focuses on onboarding new users, configuring the system, and implementing authentication mechanisms.

---

## Goals

1. ✅ Provide seamless onboarding experience (interactive + non-interactive)
2. ✅ Establish secure authentication system (local + API)
3. ✅ Create robust configuration management
4. ✅ Implement session tracking foundation
5. ⚠ Optional: Multi-platform messaging integration

---

## Specifications

### Core Specifications

1. **[Onboarding Flow](onboarding.md)**
   - Interactive TUI wizard
   - Non-interactive CLI flags
   - Provider/model selection with validation
   - OAuth support
   - Skip/resume logic

2. **[Configuration Schema](config-schema.md)**
   - Complete `config.yml` structure
   - Field validation rules
   - Model format specification
   - Security considerations

3. **[Authentication System](authentication.md)**
   - Argon2id password hashing
   - API key management
   - Session tracking (UUID-based)
   - Superuser approval pattern

4. **[Completion Checklist](Skyth/Skyth/spec/phase-1/completion-checklist.md)**
   - Detailed implementation tasks
   - Testing requirements
   - Documentation needs
   - Phase completion criteria

---

### Optional Specifications

5. **[Messaging Apps Integration](messaging-apps.md)** *(Optional)*
   - Telegram bot integration
   - WhatsApp integration
   - Cross-platform session management
   - Reference: `@refs/apps/nanobot`

---

## Key Deliverables

### Week 1-2: Configuration & Auth Infrastructure

- [ ] `~/.skyth/` directory structure
- [ ] Config.yml schema and validation
- [ ] Password hashing (Argon2id)
- [ ] Auth file management

### Week 3: Onboarding Wizard

- [ ] Interactive TUI
- [ ] Provider selection with models.dev API
- [ ] Model validation
- [ ] OAuth flows

### Week 4: Session Management

- [ ] UUID generation
- [ ] Session metadata storage
- [ ] Timeout logic
- [ ] Quasar integration hooks

### Week 5: API Keys & Testing

- [ ] API key generation/revocation
- [ ] Comprehensive testing
- [ ] Documentation
- [ ] Bug fixes and polish

---

## Technologies

### Backend (Python)
- `argon2-cffi` - Password hashing
- `pyyaml` - Config parsing
- `cryptography` - Encryption
- `uuid` - Session IDs

### CLI (TypeScript)
- Bun runtime
- `@inquirer/prompts` - TUI
- `yaml` - Config parsing

### External APIs
- models.dev - Provider/model validation
- Provider APIs - Model listings

---

## Dependencies

### Before Phase 1
- None (this is the foundation)

### After Phase 1
- Phase 2: Modular Agent Architecture
- Phase 3: Quasar memory system

---

## Success Criteria

Phase 1 is complete when:

1. ✅ User can run `skyth init` and complete onboarding
2. ✅ Config file created with valid schema
3. ✅ Authentication works (password + API keys)
4. ✅ Sessions tracked with UUIDs
5. ✅ All tests pass (unit + integration + E2E)
6. ✅ Documentation complete

**Current Status:** 60% Complete  
**Blocking Issues:** None  
**Next Steps:** Continue implementation per completion checklist

---

## Architecture Decisions

### AD1: Argon2id for Password Hashing
**Decision:** Use Argon2id instead of bcrypt  
**Rationale:** Modern, memory-hard, resistant to GPU attacks  
**Status:** Approved

### AD2: UUID-based Sessions (Phase 1)
**Decision:** Simple UUID tracking, defer JWT to Phase 2  
**Rationale:** Simpler implementation for local-only usage  
**Status:** Approved

### AD3: Separate Auth Files
**Decision:** Store passwords/keys separate from config.yml  
**Rationale:** Security isolation, easier encryption  
**Status:** Approved

---

## Known Issues

### To Address in Phase 1
- Network failure handling during onboarding
- Offline mode (cached provider lists)
- Config migration for schema changes

### Deferred to Later Phases
- Multi-user support → Phase 3
- Remote authentication → Phase 2
- Advanced encryption → Phase 3

---

## References

### Internal
- Architecture: `@spec/arch.md`
- Overall plan: `@spec/plan.md`
- Q&A: `@spec/agents/questions/2026-01-29.md`
- Answers: `@spec/agents/answers/2026-01-29.md`

### External
- Moltbot (OpenClaw): `@refs/apps/openclaw`
- Nanobot: `@refs/apps/nanobot`
- Phase 1 onboarding: `@refs/phase/phase-1/onboarding/`

---

## Questions & Answers

See [Questions 2026-01-29](Skyth/Skyth/spec/agents/questions/2026-01-29.md) sections:
- Q1.1: Onboarding Flow Implementation
- Q1.2: Config.yml Schema
- Q1.3: Authentication System
- Q1.4: Phase 1 Completion Checklist

All answered in [Answers 2026-01-29](Skyth/Skyth/spec/agents/answers/2026-01-29.md)

---

## Contact

**Phase Lead:** TBD  
**Status Updates:** Track in completion-checklist.md  
**Issues:** File in project issue tracker

---

*Last Updated: 2026-01-31*  
*Next Review: End of Week 2*
