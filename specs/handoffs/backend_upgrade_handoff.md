# Backend Upgrade Handoff

## Overview

This document outlines the backend changes required to support the Skyth frontend upgrade to match OpenClaw's feature set. The frontend upgrade specification is in `SPECS.md` at the project root.

## Context

- **Frontend Location**: `platforms/web/`
- **Reference Implementation**: `refs/openclaw/src/gateway`
- **Current Backend Methods**: 4 (`chat.send`, `chat.history`, `health`, `status`)
- **Target Backend Methods**: 50+

## Priority: Critical Gateway Methods

### Phase 1: Core Infrastructure (Before Frontend Can Function)

These methods are required for basic frontend operation:

| Method | File to Modify | Description |
|--------|---------------|-------------|
| `sessions.list` | `skyth/gateway/server.ts` | List all sessions with metadata |
| `sessions.get` | `skyth/gateway/server.ts` | Get single session details |
| `sessions.history` | `skyth/gateway/server.ts` | Get chat history for session |
| `sessions.patch` | `skyth/session/manager.ts` | Update session metadata |
| `sessions.reset` | `skyth/session/manager.ts` | Clear session conversation |
| `chat.abort` | `skyth/gateway/server.ts` | Abort running chat session |

**Current State**: Session management exists in `skyth/session/manager.ts` but needs to be exposed via gateway.

---

## Priority: High - Session & Agent Management

### Session Methods (6 methods)

| Method | Location | Status |
|--------|----------|--------|
| `sessions.list` | `skyth/gateway/server.ts` | TODO - needs implementation |
| `sessions.get` | `skyth/gateway/server.ts` | TODO - needs implementation |
| `sessions.history` | `skyth/gateway/server.ts` | TODO - needs implementation |
| `sessions.patch` | `skyth/session/manager.ts` | TODO - needs implementation |
| `sessions.reset` | `skyth/session/manager.ts` | TODO - needs implementation |
| `chat.abort` | `skyth/gateway/server.ts` | TODO - needs implementation |

### Agent Methods (8 methods)

| Method | Location | Description |
|--------|----------|-------------|
| `agents.list` | `skyth/registries/agent_registry.ts` | List registered agents |
| `agents.identity` | `skyth/agents/agents.ts` | Get agent identity details |
| `agents.files.list` | `skyth/agents/agents.ts` | List agent workspace files |
| `agents.files.get` | `skyth/agents/agents.ts` | Get file content |
| `agents.files.set` | `skyth/agents/agents.ts` | Write file content |
| `tools.catalog` | `skyth/registries/tool_registry.ts` | List all available tools |
| `tools.effective` | `skyth/session/graph.ts` | Get tools for session |
| `models.*` | `skyth/providers/registry.ts` | Model catalog/selection |

---

## Priority: Medium - Config, Channels, Cron

### Config Methods (4 methods)

| Method | Location | Description |
|--------|----------|-------------|
| `config.snapshot` | `skyth/config/loader.ts` | Get current config |
| `config.schema` | `skyth/config/schema.ts` | Get config schema |
| `config.apply` | `skyth/config/loader.ts` | Apply config changes |
| `config.validate` | `skyth/config/loader.ts` | Validate config |

### Channel Methods (2 methods)

| Method | Location | Description |
|--------|----------|-------------|
| `channels.status` | `skyth/channels/manager.ts` | Get all channel status |
| `channels.configure` | `skyth/channels/manager.ts` | Configure channel |

### Cron Methods (6 methods)

| Method | Location | Description |
|--------|----------|-------------|
| `cron.status` | `skyth/cron/service.ts` | Get cron service status |
| `cron.jobs.list` | `skyth/cron/service.ts` | List cron jobs |
| `cron.jobs.get` | `skyth/cron/service.ts` | Get job details |
| `cron.jobs.set` | `skyth/cron/service.ts` | Create/update job |
| `cron.jobs.delete` | `skyth/cron/service.ts` | Delete job |
| `cron.runs.list` | `skyth/cron/service.ts` | List job run history |

---

## Priority: Low - Health & Advanced

### Health Methods (3 methods)

| Method | Location | Description |
|--------|----------|-------------|
| `health.summary` | `skyth/heartbeat/service.ts` | Comprehensive health info |
| `health.probe` | `skyth/heartbeat/service.ts` | Deep health probe |
| `presence.list` | `skyth/heartbeat/runner.ts` | Connected clients |

### Execution Approval (2 methods)

| Method | Location | Description |
|--------|----------|-------------|
| `exec.approval.list` | `skyth/security/exec-safety.ts` | Pending approvals |
| `exec.approval.resolve` | `skyth/security/exec-safety.ts` | Approve/deny |

---

