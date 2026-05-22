# Skyth

An agent runtime built with TypeScript/Bun and a Rust durability layer (Quasar).

Skyth synthesizes ideas from Claude Code, Codebuff, Hermes, Nanobot, OpenClaw,
OpenCode, Pi, and legacy Skyth TS into a single modular, registry-driven system.

## Architecture

### Language Stack

| Layer    | Language    | Responsibility                                                 |
| -------- | ----------- | -------------------------------------------------------------- |
| Runtime  | TypeScript  | Agent loop, gateway, MCP, registries, providers, CLI, tools    |
| State    | Rust        | Encrypted durable state, IPC, VFS, auth, memory, cron, Epsilon |
| Optional | Python      | Plugin/tool runtime only, not primary loop                     |

### Component Layers

```mermaid
graph TB
    subgraph Surfaces["Surfaces"]
        CLI
        Web["Web UI"]
        TUI
        TG["Telegram"]
        DC["Discord"]
        MCP["MCP Clients"]
    end

    subgraph Gateway["Gateway Layer"]
        Router["Message Router"]
        Channels["Channel Manager"]
        Registry["Registries<br/>tools / mcp / skills<br/>pipelines / agents"]
        Hooks["Lifecycle Hooks"]
    end

    subgraph Core["Core Runtime"]
        ORCH["AgentRunOrchestrator<br/>thread routing, persistence,<br/>scheduling, delegation"]
        SR["StepRunner<br/>model/tool iteration"]
        TE["ToolExecutor<br/>dispatch, concurrency,<br/>permission hooks"]
        MEM["Memory Manager<br/>capsules, providers, decay"]
        DEL["Delegation Controller<br/>depth enforcement,<br/>circular-call prevention"]
    end

    subgraph Providers["Provider Layer"]
        AI["AI SDK Provider"]
        OAI["OpenAI Provider"]
        REG["Provider Registry"]
    end

    subgraph Quasar["Quasar Layer (Rust)"]
        VFS["VFS Abstraction"]
        AUTH["auth.quasardb<br/>ACL + Crypto"]
        MAIN["main.quasardb<br/>SQLite + sqlite-vec"]
        EPS["Epsilon VC<br/>CDC + BLAKE3 + CAS"]
        IPC["IPC<br/>Unix Sockets / Named Pipes"]
    end

    Surfaces --> Gateway
    Gateway --> ORCH
    ORCH --> SR
    SR --> TE
    ORCH --> MEM
    ORCH --> DEL
    SR --> Providers
    ORCH --> Quasar
    MEM --> Quasar
    DEL --> TE
```

## Core Runtime

### Two-Layer Agent Loop

```mermaid
sequenceDiagram
    participant Surface as Surface (CLI/Gateway)
    participant O as AgentRunOrchestrator
    participant SR as StepRunner
    participant P as Provider
    participant TE as ToolExecutor
    participant Q as Quasar

    Surface->>O: run(input)
    O->>O: resolve thread + agent
    O->>Q: load thread state
    O->>O: build initial context
    O->>SR: execute(snapshot)

    loop each step
        SR->>SR: contextBuilder.build(snapshot)
        SR->>P: stream(request)
        P-->>SR: ProviderEvent stream
        SR->>SR: collectNormalizedEvents()
        SR->>TE: validate + execute tool calls
        TE-->>SR: tool results
        SR->>SR: appendAssistantAndToolResults()
        SR->>SR: stopPolicy.shouldStop()?
    end

    SR-->>O: run result
    O->>Q: persist run events
    O-->>Surface: delivery
```

**AgentRunOrchestrator** (outer layer) owns:
- Input normalization from CLI, gateway, channels, cron
- Thread lookup, routing, locking
- Quasar-backed run/step/message persistence
- Memory and context prefetch
- Compaction scheduling and retry
- Model selection and fallback
- Cancellation and interruption
- Heartbeat, cron, and resume scheduling
- Delegation depth and circular-call enforcement

