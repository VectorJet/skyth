# Session Graph Specification

## Overview

A "git-like" session management system that enables context sharing across channels while maintaining individual session isolation. Tracks user behavior patterns to enable intelligent auto-merging when users switch between channels quickly.

## Goals

1. Maintain separate sessions per channel+chat by default (current behavior)
2. Enable manual linking/merging of sessions across channels
3. Auto-merge context when user switches channels within a time threshold (5 min default)
4. Persist session graph to disk for cross-restart continuity
5. Provide tools to visualize and manipulate session relationships

## Core Concepts

### Session Branch
Each channel+chat session is a "branch" in the session graph.

### Session Graph
Directed acyclic graph (DAG) of session relationships:
- Nodes: individual sessions (channel:chatId)
- Edges: merge relationships (parent -> child)

### User Behavior Profile
Tracks user switching patterns to inform auto-merge decisions:
- `switchFrequencyMs`: average time between channel switches
- `lastSwitches`: recent switch events with timestamps
- `preferredChannel`: most frequently used channel

## Configuration

```typescript
// skyth/config/schema.ts
session_graph?: {
  auto_merge_threshold_ms: number;  // default: 300000 (5 min)
  persist_to_disk: boolean;          // default: true
  max_switch_history: number;         // default: 20
}
```

## Data Structures

### MergeEdge
```typescript
interface MergeEdge {
  id: string;
  sourceKey: string;    // session being merged FROM
  targetKey: string;   // session being merged INTO
  timestamp: number;
  mode: "full" | "compact";
  compactedMessages?: number;  // count if mode=compact
}
```

### SessionGraph
```typescript
interface SessionGraph {
  version: "1.0";
  sessions: Record<string, SessionBranch>;
  edges: MergeEdge[];
  behavior: UserBehaviorProfile;
}

interface SessionBranch {
  key: string;
  createdAt: string;
  mergedFrom: string[];    // keys merged INTO this session
  parentKey?: string;      // primary parent after merge
}

interface UserBehaviorProfile {
  switchFrequencyMs: number;
  preferredChannel: string;
  lastSwitches: Array<{
    fromChannel: string;
    toChannel: string;
    timestamp: number;
  }>;
}
```

## Implementation

### Phase 1: Core Graph Infrastructure

#### 1.1 SessionGraph Class (`skyth/session/graph.ts`)
- `load(workspace: string): SessionGraph`
- `save(workspace: string): void`
- `addSession(key: string): void`
- `merge(sourceKey: string, targetKey: string, mode: "full" | "compact"): void`
- `getAncestors(key: string): string[]`
- `getDescendants(key: string): string[]`
- `recordSwitch(fromChannel: string, toChannel: string): void`
- `shouldAutoMerge(fromKey: string, toKey: string, thresholdMs: number): boolean`

#### 1.2 Integrate with SessionManager (`skyth/session/manager.ts`)
- Load/save session graph alongside sessions
- Expose graph methods via SessionManager API

#### 1.3 Persist to Disk
- Location: `workspace/sessions/graph.json`
- Format: JSON

### Phase 2: Auto-Merge Logic

#### 2.1 Detect Channel Switches (`skyth/agents/generalist_agent/loop.ts`)
- Track `last_channel` and `last_chat_id` in session metadata
- Compare incoming message channel/chatId with previous
- If switch detected, check auto-merge conditions

#### 2.2 Auto-Merge Trigger
```typescript
const threshold = config.session_graph?.auto_merge_threshold_ms ?? 300000;
if (graph.shouldAutoMerge(previousKey, currentKey, threshold)) {
  await graph.merge(previousKey, currentKey, { mode: "compact" });
}
```

#### 2.3 Context Compaction
When merging with `mode: "compact"`:
- Extract top 3-5 important messages from source (using heuristics: tool calls, decisions, key facts)
- Summarize remaining messages into brief context note
- Append as system message in target session

### Phase 3: Tools and Commands

#### 3.1 Agent Tools (`skyth/agents/generalist_agent/tools/`)

##### session-branch
Show current session graph visualization:
```
Current branches:
├── discord:12345 (main)
│   └── merged from telegram:67890 (compacted)
├── telegram:67890
└── cli:direct
```

##### session-merge <target-session>
Manually merge another session into current:
- Options: `--compact` (default) or `--full`
- Example: `/session-merge telegram:mychat --compact`

##### session-rebase <source-session>
Rebase current session on another (linearize history):
- Like git rebase: replay current messages on top of source

##### session-purge
Clear all session history and start fresh:
- Option: `--force` to skip confirmation

##### session-search <query>
Search across all sessions in graph:
- Uses existing memory search under the hood
- Returns results with session context

##### session-link <channel:chatId>
Explicitly link two sessions without merging:
- Creates edge in graph without modifying messages

#### 3.2 CLI Commands (`skyth/cli/main.ts`)
Expose session-graph management:
- `skyth session graph` - show graph
- `skyth session merge <from> <to>` - merge sessions
- `skyth session reset` - clear graph

## Behavior Details

### Time-based Auto-merge
- Threshold: 5 minutes (configurable)
- When user switches channels within threshold:
  1. Source session context is compacted
  2. Compacted context injected into target session
  3. Graph edge created: source -> target
- When user switches after threshold:
  1. Fresh session (current behavior preserved)

### Compaction Algorithm
1. Identify last N messages with tool calls (keep these)
2. Summarize remaining messages using LLM
3. Format as: `[Merged from ${sourceChannel}: ${summary}]`
4. Append to target session messages

### Behavior Learning
- Track last 20 switch events
- Calculate rolling average of switch frequency
- Update preferredChannel based on most frequent
- Use this data to improve future auto-merge decisions

## Edge Cases

1. **Merge conflicts**: When same tool used in both sessions - keep both, mark as merged
2. **Circular detection**: Prevent re-merging already merged sessions
3. **Stale sessions**: Archive sessions not touched in 7 days
4. **Graph corruption**: Validate on load, rebuild if invalid

## File Changes Summary

### New Files
- `skyth/session/graph.ts` - SessionGraph class
- `skyth/agents/generalist_agent/tools/session-tools.ts` - agent tools
- `specs/session-graph/index.md` - this spec

### Modified Files
- `skyth/config/schema.ts` - add session_graph config
- `skyth/session/manager.ts` - integrate graph
- `skyth/agents/generalist_agent/loop.ts` - auto-merge logic
- `skyth/cli/main.ts` - CLI commands

## Testing

1. Unit tests for SessionGraph methods
2. Integration tests for auto-merge triggers
3. Manual testing of all commands
4. Verify persistence across restarts

## Acceptance Criteria

- [ ] Sessions remain isolated by default (no behavior change without interaction)
- [ ] Manual `/session-merge` works with compact mode
- [ ] Auto-merge triggers within 5-min threshold
- [ ] Session graph persists to disk
- [ ] `/session-branch` shows graph visualization
- [ ] `/session-search` returns results from all sessions
- [ ] No regression in existing session behavior
