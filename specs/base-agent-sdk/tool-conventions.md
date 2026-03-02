# Tool Auto-Discovery Conventions

**Status:** Planning Complete
**Date:** 2026-03-02
**Parent Spec:** `specs/base-agent-sdk/spec.md`

---

## Overview

The ToolRegistry auto-discovery system scans known directories for tool definitions, validates their metadata, and registers them for agent use. This replaces the current hard-coded tool registration in the generalist agent's constructor.

---

## Naming Conventions

### File-Based Tools

Single-file tools must be named with the `_tool` suffix:

```
*_tool.ts
*_tool.py
*_tool.js
*_tool.sh
*_tool.rb
*_tool.php
*_tool.pl
*_tool.lua
*_tool.ps1
```

Examples:
- `lint_tool.ts`
- `search_tool.py`
- `deploy_tool.sh`

### Folder-Based Tools

Complex tools that require multiple files live in a `*_tool/` directory:

```
search_tool/
|-- index.ts          # Required: assembles and exports the tool
|-- desc.txt          # Optional: tool description (if not in header metadata)
|-- query_parser.ts   # Supporting modules
+-- result_formatter.ts
```

Requirements:
- Directory name must end with `_tool/`
- Must contain an `index.ts` (or `index.{ext}` for other languages)
- Optional `desc.txt` for description when not using header metadata

---

## Scan Directories

The loader scans these locations in order:

1. **Global tools:** `skyth/tools/` -- shared across all agents
2. **Agent-specific tools:** `skyth/agents/{agent_name}/tools/` -- scoped to one agent
3. **Pipeline tools:** `skyth/agents/{agent_name}/pipelines/tools/` -- scoped to pipeline
4. **App tools:** `skyth/agents/{agent_name}/apps/{app_name}/tools/` -- scoped to app

Duplicate tool names are resolved by priority: agent-specific > global.

---

## Header Metadata

Every tool must include header metadata. For TypeScript/JavaScript files, use JSDoc-style comments at the top of the file:

```typescript
/**
 * @tool lint_tool
 * @author skyth-team
 * @version 1.0.0
 * @description Runs project linter on specified files
 * @tags code, quality
 * @requires bins: eslint
 */
```

For Python files:

```python
"""
@tool lint_tool
@author skyth-team
@version 1.0.0
@description Runs project linter on specified files
@tags code, quality
@requires bins: pylint
"""
```

For shell scripts:

```bash
# @tool deploy_tool
# @author skyth-team
# @version 1.0.0
# @description Deploys to staging environment
# @requires bins: docker, kubectl
```

### Required Fields

| Field | Description |
|-------|-------------|
| `@tool` | Tool identifier (must match filename without extension) |
| `@author` | Author name or team |
| `@description` | Human-readable description of what the tool does |

### Optional Fields

| Field | Description |
|-------|-------------|
| `@version` | Semantic version (default: "1.0.0") |
| `@tags` | Comma-separated tags for categorization |
| `@requires` | Dependencies: `bins: <binary1>, <binary2>` and/or `env: <VAR1>, <VAR2>` |

### Folder-Based Description

For `*_tool/` directories, the description can be provided via:
1. Header metadata in `index.ts` (preferred)
2. A `desc.txt` file in the tool directory (fallback)

---

## First-Use Security Review

When an agent calls any auto-discovered tool for the **first time in a session**, the runtime injects a system message containing the tool's source code so the LLM can review it before execution.

### How It Works

1. Agent requests tool execution
2. Runtime checks `firstUseSet` for this session
3. If tool not in set:
   a. Read tool source code
   b. Inject system message: `[TOOL SOURCE REVIEW: {tool_name}]\n\n{source_code}\n\nReview this tool source before proceeding. This is a security measure for auto-discovered tools.`
   c. Add tool to `firstUseSet`
4. Execute tool normally

### Exemptions

- Built-in core tools (read_file, write_file, exec, etc.) are exempt from first-use review
- Tools with `@trusted` metadata tag skip the review
- Subagents inherit the parent agent's `firstUseSet`

---

## Tool Interface

All tools must conform to the base tool interface:

```typescript
export interface ToolEntry {
  name: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
  requires: {
    bins: string[];
    env: string[];
  };
  parameters: Record<string, any>;  // JSON Schema
  execute(params: Record<string, any>): Promise<string>;
  source: "global" | "agent" | "workspace" | "pipeline" | "app";
  filePath: string;  // Absolute path to tool file
}
```

---

## Tool Metadata Interface

```typescript
export interface ToolMetadata {
  tool: string;
  author: string;
  version: string;
  description: string;
  tags: string[];
  requires: {
    bins: string[];
    env: string[];
  };
  trusted: boolean;
}
```

---

## Validation Rules

1. Tool name in metadata must match filename (without `_tool` suffix allowed)
2. `@author` is required -- tools without authors are rejected with a diagnostic
3. `@description` is required -- tools without descriptions are rejected
4. If `@requires` specifies binaries, they are checked at discovery time; unavailable tools are marked but not removed
5. Duplicate tool names produce a warning; the higher-priority source wins
6. Empty tool files are skipped with a diagnostic
7. Malformed metadata produces a diagnostic but does not crash discovery

---

## Example: Complete Agent Tool Structure

```
agents/code_agent/
|-- agent_manifest.json
|-- index.ts
+-- tools/
    |-- lint_tool.ts              # Single-file tool
    |-- format_tool.ts            # Single-file tool
    +-- test_runner_tool/         # Folder-based tool
        |-- index.ts
        |-- desc.txt
        |-- runner.ts
        +-- report_formatter.ts
```

---

_Date: 2026-03-02_
