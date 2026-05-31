# Handoff: legacy-ts2 Archive (2026-05-31)

## What Happened

The current TypeScript codebase (skyth v2 built on pi + Quasar + AI SDK) has been
archived into `legacy/legacy-ts2/` to make room for a ground-up rebuild.

The decision was made to restart cleanly on top of the `pi` runtime
(`@earendil-works/pi-agent-core` / `@earendil-works/pi-ai`) rather than continuing
to layer onto the existing architecture.

## What Was Archived

Everything that was at the repo root, including:

- `skyth/`           — All TypeScript source modules (agents, core, cli, gateway, pi, quasar, ...)
- `quasar/`          — Rust sidecar for native tool execution
- `tests/`           — Bun test suite (160 tests, all passing at time of archive)
- `specs/`           — Architecture specs, progress notes, handoffs (all preserved)
- `refs/`            — Reference documentation
- `vendor/`          — Vendored dependencies
- `scripts/`         — Build/dev helper scripts
- `dist/`            — Built binary output
- `node_modules/`    — Installed dependencies
- `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `bun.lock`, `index.ts`

## State at Time of Archive

- `bun run typecheck` — 0 errors
- `bun test tests/`  — 160 tests, all passing
- No files over 400 LOC (loc_check.sh clean)
- pi adapter (`skyth/pi/`) was the last major milestone: baseline wiring complete,
  catalog/router/runtime integrated, provider bridge tested

## What Remains at Root

- `.agents/`         — Agent skills, questions, answers
- `.git/`            — Version history
- `.gitignore`
- `AGENTS.md` / `GEMINI.md` / `CLAUDE.md`  — Operating rules
- `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `LICENSE`, `README.md`
- `legacy/`          — All archived generations:
  - `legacy-py/`     — Original Python implementation
  - `legacy-ts/`     — First TypeScript rewrite
  - `legacy-ts2/`    — This archive (pi-integrated build)

## Next Steps for Incoming Agent

- Start fresh from root; `pi` is the intended foundation
- See `legacy/legacy-ts2/skyth/pi/README.md` for the pi adapter design
- The pi vendor lives in `legacy/legacy-ts2/vendor/`
- All previous specs and handoffs are in `legacy/legacy-ts2/specs/handoffs/`
- Do not import from the legacy tree — treat it as read-only reference
