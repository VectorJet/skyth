# Phase 4-5: Multi-Platform Frontends

**Status:** Specification Complete  
**Priority:** Medium  
**Timeline:** Weeks 21-30 (after Phase 3)

---

## Overview

Phase 4-5 expand Skyth beyond CLI to web, desktop, and mobile platforms. This phase establishes the unified platform architecture and visual agent builder.

---

## Goals

1. ✅ Restructure repository into `core/` and `platforms/`
2. ✅ Implement multi-protocol backend API (REST + SSE + WebSocket)
3. ✅ Build Next.js web interface
4. ✅ Create Tauri desktop application
5. ✅ Setup monorepo management (Just + Turborepo)
6. ✅ Defer visual agent builder to Phase 6+

---

## Specifications

### Core Specifications

1. **[Platform Directory Structure](./platform-structure.md)**
   - `core/backend/` - Python FastAPI
   - `platforms/` - All client platforms
   - `platforms/shared/` - Shared TypeScript types
   - Monorepo management strategy

2. **[Backend API Design](./backend-api.md)**
   - REST API for standard operations
   - SSE for one-way streaming
   - WebSocket for bidirectional communication
   - Multiple authentication methods
   - State management strategy

3. **[Web UI](./web-ui.md)** *(Phase 4)*
   - Next.js (App Router)
   - Basic agent interaction
   - Session management
   - Memory/history viewing
   - Settings UI
   - Defer visual builder to Phase 6+

4. **[Desktop App](./desktop-app.md)** *(Phase 5)*
   - Tauri framework
   - Native OS integration
   - Embedded backend option
   - WebSocket communication

5. **[Mobile App](./mobile-app.md)** *(Deferred to Phase 6+)*
   - Flutter framework
   - iOS + Android support
   - Remote backend connection

---

## Repository Structure

```
Skyth/                          # Main monorepo
├── justfile                    # Primary developer interface
├── turbo.json                  # Task orchestration (TS platforms)
├── package.json                # Root workspace
│
├── core/                       # Core implementation
│   └── backend/                # FastAPI backend (Python + uv)
│       ├── pyproject.toml
│       ├── tools/
│       ├── agents/
│       ├── pipelines/
│       ├── converters/
│       └── ...
│
├── platforms/                  # All client platforms
│   ├── package.json           # Bun workspace root
│   ├── shared/                # Shared TypeScript types
│   │   ├── types/
│   │   ├── utils/
│   │   └── package.json
│   ├── cli/                   # Bun CLI (Phase 2-3)
│   ├── web/                   # Next.js (Phase 4)
│   ├── desktop/               # Tauri (Phase 5)
│   └── mobile/                # Flutter (Phase 6+)
│
├── spec/                      # Specifications
└── refs/                      # Reference implementations
```

---

## Key Deliverables

### Phase 4: Week 21-25

**Week 21-22: Repository Restructure**
- [ ] Create `core/` and `platforms/` directories
- [ ] Move backend to `core/backend/`
- [ ] Setup Turborepo for TS platforms
- [ ] Create `justfile` with all commands
- [ ] Extract shared types to `platforms/shared/`

**Week 23-24: Backend API**
- [ ] Implement REST endpoints
- [ ] Implement SSE streaming
- [ ] Implement WebSocket server
- [ ] Multiple auth methods (JWT, session, API key)
- [ ] API documentation (OpenAPI)

**Week 25: Web UI**
- [ ] Next.js App Router setup
- [ ] Basic chat interface
- [ ] Agent selection
- [ ] Session management UI
- [ ] Memory viewer
- [ ] Settings page

---

### Phase 5: Week 26-30

**Week 26-27: Desktop App**
- [ ] Tauri project setup
- [ ] Native OS integration
- [ ] Embedded backend option
- [ ] WebSocket client
- [ ] Platform-specific features (notifications, tray icon)

**Week 28-29: Integration**
- [ ] Cross-platform testing
- [ ] Performance optimization
- [ ] Error handling improvements
- [ ] State synchronization

**Week 30: Polish & Documentation**
- [ ] UI/UX refinement
- [ ] Platform-specific installers
- [ ] User documentation
- [ ] Developer documentation

---

## Technologies

### Backend API
- FastAPI - Web framework
- WebSockets - Bidirectional communication
- SSE (Server-Sent Events) - One-way streaming
- JWT - Token authentication
- Redis (optional) - Session storage

### Web (Phase 4)
- Next.js 14+ (App Router)
- shadcn/ui - Component library
- Bun - Package manager
- WebSocket client

### Desktop (Phase 5)
- Tauri v2 - Native wrapper
- Rust backend (Tauri Core)
- TypeScript frontend
- OS-specific APIs

### Mobile (Phase 6+)
- Flutter - Cross-platform framework
- Dart - Programming language
- iOS + Android targets

---

## Communication Protocols

### REST API

**Base:** `http://localhost:8000/api/v1`

