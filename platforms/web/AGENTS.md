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
- Run `bun run build` after adding new dependencies to verify build time stays reasonable (target: under 60s).

## Build Performance

- Current baseline: ~45s full build (SSR + client), ~1200 modules.
- If module count exceeds ~2000 or build exceeds 60s, investigate barrel imports and unused dependencies first.
- The `@` alias in `svelte.config.js` points to `../../skyth` (the backend). Do not import backend modules into the web frontend unless absolutely necessary - it pulls the entire dependency tree into the Vite build.
