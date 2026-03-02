# Project knowledge

Skyth is a modular, registry-driven AI agent platform with a CLI, WebSocket gateway, multi-channel adapters, tool execution, and a SvelteKit web frontend.

## Quickstart
- Setup: `bun install`
- Run: `bun run skyth/cli/main.ts` (or `bun start`)
- Dev (web): `cd platforms/web && bun install && bun run dev`
- Test: `bun test tests/`
- Typecheck: `bun run typecheck` (runs `tsc --noEmit`)
- Build binary: `bun run build:bin`
- Build web: `cd platforms/web && bun run build`
- Check web types: `cd platforms/web && bun run check`

## Architecture
- `skyth/` — core backend: agents, channels, CLI, config, gateway, tools, providers, session, memory, skills
- `skyth/cli/` — CLI entry point (`main.ts`), commands, runtime helpers
- `skyth/channels/` — platform adapters (Telegram, Discord, Slack, WhatsApp, email, web, etc.)
- `skyth/providers/` — AI model providers (AI SDK, OpenAI Codex)
- `skyth/tools/` — agent tools (bash, edit, read, write, grep, glob, codesearch, websearch, etc.)
- `skyth/gateway/` — WebSocket gateway server and discovery
- `skyth/session/` — session graph, manager, and router
- `skyth/skills/` — pluggable skill definitions (Markdown-based)
- `platforms/web/` — SvelteKit web frontend (Svelte 5, Tailwind v4, shadcn-svelte, bits-ui)
- `tests/` — Bun test files
- `specs/` — design specs, progress tracking, and handoff notes

## Conventions
- Runtime/package manager: **Bun** for all TS/JS tasks
- All TypeScript imports in `skyth/` MUST use absolute paths with `@/` prefix (e.g., `@/channels/manager`), never relative paths. The `@/` alias maps to `skyth/`.
- Registry + manifest auto-discovery for extensible systems (providers, channels, tools, agents, skills)
- No emoji in logs, CLI output, docs, status markers, or code
- Lucide icons in web frontend: ALWAYS use deep imports (`@lucide/svelte/icons/shield`), NEVER barrel imports
- The `@` alias in `platforms/web/svelte.config.js` points to `../../skyth` (the backend) — avoid importing backend modules into the web frontend unless necessary
- Strict TypeScript (`strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`)
- Never store secrets in plaintext; use `~/.skyth/` for security-sensitive config
- Document progress in `specs/progress/Progress.md`; leave handoff notes in `specs/handoffs/`
