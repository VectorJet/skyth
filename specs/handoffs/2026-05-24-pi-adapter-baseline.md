# Handoff - Pi Adapter Baseline

Date: 2026-05-24

## Summary

Laid the baseline for the Pi migration without touching the live runtime.
A new `skyth/pi/` module holds pure conversion helpers between Skyth's
existing contracts (`LLMProvider`, `StreamEvent`, OpenAI-style message
records, OpenAI-function tool definitions) and Pi's contract surface
(`Message`, `AssistantMessageEvent`, `Context`, `Tool`).

The legacy `skyth/providers/*` stack still owns the runtime. No call sites
were rewritten in this pass.

## Files Added

- `skyth/pi/README.md` - module boundary, type strategy, migration order.
- `skyth/pi/types.ts` - local mirror of the Pi contract types used by the
  adapter so the module type-checks without Pi as an installed dep.
- `skyth/pi/model.ts` - `parsePiModelRef`, `resolvePiProviderId`.
- `skyth/pi/messages.ts` - `toPiContext`, `fromPiAssistantMessage`.
- `skyth/pi/tools.ts` - `toPiTools`.
- `skyth/pi/events.ts` - `fromPiStreamEvent`, `fromPiAssistantResponse`.
- `skyth/pi/index.ts` - barrel.
- `tests/pi_adapter_baseline.test.ts` - 10 unit cases covering each helper.

## Files Removed

- `skyth/providers/openai_codex_provider.ts` - dead code; `stripModelPrefix`
  had no remaining callers under `skyth/` or `tests/`.

## Design Notes

- The local `PiTool.parameters` field is typed as `unknown` because Pi
  uses TypeBox `TSchema` at compile time. At runtime TypeBox schemas are
  plain JSON Schema objects, so Skyth's existing
  `ToolRegistry.getDefinitions()` shape passes straight through.
- `toPiContext` hoists every `role: "system"` message into
  `Context.systemPrompt` (joined with blank lines) because Pi does not
  model system as a message role.
- Assistant `reasoning_content` becomes a Pi `thinking` content block in
  the forward direction and is reassembled into `reasoning_content` on the
  reverse path (`fromPiAssistantMessage`,
  `fromPiAssistantResponse`). Tool calls round-trip as
  `assistant.tool_calls[].function` <-> Pi `toolCall` blocks with
  JSON-stringified arguments.
- `fromPiStreamEvent` deliberately returns `null` for `start`/`*_start`/
  `*_end` lifecycle events; only deltas, the final tool call, and
  `done`/`error` map onto Skyth's `StreamEvent` union.
- Pi `StopReason` -> Skyth `finish_reason`: `stop`/`length`/`tool_calls`/
  `cancelled`/`error`.

## Type Decoupling Strategy

`skyth/pi/types.ts` is intentionally a self-contained subset of the Pi
public types. When Pi is added as a real dependency, replace each `export
interface ...` with `export type { ... } from "@earendil-works/pi-ai";`
and delete the local mirrors. No call site outside the module touches Pi
types directly, so the swap is a one-file change.

## Verification

```
bun run typecheck                              # ok
bun test tests/pi_adapter_baseline.test.ts     # 10/10 pass
bun test tests/                                # 162 pass, 3 pre-existing
                                               # timeouts in
                                               # gateway_boot_wiring.test.ts
bun run build:bin                              # ok
./scripts/loc_check.sh                         # 0 files >= 400 LOC
```

The 3 `buildGatewayAgentSession` timeouts reproduce on stock `main`
without this change.

## Recommended Next Wiring Steps

1. Install `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core`.
   Either pin from npm or wire vendor/pi packages via workspace path.
2. Replace `skyth/pi/types.ts` with re-exports from `@earendil-works/pi-ai`.
3. Add `skyth/pi/provider.ts`: an `LLMProvider` subclass backed by Pi's
   `streamSimple` that uses the new conversion helpers end-to-end.
4. Plumb a config flag (e.g. `runtime.useProvider: "pi" | "ai-sdk"`) into
   `gateway/lifecycle/agent-session-boot.ts` so `StepRunner` can pick the
   Pi provider for a gateway turn without removing AI SDK path.
5. Bring up a `tests/pi_provider_step_runner.test.ts` integration test
   using Pi's `faux` provider before touching channel paths.
6. After channel paths are migrated, delete `skyth/providers/*` and the
   `LLMProvider` indirection.

## Out of Scope For This Pass

- No changes to `skyth/providers/*` runtime behavior beyond removing the
  dead `openai_codex_provider.ts`.
- No changes to `gateway/*`, `base/base_agent/*`, or session router.
- No new dependencies installed.