**StepRunner** (inner layer) is harness-neutral:
```text
while not done:
  request = contextBuilder.build(snapshot)
  stream = provider.stream(request)
  step = collectNormalizedEvents(stream)
  checkedCalls = toolPolicy.validate(step.toolCalls)
  results = toolExecutor.execute(checkedCalls)
  appendAssistantAndToolResults(step, results)
  done = stopPolicy.shouldStop(step, results)
```

The StepRunner knows nothing about Telegram, HTTP, MCP transport,
Quasar internals, or channel-specific delivery.

## Threads

User-facing sessions are called **threads**. Every surface owns its own thread
graph.

```mermaid
graph LR
    subgraph Surfaces
        WEB["Web Tab"]
        TG["Telegram DM"]
        CLI["CLI Session"]
    end

    subgraph Threads
        T1["thread:abc<br/>web"]
        T2["thread:def<br/>telegram"]
        T3["thread:ghi<br/>cli"]
        T4["thread:jkl<br/>forked"]
    end

    WEB --> T1
    TG --> T2
    CLI --> T3
    T3 -- "forked_from" --> T4
    T4 -- "merged_into" --> T1
    T2 -- "handoff_to" --> T3
```

Thread tools:
- `thread:read` -- load thread history
- `thread:search` -- search across threads
- `thread:handoff` -- continue in a new thread
- `thread:merge` -- merge two threads
- `thread:switch` -- switch active thread
- `thread:list` -- list threads for current surface
- `thread:compact` -- compact thread context

## Agent Hierarchy

```mermaid
graph BT
    subgraph Subagents["Disposable Subagents"]
        DEBUG["debug-agent"]
        TEST["test-agent"]
        PARSE["parser-agent"]
    end

    subgraph Specialists["Specialized Agents"]
        CODE["code-agent"]
        RESEARCH["research-agent"]
        DATA["data-agent"]
    end

    subgraph Generalist
        GEN["Generalist Agent<br/>default top-level agent"]
    end

    DEBUG --> CODE
    TEST --> CODE
    PARSE --> DATA
    CODE --> GEN
    RESEARCH --> GEN
    DATA --> GEN
```

Rules:
- Max delegation depth enforced centrally
- No circular delegation
- Subagents cannot delegate
- Subagents receive narrow tool sets
- Parent receives structured results

## Delegation Safety

```mermaid
stateDiagram-v2
    [*] --> CheckDepth: delegate(task)
    CheckDepth --> CheckCircular: depth < max
    CheckDepth --> Reject: depth >= max
    CheckCircular --> CheckRepeat: no repeat in path
    CheckCircular --> Reject: circular detected
    CheckRepeat --> Execute: agent not in path
    CheckRepeat --> Reject: repeat detected
    Execute --> ReturnResult
    ReturnResult --> [*]
    Reject --> [*]
```

## Quasar State Layer

Quasar is Skyth's encrypted durable state authority -- written in Rust.

```mermaid
graph TB
    subgraph QuasarProcess["Quasar Daemon (Rust)"]
        IPC["IPC Server<br/>Unix Socket / Named Pipe"]

        subgraph Databases["QuasarDB Files"]
            AUTH["auth.quasardb<br/>AES-256 + Argon2id<br/>username, password,<br/>device fingerprint"]
            MAIN["main.quasardb<br/>AES-256 + sqlite-vec<br/>events, vectors,<br/>agent workspace"]
            CUSTOM["custom.quasardb<br/>user/agent created"]
        end

        subgraph Services
            VFS["Virtual File System<br/>namespaces, paths,<br/>read/write/delete/export"]
            EPSILON["Epsilon VC<br/>content-defined chunking<br/>BLAKE3 + dedup + CAS"]
            HR["Heartbeat<br/>Generalist-routed"]
            CRON["Cron<br/>per-job permissions"]
            MEM["Memory Store<br/>structured records"]
            QUEUE["Message Queue"]
            STATE["State Store"]
        end

        IPC --> VFS
        VFS --> AUTH
        VFS --> MAIN
        VFS --> CUSTOM
        EPSILON --> MAIN
        HR --> VFS
        CRON --> VFS
        MEM --> VFS
    end

    subgraph SkythProcess["Skyth Runtime (TS/Bun)"]
        CLIENT["Quasar IPC Client<br/>skyth/quasar/client.ts"]
        ADAPTER["Gateway Quasar Adapters<br/>skyth/gateway/durable/"]
    end

    CLIENT --> IPC
    ADAPTER --> CLIENT
```

