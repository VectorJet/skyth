# Progress

Updated: 2026-05-22T03:25:17Z

## Current Focus

Restored the richer provider/model discovery surface after committing the
current onboarding/Quasar wiring.

## Completed

- Committed the current onboarding/CLI/Quasar secret-storage work:
  - Commit: `bdd70c1` (`Port onboarding CLI with Quasar secret storage`)
- Fixed provider/model discovery so menus do not get stuck on only static
  providers when the `models.dev` cache is empty or stale.
- `loadModelsDevCatalog()` now treats an empty cached catalog as a cache miss.
- `listProviderSpecs()` now accepts `forceRefresh`.
- Force-refresh is used by:
  - onboarding model/provider selection
  - onboarding metadata route
  - `skyth configure provider`
  - `skyth configure model`
  - `skyth provider list`
  - `skyth provider login`
- Verified live catalog behavior:
  - 135 provider specs
  - 134 `models.dev` providers

## Verification

- `bun run typecheck` passed.
- `./scripts/loc_check.sh` passed.
  - Files >= 400 LOC: 0
  - Files close to 400 LOC: 16

## Notes

- `skyth/providers/registry.ts` is now 365 LOC and should be split before
  adding more provider behavior.
- Quasar tests were not rerun for this tiny TypeScript-only provider/menu fix.

## Next Steps

1. If the restored provider/model menus look right, move on to the real agent
   loop port.
2. Split `skyth/providers/registry.ts` before extending provider behavior again.
