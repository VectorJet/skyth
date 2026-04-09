# Phase 5: Watcher Mode & Advanced Features

**Status:** Specification Complete  
**Priority:** Medium  
**Timeline:** Weeks 31-35 (after Phase 4)

---

## Overview

Phase 5 introduces advanced automation features including watcher mode, background processing, and enhanced security controls for host execution.

---

## Goals

1. ✅ Implement watcher mode for continuous monitoring
2. ✅ Build background processing system (Obsidian-like)
3. ✅ Create tiered security model for host execution
4. ✅ Implement Epsilon version control system
5. ✅ Setup daemon/detached mode options

---

## Specifications

### Core Specifications

1. **[Watcher Mode](./watcher-mode.md)**
   - File system monitoring
   - Time-based triggers (cron)
   - External events (webhooks)
   - Resource management
   - Daemon vs detached mode

2. **[Background Processing](./background-processing.md)**
   - Session-end processing
   - Daily summary generation
   - Embedding creation
   - Entity graph updates
   - Detached mode (default)
   - Optional daemon mode

3. **[Host Execution Security](./host-execution-security.md)**
   - Tiered trust system
   - Command approval flow
   - Dangerous command detection
   - Whitelist/blacklist patterns
   - VPS vs local environments

4. **[Epsilon Version Control](./epsilon.md)**
   - State-based version control
   - Filesystem state tracking
   - Time-travel via ticks
   - Integration with Quasar events
   - Project-specific `.skyth/` storage

---

## Key Deliverables

### Week 31: Watcher Mode

- [ ] File system monitoring (inotify/FSEvents)
- [ ] Cron-based scheduling
- [ ] Webhook receivers
- [ ] Resource management (CPU, memory limits)
- [ ] Watcher configuration UI

### Week 32: Background Processing

- [ ] Session-end triggers
- [ ] Daily aggregation logic
- [ ] Embedding pipeline
- [ ] Detached process management
- [ ] Optional daemon mode

### Week 33: Security Model

- [ ] Tiered trust levels (Paranoid, Standard, Trust)
- [ ] Command interceptor middleware
- [ ] Approval UI (CLI + web)
- [ ] Whitelist/blacklist engine
- [ ] Dangerous command detector

### Week 34: Epsilon System

- [ ] Filesystem state snapshots
- [ ] Tick-based versioning
- [ ] State restoration logic
- [ ] Integration with Solars/Nebulas
- [ ] CLI for time-travel

### Week 35: Integration & Testing

- [ ] Cross-platform testing
- [ ] Performance optimization
- [ ] Security audit
- [ ] Documentation

---

## Technologies

### Watcher
- `watchdog` (Python) - File system monitoring
- `schedule` - Cron-like scheduling
- `FastAPI webhooks` - External triggers

### Background Processing
- Python `multiprocessing` - Detached processes
- systemd / launchd - Optional daemon integration
- `asyncio` - Async task management

### Security
- Pattern matching - Command analysis
- LLM (optional) - Semantic danger detection

### Epsilon
- Git-like diff algorithm
- Filesystem snapshots
- JSONL event storage

---

## Watcher Mode

### Activation Triggers

**1. File System Changes**
```yaml
watcher:
  enabled: true
  triggers:
    file_changes:
      paths:
        - ~/Documents/**
        - ~/Projects/**
      events:
        - create
        - modify
        - delete
      debounce: 5s  # Wait 5s after last change
```

**2. Time-Based (Cron)**
```yaml
  triggers:
    schedule:
      - expression: "0 9 * * *"  # 9 AM daily
        task: "Generate daily summary"
      - expression: "*/30 * * * *"  # Every 30 min
        task: "Check for updates"
```

**3. External Events (Webhooks)**
```yaml
  triggers:
    webhooks:
      - url: /webhook/github-push
        secret: "your_webhook_secret"
        action: "Run tests on push"
```

---

### Daemon Mode vs Detached Mode

**Daemon Mode (Optional):**
- Continuous background service
- OS-native integration (systemd, launchd)
- Requires installation/setup
- Higher resource usage

**Detached Mode (Default):**
- Triggered after events (session end, file change)
- No persistent process
- Lower resource usage
- No system permissions needed

**Recommendation:** Detached mode for most users, daemon for power users/VPS.

---

## Background Processing

### Triggers

**1. Session End**
```python
async def on_session_end(session_id: str):
    """Triggered when user exits session"""
    
    # Generate session summary
    summary = await quasar.summarize_session(session_id)
    
    # Create embeddings
    await quasar.embed_session(session_id)
    
    # Update entity graphs
    await quasar.update_entities(session_id)
    
    # Archive to daily storage
    await quasar.archive_to_daily(session_id)
```

**2. Daily Aggregation**
```python
async def daily_processing():
    """Run once per day at end of day"""
    
    # Aggregate all sessions from today
    sessions = await get_sessions_for_date(today())
    
    # Generate daily summary
    summary = await quasar.summarize_daily(sessions)
    
    # Compress old sessions
    await quasar.compress_sessions(older_than=30_days)
```

**3. Conditional: Human Interaction**
```python
async def should_run_daily_processing():
    """Only run if human interacted with Skyth today"""
    
    last_interaction = await get_last_user_interaction()
    if last_interaction.date() == today():
        await daily_processing()
    else:
        logger.info("No interaction today, skipping processing")
```

