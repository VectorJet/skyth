# Phase 2 Handoff Note

**Status:** Planning Complete - Ready for Implementation  
**Date:** 2026-02-13

---

## Summary

Phase 2 builds on the TypeScript/Bun foundation and now includes **OpenClaw migration** as the highest priority. The key change is:

1. **Migrate from OpenClaw** - Copy data, inform agent about new "body"
2. **Copy Gateway** - From OpenClaw refs for 24/7 agent running
3. **Copy Messaging Channels** - Telegram, Discord, Slack, etc.
4. **Then** - Agent architecture (delegation, etc.)

---

## New Priority Order

### Priority 0: OpenClaw Migration (Highest)

**Why:** User wants to migrate from OpenClaw to Skyth.

**Components:**

1. **Data Migration** - Copy `~/.openclaw/` to `~/.skyth/`
2. **Agent Body** - Inform agent it's now in Skyth
3. **Gateway** - Copy from `refs/apps/openclaw/src/gateway/`
4. **Messaging** - Copy channel implementations from OpenClaw

### Priority 1-5: (Original Agent Architecture)

See `spec/phase-2/completion-checklist.md` for full list.

---

## OpenClaw Migration Details

### Data to Migrate

| OpenClaw Path               | Skyth Path                      | Notes           |
| --------------------------- | ------------------------------- | --------------- |
| `~/.openclaw/agents/main/`  | `~/.skyth/agents/main/`         | Main agent      |
| `~/.openclaw/sessions/`     | `~/.skyth/sessions/`            | Session history |
| `~/.openclaw/credentials/`  | `~/.skyth/credentials/`         | API keys        |
| `~/.openclaw/telegram/`     | `~/.skyth/channels/telegram/`   | Telegram config |
| `~/.openclaw/identity/`     | `~/.skyth/identity/`            | Device identity |
| `~/.openclaw/extensions/`   | `~/.skyth/extensions/`          | MCP extensions  |
| `~/.openclaw/openclaw.json` | `~/.skyth/config/openclaw.json` | Legacy config   |

### Agent Body Concept

When agent starts in Skyth for first time after migration:

- Inform agent it's now running in **Skyth** (new body)
- Explain new capabilities: **LGP**, **Quasar**, better security
- Preserve all **memories** from OpenClaw
- Agent retains identity but understands new environment

### Gateway (24/7 Agents)

Reference: `refs/apps/openclaw/src/gateway/`

Components to copy:

- `server.impl.ts` - Main gateway server
- `server-methods/` - API methods (chat, send, sessions, etc.)
- `ws-connection/` - WebSocket handling
- `hooks.ts` - Lifecycle hooks

### Messaging Channels

Reference: `refs/apps/openclaw/src/telegram/`, `discord/`, `slack/`, etc.

Channels to support:

- Telegram
- Discord
- Slack
- Signal
- WhatsApp (web)
- iMessage

---

## Files to Create

### Migration

```
core/backend/
├── internal/
│   └── cli/
│       └── cmd/
│           └── migrate.ts          (NEW - migration CLI)
```

### Gateway

```
core/backend/
├── gateway/
│   ├── index.ts                   (NEW - gateway entry)
│   ├── server.ts                  (NEW - main server)
│   ├── server-methods/            (NEW - from OpenClaw)
│   └── ws-connection.ts           (NEW - WebSocket)
```

### Channels

```
core/backend/
├── channels/
│   ├── telegram/                  (NEW - from OpenClaw)
│   ├── discord/                  (NEW - from OpenClaw)
│   ├── slack/                    (NEW - from OpenClaw)
│   └── index.ts                  (NEW - channel registry)
```

---

## Questions for User

See: `spec/agents/questions/2026-02-13.md`
