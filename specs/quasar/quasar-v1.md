# Quasar v1 Specification

**Status:** Draft v1 scope
**Date:** 2026-05-18
**Source of truth:** `.agents/answers/2026-05-18/quasar-sidecar-answers.md`

## Purpose

Quasar is Skyth's first-tier local state authority. It owns durable state transitions across the Skyth ecosystem and provides the storage, versioning, scheduling, and IPC primitives that agents and surfaces use to coordinate work.

The old Quasar 5-layer memory design is retired. Quasar v1 is built around a universal VFS abstraction backed by encrypted `*.quasardb` databases, plus Epsilon version control and local IPC.

## Non-Goals

The following are explicitly out of scope for v1:

- Legacy 5-layer Quasar architecture compatibility.
- External service dependencies such as PostgreSQL, pgvector, ChromaDB, or Redis.
- Network API surface for Quasar.
- `quasar-cli`.
- Recovery mode.
- Custom per-quasardb passwords.
- LGP design and tool execution semantics.
- Plugin architecture implementation.

## Process Authority

Quasar runs as the same OS user as Skyth. It does not require root, sudo, service accounts, or OS-level privilege escalation.

Quasar's higher authority is logical and scheduling authority:

- Quasar-originated messages are handled before normal user messages.
- A user message arriving while Quasar is active is queued or stacked for a later model call.
- Quasar owns ecosystem state transitions for the gateway, desktop, Android, web, CLI, and agent runtime surfaces.

The Generalist agent acts as the system process for the Skyth ecosystem. Heartbeats and cron jobs land at the Generalist first; the Generalist may delegate cron work to other agents.

## Storage Layout

The default physical storage root is:

```text
~/.skyth/agents/{agent_id}/private/
```

Quasar ships with two default databases:

```text
auth.quasardb
main.quasardb
```

These are not special-case storage engines. All `*.quasardb` files use the same VFS abstraction and database format. Agents and users may create additional quasardbs using the same rules.

`auth.quasardb` is global. It governs all quasardbs.

`main.quasardb` may be global or per-agent. Global is the default.

## QuasarDB Format

Every `*.quasardb` is a SQLite database using `sqlite-vec`.

Required properties:

- Single-file SQLite database.
- Vector storage through `sqlite-vec`.
- Append-only event tables.
- No in-place mutation for historical events.
- AES-256 encryption at rest.
- Random salt per database.
- Argon2id key derivation.
- Uniform VFS tooling across all quasardbs.

`main.quasardb` acts as both event store and vector database.

## Auth Database

`auth.quasardb` contains only:

- Username and superuser password material set at onboarding.
- Per-quasardb permission grants.
- Device fingerprint.

It must not become a general policy store, memory store, app config store, or event store.

The device fingerprint is a hash derived from local system facts such as kernel version, architecture, OS version, and related system strings. Raw system strings should not be stored.

## Unlock Model

Primary unlock requires:

- Superuser password.
- Matching device fingerprint.

Each quasardb stores its database password encrypted in its own header or footer. Future recovery mode may unlock with the password regardless of device fingerprint. Recovery mode is not v1 scope.

## Permission Model

Permission enforcement is Quasar-layer enforcement, not OS permission enforcement.

Default rules:

- Read access is open by default across all agents.
- Write access requires explicit permission from the Generalist.
- The Generalist has unconditional read/write access to every agent workspace.

Gateway mediation is mandatory for all agent-to-Quasar interactions. Agents do not directly bypass the gateway to perform privileged Quasar operations.

Mandatory prompts:

- File/data delete prompts the user.
- Entire quasardb delete prompts the user and first snapshots to temp.
- Explicit override commands may bypass the quasardb delete prompt.

Read, write, and edit operations do not prompt by default. Epsilon versioning is the safety net. Agents may still choose to ask before accessing sensitive data.

## VFS

The VFS abstraction is universal across Quasar. It applies to default and custom quasardbs.

The VFS must support:

- Namespaces.
- File paths.
- Read/write/edit operations.
- Delete operations with policy hooks.
- Export by namespace, event range, agent, memory type, and file path.
- Audit event creation for relevant operations.
- Consistent access checks through `auth.quasardb`.

The VFS is the new primitive replacing the old Quasar layer stack.

## Export

Quasardb export produces a zip or tar archive of VFS contents.