---

## Security Model

### Tiered Trust Levels

**1. Paranoid Mode**
- Approve ALL commands (even reads)
- User must confirm every action
- Recommended for: Production servers, sensitive data

**2. Standard Mode (Default)**
- Approve dangerous/mutating commands
- Allow safe reads automatically
- Recommended for: Most users

**3. Trust/Dev Mode**
- No approval required
- All commands execute automatically
- Recommended for: VPS, isolated environments, testing

**Configuration:**
```yaml
security:
  trust_level: "standard"  # paranoid, standard, trust
  environment: "local"     # local, vps
```

---

### Dangerous Command Detection

**Pattern Matching:**
```yaml
dangerous_patterns:
  - "rm -rf /*"
  - "rm -rf ~/*"
  - "sudo *"
  - "chmod +x /*"
  - "dd if=*"
  - "> /dev/sda"
  - ":(){ :|:& };:"  # Fork bomb
```

**Semantic Analysis (Optional):**
```python
# Use LLM to assess danger level
danger_score = await llm.assess_danger(command)
if danger_score > 0.8:
    require_approval(command)
```

---

### Approval Flow

**CLI:**
```
Agent: I need to run: rm -rf /tmp/old_files/*

⚠ This command requires approval:
  Command: rm -rf /tmp/old_files/*
  Danger: High (file deletion)
  Files affected: ~150

  Enter superuser password to approve: [password]

✓ Approved. Executing...
```

**Web UI:**
```
┌─────────────────────────────────────┐
│ Command Approval Required           │
├─────────────────────────────────────┤
│ Command: rm -rf /tmp/old_files/*    │
│ Danger: High (file deletion)        │
│ Files: ~150                         │
│                                     │
│ [Enter Password] [Cancel]           │
└─────────────────────────────────────┘
```

---

### Whitelist/Blacklist

```yaml
command_rules:
  whitelist:  # Always allow
    - "git *"
    - "npm *"
    - "python *.py"
    - "ls *"
    - "cat *"
  
  blacklist:  # Never allow (override with superuser)
    - "rm -rf /*"
    - "sudo rm *"
    - "dd *"
  
  require_approval:  # Ask user
    - "docker run*"
    - "npm install *"
    - "pip install *"
    - "rm -r *"
```

---

## Epsilon Version Control

### Purpose

Track filesystem state at every Quasar tick, enabling "time travel" to any point in conversation history.

### How It Works

**1. State Snapshot**
```python
async def take_snapshot(tick_id: str):
    """Snapshot filesystem state at this tick"""
    
    snapshot = {
        "tick_id": tick_id,
        "timestamp": now(),
        "files": {}
    }
    
    # Track all files in project
    for file in tracked_files:
        snapshot["files"][file] = {
            "hash": compute_hash(file),
            "size": get_size(file),
            "modified": get_mtime(file)
        }
    
    await save_snapshot(snapshot)
```

**2. Diff Storage**
```python
async def store_diff(tick_id: str):
    """Store only changes since last tick"""
    
    prev_snapshot = await get_snapshot(previous_tick)
    curr_snapshot = await get_snapshot(tick_id)
    
    diff = compute_diff(prev_snapshot, curr_snapshot)
    await save_diff(tick_id, diff)
```

**3. Restoration**
```python
async def restore_to_tick(tick_id: str):
    """Restore filesystem to this tick's state"""
    
    # Get snapshot or reconstruct from diffs
    snapshot = await get_or_reconstruct_snapshot(tick_id)
    
    # Restore files
    for file, metadata in snapshot["files"].items():
        if file_changed(file, metadata):
            restore_file(file, tick_id)
```

---

### Integration with Solars/Nebulas

**Solar (User Edit):**
- Filesystem restored to state BEFORE original message
- All changes made after that message undone

**Nebula (Regeneration):**
- Filesystem restored to state BEFORE original response
- All files created/modified by that response undone

---

### CLI Commands

```bash
# View epsilon history
epsilon history

# Restore to specific tick
epsilon restore {tick_id}

# Show diff between ticks
epsilon diff {tick1} {tick2}

# List tracked files
epsilon status
```

---

## Success Criteria

Phase 5 is complete when:

1. ✅ Watcher mode functional with all trigger types
2. ✅ Background processing working (detached mode)
3. ✅ Security tiers enforced correctly
4. ✅ Epsilon snapshots and restoration work
5. ✅ Daemon mode optional integration complete
6. ✅ All tests pass
7. ✅ Documentation complete

**Estimated Completion:** Week 35  
**Blocking Dependencies:** Phase 4 complete

---

## Known Issues

### To Address in Phase 5
- Resource limits for watcher mode
- Performance optimization for large projects (Epsilon)
- Security audit for command approval bypass attempts

### Deferred to Later Phases
- Machine learning for danger detection → Phase 6+
- Collaborative watcher (multi-user) → Phase 7+

---

## References

### Internal
- Q&A: Q5.1, Q5.2, Q7.1, A9.3 / A5.1, A5.2, A7.1
- Quasar events: `@spec/phase-3/event-types-branching.md`

---

*Last Updated: 2026-01-31*  
*Next Review: Start of Phase 5 (after Phase 4 completion)*
