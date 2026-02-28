# Progress

## In Progress

### Frontend Version Bump (2026-02-28)

Changed version from Open WebUI's 0.8.5 to 0.0.1.

## Files Modified

- `platforms/web/package.json` - version: "0.8.5" -> "0.0.1"

---

## Completed

### Provider Invalid Prompt Fix: Typed Tool-Result Output (2026-02-26)

Fixed the recurring runtime failure:
- `Provider error: Invalid prompt: The messages...`

Root cause:
- In `AISDKProvider.toMessages()`, tool-role messages were emitted with `tool-result.output` as a raw string.
- AI SDK prompt schema requires `tool-result.output` to be a typed object (for example `{ type: "text", value: "..." }` or `{ type: "json", value: ... }`).
- This malformed shape can trigger provider-side invalid prompt errors on the next model turn after a tool call.

## Changes

1. AI SDK provider tool-result serialization
- Added `toToolResultOutput()` helper.
- Tool results now serialize as:
  - `{ type: "json", value: <object> }` when content parses as JSON object
  - `{ type: "text", value: <string> }` otherwise
- Wired this into `toMessages()` for `role: "tool"` conversion.

2. Regression tests
- Extended provider message tests to assert typed tool-result output shape.

## Files Modified

- `skyth/providers/ai_sdk_provider.ts`
  - Added typed tool-result conversion helper.
  - Updated `tool-result.output` construction to schema-compliant object format.

- `tests/ai_sdk_provider_messages.test.ts`
  - Added assertions for `tool-result.output` typed payload (`json` and `text`).

## Validation

Passed:
- `bun test tests/ai_sdk_provider_messages.test.ts tests/merge_router.test.ts`
- `bun test tests/` -> 111 pass, 0 fail
