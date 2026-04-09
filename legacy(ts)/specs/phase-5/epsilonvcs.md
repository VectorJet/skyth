# Epsilon Version Control System - Technical Specification

**Version:** 1.0  
**Author:** VectorJet
**Date:** 2026-09-02
**Status:** Draft for Review  
**Target:** Phase 5, Week 34

---

## 1. Executive Summary

Epsilon is a filesystem version control system designed to snapshot and restore filesystem state at every Quasar event (solar/nebula). It provides efficient storage through content-addressed deduplication and compression, supporting projects from 10 MB to 50+ GB without excessive bloat.

**Key Metrics (Target):**
- Small projects (10 MB): ~2-5 MB storage overhead
- Large projects (50 GB): ~3-7 GB storage overhead  
- Snapshot time: <1s for typical changes, <30s for initial snapshot
- Restore time: <5s for small projects, <60s for large projects

---

## 2. Architecture Overview

### 2.1 Core Components

```
.skyth/epsilon/
├── objects/              # Content-addressed object store
│   ├── blobs/           # File content (compressed)
│   └── trees/           # Directory metadata
├── ticks/               # Tick metadata (snapshots)
│   └── [tick-id].json
├── cache/               # Performance optimization
│   └── tree-cache.db
├── HEAD                 # Current tick pointer
└── config.toml          # Configuration
```

### 2.2 Design Principles

1. **Content-Addressed Storage**: Files stored by SHA-256 hash of content
2. **Automatic Deduplication**: Identical content stored only once
3. **Aggressive Compression**: zstd compression on all stored objects
4. **Smart Scanning**: Only rehash changed files (mtime/size comparison)
5. **Merkle Tree Structure**: Hierarchical tree enables efficient diffing

---

## 3. Data Structures

### 3.1 Blob Object

Represents file content.

```python
class Blob:
    hash: str              # SHA-256 of original content
    compressed_data: bytes # zstd compressed content
    original_size: int     # Uncompressed size
    compression_ratio: float
```

**Storage Format:**
```
objects/blobs/ab/cd1234567890abcdef...
  [zstd compressed bytes]
```

### 3.2 Tree Object

Represents directory structure.

```python
class TreeEntry:
    name: str              # File/directory name
    mode: int              # Unix permissions (e.g., 0o644)
    type: str              # "blob" or "tree"
    hash: str              # Reference to blob or tree
    size: int              # Original file size (0 for trees)
    mtime_ns: int          # Modification time (nanoseconds)

class Tree:
    hash: str              # SHA-256 of serialized tree
    entries: List[TreeEntry]
```

**Storage Format:**
```json
objects/trees/ab/cd1234567890abcdef...
{
  "entries": [
    {
      "name": "main.py",
      "mode": 33188,
      "type": "blob",
      "hash": "abc123...",
      "size": 1024,
      "mtime_ns": 1234567890123456789
    },
    {
      "name": "src",
      "mode": 16877,
      "type": "tree",
      "hash": "def456...",
      "size": 0,
      "mtime_ns": 1234567890123456789
    }
  ]
}
```

### 3.3 Tick Object

Represents a snapshot at a Quasar event.

```python
class Tick:
    id: str                # Quasar event ID (e.g., "solar-abc123")
    parent: Optional[str]  # Parent tick ID
    timestamp: int         # Unix timestamp (seconds)
    tree_hash: str         # Root tree hash
    metadata: dict         # Event metadata
        event_type: str    # "quasar", "solar", "nebula"
        message: str       # Optional description
        author: str        # User/system identifier
```

**Storage Format:**
```json
ticks/solar-abc123.json
{
  "id": "solar-abc123",
  "parent": "quasar-abc123",
  "timestamp": 1234567890,
  "tree_hash": "xyz789...",
  "metadata": {
    "event_type": "solar",
    "message": "User edited message 5",
    "author": "user@example.com"
  }
}
```

---

## 4. Core Operations

### 4.1 Capture (Snapshot)

**Input:** Tick ID, parent tick ID (optional)  
**Output:** Tick object  
**Side Effects:** Stores new blobs/trees in object store

**Algorithm:**

```
function capture(tick_id, parent_id):
    # Load parent tree if exists
    parent_tree = load_parent_tree(parent_id) if parent_id else None
    
    # Snapshot filesystem (smart scan)
    root_tree_hash = snapshot_directory(".", parent_tree)
    
    # Create tick object
    tick = Tick(
        id=tick_id,
        parent=parent_id,
        timestamp=now(),
        tree_hash=root_tree_hash,
        metadata=extract_metadata_from_quasar(tick_id)
    )
    
    # Save tick
    save_tick(tick)
    
    # Update HEAD
    write_file("HEAD", tick_id)
    
    return tick
```

