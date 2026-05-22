# Progress

Updated: 2026-05-22T03:19:51Z

## Current Focus

Finished the onboarding/config/CLI wiring slice so the next major task can be
the real agent loop.

## Completed

- Kept Quasar as the auth/security authority.
- Added a Quasar VFS-backed secret bridge:
  - `skyth/config/quasar-secret-store.ts`
  - `skyth/config/quasar-secret-store-cli.ts`
  - Stores provider, tool, websearch, and channel secrets in
    `~/.skyth/quasar/secrets.quasardb`.
  - Uses namespace `secrets` and path layout
    `/{scope}/{subject}/{keyPath}.txt`.
- Rewired config secret hydration and redaction through the Quasar bridge.
  - Redacted config fields can hydrate from Quasar when the daemon is unlocked.
  - New secret values are written through Quasar before redaction.
- Restored legacy Skyth CLI command surfaces that are useful before the agent
  loop:
  - `channels`
  - `configure`
  - `cron`
  - `migrate`
  - `pairing`
  - `gateway`
- Reworked restored CLI commands away from the old TS auth store:
  - Channel auth gates unlock through Quasar.
  - `configure password` updates Quasar onboarding auth.
  - Channel edits persist secrets through Quasar.
  - Provider token helper writes to Quasar instead of plaintext token JSON.
- Restored Telegram pairing for onboarding and `skyth pairing telegram` through
  direct Telegram polling, without the old device-token pairing manager.
- Kept `cron run` as a scaffolded command until the agent loop lands.
- Added Hono onboarding API routes to the current gateway:
  - `GET /api/onboarding/status`
  - `GET /api/onboarding/metadata`
  - `POST /api/onboarding`
- Added the first core runtime API scaffold:
  - `AgentSession`
  - `AgentRunOrchestrator`
  - `StepRunner`

## Verification

- `bun run typecheck` passed.
- `cargo test` in `quasar/` passed: 18 passed, 0 failed.
- `./scripts/loc_check.sh` passed.
  - Files >= 400 LOC: 0
  - Files close to 400 LOC: 16

## Notes

- Quasar must be running and unlocked for redacted secrets to hydrate.
- Secret hydration is synchronous at the config-loader boundary, so it shells to
  a small Bun helper that talks to Quasar IPC. This preserves the copied legacy
  synchronous `loadConfig()` shape.
- `cron run` does not yet call an agent loop. It is intentionally waiting for
  the next slice.
- The current Quasar daemon still uses the development `MockGateway` mediation
  implementation.

## Next Steps

1. Port the real agent loop into `skyth/core/run/step-runner.ts`.
2. Wire CLI/gateway/channel execution through `SkythAgentSession.run(...)`.
3. Replace Quasar `MockGateway` with a Skyth gateway mediation implementation.
4. Split near-threshold files before adding substantial behavior:
   - `skyth/config/schema.ts`
   - `skyth/providers/registry.ts`
   - `skyth/cli/cmd/migrate/index.ts`
