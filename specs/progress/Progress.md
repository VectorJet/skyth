# Progress Update - 2026-02-23

## Scope Completed
Completed the requested migration batch for channels/runtime behavior, built-in skills/subagent parity, heartbeat/cron runtime wiring, and CLI modularization with command registry.

## Changes

### Channels and Gateway
- Persisted channels as separate files under `~/.skyth/channels/*.json`.
- Loader now reads channel files first, with legacy `runtime.json.channels` fallback.
- Gateway error messaging now points to `~/.skyth/channels/*.json`.
- Added CLI channel editor command:
  - `skyth channels edit <channel> --enable|--disable --set key=value --json '{...}'`

### Telegram and WhatsApp
- Added Telegram typing indicator lifecycle (start on inbound, stop on outbound/timeout).
- Migrated Telegram built-in `/start` and `/help` handling (including `@bot` command forms).
- Added WhatsApp best-effort typing/presence signals around inbound/outbound flow.

### Agent Context and Platform Awareness
- Added explicit gateway/channel context in prompt construction.
- Added session transition notes when channel/chat routing changes.
- Session metadata now tracks prior channel/chat to detect platform change.

### Built-in Skills Migration
- Migrated skills loader to support:
  - workspace + built-in skill discovery
  - frontmatter parsing
  - requirement checks (bin/env)
  - always-on skill resolution
  - XML summary output with availability and requirement diagnostics
- Copied legacy built-in skills into `skyth/skills/*`.

### Subagent Migration
- Replaced minimal subagent stub with iterative tool-using execution loop.
- Subagent now has its own tool registry (filesystem, shell, web).
- Subagent completion/error is announced back into the main bus as system inbound context.
- Added provider/model/tool runtime wiring from main agent loop into subagent manager.

### Heartbeat and Cron Runtime
- Added heartbeat module:
  - `skyth/heartbeat/service.ts`
  - `skyth/heartbeat/index.ts`
- Gateway now starts/stops heartbeat and routes heartbeat prompts into agent processing.
- Extended cron service runtime behavior:
  - start/stop lifecycle
  - timer arming
  - due-job execution
  - callback-driven job dispatch
- Gateway now starts cron runtime, executes due jobs through agent loop, and optionally delivers outbound results.

### CLI Modularization
- Introduced command registry:
  - `skyth/cli/command_registry.ts`
- Added reusable CLI runtime helper module:
  - `skyth/cli/runtime_helpers.ts`
- Split legacy command logic into module files under:
  - `skyth/cli/command_modules/*`
- Kept compatibility barrel:
  - `skyth/cli/commands.ts`
- Refactored `skyth/cli/main.ts` to use command registry + helper APIs.

## Validation
- Ran: `bun test tests`
  - Result: `46 passed, 0 failed`
- Ran: `bun run build:bin`
  - Result: binary compiled successfully to `dist/skyth`

## Outcome
The migrated gateway/runtime now supports separate channel persistence, typing indicators, platform-aware prompting, expanded built-in skills/subagent behavior, and active heartbeat/cron execution. CLI structure is modularized with command registry and command modules while preserving existing command behavior.
