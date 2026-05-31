# Harness Review: oh-my-pi (2026-05-31)

Repo: https://github.com/can1357/oh-my-pi
Cloned to: refs/harnesses/oh-my-pi
Reviewed against: AGENTS.md / GEMINI.md standards

---

## 1. Overview

oh-my-pi is the upstream monorepo that publishes the packages Skyth was
previously consuming as `@earendil-works/pi-agent-core` and
`@earendil-works/pi-ai`. The upstream now publishes under the
`@oh-my-pi` scope. The monorepo contains:

| Package                   | Description                                         |
|---------------------------|-----------------------------------------------------|
| `packages/ai`             | Multi-provider LLM client (`@oh-my-pi/pi-ai`)       |
| `packages/agent`          | Agent runtime + loop (`@oh-my-pi/pi-agent-core`)    |
| `packages/coding-agent`   | Full coding-agent CLI (primary application)         |
| `packages/tui`            | Terminal UI with diff rendering (`@oh-my-pi/pi-tui`)|
| `packages/natives`        | Rust-backed native bindings                         |
| `packages/mnemopi`        | Memory / embedding backend                          |
| `packages/stats`          | Local observability dashboard                       |
| `packages/utils`          | Shared utilities (`@oh-my-pi/pi-utils`)             |
| `crates/pi-{ast,shell,natives,iso}` | Rust crates for native ops              |

---

## 2. Standard-by-Standard Analysis

### 2.1 Preferred Tooling

| Criteria          | Status | Notes                                                         |
|-------------------|--------|---------------------------------------------------------------|
| bun as runtime    | PASS   | `"packageManager": "bun@1.3.14"` in root package.json        |
| bun for scripts   | PASS   | All scripts use `bun run`, `bun --cwd`, bun shell (`$\`cmd\``) |
| Biome linting     | PASS   | `biome.json` at root, workspace-wide, used in all CI scripts  |
| Biome formatting  | PASS   | tab-indented, semicolons, double-quotes, 120 char line width   |
| rg / fd for search| PASS   | AGENTS.md explicitly recommends `rg`, `fd`, `$which`          |
| uv for Python     | N/A    | Python tooling uses `ruff` + `pip`; no `uv`. Not applicable since we are building TS |

### 2.2 Modular Architecture / LOC Management

| Criteria                        | Status   | Notes                                                       |
|---------------------------------|----------|-------------------------------------------------------------|
| Layered architecture            | PASS     | Clear layer boundaries: ai -> agent -> coding-agent         |
| Barrel exports via index.ts     | PASS     | Every package has clean `index.ts` barrel re-exports        |
| LOC limit (< 400)               | FAIL     | Several files massively exceed 400 LOC:                     |
|                                 |          | - `agent-loop.ts`: 1391 LOC                                 |
|                                 |          | - `agent.ts`: 1210 LOC                                      |
|                                 |          | - `auth-storage.ts`: 4358 LOC                               |
|                                 |          | - `settings-schema.ts`: 3478 LOC                            |
|                                 |          | - `sdk.ts`: ~2800 LOC (coding-agent)                        |
|                                 |          | - `openai-codex-responses.ts`: 3018 LOC                     |
|                                 |          | - `cursor.ts`: 2604 LOC                                     |
|                                 |          | This is expected upstream behavior; Skyth's own code        |
|                                 |          | must stay under 400 LOC regardless.                         |
| ES `#private` fields            | PASS     | `AgentRegistry`, `SecretObfuscator` etc use `#private`      |
| No `private`/`protected` on fields | PASS  | Pattern matches AGENTS.md requirement                       |

### 2.3 Registry-Based Auto-Discovery

| Criteria                        | Status   | Notes                                                       |
|---------------------------------|----------|-------------------------------------------------------------|
| Provider registry               | PASS     | `api-registry.ts` — `registerCustomApi` / `getCustomApi`    |
|                                 |          | with source-ID-based unregistration for extensions          |
| Built-in provider enumeration   | PASS     | `BUILTIN_APIS` Set protects reserved names                  |
| Lazy provider loading           | PARTIAL  | `register-builtins.ts` implements lazy module infrastructure|
|                                 |          | but is NOT yet wired into the streaming path (comment notes)|
| Agent registry                  | PASS     | `AgentRegistry` singleton with event listeners,             |
|                                 |          | status tracking, and `listVisibleTo` for delegation         |
| Extension/plugin loader         | PASS     | `extensibility/extensions/loader.ts` — loads TS extensions  |
|                                 |          | via native Bun import with fail-open error handling         |
| Tool discovery                  | PASS     | `tool-discovery/` directory, capability-based `loadCapability` |
| Manifest contract               | PARTIAL  | Extensions use typed `ExtensionFactory` + `ExtensionAPI`    |
|                                 |          | but no explicit JSON manifest schema with id/version/       |
|                                 |          | entrypoint/capabilities/dependencies/security fields.       |
|                                 |          | Skyth will need to add manifest validation on top.          |

