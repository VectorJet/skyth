# Quasar Sidecar Questions

**Date:** 2026-05-18
**Context:** Quasar is being re-scoped from the older 5-layer memory concept into a first-tier gateway sidecar that owns private database-backed VFS files, heartbeats, cron, memory, Epsilon version control, Logic Gate Protocol, and state management.

## Storage and VFS Boundary

1. Should `auth.quasardb` and `main.quasardb` be the only database-backed VFS files in `private/`, or should every private Quasar store be exposed through the same VFS abstraction?
2. Should `auth.quasardb` contain only authentication and key material, or should it also contain policy, grants, agent identity, and capability records?
3. Should `main.quasardb` be an encrypted SQLite database, encrypted JSONL, a custom append-only QuasarDB format, or a SQLite database with append-only event tables?
4. Where should Quasar physically store agent data by default: `~/.skyth/agents/{agent_id}/private/`, `~/.skyth/quasar/`, or a gateway-level root shared across agents?
5. Should each agent get separate `auth.quasardb` and `main.quasardb` files, or should Quasar maintain one global authority database with per-agent partitions?

## Authority Model

6. You described Quasar as a first-tier gateway process with more authority than the user. What does "more authority than the user" mean operationally on Linux/macOS/WSL, where the OS normally limits a process to the current user unless it runs with elevated privileges?
7. Should Quasar run as the same OS user, a dedicated `skyth` service user, root/admin with privilege dropping, or platform-specific service accounts?
8. Which operations require explicit user approval even when Quasar has authority: reading sensitive paths, writing user files, deleting files, exporting private memory, restoring Epsilon snapshots, running cron jobs, or all destructive actions?
9. Should agents be able to request privileged Quasar operations directly, or must they go through a gateway policy decision and audit event first?
10. If Quasar and the user disagree, which wins: direct user filesystem changes, Quasar policy, or an interactive approval flow?

## Private Data and Export

11. What is the intended export model for sensitive Quasar data: decrypted file export, redacted export, portable encrypted bundle, or all three?
12. Should exported private data remain linked to the Quasar audit log, or should export create a standalone user-owned copy outside Quasar control?
13. Should Quasar support selective export by namespace, event range, agent, memory type, or file path?
14. What is the expected unlock model for encrypted private data: password, OS keychain, hardware key, recovery phrase, or gateway-held key?

## Heartbeats, Cron, and State

15. Are heartbeats and cron jobs global gateway services, per-agent services, or both?
16. Should cron jobs run with the initiating agent's permissions, Quasar's permissions, or a constrained scheduled-task permission profile?
17. Should heartbeat state be stored in `main.quasardb`, a separate state database, or normal workspace files?
18. Should Quasar own all gateway state transitions, or only durable state while the gateway owns live runtime state?

## Epsilon Version Control

19. Should Epsilon snapshot only the agent workspace, the private Quasar VFS, selected user filesystem mounts, or all three?
20. Should Epsilon snapshots be event-level by default for every Quasar event, or only for mutating operations and explicit checkpoints?
21. Should Epsilon restore be allowed to modify user filesystem mounts, or should it restore only Skyth-owned workspace/private paths unless the user explicitly approves?
22. Does Epsilon need to version database-backed VFS contents at the logical event level, the raw database file level, or both?

## LGP and Tool Execution

23. Should LGP execution live inside Quasar, or should Quasar only persist/audit LGP plans while the gateway/tool runtime executes them?
24. Should LGP be allowed to invoke privileged Quasar operations directly, or should every LGP step pass through the same tool policy and approval system as normal agent tools?
25. Is Nushell still the target execution substrate for LGP, or should LGP be implemented as a typed internal DAG executor first with shell integration as an adapter?

## Layering and Compatibility

26. Should the older Quasar 5-layer design remain part of the new spec, or should it be simplified into canonical event store + indexes + cache?
27. Are PostgreSQL, pgvector, ChromaDB, and Redis still desired optional layers, or should the first implementation avoid external services entirely?
28. Should the old Solar/Nebula branch model remain the primary conversation branching model, or should it be merged with Epsilon's tick graph?
29. Should Quasar expose a stable local API over IPC, HTTP, Unix socket/named pipe, or direct library calls?
30. What is the minimum viable Quasar v1 that you want specified first?