Export modes:

- Full quasardb export.
- Selective export by namespace.
- Selective export by event range.
- Selective export by agent.
- Selective export by memory type.
- Selective export by file path.

Exports do not require mandatory re-encryption. Contents are exported as they exist in the VFS.

Every export creates:

- A Quasar audit event.
- A Galaxy branch in Epsilon containing exactly the exported contents.

## Branch Taxonomy

Quasar and Epsilon share one unified graph.

Branch types:

- Solar: user direct edits.
- Nebula: agent or Quasar changes.
- Galaxy: exports.

Conflict handling:

- User direct edit creates a Solar branch.
- Quasar or agent change creates a Nebula branch.
- Epsilon immediately switches to Solar when the user edit takes effect.
- Branches merge into main.
- The agent handles conflict resolution.

No global winner is declared between user and Quasar changes.

## Epsilon

Epsilon is Skyth's byte-level version control system.

Snapshot scope:

- Agent workspace.
- Private Quasar VFS.
- Per-project `.skyth/epsilon/` folders.
- User filesystem mounts when covered by Quasar administrative authority.

Snapshot mode is configurable:

- Time-based mode is the default. Snapshot every configured interval and drop unchanged snapshots.
- Storage-unconstrained mode keeps every snapshot even if the diff is empty.

Epsilon storage is content-addressed and uses content-defined chunking with deduplication across snapshots.

Epsilon does not interpret logical event semantics. It sees bytes. Quasar owns logical event awareness.

Restore rules:

- Epsilon may restore user filesystem mounts.
- Restore requires one user prompt before it starts.
- Append-only Quasar history means restore is forward/backward navigation, not destructive rollback.

Operating modes:

- Event-based VC mode creates Epsilon branches in lockstep with Quasar events.
- Tick-based mode snapshots all branches accumulated since the last tick.

## Heartbeats

Heartbeats are global gateway services routed only to the Generalist.

Rules:

- Non-delegatable.
- Stored in `HEARTBEAT.md`.
- `HEARTBEAT.md` uses YAML frontmatter between `---` separators.

## Cron

Cron is a global gateway service routed to the Generalist first.

Rules:

- The Generalist may delegate cron tasks to other agents.
- Each cron job carries its own permission profile set at creation time.
- There is no blanket cron permission profile.

## IPC

Quasar exposes a local IPC API only:

- Unix domain sockets on Linux and macOS.
- Named pipes on Windows.

Quasar v1 must not expose a network API. Local IPC keeps the process local and avoids network stack overhead.

## Gateway Integration

Gateway mediates all agent and surface interactions with Quasar.

Required gateway responsibilities:

- Authenticate IPC clients.
- Route agent requests to Quasar.
- Enforce operation mediation.
- Preserve Quasar priority in scheduling.
- Record or forward audit events.
- Keep all Quasar access local.

## State Ownership

Quasar owns state transitions for:

- Gateway.
- Skyth desktop.
- Android.
- Web.
- CLI.
- Agent runtime.
- Heartbeats.
- Cron.
- Memory.
- Epsilon.

Surfaces may keep live UI state, but durable state transitions belong to Quasar.

## v1 Deliverables

Quasar v1 includes:

- Universal VFS abstraction.
- `auth.quasardb`.
- `main.quasardb`.
- SQLite + `sqlite-vec` quasardb format.
- AES-256 encryption with Argon2id key derivation.
- Device fingerprint auth.
- Global/per-agent permission model.
- Gateway-mediated agent access.
- Heartbeat service state ownership.
- Cron service state ownership.
- Epsilon version control with CDC and deduplication.
- Solar, Nebula, and Galaxy branch taxonomy.
- Time-based snapshots.
- Local IPC over Unix sockets or named pipes.

## Open Deferred Areas

The following need separate specs after Quasar core is accepted:

- LGP and tool execution.
- `quasar-cli`.
- Recovery mode.
- Plugin architecture.
- Custom per-quasardb passwords.
- Cross-device migration and device rebind.
- Detailed SQLite schema.
- Detailed IPC message schema.
- Detailed Epsilon chunk format.

## See Legacy Skyth(ts) Implementation

- For Onboarding Reference(vaugely)
- Superuser Password(vaugely)
- Currunt Implementation doesn't have those features 
- shared logic or bindings in skyth/shared/quasar/