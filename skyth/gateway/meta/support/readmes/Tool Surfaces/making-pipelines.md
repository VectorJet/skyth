# Making Pipelines

A pipeline is a named workflow with run tracking. Use it when work may be long-running, multi-step, artifact-producing, or needs status polling.

## Directory Shape

TypeScript:

```text
<PIPELINES>/<pipeline_name>/
  manifest.json
  index.ts
  package.json        optional
```

Python:

```text
<PIPELINES>/<pipeline_name>/
  manifest.json
  index.py
  requirements.txt    optional
```

Use workspace `PIPELINES` for durable user workflows and `TEMP/pipelines` for generated experiments. Use `src/builtin/pipelines` only for gateway-owned workflows.

## Manifest

```json
{
  "name": "example_pipeline",
  "description": "Runs a multi-step workflow.",
  "kind": "pipeline",
  "version": "1.0.0",
  "author": "workspace",
  "category": "workflow",
  "tags": ["example"],
  "permissions": ["fs:workspace", "network"],
  "ax": {
    "summary": "Run the example workflow.",
    "visibility": "discoverable",
    "triggerPhrases": ["run example workflow"]
  }
}
```

Hooks apply the same manifest, source, permission, AX, and smoke expectations as tools, with `kind: "pipeline"`.

## TypeScript Entrypoint

`PipelineLoader` imports `index.ts` from `.gateway-reload-cache/pipelines`. It registers `default` or named export `pipeline`.

```ts
import type { PipelineDefinition } from '@/registries/pipelines/index.ts';

const pipeline: PipelineDefinition = {
  name: 'example_pipeline',
  description: 'Runs a multi-step workflow.',
  parameters: [
    { name: 'input', description: 'Input text.', type: 'string', required: true }
  ],
  handler: async (args) => {
    const text = String(args.input).trim();
    return { text, length: text.length };
  },
  metadata: {
    category: 'workflow',
    tags: ['example'],
    ax: {
      summary: 'Run an example text workflow.',
      visibility: 'discoverable',
      triggerPhrases: ['run example pipeline']
    }
  }
};

export default pipeline;
```

## Python Entrypoint

Python pipelines follow the same wrapper pattern as Python tools: `--metadata` must print JSON metadata, execution receives one JSON argument string, stdout is parsed as JSON when possible, and `uv`/`requirements.txt` are used when available.

## Execution Model

The pipeline registry always starts runs asynchronously internally. `PipelineRegistry.execute()` creates a `runId`, stores `pending`, starts background execution, then updates the run to `running`, `completed`, or `failed`.

`PipelineRunner.run()` starts a pipeline and waits for completion by polling, defaulting to `CLAUDE_GATEWAY_PIPELINE_RUNNER_POLL_MS` or 1000 ms. Through `execute_tool`, use `pipeline:<name>`.

For potentially long work, prefer:

```json
{
  "tool": "pipeline:example_pipeline",
  "args": { "input": "hello" },
  "async": true
}
```

Then use `tool_watch`, `wait`, or `tool_result`.

HTTP routes also exist:

- `GET /pipelines`
- `POST /pipelines/:name/execute`
- `GET /pipelines/runs/:runId`
- `GET /pipelines/runs`

## Verification

1. Confirm `manifest.json` and `index.ts` or `index.py` exist.
2. Confirm hooks accept the candidate.
3. Confirm discovery with `find_tools` or `list_tools` source `pipeline`.
4. Execute with `execute_tool` using `pipeline:<name>`.
5. Check run status with `tool_result`, `/pipelines/runs/:runId`, or `gateway_debug`.
6. Confirm output is structured and errors are meaningful.