## Event System Changes Required

The backend needs to broadcast these events to connected WebSocket clients:

### Required Events (15+)

```
connect.challenge     - Already implemented (nonce challenge)
connect.ok            - Already implemented
connect.error         - TODO: Add error event

chat                  - TODO: Add chat stream events (delta, final, aborted, error)
agent                 - TODO: Add tool execution events

presence              - TODO: Add presence updates

sessions.changed      - TODO: Add when sessions list changes
sessions.deleted      - TODO: Add when session is deleted

cron                  - TODO: Add cron status updates
cron.run              - TODO: Add job run events

device.pair.requested - TODO: Add device pairing
device.pair.resolved  - TODO: Add pairing result

exec.approval.requested - TODO: Add approval requests
exec.approval.resolved  - TODO: Add approval results

update.available     - TODO: Add version update
shutdown             - TODO: Add server shutdown
```

---

## File-by-File Changes

### 1. `skyth/gateway/protocol.ts`
**Changes**:
- Add `seq?: number` to `GatewayEventFrame` for sequence tracking
- Add protocol version negotiation types
- Add `hello-ok` frame type with features/methods/events
- Add device auth fields

### 2. `skyth/gateway/server.ts`
**Changes**:
- Expand `GATEWAY_METHODS` from 4 to 50+
- Add method handler switch for all new methods
- Add event broadcasting to all connected clients
- Add request timeout handling

### 3. `skyth/gateway/ws-connection.ts`
**Changes**:
- Add pending request map with timeouts
- Add gap detection (seq tracking)
- Add event handler registration system

### 4. `skyth/session/manager.ts`
**Changes**:
- Add `listSessions()` with filters/sorting/pagination
- Add `getSession()` with full metadata
- Add `patchSession()` for updates
- Add `resetSession()` to clear history
- Add session metadata (tokens, model, status)

### 5. `skyth/config/loader.ts`
**Changes**:
- Add `getSnapshot()` method
- Add `applyConfig()` method
- Add `validateConfig()` method

### 6. `skyth/channels/manager.ts`
**Changes**:
- Add `getStatus()` method returning all channels
- Add `configure()` method for channel settings

### 7. `skyth/cron/service.ts`
**Changes**:
- Add all 6 cron methods
- Expose job listing and management

### 8. `skyth/registries/agent_registry.ts`
**Changes**:
- Add `list()` method for agent discovery

### 9. `skyth/registries/tool_registry.ts`
**Changes**:
- Add `catalog()` method
- Add `effective(sessionKey)` method

### 10. `skyth/heartbeat/service.ts`
**Changes**:
- Add `healthSummary()` method
- Add `probe()` method

---

## Implementation Order

### Step 1: Gateway Protocol Enhancement
1. Update `skyth/gateway/protocol.ts` types
2. Add sequence tracking to events

### Step 2: Session Methods
1. Expose session manager via gateway
2. Implement `sessions.list`, `sessions.get`, `sessions.history`
3. Implement `sessions.patch`, `sessions.reset`

### Step 3: Event Broadcasting
1. Wire up `sessions.changed` event
2. Add `chat` events (stream handling)
3. Add `agent` events (tool execution)

### Step 4: Agent & Tools
1. Expose agent registry
2. Implement agent list/identity methods
3. Implement tools.catalog, tools.effective

### Step 5: Config, Channels, Cron
1. Add config snapshot/schema/apply methods
2. Add channel status method
3. Add cron management methods

### Step 6: Health & Presence
1. Add health.summary
2. Add presence.list

### Step 7: Advanced
1. Add execution approval methods
2. Add device pairing events
3. Add update/shutdown events

---

## Reference Files

- **OpenClaw Gateway**: `refs/openclaw/src/gateway/events.ts`
- **OpenClaw Client**: `refs/openclaw/src/gateway/client.ts`
- **OpenClaw Types**: `refs/openclaw/ui/src/ui/types.ts`
- **Session Manager**: `skyth/session/manager.ts`
- **Current Protocol**: `skyth/gateway/protocol.ts`

---

## Testing Checklist

- [ ] All 50+ methods respond correctly
- [ ] Events are broadcast to all clients
- [ ] Sequence tracking works (no gaps)
- [ ] Authentication works for all methods
- [ ] Request timeouts work
- [ ] Reconnection handles dropped events
- [ ] Large payloads don't crash server

---

## Notes

- The frontend already has partial WebSocket handling - backend must match its expectations
- Check `platforms/web/src/lib/gateway/` for frontend's expected protocol format
- OpenClaw uses a versioned protocol - consider implementing version negotiation
- Device authentication is important for production use

---

**Created**: Based on SPECS.md frontend upgrade specification
**Status**: Ready for implementation