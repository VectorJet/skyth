# Handoff: Full TypeScript Migration In Progress

Date: 2026-02-23

## What was done

A substantial TypeScript foundation was implemented from `legacy/skyth` into `skyth/`, with passing parity tests for core behaviors currently covered by the new TS tests.

Implemented modules include:

- Manifest/registry system (`core/*`, `registries/*`)
- Tool base + registry with JSON-schema-like parameter validation
- Message bus types and async queue
- Session persistence (JSONL metadata + message lines)
- Config schema + modular config loader + legacy single-file migration + camelCase coercion
- Cron service timezone validation and scheduling state creation
- Email channel IMAP/SMTP behavior (through injected client adapters)
- Provider registry + key model prefix logic + Codex prefix stripping utility
- Agent loop with consolidation guards and `/new` archival semantics
- Minimal CLI onboarding + cron add command

## Validation completed

- `bun test` executed successfully.
- Result: `38 pass, 0 fail`.

## Important implementation notes

- `LiteLLMProvider` is currently wired to AI SDK at a scaffold level and not production-equivalent to the legacy Python LiteLLM integration.
- `OpenAICodexProvider` has only prefix utility migrated; full OAuth + SSE provider behavior is not migrated.
- `CronService` currently computes a future next run for cron expressions after timezone validation; full cron expression schedule parity still needs expansion.

## Remaining work for full parity

1. Migrate all remaining channels:
- `skyth/channels/telegram`
- `skyth/channels/discord`
- `skyth/channels/slack`
- `skyth/channels/whatsapp`
- `skyth/channels/feishu`
- `skyth/channels/mochat`
- `skyth/channels/dingtalk`
- `skyth/channels/qq`
- `skyth/channels/manager`

2. Migrate full toolset modules:
- filesystem tools
- shell tool with safety controls
- web search/fetch tools
- cron tool wrapper
- spawn tool
- MCP tool connector

3. Complete provider parity:
- Full LiteLLM-style request/response handling and model overrides
- Full Codex OAuth token retrieval and SSE streaming parser
- Custom provider parity from legacy

4. Complete CLI and runtime parity:
- Full command tree from legacy `cli/commands.py`
- Interactive prompt behavior parity
- Gateway/service startup wiring

5. Bridge + deployment:
- Integrate/port legacy `bridge/` and deployment scripts to Bun-first flow while preserving behavior
- Align Docker/container runtime to TS entrypoints

6. Policy alignment:
- Remove emoji output from remaining migrated paths per AGENTS policy

## Suggested immediate next step

Start with `channels/manager` + `telegram` + `slack` because these are high-impact runtime paths and unlock broader end-to-end validation.
