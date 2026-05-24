# Handoff - Quasar unlock password normalization

## Context

After onboarding completed and saved provider/channel secrets, `./dist/skyth gateway` could either skip the Quasar prompt on a fresh locked daemon or reject the entered password with `authentication failed`. Config hydration then could not read Quasar-backed redacted secrets, so the provider reported `apiKeyConfigured: false` and Telegram was skipped with `missing token`.

## Change

- `skyth/gateway/gateway.ts`
  - `plainPasswordToB64()` now trims plain-text input before base64 encoding.
  - The helper is exported for regression tests.
  - Gateway now prompts when `~/.skyth/auth.quasardb` exists even if daemon status reports auth is not loaded yet.
- `skyth/gateway/durable/quasar-adapters.ts`
  - `SKYTH_QUASAR_PASSWORD` is trimmed before encoding.

This matches onboarding behavior in `skyth/cli/cmd/onboarding/index.ts`, where `args.superuser_password.trim()` is stored in Quasar. The auth DB existence check works around current daemon status semantics: `auth_initialized` currently means the auth DB is loaded/unlocked in memory, not merely that onboarding has created auth state.

## Tests

- Added `tests/quasar_gateway_unlock.test.ts`.
- Extended `tests/quasar_durability_init.test.ts`.

Verification:

```bash
bun test tests/quasar_gateway_unlock.test.ts tests/quasar_durability_init.test.ts
```

Result: passed.

```bash
bun run build:bin
```

Result: passed.

Typecheck was attempted with:

```bash
bun run typecheck
```

It currently fails in unrelated untracked provider files:

- `skyth/providers/opencode_provider_transform.ts` imports missing `stripToolHistoryForProvider`.
- `ModelSDKInfo` does not expose `toolCall` or `temperature` for that file.

## Follow-up

Rebuild the binary with `bun run build:bin`, then retry:

```bash
./dist/skyth gateway
```

If Quasar still rejects the password, inspect whether an older `~/.skyth/auth.quasardb` exists from a previous password and whether the daemon process was already running against that state.