**Smart Scanning Optimization:**

```
function snapshot_directory(path, parent_tree):
    entries = []
    parent_map = build_parent_map(parent_tree)
    
    for item in sorted(list_directory(path)):
        # Skip .skyth directory
        if ".skyth" in item.path:
            continue
        
        stat = get_file_stats(item)
        
        # Check if unchanged from parent
        if item.name in parent_map:
            parent_entry = parent_map[item.name]
            
            if stat.mtime_ns == parent_entry.mtime_ns and 
               stat.size == parent_entry.size:
                # Unchanged - reuse parent hash
                entries.append(parent_entry)
                continue
        
        # Changed or new - process
        if item.is_file():
            content = read_file(item.path)
            hash = store_blob(content)
            
            entries.append(TreeEntry(
                name=item.name,
                mode=stat.mode,
                type="blob",
                hash=hash,
                size=stat.size,
                mtime_ns=stat.mtime_ns
            ))
        
        elif item.is_dir():
            parent_subtree = load_tree(parent_entry.hash) if item.name in parent_map else None
            subtree_hash = snapshot_directory(item.path, parent_subtree)
            
            entries.append(TreeEntry(
                name=item.name,
                mode=stat.mode,
                type="tree",
                hash=subtree_hash,
                size=0,
                mtime_ns=stat.mtime_ns
            ))
    
    tree = Tree(entries=entries)
    tree_hash = hash_tree(tree)
    store_tree(tree_hash, tree)
    
    return tree_hash
```

### 4.2 Restore

**Input:** Tick ID  
**Output:** None  
**Side Effects:** Modifies filesystem to match tick state

**Algorithm:**

```
function restore(tick_id):
    # Load tick
    tick = load_tick(tick_id)
    
    # Load root tree
    root_tree = load_tree(tick.tree_hash)
    
    # Clear working directory (except .skyth)
    clear_directory(".", preserve=[".skyth"])
    
    # Restore tree
    restore_tree(root_tree, ".")
    
    # Update HEAD
    write_file("HEAD", tick_id)

function restore_tree(tree, path):
    create_directory(path)
    
    for entry in tree.entries:
        full_path = join(path, entry.name)
        
        if entry.type == "blob":
            # Restore file
            content = load_blob(entry.hash)
            write_file(full_path, content)
            set_permissions(full_path, entry.mode)
            set_mtime(full_path, entry.mtime_ns)
        
        elif entry.type == "tree":
            # Restore subdirectory
            subtree = load_tree(entry.hash)
            restore_tree(subtree, full_path)
```

### 4.3 Diff

**Input:** Two tick IDs  
**Output:** List of changes

**Algorithm:**

```
function diff(tick_a_id, tick_b_id):
    tick_a = load_tick(tick_a_id)
    tick_b = load_tick(tick_b_id)
    
    tree_a = load_tree(tick_a.tree_hash)
    tree_b = load_tree(tick_b.tree_hash)
    
    return diff_trees(tree_a, tree_b, "")

function diff_trees(tree_a, tree_b, path_prefix):
    changes = []
    
    entries_a = {e.name: e for e in tree_a.entries}
    entries_b = {e.name: e for e in tree_b.entries}
    
    all_names = set(entries_a.keys()) | set(entries_b.keys())
    
    for name in sorted(all_names):
        full_path = join(path_prefix, name)
        
        if name not in entries_a:
            # Added in B
            changes.append(Change(type="added", path=full_path))
        
        elif name not in entries_b:
            # Deleted in B
            changes.append(Change(type="deleted", path=full_path))
        
        elif entries_a[name].hash != entries_b[name].hash:
            # Modified
            if entries_a[name].type == "tree" and entries_b[name].type == "tree":
                # Recurse into subdirectory
                subtree_a = load_tree(entries_a[name].hash)
                subtree_b = load_tree(entries_b[name].hash)
                changes.extend(diff_trees(subtree_a, subtree_b, full_path))
            else:
                # File modified or type changed
                changes.append(Change(type="modified", path=full_path))
    
    return changes
```

---

## 5. Storage Layer

### 5.1 Object Store

**Responsibilities:**
- Store and retrieve blobs/trees by hash
- Automatic deduplication (hash collision = already stored)
- Compression/decompression

