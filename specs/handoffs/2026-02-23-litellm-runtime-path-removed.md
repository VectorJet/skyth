# Handoff: LiteLLM Runtime Path Removed, CLI/Gateway Expanded

Date: 2026-02-23

## Key update

Runtime now uses AI SDK provider path in CLI command execution. The previous GitHub login path that invoked `litellm` has been removed.

## Implemented

1. Provider runtime switch
- `skyth/cli/main.ts` now constructs `AISDKProvider` from config.
- `skyth/providers/ai_sdk_provider.ts` added and used.

2. Provider login changes
- `openai-codex`: uses available Python environment (prefers `legacy/.venv/bin/python`) with `oauth_cli_kit`.
- `github-copilot`: no litellm call; now token-based (`GITHUB_TOKEN`/`GH_TOKEN`) and persists config.

3. Gateway runtime wiring
- Added/used `ChannelManager` with inbound->agent->outbound flow.
- Added channel modules for structure parity (`telegram`, `whatsapp`, `discord`, `feishu`, `mochat`, `dingtalk`, `slack`, `qq`).

4. Agent command behavior
- Supports interactive mode (no `-m`) and one-shot mode (`-m`).

## Validation

- Tests pass (`38/38`).
- Binary rebuild succeeds.
- Runtime checks pass for help/status/channels/gateway/agent/provider login paths.

## Notes

- `skyth/providers/litellm_provider.ts` remains only as a compatibility shim export for legacy test imports. Runtime command path no longer depends on litellm execution.
- Full end-to-end parity for all adapters/providers/tools is still in progress.
