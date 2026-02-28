# Progress

## Scope
Replace manual channel runtime handling with Vercel Chat SDK where supported, while keeping unsupported channels for backward compatibility.

## Completed
- Replaced runtime channel orchestration in `skyth/channels/manager.ts` with a hybrid manager:
  - Chat SDK-backed channels: `slack`, `discord`, `telegram`
  - Legacy adapters retained for compatibility/unsupported: `whatsapp`, `email`
- Added Chat SDK webhook server startup inside `ChannelManager`:
  - `POST /api/webhooks/slack`
  - `POST /api/webhooks/discord`
  - `POST /api/webhooks/telegram`
  - `GET /health`
- Added Discord Chat SDK Gateway forwarding loop (`startGatewayListener`) to keep Discord message ingress working through webhook routing.
- Preserved trust/auth pairing flow for Chat SDK channels:
  - Detect pairing codes in `ABC-123` / normalized `ABC123` form
  - Forward to pairing endpoint (`/pair`)
  - Keep node trust model and node token flow intact
- Updated gateway runtime wiring to pass webhook port into `ChannelManager`:
  - `skyth/cli/runtime/gateway.ts` now initializes `ChannelManager(cfg, bus, { webhookPort: port })`
- Added config fields needed by Chat SDK adapters:
  - `channels.discord.public_key`
  - `channels.discord.application_id`
  - `channels.slack.signing_secret`
- Updated interactive channel configure labels for the new fields in:
  - `skyth/cli/cmd/configure/pointers/channel.ts`
- Updated slack allowlist policy parsing for Chat SDK thread-style IDs:
  - `skyth/channels/policy.ts` now extracts the Slack channel segment from `slack:...` chat IDs when enforcing `group_allow_from`.
- Added Chat SDK dependencies:
  - `chat`
  - `@chat-adapter/slack`
  - `@chat-adapter/discord`
  - `@chat-adapter/telegram`
  - `@chat-adapter/state-memory`

## Validation
- Ran targeted typecheck verification for touched files (full repo has many pre-existing unrelated type errors).
- Ran tests:
  - `bun test tests/channel_policy.test.ts` (pass)

## Notes
- Unsupported channels remain on legacy adapter implementations by design for backward compatibility.
- Supported channels fall back to legacy adapters when Chat SDK-required credentials are missing:
  - Slack requires signing secret (`channels.slack.signing_secret` or `SLACK_SIGNING_SECRET`)
  - Discord requires token + public key + application ID (config or env)
  - Telegram requires bot token