**Interface:**

```python
class ObjectStore:
    def put_blob(content: bytes) -> str:
        """Store blob, return hash. Idempotent."""
    
    def get_blob(hash: str) -> bytes:
        """Retrieve blob by hash."""
    
    def put_tree(tree: Tree) -> str:
        """Store tree, return hash. Idempotent."""
    
    def get_tree(hash: str) -> Tree:
        """Retrieve tree by hash."""
    
    def exists(hash: str) -> bool:
        """Check if object exists."""
    
    def gc() -> int:
        """Garbage collect unreferenced objects. Returns bytes freed."""
```

**Implementation Details:**

```python
def put_blob(content: bytes) -> str:
    # Hash content
    hash = sha256(content).hexdigest()
    
    # Check if exists
    path = hash_to_path(hash, "blobs")
    if path.exists():
        return hash  # Already stored (dedup)
    
    # Compress
    compressed = zstd.compress(content, level=10)
    
    # Store
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(compressed)
    
    # Log metrics
    ratio = len(compressed) / len(content)
    log_compression_metric(ratio)
    
    return hash

def get_blob(hash: str) -> bytes:
    path = hash_to_path(hash, "blobs")
    
    if not path.exists():
        raise ObjectNotFound(hash)
    
    compressed = path.read_bytes()
    return zstd.decompress(compressed)

def hash_to_path(hash: str, object_type: str) -> Path:
    # Store as objects/{type}/ab/cd1234567890...
    return Path(f".skyth/epsilon/objects/{object_type}/{hash[:2]}/{hash[2:]}")
```

### 5.2 Tick Store

**Responsibilities:**
- Store and retrieve tick metadata
- Track tick ancestry
- Query tick history

**Interface:**

```python
class TickStore:
    def save(tick: Tick) -> None:
        """Save tick metadata."""
    
    def load(tick_id: str) -> Tick:
        """Load tick by ID."""
    
    def list(limit: int = 100) -> List[Tick]:
        """List recent ticks."""
    
    def get_ancestry(tick_id: str) -> List[str]:
        """Get list of ancestor tick IDs."""
    
    def get_children(tick_id: str) -> List[str]:
        """Get child ticks (solar/nebula branches)."""
```

---

## 6. Performance Optimizations

### 6.1 Tree Cache

Cache recently accessed tree objects in memory to avoid repeated disk I/O.

```python
class TreeCache:
    def __init__(self, max_size: int = 1000):
        self.cache = LRUCache(max_size)
    
    def get(self, hash: str) -> Optional[Tree]:
        return self.cache.get(hash)
    
    def put(self, hash: str, tree: Tree):
        self.cache.put(hash, tree)
```

### 6.2 Parallel Hashing

For large codebases, hash files in parallel.

```python
def snapshot_directory_parallel(path, parent_tree, workers=4):
    # Collect all files that need hashing
    files_to_hash = []
    
    for item in walk_directory(path):
        if needs_rehashing(item, parent_tree):
            files_to_hash.append(item)
    
    # Hash in parallel
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(hash_file, f): f for f in files_to_hash}
        
        for future in as_completed(futures):
            file = futures[future]
            hash = future.result()
            # ... store blob ...
```

### 6.3 Incremental Snapshots

Only snapshot changed portions of the tree.

```python
def capture_incremental(tick_id, parent_id):
    # Use filesystem watcher to track changed paths
    changed_paths = get_changed_paths_since_last_tick()
    
    if not changed_paths:
        # No changes - create tick pointing to same tree
        return create_tick(tick_id, parent_tick.tree_hash)
    
    # Only rebuild trees along changed paths
    root_hash = rebuild_partial_tree(changed_paths, parent_tree)
    return create_tick(tick_id, root_hash)
```

---

## 7. Storage Estimates

### 7.1 Small Project (10 MB, 100 files)

**Initial snapshot:**
- Raw: 10 MB
- Compressed: ~2 MB (5× compression on source code)
- Tree metadata: ~20 KB (100 entries × 200 bytes)
- **Total: ~2 MB**

**After 100 ticks (typical development):**
- ~30 files changed per tick on average
- Changed content: ~100 KB per tick
- Compressed: ~20 KB per tick
- 100 ticks × 20 KB = 2 MB
- **Total: ~4 MB** (initial + deltas)

### 7.2 Large Project (50 GB, 1M files)

