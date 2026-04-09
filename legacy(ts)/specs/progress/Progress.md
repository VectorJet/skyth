# Progress - April 4, 2026

## Pull and Review PRs
- Reviewed and merged core PRs:
    - `sentinel-fix-path-traversal-windows`: Fixed path traversal vulnerability on Windows using `path.sep` and `isAbsolute`.
    - `bolt-optimize-promise-all`: Introduced concurrency limiting (batch size 50) in `SessionManager.getMany` to prevent EMFILE errors.
    - `session-context-size-caching`: Added length-based caching for `estimateContextSize` in `Session` class to improve performance.
- Reviewed web platform PRs (legacy):
    - `add-auth-autocomplete`: Added autocomplete attributes to login form.
    - `add-keyboard-hint`: Added Enter key hint to send message tooltip.
    - *Note: These were not merged as `platforms/web` was recently deleted from `main`.*

## Code Size Management (LOC Check)
- Identified and split files exceeding 400 LOC:
    - `skyth/session/manager.ts` (499 -> 333): Split into `types.ts`, `session.ts`, `listing.ts`, and updated `manager.ts`.
    - `skyth/base/base_agent/runtime.ts` (436 -> 366): Extracted `HandoffController` and `consolidation_helpers.ts`.
    - `skyth/cli/cmd/onboarding/module/steps/06-channel-selection.ts` (417 -> 279): Extracted constants and pairing logic into `channel_selection/` subdirectory.
    - `skyth/gateway/handlers/agents.ts` (404 -> 248): Split into `types.ts` and `helpers.ts`.
- **Fixed:** Incorrect agent gateway workspace resolution in `skyth/gateway/handlers/agents.ts` (resolved to `entry.root` directly as per handoff notes).

## Dependencies and Cleanup (April 4, 2026)
- **Dependency Audit**: The user reported that huge packages like `koffi` were being installed despite not being declared or used directly.
- **Root Cause**: Several `@mariozechner/pi-*` packages and frontend dependencies (`@sveltejs/*`, `@tailwindcss/vite`, `tailwindcss`) were declared in `package.json` but completely unused by the backend-only `skyth/` tree. These brought in massive transitive dependencies like `koffi`, `@rolldown`, etc.
- **Action**: Completely purged 37 unused packages and devDependencies from `package.json` and `bun.lock`.
- **Additional Fixes**: Added `glob`, `@types/glob`, `@homebridge/ciao`, and `@types/ws` which were previously functioning as phantom transitive dependencies but were actually required at runtime or compile time.
- **Node Modules size reduction**: `node_modules` size dropped drastically and dependency count reduced from ~570 to ~108.
- **Bun configuration**: Scoped `bunfig.toml` to prevent `bun install` from scanning `refs/` directory and incorrectly hoisting dependencies from 170+ archived `package.json` files.

## Verification
- Ran full test suite: 172 pass, 0 fail.
- Typecheck (`tsc --noEmit`): Pass.
- All files now meet the < 400 LOC requirement.
