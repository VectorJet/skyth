# Async Runs

Use async execution for work that may exceed normal response time, block the gateway event loop, or produce large output.

## Execute Tool Async

`execute_tool` can start an async tool run and return a gateway `runId`.

```json
{
  "tool": "pipeline:transcript",
  "args": { "url": "https://example.com" },
  "async": true
}
```

The response includes:

- `tool`
- `async: true`
- `runId`
- `status: "pending"`
- a message explaining how to wait or fetch result

## Auto Async and Force Async

`execute_tool` can auto-async long synchronous calls after `CLAUDE_GATEWAY_TOOL_AUTO_ASYNC_MS`, default 150000 ms.

Some work is forced async:

- `memory_embed`
- `memory_import` when `mode` is `reindex`
- `memory_import` when `filePath` is provided
- tool names listed in `CLAUDE_GATEWAY_TOOL_FORCE_ASYNC`

This prevents MCP transport timeouts and gives the model a real run id before heavy work begins.

## Observing Runs

Use:

- `tool_watch`: wait briefly when the result is needed in the current answer.
- `wait`: mark the run for gateway notification when it completes, then end the response.
- `tool_result`: check status or retrieve output manually.

When notification is enabled, completion messages are sent back through the web channel. Large output is not inlined past `CLAUDE_GATEWAY_TOOL_COMPLETE_INLINE_CHARS`, default 4000 chars.

## Pipeline Runs vs Tool Runs

A pipeline has its own pipeline `runId` inside `PipelineRegistry`. An async `execute_tool` call also has a tool-run `runId`. HTTP pipeline execution may return both `toolRunId` and `pipelineRunId`.

Keep the ids straight:

- Use gateway async tools (`tool_watch`, `wait`, `tool_result`) with tool-run ids.
- Use `/pipelines/runs/:runId` with pipeline registry run ids.

## Agent Rule

Do not say work is complete just because an async run started. Report the `runId`, current status, and exactly what has and has not completed.
