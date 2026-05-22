# Handoff - Configured Channel Agent Loop Wiring

Date: 2026-05-22

## Summary

This slice wires gateway channel boot and provider boot to the hydrated Skyth config produced by onboarding. `loadConfig()` already hydrates redacted provider and channel secrets from Quasar through `hydrateSecretField()`, so gateway startup now consumes that config directly instead of requiring duplicate env-only setup.

The channel subsystem now registers concrete adapters from `config.channels`, and those channels route inbound turns through the existing Quasar-backed `MessageRouter` into the hybrid `SkythAgentSession` agent loop.

## Key Changes

- `skyth/gateway/lifecycle/agent-session-boot.ts`
  - `AgentSessionBootInput` accepts optional `config`.
  - `buildProviderConfig(env, config)` preserves env precedence but falls back to hydrated config for model, provider, API key, and API base.
  - `buildGatewayAgentSession()` loads config by default when no explicit env object is injected.

- `skyth/gateway/gateway.ts`
  - Loads config once at startup.
  - Passes the same hydrated config into agent session boot and channel subsystem boot.

- `skyth/gateway/channels/configured.ts`
  - New config-driven channel factory.
  - Registers web by default unless disabled.
  - Registers Telegram, Discord, and Slack when enabled in config.
  - Reports enabled-but-unwired channels as unsupported instead of silently creating stubs.
  - Marks Telegram as externally handled when `CLAUDE_GATEWAY_TELEGRAM_POLLING=0`, preserving the bridged Rust relay behavior without hard-coding Telegram in the runner.

- `skyth/gateway/channels/index.ts`
  - Uses `createConfiguredChannels()` rather than always constructing Telegram + Web.
  - Registers slash commands only when Telegram is present.
  - Uses the configured skip list when creating the channel turn runner.

- `skyth/gateway/channels/agent-runner.ts`
  - Replaced `handleTelegram` with generic `skippedAgentChannels`.

- `skyth/gateway/channels/discord-channel.ts`
  - Current gateway adapter ported from legacy TS Discord channel behavior.
  - Supports Discord gateway websocket input, HTTP text send, reaction API, basic attachment caching, and simple allow/group allowlist checks.

- `skyth/gateway/channels/slack-channel.ts`
  - Current gateway adapter ported from legacy TS Slack channel behavior.
  - Supports Slack socket mode input, text send, mention/group policy, and DM policy checks.

## Quasar / Secret Handling

No new secret storage mechanism was introduced. The path is:

1. Onboarding or `skyth channels edit` persists secrets through `persistSecretValue*()` into `~/.skyth/quasar/secrets.quasardb`.
2. Config files retain `[redacted]` placeholders.
3. `loadConfig()` calls `loadChannelsConfig()` / provider loading.
4. `hydrateSecretField()` resolves `[redacted]` values from Quasar into the runtime `Config` object.
5. Gateway boot passes that hydrated config into provider and channel construction.

## Verification

Passed:

```text
bun test tests/gateway_configured_channels.test.ts tests/gateway_boot_wiring.test.ts tests/gateway_channel_agent_runner.test.ts
bun run typecheck
```

Focused tests: 16 passed, 0 failed.

LOC check was also run:

```text
./scripts/loc_check.sh
```

It reports one existing over-limit file, `skyth/quasar/client.ts` at 405 LOC. This slice did not touch that file. New/changed files from this slice are under 400 LOC.

## Important Caveats

- WhatsApp, Feishu, Mochat, DingTalk, QQ, and email are still not wired as current gateway adapters. If enabled, they are reported as unsupported at startup.
- Discord and Slack adapters are intentionally first-pass ports from legacy TS, not full Hermes/OpenClaw parity.
- Channel directory / human target resolution is still missing. Hermes `gateway/channel_directory.py` is the right reference for that next layer.
- Live channel smoke with real credentials/provider still needs to be run manually.
- Future headless async mode was noted but not implemented: `skyth -p "prompt"` should eventually deploy an asynchronous agent run.

## Next Suggested Slice

Port remaining legacy TS channel adapters into the current `Channel` interface, then add a Quasar-backed channel directory / send-target resolution layer modeled on Hermes. After that, run a live smoke through at least one configured channel using existing Quasar-stored channel/provider secrets.
