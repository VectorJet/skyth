# 2026-05-23 Provider Model Resolution

## Summary

Fixed a live gateway provider failure where onboarding selected Kilo with `kilo/deepseek/deepseek-v4-flash:free`, but the runtime sent `deepseek/kilo/deepseek/deepseek-v4-flash:free` to Kilo. Kilo rejected that as an invalid model id.

The fix mirrors opencode's provider/model split:

- provider id selects the SDK, auth, and base URL;
- model id is passed to the SDK as the provider catalog model id.

## Files Changed

- `skyth/providers/ai_sdk_provider.ts`
  - Removed keyword-based model rerouting from the request path.
  - `resolveModel()` now strips only the explicitly configured provider prefix.
  - `createSDK()` passes the selected provider id into the resolver.
  - Explicit provider selection now disables legacy gateway auto-detection.
  - Requests now flow through an opencode-style provider transform module before reaching AI SDK.
  - Transient streaming failures now retry once as trimmed non-streaming requests without tools.
  - Transient non-streaming failures with tools now retry once without tools before returning a provider error.
  - Existing config pinned to a deprecated catalog model now returns a clear provider error before making a doomed request.
- `skyth/providers/opencode_provider_transform.ts`
  - Ports the provider-specific request shaping from opencode into Skyth-native code.
  - Handles text sanitization, Anthropic empty-content normalization, Claude/Mistral tool id scrubbing, DeepSeek reasoning placeholders, Gemini thought-signature-safe history cleanup, model-derived temperature/topP/topK defaults, and models.dev capability gates.
- `skyth/providers/ai_sdk_response.ts`
  - Extracts response usage/tool-call conversion to keep `AISDKProvider` below the repository LOC limit.
- `skyth/base/base_agent/runtime/step-runner.ts`
  - Removes the hardcoded `Done. Completed the requested updates.` fallback.
  - Empty-final turns now use actual tool-result fallback text or report that no final provider reply was produced.
- `skyth/base/base_agent/runtime/agent_loop_runner.ts`
  - Applies the same fake-completion removal to the legacy loop path.
- `skyth/providers/ai_sdk_resolver.ts`
  - Accepts an explicit `providerID` so SDK/base URL resolution is not inferred from the already-stripped model id.
  - Applies opencode-style provider defaults for Kilo/OpenRouter headers.
  - Enables usage reporting for OpenAI-compatible providers where supported.
  - Merges model-level headers from models.dev.
- `skyth/providers/registry.ts`
  - Exposes model-level SDK metadata for headers, temperature support, and tool-call support.
- `tests/ai_sdk_provider_model_resolution.test.ts`
  - Covers Kilo, OpenRouter-style nested model ids, and nested provider-looking model ids.
- `tests/ai_sdk_provider_tools_schema.test.ts`
  - Covers system-message coalescing for Anthropic-compatible providers.
  - Covers removal of replayed tool history for providers that cannot accept it without signatures.
- `skyth/cli/cmd/onboarding/module/steps/05-model-selection.ts`
  - Filters deprecated models from interactive choices.
- `skyth/cli/cmd/configure/pointers/model.ts`
  - Filters deprecated models from interactive choices.
- `specs/progress/Progress.md`
  - Overwritten with current progress as required by repo instructions.

## Verification

Passed:

- `bun test tests/ai_sdk_provider_model_resolution.test.ts tests/ai_sdk_provider_tools_schema.test.ts`
- `bun run typecheck`
- `bun run build:bin`
- `./scripts/loc_check.sh`

LOC check reported zero files at or above 400 LOC and 17 files in the 350-399 LOC range.

## Follow-Up

Run a live `./dist/skyth gateway` smoke with the Kilo config created during onboarding. Expected provider log should show:

- provider: `kilo`
- defaultModel: `kilo/deepseek/deepseek-v4-flash:free`
- request model: `deepseek/deepseek-v4-flash:free`

The previous invalid model id `deepseek/kilo/deepseek/deepseek-v4-flash:free` should not appear.

If Kilo returns `503 Service Unavailable` while the request model is `deepseek/deepseek-v4-flash:free`, the model routing bug is fixed and the remaining failure is upstream provider availability or account/provider-side access.

`opencode/minimax-m2.5-free` is marked `deprecated` in the local models.dev cache and OpenCode returns that the free promotion ended. Switch to a current OpenCode model such as `opencode/kimi-k2.5` or `opencode/deepseek-v4-flash-free`, depending on account access.