**Initial snapshot:**
- Raw: 50 GB
- Unique content after dedup: ~40 GB (20% duplication common)
- Compressed: ~5 GB (8× compression)
- Tree metadata: ~200 MB (1M entries)
- **Total: ~5.2 GB**

**After 1000 ticks:**
- ~500 files changed per tick on average
- Changed content: ~5 MB per tick
- Compressed: ~500 KB per tick
- 1000 ticks × 500 KB = 500 MB
- **Total: ~5.7 GB** (initial + deltas)

**Storage overhead: ~11% of original size**

---

## 8. Integration with Quasar

### 8.1 Event Hook

Epsilon listens for Quasar events and automatically snapshots.

```python
# In Quasar event handler
async def on_quasar_event(event: QuasarEvent):
    # Process event in Quasar
    await quasar.process_event(event)
    
    # Trigger Epsilon snapshot
    parent_id = get_parent_tick_id(event)
    await epsilon.capture(event.id, parent_id)
```

### 8.2 Event Type Mapping

```python
def get_parent_tick_id(event: QuasarEvent) -> Optional[str]:
    """Determine parent tick based on event type"""
    
    if event.type == "quasar":
        # Root event - no parent
        return None
    
    elif event.type == "solar":
        # Solar branches from the quasar event being edited
        return event.metadata["original_event_id"]
    
    elif event.type == "nebula":
        # Nebula branches from the event being regenerated
        return event.metadata["regenerated_event_id"]
    
    else:
        # Default: use previous event in timeline
        return event.parent_id
```

### 8.3 Restoration Flow

When user navigates to a solar/nebula branch:

```python
async def restore_to_quasar_event(event_id: str):
    # Restore Quasar database state
    await quasar.restore_to_event(event_id)
    
    # Restore filesystem state
    await epsilon.restore(event_id)
    
    # Update UI
    ui.show_current_event(event_id)
```

---

## 9. CLI Interface

### 9.1 Commands

```bash
# Capture snapshot (usually automatic via Quasar)
epsilon capture <tick-id> [--parent <parent-id>]

# Restore to tick
epsilon restore <tick-id>

# Show history
epsilon log [--limit 100]

# Diff two ticks
epsilon diff <tick-a> <tick-b>

# Show current tick
epsilon status

# Garbage collect unreferenced objects
epsilon gc

# Show storage stats
epsilon stats
```

### 9.2 Example Output

```bash
$ epsilon log --limit 5

solar-abc123+2 (2 minutes ago)
│  User edited message 7
│  Files changed: 3

solar-abc123+1 (15 minutes ago)
│  User edited message 5
│  Files changed: 12

solar-abc123 (1 hour ago)
│  User went back in time
│  Files changed: 8

nebula-def456 (2 hours ago)
│  AI regenerated response
│  Files changed: 5

quasar-abc123 (3 hours ago)
│  Initial conversation state
│  Files: 1,245

$ epsilon stats

Storage Statistics:
  Total objects:      12,453
  Blobs:             12,230
  Trees:                223
  
  Disk usage:         2.3 GB
  Original size:     18.7 GB
  Compression ratio:  8.1×
  
  Deduplication:
    Unique blobs:    12,230
    References:      45,892
    Savings:         73.4%
  
  Ticks:                 156
  Average per tick:   15 MB
```

---

## 10. Error Handling

### 10.1 Corruption Detection

Every object includes a checksum. On read:

```python
def get_blob(hash: str) -> bytes:
    content = decompress(read_object(hash))
    
    # Verify hash
    actual_hash = sha256(content).hexdigest()
    if actual_hash != hash:
        raise CorruptedObjectError(hash, actual_hash)
    
    return content
```

### 10.2 Missing Objects

```python
def restore(tick_id: str):
    try:
        tick = load_tick(tick_id)
        tree = load_tree(tick.tree_hash)
        restore_tree(tree, ".")
    
    except ObjectNotFound as e:
        logger.error(f"Corrupt repository: missing object {e.hash}")
        
        # Attempt repair
        if can_recover_from_backup():
            recover_object(e.hash)
            retry_restore(tick_id)
        else:
            raise UnrecoverableError(f"Cannot restore tick {tick_id}")
```

### 10.3 Concurrent Modifications

Use file locking during capture:

```python
def capture(tick_id, parent_id):
    with FileLock(".skyth/epsilon/LOCK"):
        # Ensure atomicity
        return _capture_impl(tick_id, parent_id)
```

---

## 11. Configuration

### 11.1 Config File

`.skyth/epsilon/config.toml`:

