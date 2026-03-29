# Backend Upgrade TODO

## Completed Tasks

### Phase 1: Session Management (✅ DONE)
- [x] `sessions.list` - List all sessions with ownership validation
- [x] `sessions.get` - Get single session details
- [x] `sessions.history` - Get chat history for session
- [x] `sessions.patch` - Update session metadata
- [x] `sessions.reset` - Clear session conversation
- [x] `sessions.delete` - Delete a session
- [x] `sessions.create` - Create new session
- [x] `sessions.compact` - Compact session storage
- [x] `chat.abort` - Abort running chat session (stub)
- [x] Session ownership validation (security)

**Files Created/Modified:**
- `skyth/gateway/handlers/sessions.ts` (NEW - modular handler)
- `skyth/gateway/handlers/index.ts` (NEW - exports)
- `skyth/gateway/server.ts` - Wired session handlers + chat.abort

---

## Pending Tasks

### Phase 2: Agent & Tools Methods (✅ COMPLETED)
- [x] `agents.list` - List registered agents
- [x] `agents.identity` - Get agent identity details
- [x] `agents.files.list` - List agent workspace files
- [x] `agents.files.get` - Get file content (with path traversal protection)
- [x] `agents.files.set` - Write file content (with path traversal protection)
- [x] `tools.catalog` - List all available tools
- [x] `tools.effective` - Get tools for session
- [x] `models.catalog` - List available models
- [x] `models.selected` - Get current model
- [x] `models.select` - Select a model

### Phase 3: Config, Channels, Cron (✅ COMPLETED)
- [x] `config.snapshot` - Get current config
- [x] `config.schema` - Get config schema
- [x] `config.apply` - Apply config changes
- [x] `config.validate` - Validate config
- [x] `channels.status` - Get all channel status
- [x] `channels.configure` - Configure channel
- [x] `cron.status` - Get cron service status
- [x] `cron.jobs.list` - List cron jobs
- [x] `cron.jobs.get` - Get job details
- [x] `cron.jobs.set` - Create/update job
- [x] `cron.jobs.delete` - Delete job
- [x] `cron.runs.list` - List job run history

### Phase 4: Health & Advanced (✅ COMPLETED)
- [x] `health.summary` - Comprehensive health info
- [x] `health.probe` - Deep health probe
- [x] `presence.list` - Connected clients
- [x] `exec.approval.list` - Pending approvals
- [x] `exec.approval.resolve` - Approve/deny
- [x] `exec.approval.request` - Request exec approval
- [x] `exec.approval.waitDecision` - Wait for approval decision

**Files Created/Modified:**
- `skyth/gateway/handlers/health.ts` (NEW - health & presence handlers)
- `skyth/gateway/handlers/exec-approvals.ts` (NEW - exec approval handlers)
- `skyth/gateway/handlers/index.ts` - Added exports
- `skyth/gateway/server.ts` - Wired health and exec-approval handlers

### Phase 5: Event System (✅ COMPLETED)
- [x] `connect.error` event
- [x] `chat` stream events (delta, final, aborted, error)
- [x] `agent` tool execution events
- [x] `presence` updates
- [x] `sessions.changed` event
- [x] `sessions.deleted` event
- [x] `cron` status updates
- [x] `cron.run` job events
- [x] `device.pair.*` events
- [x] `exec.approval.*` events
- [x] `update.available` event
- [x] `shutdown` event

**Files Created/Modified:**
- `skyth/gateway/handlers/events.ts` (NEW - event handlers + EventEmitter)
- `skyth/gateway/handlers/index.ts` - Added exports
- `skyth/gateway/server.ts` - Wired event handlers + exposed EventEmitter

---

## Next Action

Start implementing **Phase 2: Agent & Tools Methods**

Priority order:
1. `tools.catalog` - List all available tools (needed for frontend)
2. `tools.effective` - Get tools for session
3. `agents.list` - List registered agents
4. `agents.identity` - Get agent identity details

See `specs/handoffs/backend_upgrade_handoff.md` for full details.