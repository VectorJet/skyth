# Handoff: opencode Provider Logic Import

Date: 2026-02-23

## What was done

- Source repo available at `refs/opencode`.
- Provider logic patterns copied into `skyth/providers/registry.ts`:
  - models.dev catalog loading + cache file handling
  - dynamic provider spec generation
  - provider enable/disable filtering API
  - model-ref parsing helper
  - small-model priority helper

## Current impact

- Skyth provider registry is no longer static-only; dynamic catalog hooks are now present.
- Existing command/runtime flow remains stable and builds successfully.

## Validation

- `bun test tests` -> pass (38/38)
- `bun run build:bin` -> pass

## Important caveat

- Do not run unscoped `bun test` unless intentionally testing `refs/opencode/**` too.
  It pulls in opencode monorepo tests with unmet dependencies in this workspace.

## Next recommended continuation

1. Wire `listProviderSpecs()` into runtime command paths (`status`, provider discovery outputs).
2. Port opencode merge precedence semantics (env + api auth + config + custom loader overlays).
3. Port model selection/loading semantics for full provider parity.