```toml
[storage]
compression_level = 10  # zstd level (1-22)
max_blob_size = 104857600  # 100 MB
gc_threshold_mb = 1000  # Run GC when overhead exceeds 1 GB

[performance]
parallel_hashing = true
hash_workers = 4
tree_cache_size = 1000

[retention]
keep_all_recent = 100  # Keep last 100 ticks always
prune_after_days = 90  # Prune ticks older than 90 days (optional)

[ignore]
patterns = [
    "*.log",
    "*.tmp",
    "__pycache__/",
    "node_modules/",
    ".git/",
]
```

---

## 12. Testing Strategy

### 12.1 Unit Tests

```python
def test_blob_deduplication():
    store = ObjectStore()
    
    content = b"hello world"
    hash1 = store.put_blob(content)
    hash2 = store.put_blob(content)
    
    assert hash1 == hash2
    assert store.exists(hash1)
    
    # Verify only stored once
    assert count_objects(store) == 1

def test_tree_reconstruction():
    # Create a tree
    original = create_test_tree()
    hash = store.put_tree(original)
    
    # Retrieve it
    retrieved = store.get_tree(hash)
    
    assert trees_equal(original, retrieved)

def test_smart_scanning():
    # Initial snapshot
    tick1 = epsilon.capture("tick1")
    
    # Modify one file
    modify_file("test.txt")
    
    # Capture again
    with measure_time() as t:
        tick2 = epsilon.capture("tick2", parent="tick1")
    
    # Should be fast (only rehashed changed file)
    assert t.elapsed < 1.0  # 1 second
```

### 12.2 Integration Tests

```python
def test_full_workflow():
    # Create test project
    create_test_project(files=1000, size_mb=100)
    
    # Capture initial snapshot
    tick1 = epsilon.capture("tick1")
    
    # Modify some files
    modify_files(count=50)
    
    # Capture second snapshot
    tick2 = epsilon.capture("tick2", parent="tick1")
    
    # Restore to tick1
    epsilon.restore("tick1")
    
    # Verify filesystem matches
    assert verify_filesystem_matches_tick("tick1")
    
    # Check storage efficiency
    stats = epsilon.get_stats()
    assert stats.compression_ratio > 5.0
    assert stats.dedup_savings > 0.5

def test_large_codebase():
    # Test on 50 GB synthetic codebase
    create_large_project(size_gb=50, files=1_000_000)
    
    with measure_time() as t:
        tick = epsilon.capture("large_tick")
    
    # Should complete in reasonable time
    assert t.elapsed < 300  # 5 minutes max
    
    # Check storage
    stats = epsilon.get_stats()
    assert stats.disk_usage_gb < 10  # Should be under 10 GB
```

### 12.3 Performance Benchmarks

```python
def benchmark_snapshot_performance():
    sizes = [10, 100, 1000, 10000]  # MB
    
    for size_mb in sizes:
        project = create_project(size_mb=size_mb)
        
        # Initial snapshot
        start = time.time()
        epsilon.capture(f"bench_{size_mb}_initial")
        initial_time = time.time() - start
        
        # Incremental snapshot (1% changed)
        modify_files(count=int(project.file_count * 0.01))
        start = time.time()
        epsilon.capture(f"bench_{size_mb}_incremental")
        incremental_time = time.time() - start
        
        print(f"Size: {size_mb} MB")
        print(f"  Initial: {initial_time:.2f}s")
        print(f"  Incremental: {incremental_time:.2f}s")
```

---

## 13. Risks & Mitigations

| Risk                                    | Impact | Likelihood | Mitigation                               |
| --------------------------------------- | ------ | ---------- | ---------------------------------------- |
| Storage bloat exceeds estimates         | High   | Medium     | Implement chunking if metrics show issue |
| Snapshot too slow for large projects    | High   | Medium     | Parallel hashing, smart scanning         |
| Restore too slow                        | Medium | Low        | FUSE lazy loading (future)               |
| Object corruption                       | High   | Low        | Checksums, backup/repair tools           |
| Concurrent access conflicts             | Medium | Low        | File locking                             |
| Insufficient testing on large codebases | Medium | Medium     | Synthetic benchmarks, beta testing       |

---

## 14. Timeline

### Week 34 - Implementation

**Day 1-2: Core Implementation**
- ObjectStore (blob/tree storage)
- TickStore (metadata)
- Capture algorithm (naive version)
- Restore algorithm

**Day 3: Optimization**
- Smart scanning (mtime/size comparison)
- Tree caching
- Parallel hashing