**Endpoints:**
```
Authentication:
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh

Agents:
GET    /agents
POST   /agents/{agent_id}/execute
GET    /agents/{agent_id}/status

Sessions:
GET    /sessions
POST   /sessions
GET    /sessions/{session_id}
DELETE /sessions/{session_id}

Memory:
GET    /memory/search
POST   /memory/add
GET    /memory/timeline
```

---

### SSE (Server-Sent Events)

**Usage:** One-way streaming (agent responses, progress updates)

**Endpoints:**
```
GET /api/v1/stream/agent/{session_id}
GET /api/v1/stream/logs
GET /api/v1/stream/status
```

**Event Types:**
- `agent_response` - Agent text output
- `tool_execution` - Tool status updates
- `progress_update` - Progress indicators
- `error` - Error messages
- `session_end` - Session completion

---

### WebSocket

**Usage:** Bidirectional communication, interactive sessions

**Connection:**
```
WS /api/v1/ws/agent/{session_id}
```

**Message Format:**
```json
// Client → Server
{
  "type": "user_message",
  "content": "Write a function",
  "session_id": "uuid"
}

// Server → Client
{
  "type": "agent_response",
  "content": "I'll create a function...",
  "timestamp": "2026-01-31T14:00:00Z"
}
```

---

## Authentication Strategy

### Multiple Auth Methods

**1. Session-based (Web UI)**
- HTTP-only cookies
- CSRF protection
- Login via username + password

**2. JWT Tokens (CLI, Mobile)**
- Bearer token
- Refresh token mechanism
- Stored in `~/.skyth/auth/token.json`

**3. API Keys (Programmatic)**
- Long-lived keys
- Generated via `skyth auth create-key`
- Used for automation/scripts

**4. Local Auth (Desktop)**
- Superuser password
- Optional remote backend connection

---

## Monorepo Management

### Just (Primary Interface)

**Command runner for all development tasks**

```justfile
# Development
backend-dev:
    cd core/backend && uv run uvicorn main:app --reload

cli-dev:
    cd platforms/cli && bun run dev

web-dev:
    cd platforms/web && bun run dev

# Building
build-all: build-backend build-platforms

# Testing
test-all: test-backend test-platforms
```

---

### Turborepo (TS Platform Orchestration)

**Task caching and parallelization for TypeScript platforms**

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

---

## Platform Features

### CLI (Phase 2-3)
- ✅ Primary interface (TUI)
- ✅ Local-first
- ✅ Full agent capabilities
- ✅ Bun runtime

### Web (Phase 4)
- 🔄 Browser-based access
- 🔄 Visual chat interface
- 🔄 Session management
- 🔄 Memory visualization
- ⏸ Visual agent builder (Phase 6+)

### Desktop (Phase 5)
- ⏸ Native OS integration
- ⏸ Embedded backend option
- ⏸ Offline mode
- ⏸ System tray icon
- ⏸ Native notifications

### Mobile (Phase 6+)
- ⏸ iOS + Android
- ⏸ Remote backend connection
- ⏸ Push notifications
- ⏸ On-device model support (future)

---

## Platform Distribution

### Installation Methods

**CLI:**
```bash
curl -fsSL https://github.com/skyth/install.sh | sh
```

**Web:**
- Self-hosted (Docker image)
- Static files + API server

**Desktop:**
- macOS: `.dmg` installer
- Windows: `.exe` installer
- Linux: `.AppImage`, `.deb`, `.rpm`

**Mobile:**
- iOS: App Store
- Android: Google Play Store

---

## Success Criteria

### Phase 4 Complete When:

1. ✅ Repository restructured (core/ + platforms/)
2. ✅ Backend API implements REST + SSE + WebSocket
3. ✅ Web UI functional with basic features
4. ✅ Multiple auth methods working
5. ✅ Monorepo management stable
6. ✅ All tests pass
7. ✅ Documentation complete

### Phase 5 Complete When:

1. ✅ Desktop app builds for all platforms
2. ✅ Native OS integration works
3. ✅ Embedded backend option functional
4. ✅ Cross-platform testing passes
5. ✅ Installers created
6. ✅ User documentation complete

---

## Known Issues

### To Address in Phase 4-5
- State synchronization across platforms
- Offline mode implementation
- Performance optimization for web UI
- Native OS permission handling (desktop)

### Deferred to Later Phases
- Visual agent builder → Phase 6
- Mobile app → Phase 6+
- Collaborative features → Phase 7+

---

## References

### Internal
- Q&A Sections: Q4.1-Q4.3, Q9.1-Q9.3 / A4.1-A4.3, A9.1-A9.3
- OpenClaw: `@refs/apps/openclaw`
- Nanoclaw: `@refs/apps/nanoclaw`
- Nanobot: `@refs/apps/nanobot`

### External
- Tauri docs: https://tauri.app
- Next.js docs: https://nextjs.org
- shadcn/ui: https://ui.shadcn.com
- Just: https://just.systems
- Turborepo: https://turbo.build

---

*Last Updated: 2026-01-31*  
*Next Review: Start of Phase 4 (after Phase 3 completion)*