### 2.4 Manifest JSON Contract

Not present in oh-my-pi in its standard form (per AGENTS.md rule 5).
Extensions are loaded as TypeScript modules directly — no JSON manifest files.
Skyth will need to layer its own manifest schema on top of the extension API.

### 2.5 Security and Secret Handling

| Criteria                         | Status | Notes                                                       |
|----------------------------------|--------|-------------------------------------------------------------|
| No plaintext secrets in code     | PASS   | `SecretObfuscator` actively strips secrets from LLM context |
| Obfuscation / replacement        | PASS   | Hash-based placeholder system with deobfuscation for re-use |
| Auth storage                     | PASS   | `auth-storage.ts` — encrypted credential storage            |
|                                  |        | `auth-broker/` — IPC-based credential brokering             |
| Input sanitization               | PASS   | `sanitizeText` from `@oh-my-pi/pi-utils` used in agent-loop |
| No secrets in version control    | PASS   | `.gitignore` covers session files, credential files         |
| Destructive ops confirmation     | N/A    | Handled at tool-execution layer in coding-agent             |
| Config under `~/.skyth/`         | N/A    | oh-my-pi uses `~/.omp/`; Skyth will use `~/.skyth/`         |

### 2.6 Configuration and Schema Validation

| Criteria                    | Status | Notes                                                            |
|-----------------------------|--------|------------------------------------------------------------------|
| Required fields validated   | PASS   | Settings system in `settings-schema.ts` is strongly typed        |
| Zod v4 used                 | PASS   | `import { z } from "zod/v4"` throughout                         |
| Startup validation          | PASS   | Discovery + capability loading validates extensions at load time |
| Actionable errors           | PASS   | Extension loader produces path + reason diagnostics              |

### 2.7 Output / UX / Emoji Policy

| Criteria               | Status | Notes                                                              |
|------------------------|--------|--------------------------------------------------------------------|
| No emoji in logs/CLI   | FAIL   | Emoji present in:                                                  |
|                        |        | - `emoji-autocomplete.ts` (UI feature - intentional)               |
|                        |        | - `theme.ts` (theme symbols - intentional UI icons)                |
|                        |        | - `settings-schema.ts` (tab icons using symbol keys, not raw emoji)|
|                        |        | - test files (test data, not production output)                    |
|                        |        | These are upstream design choices for an interactive TUI.          |
|                        |        | Skyth's own code, logs, and CLI output must remain emoji-free.     |

### 2.8 TypeScript Import Style

| Criteria                        | Status | Notes                                                         |
|---------------------------------|--------|---------------------------------------------------------------|
| No relative cross-package paths | PASS   | Cross-package: always `@oh-my-pi/pkg-name` package references |
| Relative within same package    | PASS   | Within a package: relative imports like `./module`, `../utils`|
| No `@/` alias                   | N/A    | oh-my-pi uses workspace package names, not `@/` aliases.      |
|                                 |        | Skyth rule requires `@/` -> `skyth/`. These are compatible    |
|                                 |        | as long as Skyth's tsconfig maps `@/` to its source root.     |
| `verbatimModuleSyntax`          | PASS   | Enabled in `tsconfig.base.json`                               |
| No inline dynamic imports       | PASS   | AGENTS.md explicitly bans `await import()` in type positions  |
| No `ReturnType<>`               | PASS   | AGENTS.md explicitly bans `ReturnType<>`                      |

### 2.9 Delegation / Agent Safety

| Criteria                         | Status | Notes                                                       |
|----------------------------------|--------|-------------------------------------------------------------|
| Agent registry with status       | PASS   | `AgentRegistry.listVisibleTo()` excludes completed/aborted  |
| Subagent support                 | PASS   | `AgentRef` has `parentId` for hierarchy tracking            |
| Bounded delegation depth         | PARTIAL| No explicit depth cap visible in the registry or loop.      |
|                                  |        | Skyth will need to add bounded depth on delegation.         |
| Circular-call prevention         | PARTIAL| Not explicitly enforced in registry. Skyth must add this.   |
| Interrupt / steer mechanism      | PASS   | `interruptMode: "immediate" | "wait"` in `AgentLoopConfig`  |

