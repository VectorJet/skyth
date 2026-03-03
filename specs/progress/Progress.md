# Progress Update

**Date:** 2026-03-02
**Scope:** Global tools convention migration (manual cleanup of legacy text sidecars)

## Completed

- Converted global tool descriptions from per-file `*.txt` sidecars to code constants in:
  - `skyth/tools/descriptions.ts`
- Updated all global tool implementations to import descriptions from `@/tools/descriptions` instead of `@/tools/*.txt`:
  - `apply_patch.ts`, `bash.ts`, `batch.ts`, `codesearch.ts`, `edit.ts`, `glob.ts`, `grep.ts`, `ls.ts`, `lsp.ts`, `multiedit.ts`, `plan.ts`, `question.ts`, `read.ts`, `task.ts`, `todo.ts`, `webfetch.ts`, `websearch.ts`, `write.ts`
- Added missing convention wrappers for remaining tools:
  - `skyth/tools/list_tool.ts`
  - `skyth/tools/multiedit_tool.ts`
- Removed legacy text sidecars from `skyth/tools/`:
  - `apply_patch.txt`, `bash.txt`, `batch.txt`, `codesearch.txt`, `edit.txt`, `glob.txt`, `grep.txt`, `ls.txt`, `lsp.txt`, `multiedit.txt`, `plan-enter.txt`, `plan-exit.txt`, `question.txt`, `read.txt`, `task.txt`, `todoread.txt`, `todowrite.txt`, `webfetch.txt`, `websearch.txt`, `write.txt`

## Convention status

- `skyth/tools/` now uses convention entrypoints (`*_tool.ts`) with metadata headers and no description `.txt` clutter.
- Author metadata for convention wrappers is set to `VectorJet`.

## Tests and validation

- `bun run typecheck` -> pass
- `bun test tests/base_agent_tool_discovery.test.ts` -> pass
- `bun test tests/` -> pass (`139 pass`, `0 fail`, `6 skip`, `3 todo`)