### Epsilon Branch Taxonomy

```mermaid
graph LR
    SOLAR["Solar Branch<br/>user direct edits"]
    NEBULA["Nebula Branch<br/>agent/Quasar changes"]
    GALAXY["Galaxy Branch<br/>exports"]
    MAIN_BRANCH["Main"]

    SOLAR --> MAIN_BRANCH
    NEBULA --> MAIN_BRANCH
    GALAXY --> MAIN_BRANCH
```

Conflict resolution: no global winner. User edits create Solar branches,
agent changes create Nebula branches. The agent handles conflict resolution
during merge.

## Capability Lifecycle

Every created capability follows a lifecycle from ephemeral to permanent:

```mermaid
graph LR
    S["scratch<br/>run-local, discarded<br/>unless promoted"] --> T["temporary<br/>session/project-local<br/>expires or reviewed"]
    T --> C["candidate<br/>persisted but<br/>experimental/untrusted"]
    C --> P["permanent<br/>validated, approved,<br/>actively maintained"]
    P --> CORE["core<br/>bundled/versioned<br/>with Skyth"]
```

Promotion gates:
- Valid manifest and `.ax` sidecar
- Declared permissions and security model
- Duplicate and conflict check
- Successful smoke test or explicit waiver
- Usage or user approval signal
- No secret leakage
- Audit event written

## Registry Auto-Discovery

All extensible capabilities register via manifest JSON:

```json
{
  "id": "my-tool",
  "name": "My Tool",
  "version": "1.0.0",
  "entrypoint": "./index.ts",
  "capabilities": ["tool:execute"],
  "dependencies": [],
  "security": {
    "permissions": ["filesystem:read"]
  }
}
```

Registry domains: providers, channels, tools, agents, skills, plugins, MCP,
pipelines.

Fail-open policy: a broken external plugin must not block internal discovery.

## Project Structure

```
skyth/              TypeScript/Bun source tree
  agents/           Concrete agent definitions
  api/              API routes
  base/             Base agent runtime (orchestrator, step-runner, tools,
                    delegation, session, context, memory, manifests, plugins)
  cli/              CLI commands and onboarding wizard
  config/           Config loading, schema validation, secret store
  core/             Core compatibility exports
  cron/             Cron service wrapper
  gateway/          Gateway server, channels, MCP, registries, runners,
                    hooks, lifecycle, memory stores
  providers/        Provider adapters (AI SDK, OpenAI, registry)
  quasar/           TypeScript IPC client, protocol, daemon lifecycle
  utils/            Shared utilities, templates
quasar/             Rust crate (auth, crypto, Epsilon, IPC, services, VFS)
specs/              Architecture specifications and handoffs
  core/             Core runtime specs (hybrid-agent-loop)
  quasar/           Quasar specs (quasar-v1)
  progress/         Current progress tracking
  handoffs/         Agent handoff documents
tests/              Test suite (132+ tests)
```

## Quick Start

```bash
# Install dependencies
bun install

# Build CLI binary
bun run build:bin

# Run typecheck
bun run typecheck

# Run tests
bun test tests/

# Start CLI
bun run start --help

# Start gateway server
bun run gateway
```

## Project Status

Active development. See [specs/progress/Progress.md](specs/progress/Progress.md)
for current status and next steps.

Architecture decisions are documented in:
- [Skyth Next Runtime and Capability System](specs/skyth-next-runtime-and-capabilities.md)
- [Hybrid Agent Loop](specs/core/hybrid-agent-loop.md)
- [Quasar v1 Specification](specs/quasar/quasar-v1.md)

Contributor policies are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
