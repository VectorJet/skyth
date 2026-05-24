# skyth/pi

Adapter layer that translates Skyth runtime contracts into the Pi
(`@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`) runtime contracts.

Status: baseline scaffolding. No Pi runtime calls are wired yet. Each module
exposes pure conversion helpers used by the future Pi-backed `StepRunner`,
session router, and channel paths.

## Module Boundary

This module owns:

- Conversion between Skyth's OpenAI-style messages and Pi's `Message[]`.
- Conversion between Skyth JSON-schema tool definitions and Pi `Tool[]`.
- Conversion between Pi `AssistantMessageEvent` and Skyth `StreamEvent`.
- Parsing/resolution of Skyth `provider/model` strings into the Pi
  `(provider, modelId)` pair used by `getModel`.

This module does NOT own:

- Channel adapters, gateway lifecycle, session storage, tool execution.
- The legacy `LLMProvider` boundary in `skyth/providers/*`. That stays in
  place until the Pi-backed `StepRunner` is wired end-to-end.

## Type Strategy

`types.ts` declares a minimal local mirror of the Pi contract types we depend
on, so this module type-checks today without `@earendil-works/pi-ai` being
installed as a dependency. When Pi is wired as a real dependency, swap the
`types.ts` re-exports for imports from `@earendil-works/pi-ai` and delete the
local mirrors.

## Recommended Migration Order

1. Install Pi packages and replace `types.ts` mirrors with real imports.
2. Implement `PiProvider` in `provider.ts` against the Pi `streamSimple` API,
   conforming to Skyth's `LLMProvider` so `StepRunner` can drop it in.
3. Run one `AgentRunOrchestrator` gateway turn through Pi behind a flag.
4. Move session routing/naming to Pi-backed completion helpers.
5. Remove `skyth/providers/*` after gateway and channel paths no longer
   import it.
