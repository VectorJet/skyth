# Quasar Design Decisions
**Date:** 2026-05-18  
**Status:** v1 Scoped

---

## Storage and VFS Boundary

**Q1 — VFS abstraction scope**  
The VFS abstraction is universal. `auth.quasardb` and `main.quasardb` are the defaults that ship with Quasar, not special-cased singletons. Agents and users can create additional custom quasardbs — all follow the same VFS abstraction.

**Q2 — auth.quasardb contents**  
`auth.quasardb` contains strictly:
- Username + superuser password (set at onboarding)
- Per-quasardb permission grants (read/write/etc)
- Device fingerprint (hash of kernel version, architecture, OS version, and other system strings — mangled together)

Nothing else. It is the ACL layer and cryptographic root of trust, not a general policy store.

**Q3 — main.quasardb format**  
`main.quasardb` is a **sqlite-vec** database (SQLite + vector extension in one file):
- Append-only event tables (no in-place mutation)
- Encrypted with AES-256, random salt, Argon2id KDF
- Doubles as both event store and vector database

All quasardbs follow this same format — tooling is uniform across the ecosystem.

**Q4 — Physical storage path**  
Default path: `~/.skyth/agents/{agent_id}/private/`

Permission model (enforced at Quasar layer, not OS):
- **Read**: open by default across all agents
- **Write**: requires explicit permission from Generalist
- **Generalist**: god-mode, can read and write any agent's workspace unconditionally

**Q5 — Per-agent vs global databases**  
- `auth.quasardb`: single global instance, one superuser password governs all quasardbs
- `main.quasardb`: flexible — can be global or per-agent, both supported, global is the default
- Custom per-quasardb passwords: future `quasar-cli` feature, not v1 scope

---

## Authority Model

**Q6 — "More authority than the user" defined**  
Logical/scheduling authority, not OS privilege escalation. Quasar has message priority over user:
- Quasar message arrives → agent handles it first, uninterrupted
- User message during Quasar handling → either stacked (queued for next API call) or queued (waits until agent is fully done)

**Q7 — OS user**  
Same OS user. No privilege escalation, no service accounts, no sudo required.

**Q8 — Operations requiring user approval**  
- Read / write / edit: no prompt (Epsilon versioning is the safety net)
- Delete (file/data): prompts user
- Delete entire quasardb: auto-snapshots to temp before deletion, prompts user — can be bypassed with explicit override command

**Q9 — Agent access to privileged Quasar operations**  
Gateway mediates all agent ↔ Quasar interactions. No mandatory approval prompts. Agents can optionally choose to prompt the user before accessing sensitive data (e.g. SSN, keys).

**Q10 — Conflict resolution (user vs Quasar/agent)**  
No winner declared. Conflict forks into branches:
- User direct edit → **Solar branch**
- Quasar/agent change → **Nebula branch**
- Epsilon auto-switches to Solar (user change takes immediate effect)
- Both branches merge into main; agent handles conflict resolution

---

## Private Data and Export

**Q11 — Export model**  
A quasardb export is a zip or tar archive of all VFS contents. Selective export (specific files) also supported. No mandatory re-encryption step — contents are exported as-is from the VFS.

**Q12 — Audit linkage**  
Export creates two things simultaneously:
- Audit log entry (Quasar records the export event)
- **Galaxy branch** in Epsilon containing exactly the exported contents

Branch taxonomy: Solar (user edits), Nebula (agent/Quasar changes), Galaxy (exports).

**Q13 — Selective export axes**  
Full granularity supported. Can export by:
- Namespace
- Event range
- Agent
- Memory type
- File path

**Q14 — Unlock model**  
- **Primary unlock**: superuser password + device fingerprint (hash of kernel version, arch, OS version, etc.)
- **Device binding**: auth.quasardb stores the fingerprint — raw db copy on a different machine won't open without recovery
- **Recovery**: every quasardb has its password stored encrypted in its own header/footer — `quasar-cli recovery` mode lets you unlock with just the password regardless of device fingerprint

---

## Heartbeats, Cron, and State

**Q15 — Global vs per-agent**  
Both are global gateway services:
- **Heartbeats**: Generalist only, non-delegatable
- **Cron jobs**: land at Generalist first, Generalist can delegate to other agents if desired

Generalist is the system process / init of the Skyth ecosystem.

**Q16 — Cron job permissions**  
Per-cron configurable. No blanket permission profile — each cron job carries its own permission profile set at creation time.

**Q17 — Heartbeat state storage**  
Stored in `HEARTBEAT.md` with YAML frontmatter between `---` breaks, consistent with existing harness pattern.

**Q18 — State transition ownership**  
Quasar owns all state transitions across the entire Skyth ecosystem:
- Gateway
- Skyth desktop
- Android
- Web
- CLI

Quasar is the central nervous system of all of Skyth, not just a gateway sidecar.

---

## Epsilon Version Control

**Q19 — Epsilon snapshot scope**  
Epsilon snapshots everything in the Skyth ecosystem:
- Agent workspace
- Private Quasar VFS
- Per-project `.skyth/epsilon/` folders (each project carries its own Epsilon history locally)
- Periodic by default (time-based)

**Q20 — Snapshot modes**  
Two configurable modes:
- **Time-based (default)**: snapshot every X interval, drop if nothing changed since last snapshot
- **Storage-unconstrained mode**: keep every snapshot regardless of diff

No forced event-level granularity.

**Q21 — Restore scope**  
Epsilon can restore user filesystem mounts (covered by Quasar's administrative authority):
- One prompt to user before restore kicks off
- Append-only event store means no destructive rollback — can move forward and backward freely

**Q22 — VFS versioning strategy**  
Content-addressed, content-defined chunking (CDC) with deduplication across snapshots — git-brained but with Restic/Bup-style storage. Epsilon doesn't care about logical event semantics, it sees bytes. Logical event awareness is Quasar's responsibility.

---

## LGP and Tool Execution

**Q23–25 — LGP questions**  
Deferred. LGP falls under tool handling which is not yet scoped.

---

## Layering and Compatibility

**Q26 — Old 5-layer design**  
Scrapped entirely. The new primitive is VFS. No backwards compatibility with old design.

**Q27 — External services (PostgreSQL, pgvector, ChromaDB, Redis)**  
Core Quasar has zero external service dependencies. Plugin architecture assumed from day one so external services can be added as clean extensions post-v1. Final plugin architecture decisions deferred until core Quasar is complete.

**Q28 — Solar/Nebula branch model + Epsilon tick graph**  
Merged into one unified graph with two operating modes:
- **Event-based VC mode**: Epsilon branches created in lockstep with Quasar events
- **Tick-based mode**: Epsilon snapshots all branches accumulated since the last tick

**Q29 — Local API surface**  
Unix domain sockets (Linux/macOS) and named pipes (Windows). No network stack overhead, stays local.

**Q30 — Minimum viable Quasar v1**  
v1 includes everything in this document:
- VFS abstraction
- auth.quasardb + main.quasardb (sqlite-vec, AES-256/Argon2id)
- Device fingerprint auth
- Permission model (global/per-agent)
- Heartbeat + cron (global, Generalist-routed)
- Epsilon VC (CDC, dedup, time-based snapshots, Solar/Nebula/Galaxy branches)
- State ownership across all Skyth surfaces
- Unix socket / named pipe IPC

**v2 scope** (explicitly deferred):
- Recovery mode
- `quasar-cli`
- Plugin architecture
- Custom per-quasardb passwords