### 2.10 Key Architectural Assets for Skyth

The following components from oh-my-pi are directly usable:

| Asset                          | Location                              | Value for Skyth                     |
|--------------------------------|---------------------------------------|--------------------------------------|
| `streamSimple` / `stream`      | `packages/ai/src/stream.ts`           | Core LLM streaming, multi-provider   |
| `agentLoop` / `agentLoopContinue` | `packages/agent/src/agent-loop.ts`| Full tool-calling loop               |
| `Agent` class                  | `packages/agent/src/agent.ts`         | Stateful agent with steer/followUp   |
| `registerCustomApi`            | `packages/ai/src/api-registry.ts`     | Runtime provider registration        |
| `AgentRegistry`                | `packages/coding-agent/src/registry/` | Live session tracking                |
| `ExtensionRuntime` / loader    | `packages/coding-agent/src/extensibility/` | Plugin system baseline          |
| `SecretObfuscator`             | `packages/coding-agent/src/secrets/`  | Secret scrubbing from LLM context    |
| Telemetry / OpenTelemetry      | `packages/agent/src/telemetry.ts`     | Span-based observability             |
| `AppendOnlyContextManager`     | `packages/agent/src/append-only-context.ts` | Context window strategy       |

---

## 3. Gap Analysis: What Skyth Must Add

These are capabilities present in AGENTS.md requirements that oh-my-pi does
not provide and Skyth will need to build:

1. **JSON Manifest Contract** (rule 5): oh-my-pi uses TypeScript module
   factories. Skyth must layer `manifest.json` files with id/name/version/
   entrypoint/capabilities/dependencies/security, and validate them with Zod
   at load time.

2. **`@/` Path Alias** (rule 2): oh-my-pi uses workspace package references.
   Skyth's own source code must use the `@/` alias (mapped to `skyth/` dir).
   Add path alias to tsconfig: `"@/*": ["skyth/*"]`.

3. **Bounded Delegation Depth** (rule 3): No hard cap in oh-my-pi's agent
   registry. Skyth must add a max delegation depth (e.g. 5) and circular-call
   detection using the `parentId` chain.

4. **Fail-open Plugin Discovery** (rule 4): oh-my-pi's extension loader does
   handle errors per extension, but Skyth needs explicit registry-level fail-
   open semantics with deterministic load order.

5. **`~/.skyth/` Config Path** (rule 6): oh-my-pi uses `~/.omp/`. Skyth config,
   sessions, and credentials go under `~/.skyth/` with 0700 permissions.

6. **No-emoji Output Policy** (rule 8): oh-my-pi's TUI uses emoji for visual
   chrome. Skyth CLI/log output must be emoji-free. Any UI symbols must use
   named symbol tables, not raw emoji in output strings.

---

## 4. Version Delta: Earendil vs Oh-My-Pi

The legacy-ts2 code used `@earendil-works/pi-agent-core@0.75.5` and
`@earendil-works/pi-ai@0.75.5`. The current upstream is
`@oh-my-pi/pi-agent-core@15.7.2` and `@oh-my-pi/pi-ai@15.7.2`.

This is a major version jump. Expect breaking API changes. Key differences
observed during review:

- Import namespace: `@earendil-works/` -> `@oh-my-pi/`
- `models.json` is now 1.7 MB (greatly expanded model catalog)
- OpenAI Codex Responses provider added (3018 LOC)
- Auth broker / gateway added (`auth-broker/`, `auth-gateway/`)
- Cursor provider added (protocol buffer based)
- `HarmonyLeak` detection added to agent loop (GPT-5 protocol leak mitigation)
- `AgentRunCoverage` and `AgentRunSummary` telemetry on the loop

---

## 5. Conclusion

oh-my-pi is a solid, production-grade foundation. It aligns with Skyth
standards on tooling (bun, biome), provider architecture, extension loading,
and security patterns. The gaps are well-defined and additive:

- Manifest JSON validation (Skyth-specific rule)
- `@/` path alias (Skyth-specific convention)
- Bounded delegation depth + circular call prevention
- `~/.skyth/` config path
- Emoji-free output enforcement in Skyth-owned code

The monorepo is reference-quality and safe to build on top of.

Recommended next step: start fresh Skyth repo structure using
`@oh-my-pi/pi-agent-core` and `@oh-my-pi/pi-ai` as peer dependencies,
layer the manifest registry, `@/` alias, and delegation safety controls.
