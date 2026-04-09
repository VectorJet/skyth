# Epsilon Implementation Guide (Minimal Rust)

## Directory Structure

```text
core/quasar/
├── Cargo.toml
├── src/
│   ├── lib.rs          # Quasar Core
│   └── main.rs         # Entry point (if needed)
└── epsilon/            # Epsilon Module/Crate
    ├── Cargo.toml
    └── src/
        ├── lib.rs      # Public API
        ├── storage.rs  # CAS (Blob/Tree I/O)
        ├── snapshot.rs # Walkdir & Hashing
        └── restore.rs  # Checkout logic
```

## Step-by-Step Implementation

### 1. Project Setup

Initialize a new Rust library in `core/quasar/epsilon`.

```bash
cargo new --lib core/quasar/epsilon
```

### 2. Dependencies

- `sha2`: Hashing.
- `zstd`: Compression.
- `walkdir`: Directory traversal.
- `serde`, `serde_json`: Metadata serialization.
- `tempfile`: For atomic writes.
- `thiserror`, `anyhow`: Error handling.

### 3. The `ObjectStore`

Implement `put` and `get` methods that transparently handle:

1.  Hashing the data.
2.  Compressing it.
3.  Writing to `.skyth/epsilon/objects/xx/yyyy...`.

### 4. The Snapshot Loop

1.  Walk the directory (respecting ignores).
2.  For each file:
    - Read content.
    - `store.put(content)`.
    - Add to current `TreeBuilder`.
3.  For each directory:
    - `store.put(tree)`.
    - Add to parent `TreeBuilder`.
4.  Create `Tick` object with root tree hash.
5.  `store.put(tick)`.
6.  Update `HEAD`.

### 5. The Restore Loop

1.  Load `Tick`.
2.  Load Root `Tree`.
3.  Diff Root `Tree` against disk (optimization).
4.  Overwrite changed files.
5.  Delete tracked files that are missing in `Tree`.
