# Current Workflow

## Purpose

This file captures the current exploration workflow so work can resume cleanly after context compaction or agent handoff.

## Objective

We are exploring harnesses under `refs/` one at a time and documenting how they are engineered.

For each harness, we are focusing on three dimensions:

1. AX — Agent experience
   - what the agent sees
   - how the context window is structured
   - how tools are exposed and called
   - memory/session/runtime behavior
   - diagrams where useful

2. UX — User experience
   - how users interact with the harness
   - CLI, chat, web, API, or other surfaces
   - onboarding, feedback, streaming, commands, control surfaces

3. DX — Developer experience
   - how easy it is to extend and maintain
   - plugins, tools, providers, channels, configuration
   - whether humans and coding agents can work with it effectively

We are not ranking harnesses yet.
Ranking will happen only after multiple harness explorations are complete.

## Output Location

Findings are written to:

```text
.findings/{harness_name}/*.md
```

Current completed document:

- `.findings/nanobot/exploration.md`

## Current State

We first listed the top-level contents of `refs/`.
Then we selected the smallest harness to start with: `refs/nanobot`.

Nanobot exploration has been completed at an initial deep-dive level and written to:

- `.findings/nanobot/exploration.md`

That document includes:

- architectural summary
- AX analysis
- UX analysis
- DX analysis
- runtime flow descriptions
- code references

## How I explored Nanobot

The workflow used was:

1. List files and high-level structure under `refs/nanobot`
2. Read the main docs for orientation:
   - `refs/nanobot/README.md`
   - `refs/nanobot/pyproject.toml`
   - `refs/nanobot/COMMUNICATION.md`
3. Read the core runtime files:
   - `refs/nanobot/nanobot/cli/commands.py`
   - `refs/nanobot/nanobot/agent/loop.py`
   - `refs/nanobot/nanobot/agent/runner.py`
   - `refs/nanobot/nanobot/agent/context.py`
4. Read tooling, provider, channel, session, and config files:
   - `agent/tools/*`
   - `providers/*`
   - `channels/base.py`
   - `channels/manager.py`
   - `channels/registry.py`
   - `session/manager.py`
   - `config/schema.py`
   - `api/server.py`
   - `agent/skills.py`
5. Read supporting docs where they clarified extension or memory behavior:
   - `docs/CHANNEL_PLUGIN_GUIDE.md`
   - `docs/MEMORY.md`
6. Inspect code size and structure using file counts and line counts
7. Write synthesis into `.findings/nanobot/exploration.md`

## Preferred Exploration Workflow For Next Harnesses

For each next harness, follow this sequence:

1. Identify the harness folder in `refs/`
2. List top-level and relevant source files
3. Read the main README and package/build manifest
4. Identify the true runtime entrypoints
   - CLI entrypoints
   - server entrypoints
   - agent loop/runtime loop
   - transport/channel/tool code
5. Read code for:
   - context construction
   - tool calling
   - provider/model abstraction
   - memory/session handling
   - channel or user interaction flow
   - extension/plugin systems
6. Produce notes specifically organized into:
   - AX
   - UX
   - DX
7. Write a markdown document to:
   - `.findings/{harness_name}/exploration.md`

## Important Constraints

- Explore one harness at a time
- Prefer code-level truth over README claims
- Use README/docs for orientation, not as the sole source of truth
- Do not rank harnesses yet
- Keep findings focused on engineering design, not marketing claims

## Known Repository Notes

- `.findings/` did not exist initially and was created during this work
- `./scripts/loc_check.sh` was requested by repo instructions but does not exist at the project root

## Suggested Next Step

After Nanobot, move to the next-smallest or next-most-relevant harness in `refs/` and repeat the same workflow.
