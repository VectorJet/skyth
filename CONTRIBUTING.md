# Contributing to Skyth

## Project Structure

```
skyth/          TypeScript/Bun source tree
  agents/       Concrete agent definitions
  base/         Base agent runtime, tools, delegation, session, context, memory
  cli/          CLI commands and onboarding wizard
  config/       Config loading, schema validation, secret store
  core/         Core compatibility exports
  cron/         Cron service wrapper
  gateway/      Gateway server, channels, MCP, registries
  providers/    Provider adapters (AI SDK, OpenAI, etc.)
  quasar/       TypeScript client for Quasar Rust IPC
  utils/        Shared utilities
quasar/         Rust crate (encrypted durable state layer)
specs/          Architecture specifications and progress tracking
tests/          Test suite
```

## Development Setup

```bash
bun install
```

## Commands

| Command                  | Purpose              |
| ------------------------ | -------------------- |
| `bun run build:bin`      | Build binary         |
| `bun run typecheck`      | Run typecheck        |
| `bun test tests/`        | Run tests            |
| `bunx @biomejs/biome format --write` | Format code |
| `bunx @biomejs/biome lint` | Lint code          |

## Policies

### File Size

Files must stay under 400 LOC. Files approaching 350 LOC should be split into
focused modules. Run `./scripts/loc_check.sh` after any changes to verify.

### Imports

All TypeScript imports must use absolute paths with the `@/` prefix:

```ts
// Correct
import { Manager } from "@/channels/manager";

// Incorrect
import { Manager } from "../../channels/manager";
```

The `@/` alias maps to `skyth/`.

### Formatting and Linting

Formatting uses Biome. Run `bunx @biomejs/biome format --write` before
committing. Lint with `bunx @biomejs/biome lint`.

### Architecture

- Keep layered architecture: runtime/agent loop, tool execution, memory/session
  state, channel/platform adapters, provider/model integration.
- All extensible capabilities must register via registry + manifest, not
  hard-coded imports.
- Every discoverable module must expose a manifest JSON with `id`, `name`,
  `version`, `entrypoint`, `capabilities`, `dependencies`, and `security`.

### Security

- Never store secrets in plaintext.
- Hash passwords/keys where hashing is appropriate; encrypt stored
  credentials/tokens where retrieval is required.
- Never commit tokens, secrets, or credential-bearing files.
- Destructive operations require explicit approval.
- Validate and sanitize all untrusted inputs.

### No Emoji

Do not use emoji in logs, CLI output, docs, status markers, code comments,
or code itself.

### Delegation Safety

- Bounded max delegation depth.
- No circular delegation.
- Subagents cannot delegate.
- Subagents receive narrow tool sets.

## Code of Conduct

This project follows a Contributor Code of Conduct. By participating, you
are expected to uphold this code. Please report unacceptable behavior to the
project maintainers.

## Questions

If you have questions about architecture decisions, open a question in
`.agents/questions/` following the existing format.
