# Epsilon Version Control System (Phase 5)

**Status:** Proposed Architecture
**Repository:** Rust Crate (`core/quasar/epsilon`)
**Language:** Rust
**Inspiration:** Jujutsu (jj), Git

## Overview

Epsilon is a custom version control system built specifically for the Skyth agent. While it draws heavy inspiration from **Jujutsu (jj)** and **Git** regarding Content-Addressable Storage (CAS) and Merkle DAGs, it is a specialized implementation optimized for:

1.  **High-Frequency Snapshots:** "Ticks" occur at every event (User Msg, Thought, Tool Call).
2.  **Anonymous Branching:** Solar (User Edit) and Nebula (Regeneration) branches are first-class citizens, often anonymous or ephemeral.
3.  **Event Integration:** Ticks are strictly 1:1 mapped to Quasar Events.

## Architecture

### 1. Storage Layout (`.skyth/epsilon/`)

We use a Git-like object store but with simplified object types tailored for our domain.

```text
.skyth/epsilon/
├── objects/            # CAS Store (zstd compressed)
│   ├── ab/
│   │   └── cd123...    # Blob/Tree/Tick
├── refs/               # Pointers
│   ├── HEAD            # Current Tick ID
│   └── event_map/      # Index: EventID -> TickID
└── transactions/       # WAL for atomic updates
```

### 2. Object Model

#### **Blob**

- Raw file content, compressed.
- Key: `SHA256(content)`

#### **Tree**

- Directory listing.
- Key: `SHA256(sorted_entries)`
- Entries: `name`, `mode`, `hash` (Blob or Tree).

#### **Tick (The "Commit")**

- Simplified Commit object.
- Key: `SHA256(metadata)`
- Fields:
  - `tree_id`: Hash of the root Tree.
  - `parent_ids`: List of parent Tick hashes.
  - `event_id`: UUID of the triggering Quasar Event.
  - `timestamp`: u64.
  - `message`: String.

### 3. Core Logic (Rust)

The implementation will reside in `core/quasar/epsilon`.

```rust
pub struct Epsilon {
    store: ObjectStore,
    index: EventIndex,
}

impl Epsilon {
    /// Snapshot the current working directory
    pub fn snapshot(&self, event_id: Uuid) -> Result<TickId>;

    /// Restore working directory to a specific Tick
    pub fn restore(&self, tick_id: TickId) -> Result<()>;
}
```

## Relationship to JJ/Git

- **Why not just use JJ?** We need tighter integration with the Event loop and a simpler object model that doesn't require a full CLI or user-facing VCS features (like interactive rebasing, intricate conflict markers for humans).
- **What we borrow:** The CAS design, the immutable data structure, and the concept of "anonymous heads".
