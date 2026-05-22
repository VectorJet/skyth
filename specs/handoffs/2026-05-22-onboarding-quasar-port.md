# Handoff - Onboarding Quasar Port

Date: 2026-05-22

## Summary

Started copying the viable legacy Skyth TypeScript onboarding/provider slice
into the current Skyth tree and adapted superuser onboarding to Quasar IPC.

## Files Added

- `skyth/cli/`
- `skyth/config/`
- `skyth/providers/`
- `skyth/utils/`
- `skyth/api/routes/onboardingRoute.ts`
- `skyth/gateway/api/routes/onboarding-routes.ts`
- `skyth/core/events.ts`
- `skyth/core/session/agent-session.ts`
- `skyth/core/run/orchestrator.ts`
- `skyth/core/run/step-runner.ts`
- `skyth/core/index.ts`

## Important Changes

- `package.json`
  - Added `quasar` script: `cargo run --manifest-path quasar/Cargo.toml`.
- `skyth/gateway/gateway.ts`
  - Registers onboarding routes.
- `skyth/cli/cmd/onboarding/index.ts`
  - Calls `QuasarClient.onboard(...)` for superuser setup.
- `skyth/cli/cmd/onboarding/module/quasar_auth.ts`
  - Small Quasar-auth boundary for onboarding prompts.
- `skyth/config/loader/secret-redaction.ts`
  - Local redaction helpers replacing old `@/auth/secret_store` imports.

## Deliberate Omissions

- Legacy TS auth/token/pairing commands were not ported.
- Legacy TS secret storage was not ported because Quasar owns auth/security.
- Channel pairing from onboarding was disabled for now because it depended on
  the old token system.
- The copied CLI command catalog was trimmed to the commands that compile in
  this slice.

## Current Caveat

Provider/channel/tool/websearch secrets now use a Quasar VFS-backed bridge at
`~/.skyth/quasar/secrets.quasardb`.

The config loader is still synchronous, so redacted secret hydration shells to a
small Bun helper that performs the Quasar IPC read. This keeps the copied
legacy `loadConfig()` shape intact for now.

Quasar must be running and unlocked for secret hydration or secret writes.

## Restored Commands

- `skyth channels`
- `skyth configure`
- `skyth cron`
- `skyth migrate`
- `skyth pairing`
- `skyth gateway`

## Still Deferred

- `cron run` is scaffolded and does not yet execute the real agent loop.
- The old device-token pairing manager was not restored. Telegram pairing uses
  direct Telegram polling instead.
- Quasar still uses the development `MockGateway` mediation surface.

## Verification

- `bun run typecheck` passed.
- `cargo test` in `quasar/` passed: 18 passed, 0 failed.
- `./scripts/loc_check.sh` passed with no files >= 400 LOC.
