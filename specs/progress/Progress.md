## Progress

- Updated the shared web markdown renderer in `platforms/web/src/lib/components/prompt-kit/markdown/Markdown.svelte` to behave closer to Open WebUI while keeping the existing Skyth prompt-kit integration.
- Enabled richer markdown features through `svelte-streamdown` heavy components: syntax-highlighted code blocks with controls, KaTeX math rendering, and Mermaid rendering.
- Added sanitized HTML passthrough for a limited safe subset of inline/block tags so collapsible markdown patterns such as `<details>` and `<summary>` can render without opening the renderer to arbitrary HTML.
- Tightened message prose styling in `platforms/web/src/lib/components/prompt-kit/message/MessageContent.svelte` to match the denser Open WebUI-like chat presentation, including blockquote treatment and compact spacing.
- Added KaTeX overflow styling in `platforms/web/src/app.css` so wide display math remains scrollable in chat instead of breaking layout.
- Verified with `bun run --cwd platforms/web check`; result: 0 errors, 11 warnings, all pre-existing and limited to `Code.svelte` CSS at-rule warnings plus `CopyButton.svelte` state warnings.
- Ran the required `./scripts/loc_check.sh`; no new large files were introduced. The script still reports pre-existing files above the 400 LOC threshold:
  - `skyth/session/manager.ts`
  - `skyth/base/base_agent/runtime.ts`
  - `skyth/cli/cmd/onboarding/module/steps/06-channel-selection.ts`
  - `skyth/gateway/handlers/agents.ts`
