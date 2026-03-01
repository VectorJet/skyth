# Handoff: Web Build Performance Fix (2026-03-01)

## Problem
`platforms/web` build took 1m17s for a 4-route SvelteKit app. Root cause: 4780 modules being transformed.

## Root Causes Found
1. **Barrel import of `@lucide/svelte`** in `src/lib/components/ChatView.svelte` - single `import { Shield, MessageSquare, ArrowUp } from '@lucide/svelte'` pulled in all 1945 icon JS files.
2. **Unused dependencies** `isomorphic-dompurify` and `marked` in `package.json` - not imported anywhere in source but adding dead weight to `node_modules`.

## Changes Made
- Replaced barrel import with deep imports (`@lucide/svelte/icons/shield`, etc.) in `ChatView.svelte`
- Removed `isomorphic-dompurify` and `marked` from dependencies
- Created `platforms/web/AGENTS.md` with import rules to prevent recurrence

## Result
- Build time: 1m17s -> 44s
- Module count: 4780 -> 1179 (SSR), 4894 -> 1293 (client)

## Watch Out For
- Any future `from '@lucide/svelte'` barrel imports - always use `@lucide/svelte/icons/<name>`
- The `@` alias in `svelte.config.js` maps to `../../skyth` (backend) - importing from it pulls the whole backend dep tree into the web build
