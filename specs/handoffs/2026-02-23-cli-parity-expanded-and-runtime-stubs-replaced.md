# Handoff: CLI Parity Expanded, Runtime Placeholders Replaced

Date: 2026-02-23

## Delivered

- CLI now presents legacy-like top-level command surface and help output from compiled binary.
- Onboarding workspace/template behavior corrected and expanded.
- Short option parsing fixed (`-m`, `-s`, etc.).
- `agent` and `gateway` commands now execute runtime paths instead of pure placeholder text.
- `CronService` and cron CLI command set expanded (`add/list/remove/enable/run`).

## Verified binary behaviors

- `./dist/skyth --help` prints expanded command surface.
- `./dist/skyth run onboarding ...` creates expected workspace templates.
- `./dist/skyth agent -m "mock:hello"` executes and returns output.
- `./dist/skyth gateway --port 18790` starts and stops cleanly.
- `./dist/skyth status` prints config/workspace/provider states.
- `./dist/skyth cron add/list` works with persisted jobs.

## Still incomplete vs legacy

1. Channels:
- No full runtime parity for Telegram/Discord/Slack/WhatsApp/Feishu/Mochat/DingTalk/QQ.

2. Providers:
- OAuth login flows not fully implemented.
- OpenAI Codex provider full API flow (OAuth + SSE) not migrated.
- LiteLLM-equivalent runtime behavior is partial.

3. Agent/Gateway:
- Current implementations are runnable but not feature-equivalent with legacy Python runtime.
- Interactive CLI and full bus/channel orchestration remain incomplete.

4. MCP:
- Registry side exists; runtime connector/tool-call parity not complete.

## Recommended next coding block

- Implement `channels/manager` plus `telegram` and `slack` adapters first, then wire into gateway.
- Immediately after that, complete provider parity (`openai_codex` and full model routing/runtime behavior).
