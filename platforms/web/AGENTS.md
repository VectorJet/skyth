# Web Platform (SvelteKit) - Agent Rules

## Import Rules

### Lucide Icons - NEVER use barrel imports
```ts
// WRONG - pulls in ALL 1900+ icon modules, adds 40+ seconds to build
import { Shield, ArrowUp } from '@lucide/svelte';

// CORRECT - deep imports, only loads what you need
import Shield from '@lucide/svelte/icons/shield';
import ArrowUp from '@lucide/svelte/icons/arrow-up';
```

### bits-ui - prefer deep imports where possible
```ts
// Prefer specific imports over barrel re-exports when the library supports it
```

## Dependencies

- Do NOT add dependencies unless they are actually imported in source code.
- Before adding a heavy dependency (dompurify, jsdom, shiki, etc.), consider the SSR build impact - SvelteKit bundles all deps into the server build.
- Run `bun run build` after adding new dependencies to verify build time stays reasonable (target: under 30s).

## Build Performance

- Bundler: `rolldown-vite` (Rust-based Rolldown bundler via `"vite": "npm:rolldown-vite@latest"` in package.json).
- Current baseline: ~22s full build (client ~7s + SSR ~15s), ~1200 modules.
- If module count exceeds ~2000 or build exceeds 30s, investigate barrel imports and unused dependencies first.
- The `@` alias in `svelte.config.js` points to `../../skyth` (the backend). Do not import backend modules into the web frontend unless absolutely necessary - it pulls the entire dependency tree into the Vite build.

### Lazy-loading heavy components

- `svelte-streamdown` and `shiki` are heavy (~640KB client chunk). Markdown and code-highlighted components are lazy-loaded via wrapper components (`LazyMarkdown.svelte`, `LazyReasoningContent.svelte`) using `{#await import(...)}`.
- When adding new components that use `svelte-streamdown` or `shiki`, import the lazy wrappers, not the underlying components directly:
```ts
// WRONG - pulls shiki into the main bundle
import Markdown from "$lib/components/prompt-kit/markdown/Markdown.svelte";

// CORRECT - lazy-loaded, keeps main bundle small
import Markdown from "$lib/components/prompt-kit/markdown/LazyMarkdown.svelte";
// or via barrel export (already points to lazy wrapper)
import { Markdown } from "$lib/components/prompt-kit/markdown";
```
