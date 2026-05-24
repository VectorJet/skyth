# Progress - 2026-05-24

## Current Focus

Pi migration baseline. Skyth still runs through `skyth/providers/*` and the
existing `StepRunner`. The new `skyth/pi/` module is the adapter seam that
the future Pi-backed runtime plugs into.

## Completed

### Cleanup

- Removed dead `skyth/providers/openai_codex_provider.ts`. It exported a
  single `stripModelPrefix` helper with no remaining callers.

### Pi Adapter Baseline (`skyth/pi/`)

Created an isolated adapter module that depends only on local Skyth code:

- `types.ts` - local mirror of the `@earendil-works/pi-ai` contract types
  Skyth needs (`PiMessage`, `PiAssistantMessage`, `PiToolCall`,
  `PiAssistantMessageEvent`, `PiContext`, `PiTool`, ...). Lets the module
  type-check before Pi is installed as a real dependency.
- `model.ts` - `parsePiModelRef(provider/model)` and
  `resolvePiProviderId(skythId)` map Skyth provider/model strings to Pi's
  `getModel(provider, model)` shape. Normalizes Skyth `_` to Pi `-` and
  preserves nested gateway model ids (e.g. `openrouter/anthropic/...`).
- `messages.ts` - `toPiContext(messages)` collapses OpenAI-style messages
  into Pi `Context` (system prompts hoisted, assistant tool_calls and
  reasoning mapped to content blocks, tool messages mapped to
  `toolResult`). `fromPiAssistantMessage(piMessage)` reverses for replay.
- `tools.ts` - `toPiTools(definitions)` converts Skyth OpenAI-function
  tool definitions to Pi `Tool[]`. The `parameters` payload passes through
  unchanged because TypeBox `TSchema` is structurally JSON Schema at
  runtime.
- `events.ts` - `fromPiStreamEvent(event)` maps Pi
  `AssistantMessageEvent`s to Skyth `StreamEvent`s (text deltas, thinking
  deltas, tool-call ends, done/error). `fromPiAssistantResponse(message,
  stopReason)` turns a completed Pi assistant message into a Skyth
  `LLMResponse`.
- `index.ts` - barrel export.
- `README.md` - module boundary, type strategy, recommended migration
  order.

### Tests

- `tests/pi_adapter_baseline.test.ts` (10 cases, all passing) covers
  model-ref parsing, provider id normalization, message conversion, tool
  conversion, response building, and stream-event mapping.

## Verification

- `bun run typecheck` passes.
- `bun test tests/pi_adapter_baseline.test.ts` 10/10 passing.
- `bun test tests/` passes 162 cases; 3 timeouts in
  `tests/gateway_boot_wiring.test.ts` are pre-existing on `main` and not
  caused by this work.
- `bun run build:bin` succeeds.
- `./scripts/loc_check.sh` reports 0 files >= 400 LOC.

## Recommended Next Step

1. Install `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core`,
   then swap `skyth/pi/types.ts` for direct re-exports from
   `@earendil-works/pi-ai`.
2. Add `skyth/pi/provider.ts` implementing an `LLMProvider` subclass
   backed by Pi `streamSimple`. Wire its construction behind a config flag
   so `StepRunner` can pick Pi over `AISDKProvider` without disturbing the
   gateway boot path.
3. Add an integration test that runs one `AgentRunOrchestrator` turn
   through the Pi-backed provider using Pi's `faux` provider.
4. After the Pi-backed path proves a full gateway turn, migrate session
   routing/naming helpers in
   `skyth/base/base_agent/session/core/router/*` to Pi completion calls.
5. Remove `skyth/providers/*` only after both gateway and channel paths
   stop importing it.
