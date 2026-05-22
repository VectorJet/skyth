# Progress

Updated: 2026-05-22T21:20:00Z

## Current Focus

Gateway channel startup now uses the onboarded/hydrated Skyth config as the source of truth for both provider boot and channel adapter registration. The gateway can route configured channel turns into the hybrid `SkythAgentSession` agent loop through the Quasar-backed message router.

## Completed (this slice)

- Wired gateway provider boot to hydrated `Config` values:
  - `buildProviderConfig(env, config)` now falls back to `config.primary_model`, `config.agents.defaults.model`, provider name, API key, and API base when env vars are absent.
  - Because `loadConfig()` hydrates redacted provider/channel secrets from Quasar, gateway boot now consumes existing Quasar-stored secrets instead of requiring duplicate env setup.
- Added config-driven channel registration:
  - New `createConfiguredChannels(config)` builds concrete gateway channel adapters from `config.channels`.
  - Web remains the default local channel unless disabled.
  - Telegram, Discord, and Slack are now concrete current-gateway adapters.
  - Enabled channels without current adapters are reported as unsupported instead of being silently faked.
- Replaced Telegram-specific agent-loop gating with a generic `skippedAgentChannels` list:
  - Keeps externally handled bridged channels out of duplicate agent injection paths.
  - Leaves non-bridged configured channels flowing through the hybrid agent loop.
- Ported current gateway Discord and Slack adapters from the existing legacy TypeScript behavior into the current `Channel` interface:
  - Discord gateway websocket receive/send/reaction basics, attachment caching, allowlist/group allowlist checks.
  - Slack socket-mode receive/send basics, mention/group policy checks, DM policy checks.
- Gateway startup now passes the same hydrated config into both agent session boot and channel subsystem boot.
- Gateway runtime defaults now avoid legacy Claude Gateway port collisions:
  - HTTP gateway default moved from `22000` to `52000`.
  - Web relay default moved from `38427` to `52027`.
  - Operators who need prior behavior can set `SKYTH_GATEWAY_PORT=22000` and `SKYTH_GATEWAY_WEB_RELAY_PORT=38427`.

## Tests

Focused verification passed:

- `bun test tests/gateway_configured_channels.test.ts tests/gateway_boot_wiring.test.ts tests/gateway_channel_agent_runner.test.ts`
  - 16 passed, 0 failed.
- `bun run typecheck`
  - Passed.

LOC check from this slice:

- `./scripts/loc_check.sh` reports one existing over-limit file:
  - `skyth/quasar/client.ts` at 405 LOC.
- New/changed files in this slice are under the 400 LOC policy.

## Key Files Changed

- `skyth/gateway/lifecycle/agent-session-boot.ts`
- `skyth/gateway/gateway.ts`
- `skyth/gateway/channels/index.ts`
- `skyth/gateway/channels/agent-runner.ts`
- `skyth/gateway/channels/configured.ts`
- `skyth/gateway/channels/discord-channel.ts`
- `skyth/gateway/channels/slack-channel.ts`
- `tests/gateway_configured_channels.test.ts`
- `tests/gateway_boot_wiring.test.ts`
- `tests/gateway_channel_agent_runner.test.ts`

## Next Steps

1. Finish porting the remaining enabled channel adapters from legacy TS / Hermes / OpenClaw references: WhatsApp, Feishu, Mochat, DingTalk, QQ, and email.
2. Add a channel directory / target resolution layer, modeled on Hermes `gateway/channel_directory.py`, backed by Quasar where appropriate.
3. Add live smoke coverage using `scripts/live_gateway_smoke.sh` with a real configured channel and a real provider.
4. Split `skyth/quasar/client.ts` below 400 LOC.
5. Keep a future design note for headless async agent mode: `skyth -p "prompt"` should deploy an asynchronous agent run, but this was intentionally not implemented in this channel-wiring slice.
