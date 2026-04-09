# Version Information

**Last Updated:** 2026-01-31  
**Current Phase:** Phase 1 (60% complete)  
**Project Status:** Active Development

---

## Current Version

**Version:** 0.0.1-alpha  
**Release Date:** TBD (Phase 1 completion)  
**Status:** Pre-release (Alpha)

---

## Version Naming Scheme

### Semantic Versioning

Skyth follows **Semantic Versioning 2.0.0** ([semver.org](https://semver.org)):

**Format:** `MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]`

**Components:**
- **MAJOR:** Incompatible API changes
- **MINOR:** Backward-compatible functionality additions
- **PATCH:** Backward-compatible bug fixes
- **PRERELEASE:** Optional pre-release identifier (alpha, beta, rc)
- **BUILD:** Optional build metadata

**Examples:**
- `0.1.0` - Phase 1 completion
- `0.2.0` - Phase 2 completion
- `1.0.0` - Production-ready
- `1.2.3` - Stable release with patches
- `2.0.0-beta.1` - Major version beta

---

### Phase-to-Version Mapping

| Phase | Version | Status | Description |
|-------|---------|--------|-------------|
| Phase 1 | 0.1.0 | In Progress (60%) | Onboarding & Authentication |
| Phase 2 | 0.2.0 | Planned | Agent Architecture + CLI |
| Phase 3 | 0.3.0 | Planned | LGP + Quasar Memory |
| Phase 4 | 0.4.0 | Planned | Multi-Platform Frontends |
| Phase 5 | 0.5.0 | Planned | Watcher + Security + Desktop |
| Phase 6 | 0.6.0+ | Planning | Visual Builder + Mobile |
| v1.0.0 | 1.0.0 | Future | Production-Ready (estimated Phase 6-7) |

**Pre-1.0 Note:** Versions before 1.0.0 may have breaking changes between minor versions.

---

## Latest Features

### Version 0.0.1-alpha (In Development)

**Phase 1 Features (60% Complete):**

#### Completed
- ✅ User authentication system
  - Argon2id password hashing
  - Secure password storage (`~/.skyth/auth/pass.json`)
  - Session management (UUID-based)
- ✅ Configuration schema
  - `~/.skyth/config/config.yml` structure
  - Model format validation (`{provider}/{model}`)
  - Schema validation on startup
- ✅ Backend infrastructure
  - FastAPI server with async support
  - Auto-route discovery
  - CORS configuration
  - Health check endpoint
- ✅ Database foundation
  - SQLite with async support
  - Repository pattern implementation
  - User, session, and API key tables

#### In Progress
- 🔄 Onboarding wizard (TUI)
  - Interactive provider/model selection
  - Non-interactive CLI flags
  - OAuth support (Anthropic, Google)
  - API key validation (models.dev API)
- 🔄 API key management
  - `skyth auth create-key` command
  - `skyth auth revoke-key` command
  - `skyth auth list-keys` command
- 🔄 Config validation
  - Model availability checks
  - Provider validation
  - Dependency validation

#### Pending
- ⏸ LiteLLM proxy integration
- ⏸ Messaging app integration (optional)
  - Telegram bot
  - WhatsApp integration

---

## Version History

### 0.0.1-alpha (Current - In Development)

**Started:** 2026-01-24  
**Expected Completion:** TBD

**Focus:** Foundation and onboarding (Phase 1)

**Added:**
- Authentication system with Argon2id
- Configuration schema and validation
- FastAPI backend infrastructure
- SQLite database with async support
- Session management (UUID-based)

**In Progress:**
- Onboarding wizard (TUI)
- API key management
- Config validation
- LiteLLM integration

---

## Upcoming Releases

### 0.1.0 (Phase 1 Complete)

**Expected:** End of Week 5  
**Status:** In Development

**Goals:**
- Complete onboarding wizard
- API key management functional
- Config validation on startup
- All Phase 1 tests passing
- Documentation complete

**Success Criteria:**
1. User can run `skyth init` and complete onboarding
2. Config file created with valid schema
3. Authentication works (password + API keys)
4. Sessions tracked with UUIDs
5. All tests pass (unit + integration + E2E)

**Breaking Changes:** N/A (initial release)

---

### 0.2.0 (Phase 2 Complete)

**Expected:** Week 12  
**Status:** Planned

**Major Features:**
- Modular agent architecture
  - Generalist agent
  - Specialized agents (code, research, data)
  - Subagent system
- Global delegation tools
  - `delegate(agent, task, context)`
  - `task(subagent, todo)`
  - `are_we_there_yet(task_id)`
- TypeScript CLI (Bun runtime)
  - Interactive TUI mode
  - WebSocket communication
  - Agent switching UI
- MCP-to-TOON converter
  - ~40% token reduction
- FastAPI backend
  - REST API endpoints
  - Agent registry system
  - Tool registration system

**Breaking Changes:** TBD (pre-1.0, may have breaking changes)

---

### 0.3.0 (Phase 3 Complete)

**Expected:** Week 20  
**Status:** Planned

**Major Features:**
- Quasar 5-layer memory system
  - Layer 0: Canonical (encrypted JSONL)
  - Layer 0.5: ChromaDB (vector search)
  - Layer 1: JSONL (append-only)
  - Layer 2: SQLite (relational)
  - Layer 3: PostgreSQL + pgvector (optional)
- Event system & branching
  - Solars (user edits)
  - Nebulas (regenerations)
  - Filesystem restoration
- Logic Gate Protocol (LGP)
  - Tool chaining (AND, OR, XOR, PIPE, TO)
  - Nushell integration
- Quasar tools
  - quasar_search, quasar_add, quasar_subtract
  - quasar_entitize, quasar_compress, quasar_think
- 60+ CLI commands for memory management
- Background processing
  - Session-end processing
  - Daily summaries
  - Embedding creation

**Breaking Changes:** TBD

---

### 0.4.0 (Phase 4 Complete)

**Expected:** Week 25  
**Status:** Planned

**Major Features:**
- Repository restructure (core/ + platforms/)
- Multi-protocol backend API
  - REST (standard operations)
  - SSE (one-way streaming)
  - WebSocket (bidirectional)
- Multiple authentication methods
  - JWT tokens
  - Session cookies
  - API keys
- Next.js web interface
  - Basic chat interface
  - Agent selection
  - Session management
  - Memory viewer
  - Settings UI
- Monorepo management
  - Just (primary dev interface)
  - Turborepo (TypeScript orchestration)
- Shared TypeScript types (platforms/shared/)

**Breaking Changes:** Repository restructure (migration guide will be provided)

---

### 0.5.0 (Phase 5 Complete)

**Expected:** Week 35  
**Status:** Planned

**Major Features:**
- Watcher mode
  - File system monitoring
  - Cron-based scheduling
  - Webhook triggers
- Security model
  - Tiered trust levels (Paranoid, Standard, Trust)
  - Command approval flow
  - Dangerous command detection
- Epsilon version control
  - Filesystem state snapshots
  - Time-travel through conversation history
- Tauri desktop application
  - Native OS integration
  - Embedded backend option
  - System tray icon
- Background processing
  - Detached mode (default)
  - Optional daemon mode

**Breaking Changes:** TBD

---

### 0.6.0+ (Phase 6+ Features)

**Expected:** Week 36+  
**Status:** Planning

**Potential Major Features:**
- Visual agent builder (n8n-like)
- Mobile application (Flutter)
- Agent marketplace (SUR)
- Advanced memory features
- Collaborative features
- Platform expansion

**Release Timing:** Based on user feedback and demand

---

### 1.0.0 (Production-Ready)

**Expected:** TBD (after Phase 6-7?)  
**Status:** Future

**Goals:**
- Stable API (no breaking changes)
- Comprehensive documentation
- Production-ready security
- Performance optimizations
- Enterprise-grade reliability

**Breaking Changes:** This will be the first stable release. All future MAJOR versions (2.0.0, 3.0.0) may have breaking changes.

---

## Changelog Format

All future releases will follow this format:

```markdown
## [Version Number] - YYYY-MM-DD

### Added
- New features and capabilities

### Changed
- Changes to existing functionality
- Improvements and enhancements

### Deprecated
- Features marked for removal in future versions
- Migration paths provided

### Removed
- Features removed from previous versions
- Breaking changes

### Fixed
- Bug fixes and issue resolutions
- Performance improvements

### Security
- Security-related changes and patches
- Vulnerability fixes
```

---

## Development Milestones

### Phase 1: Foundation (Weeks 1-5)
- [x] Authentication system (Week 1-2)
- [x] Configuration schema (Week 1-2)
- [ ] Onboarding wizard (Week 3)
- [ ] Session management (Week 4)
- [ ] API keys & testing (Week 5)

### Phase 2: Agent Architecture (Weeks 6-12)
- [ ] Backend foundation (Week 6-7)
- [ ] Agent architecture (Week 8-9)
- [ ] CLI interface (Week 10-11)
- [ ] MCP & integration (Week 12)

### Phase 3: LGP + Quasar (Weeks 13-20)
- [ ] Quasar foundation (Week 13-14)
- [ ] Event system (Week 15-16)
- [ ] Quasar tools (Week 17)
- [ ] CLI commands (Week 18)
- [ ] LGP implementation (Week 19)
- [ ] Background processing (Week 20)

### Phase 4: Multi-Platform (Weeks 21-25)
- [ ] Repository restructure (Week 21-22)
- [ ] Backend API (Week 23-24)
- [ ] Web UI (Week 25)

### Phase 5: Watcher + Security (Weeks 26-35)
- [ ] Desktop app (Week 26-30)
- [ ] Watcher mode (Week 31)
- [ ] Background processing (Week 32)
- [ ] Security model (Week 33)
- [ ] Epsilon system (Week 34)
- [ ] Integration & testing (Week 35)

---

## Release Channels

### Stable
**Version Pattern:** `X.Y.Z`  
**Audience:** Production users  
**Frequency:** After each phase completion  
**Support:** Full support, bug fixes, security patches

### Beta
**Version Pattern:** `X.Y.Z-beta.N`  
**Audience:** Early adopters, testers  
**Frequency:** Before stable releases  
**Support:** Limited support, may have bugs

### Alpha
**Version Pattern:** `X.Y.Z-alpha.N`  
**Audience:** Developers, internal testing  
**Frequency:** During active development  
**Support:** No support guarantees, experimental

### Development
**Version Pattern:** `X.Y.Z-dev.TIMESTAMP`  
**Audience:** Contributors, developers  
**Frequency:** Continuous (main branch)  
**Support:** No support, use at own risk

---

## Version Support Policy

### Current Version
- Full support
- Bug fixes
- Security patches
- New features

### Previous Minor Version (0.N-1.0)
- Bug fixes (critical only)
- Security patches
- No new features

### Older Versions
- Security patches only (if critical)
- No bug fixes
- No new features

### Pre-1.0 Versions
- Limited support
- Breaking changes possible between minor versions
- Migration guides provided

---

## Deprecation Policy

**Notice Period:** 1 minor version (or 3 months, whichever is longer)

**Process:**
1. Feature marked as deprecated in docs
2. Warning added to code (if applicable)
3. Migration path documented
4. Removal in next minor version (pre-1.0) or next major version (post-1.0)

**Example:**
```
0.3.0 - Feature X deprecated (warning added)
0.4.0 - Feature X removed (pre-1.0)

OR

1.2.0 - Feature Y deprecated (warning added)
2.0.0 - Feature Y removed (post-1.0)
```

---

## Release Notes Archive

Release notes for all versions will be maintained here as they are released.

**Current:** No releases yet (development in progress)

---

## References

**Roadmap:** `spec/plan.md` - Detailed phase planning  
**Architecture:** `spec/arch.md` - System architecture  
**Phase Index:** `spec/PHASE_INDEX.md` - Phase navigation

**Changelog Location:** This file (version_information.md)

---

*Last Updated: 2026-01-31*  
*Next Update: Phase 1 completion (0.1.0 release)*