**Day 4: Testing**
- Unit tests
- Integration tests
- Performance benchmarks on test projects

**Day 5: Metrics & Iteration**
- Measure actual compression ratios
- Measure snapshot/restore times
- Optimize bottlenecks if needed

### Week 35 - Integration & Polish

**Day 1-2: Quasar Integration**
- Event hooks
- Parent tick resolution
- CLI commands

**Day 3: Documentation**
- User guide
- API documentation
- Configuration examples

**Day 4-5: Review & Refinement**
- Code review
- Fix issues from testing
- Prepare for Phase 5 completion

---

## 15. Success Criteria

Phase 5 Epsilon is complete when:

- ✅ Captures filesystem state on every Quasar event
- ✅ Restores to any tick in <60s for 50 GB projects
- ✅ Storage overhead <20% of original size after 1000 ticks
- ✅ All unit tests pass
- ✅ Integration tests pass on small (10 MB) and large (5+ GB) projects
- ✅ CLI functional and documented
- ✅ Metrics collected and within targets

---

## 16. Future Enhancements (Post-Phase 5)

### 16.1 Chunking (Phase 6+)

Switch from file-level to chunk-level deduplication for better compression.

### 16.2 FUSE Driver (Phase 7+)

Virtual filesystem for instant "restore" without copying files.

### 16.3 Remote Object Store (Phase 8+)

Share objects across projects, sync to cloud.

### 16.4 Delta Compression (Phase 6+)

Store similar blobs as deltas (Git-style pack files).

---

## Appendix A: Implementation Checklist

### Core Components
- [ ] ObjectStore class
  - [ ] put_blob()
  - [ ] get_blob()
  - [ ] put_tree()
  - [ ] get_tree()
  - [ ] gc()
- [ ] TickStore class
  - [ ] save()
  - [ ] load()
  - [ ] list()
  - [ ] get_ancestry()
- [ ] Epsilon class
  - [ ] capture()
  - [ ] restore()
  - [ ] diff()

### Optimizations
- [ ] Smart scanning (mtime/size check)
- [ ] Tree cache (LRU)
- [ ] Parallel hashing
- [ ] zstd compression

### Integration
- [ ] Quasar event hooks
- [ ] Parent tick resolution
- [ ] CLI commands

### Testing
- [ ] Unit tests (>80% coverage)
- [ ] Integration tests
- [ ] Performance benchmarks
- [ ] Large codebase testing

### Documentation
- [ ] User guide
- [ ] API docs
- [ ] Configuration reference
- [ ] Troubleshooting guide

---

## Appendix B: Code Skeleton

```python
# epsilon/core.py

from pathlib import Path
from typing import Optional, List
import hashlib
import json
import zstd
import time

class Epsilon:
    def __init__(self, root: Path = Path(".skyth/epsilon")):
        self.root = root
        self.store = ObjectStore(root)
        self.ticks = TickStore(root)
        
    def capture(self, tick_id: str, parent_id: Optional[str] = None) -> Tick:
        """Snapshot current filesystem state"""
        # TODO: implement
        pass
    
    def restore(self, tick_id: str):
        """Restore filesystem to tick state"""
        # TODO: implement
        pass
    
    def diff(self, tick_a: str, tick_b: str) -> List[Change]:
        """Diff two ticks"""
        # TODO: implement
        pass

class ObjectStore:
    def __init__(self, root: Path):
        self.root = root / "objects"
        self.root.mkdir(parents=True, exist_ok=True)
    
    def put_blob(self, content: bytes) -> str:
        """Store blob, return hash"""
        # TODO: implement
        pass
    
    def get_blob(self, hash: str) -> bytes:
        """Retrieve blob"""
        # TODO: implement
        pass

class TickStore:
    def __init__(self, root: Path):
        self.root = root / "ticks"
        self.root.mkdir(parents=True, exist_ok=True)
    
    def save(self, tick: Tick):
        """Save tick metadata"""
        # TODO: implement
        pass
    
    def load(self, tick_id: str) -> Tick:
        """Load tick"""
        # TODO: implement
        pass
```

---

**End of Specification**

---

## Review Notes

This spec is ready for:
1. Technical review by team
2. Validation of storage estimates
3. Approval to proceed with implementation

**Estimated Implementation Time:** 5-7 days  
**Risk Level:** Medium (well-understood problem, standard algorithms)  
**Innovation Level:** Low (Git-like, proven approach)

**Recommendation:** Approve and proceed with Week 34 implementation.