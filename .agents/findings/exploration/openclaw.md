# OpenClaw Exploration

## Scope

This document explores `refs/openclaw` as an engineered harness, focusing on:

- AX — Agent experience
- UX — User experience
- DX — Developer experience

This is an exploration, not a ranking.

## What OpenClaw Actually Is

OpenClaw is not primarily a coding-agent CLI in the way Pi, OpenCode, or Codebuff are.

At code level, it is a **gateway-centric personal-agent platform** that embeds a coding/agent runtime inside a much larger system.

The repository combines:

- a WebSocket + HTTP gateway control plane
- a multi-channel messaging fabric
- an embedded Pi-based agent runtime
- subagent orchestration
- a very large native plugin system
- mobile/desktop nodes and companion apps
- automation surfaces like cron, webhook, flows, and tasks

The most important architectural fact is this:

**the agent is only one subsystem inside a gateway that owns sessions, channels, tools, delivery, security, plugins, and automation.**

## Core Architectural Thesis

OpenClaw's engineering model is:

1. **Gateway owns reality**
   - session state
   - auth
   - channel connections
   - event distribution
   - config and secrets
   - plugin runtime

2. **Agent runs are embedded workloads inside that gateway**
   - usually via `runEmbeddedPiAgent()`
   - with gateway-managed session metadata, model selection, delivery, and safety policy

3. **Everything extensible is plugin-driven**
   - channels
   - model providers
   - speech/media providers
   - web search/fetch
   - hooks
   - routes
   - tools
   - setup flows

4. **Agents are scoped identities**
   - each agent can have isolated workspace, sessions, auth profiles, and skill filters

This makes OpenClaw feel much closer to an "agent operating environment" than a single harness app.

## High-Level Architecture

```text
Messaging surfaces / clients / nodes
├─ WhatsApp / Telegram / Slack / Discord / etc.
├─ CLI / TUI / WebChat / Control UI
├─ macOS / iOS / Android nodes
└─ ACP bridge / IDEs
        |
        v
Gateway server
├─ WS protocol
├─ HTTP APIs
├─ auth + pairing
├─ session routing
├─ event fanout
├─ channel plugin runtime
├─ plugin registry/runtime
├─ secrets runtime
├─ task/cron/webhook automation
└─ control UI hosting
        |
        v
Embedded agent runtime
├─ agentCommand / gateway server-methods
├─ runEmbeddedPiAgent()
├─ model resolution + auth profile rotation
├─ failover / retry / compaction
├─ Pi tool adaptation
└─ subagent spawn / registry / lifecycle
        |
        v
Providers / tools / sandboxes / memory / nodes
```

## Key Files Read

Primary code and docs used for this exploration:

### Orientation / docs
- `refs/openclaw/README.md`
- `refs/openclaw/docs/concepts/architecture.md`
- `refs/openclaw/docs/concepts/multi-agent.md`
- `refs/openclaw/docs/concepts/agent-loop.md`
- `refs/openclaw/docs/concepts/session.md`
- `refs/openclaw/docs/gateway/protocol.md`
- `refs/openclaw/docs/plugins/architecture.md`
- `refs/openclaw/docs.acp.md`

### Entry/runtime/gateway
- `refs/openclaw/openclaw.mjs`
- `refs/openclaw/src/runtime.ts`
- `refs/openclaw/src/gateway/server.ts`
- `refs/openclaw/src/gateway/server.impl.ts`
- `refs/openclaw/src/gateway/server-methods/agent.ts`

### Agent runtime / agent scoping
- `refs/openclaw/src/agents/pi-embedded-runner.ts`
- `refs/openclaw/src/agents/pi-embedded-runner/run.ts`
- `refs/openclaw/src/agents/agent-command.ts`
- `refs/openclaw/src/agents/agent-scope.ts`
- `refs/openclaw/src/agents/subagent-spawn.ts`
- `refs/openclaw/src/agents/system-prompt.ts`
- `refs/openclaw/src/agents/skills.ts`
- `refs/openclaw/src/agents/tool-policy.ts`

### Channels / session ingress
- `refs/openclaw/src/channels/session.ts`

### Plugin runtime
- `refs/openclaw/src/plugins/runtime.ts`
- `refs/openclaw/src/plugins/loader.ts`
- `refs/openclaw/src/plugins/registry.ts`
- `refs/openclaw/src/plugin-sdk/agent-runtime.ts`

## Architectural Character

OpenClaw is the broadest and most infrastructure-heavy harness explored so far.

Where Pi says:
- small reusable coding-agent core

and OpenCode says:
- integrated client/server coding platform

OpenClaw says:
- persistent assistant platform spanning channels, nodes, protocols, tools, and automations

The consequences show up directly in code:

- huge gateway core (`server.impl.ts`)
- heavy agent wrapper (`agent-command.ts`, `runEmbeddedPiAgent()`)
- strong plugin boundaries
- rich routing and session scoping
- operational concerns embedded into normal runtime paths

## AX: Agent Experience

## 1. The "real" agent loop is gateway-owned

The docs say this explicitly, and the code backs it up.

The high-level path is:

- `gateway server-methods/agent.ts` accepts an `agent` request
- validates params and resolves session and delivery behavior
- dispatches to `agentCommandFromIngress()`
- which reaches `agentCommandInternal()` in `src/agents/agent-command.ts`
- which prepares session/model/auth/runtime state
- and ultimately calls `runEmbeddedPiAgent()`

This is important: unlike smaller harnesses, OpenClaw does not let the agent own the world. The gateway owns the world and the agent is a managed run inside it.

### Agent execution path

```text
channel / UI / ACP client
  -> gateway method `agent`
  -> session + delivery + auth resolution
  -> agentCommandInternal()
  -> runEmbeddedPiAgent()
  -> embedded Pi session + tools + model runtime
  -> stream assistant/tool/lifecycle events back through gateway
```

That design gives OpenClaw stronger coordination, but also means the agent experience is inseparable from the gateway runtime.

## 2. Agent runs are serialized and lane-managed

From docs and `runEmbeddedPiAgent()`:

- runs are serialized per session lane
- optionally also serialized through a global lane
- command queueing is part of the authentic runtime

That means AX is designed around consistency and race avoidance, not just low-latency local interactivity.

This is a notable architectural difference from Pi and Codebuff.

## 3. OpenClaw embeds Pi instead of reinventing a small coding runtime

This is one of the most interesting engineering decisions in the repo.

`src/agents/pi-embedded-runner.ts` and `src/plugin-sdk/agent-runtime.ts` show that OpenClaw exposes and wraps Pi-oriented runtime pieces.

OpenClaw therefore inherits many Pi-like traits:

- coding tool model
- compaction machinery
- session-oriented tool/event streaming
- SDK-style tool adaptation

But it layers a lot of gateway-specific behavior around that embedded runtime:

- session-key routing
- model/profile failover
- channel delivery semantics
- node/canvas/browser/device tool exposure
- plugin hook execution
- security policies

So AX is not "Pi inside OpenClaw" in a raw sense. It is **Pi as one execution engine inside a larger orchestration shell**.

## 4. Agent scope is first-class and durable

`agent-scope.ts` is central to OpenClaw's identity model.

An "agent" in OpenClaw is not just a prompt. It can imply:

- unique `agentId`
- unique workspace
- unique `agentDir`
- own auth-profile store
- own session store
- own model defaults/fallbacks
- own skill filters
- own sandbox defaults
- own tool policy
- own group-chat behavior
- own human-delay/heartbeat/identity settings

From docs:
- sessions live under `~/.openclaw/agents/<agentId>/sessions`
- auth profiles live under `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`

This is one of OpenClaw's defining AX features: **agent identity is storage- and routing-backed, not just prompt-backed**.

## 5. Multi-agent routing is deeper than subagent spawning

The `multi-agent` docs are not merely about delegation. They are about **hosting multiple isolated brains inside one gateway**.

That means OpenClaw supports two distinct multi-agent concepts:

1. **parallel isolated top-level agents**
   - different workspaces
   - different accounts/channels
   - different state and auth

2. **runtime-spawned subagents**
   - subordinate runs/tasks
   - session/thread-bound or ephemeral
   - lifecycle-tracked by registry

This is a broader multi-agent architecture than Codebuff's specialized workers or OpenCode's task tool.

## 6. Subagent spawning is a deeply engineered subsystem

`src/agents/subagent-spawn.ts` is not a tiny helper; it is a serious orchestration module.

It handles:

- spawn modes (`run` vs `session`)
- attachment passing/materialization
- workspace inheritance
- depth enforcement
- session creation/binding
- per-session thread binding
- lifecycle hook integration
- cleanup of provisional sessions when spawn fails
- admin-scope routing for privileged methods

### Subagent path

```text
parent agent tool/action
  -> subagent-spawn.ts
  -> resolve child session key / agent id / workspace inheritance
  -> maybe create persistent child session
  -> bind thread/session lifecycle
  -> dispatch child run through gateway
  -> track in subagent registry
```

This is stronger than a simple "spawn a background task" design. It is closer to a formal child-run/session infrastructure.

## 7. Tool policy is a real runtime layer

`tool-policy.ts` shows that OpenClaw distinguishes between:

- core tools
- plugin tools
- owner-only tools
- grouped tool policies
- allow/deny resolution
- plugin-group expansion

It also wraps owner-only tools with execution-time guards, and can completely filter them for non-owner senders.

This matters because OpenClaw is designed for untrusted or semi-trusted inbound surfaces.

Compared to Codebuff, whose local execution model is powerful but looser by default, OpenClaw's AX is much more governance-aware.

## 8. System prompt composition is policy-rich

`system-prompt.ts` is another revealing file.

OpenClaw's system prompt can incorporate:

- tool inventory and tool descriptions
- skills prompt and selection rules
- memory prompt sections
- owner/authorized sender information
- time/timezone info
- reply-tag guidance
- messaging semantics
- voice/TTS hints
- documentation guidance
- workspace notes
- ACP/session-specific routing constraints
- sandbox/runtime/capability hints

And it supports multiple prompt modes:
- `full`
- `minimal`
- `none`

That is a much more infrastructure-aware system prompt than Pi or OpenCode.

### Context/prompt structure concept

```text
system prompt
├─ identity / persona / owner info
├─ tool inventory
├─ skills loading instructions
├─ memory prompt section
├─ time + timezone
├─ messaging / reply tags / channel semantics
├─ docs / workspace notes
├─ TTS / voice hints
├─ ACP / sandbox / runtime-specific hints
└─ extra system prompt overrides
```

The result is a strong AX for persistent assistants, but also a very busy one.

## 9. Skills are workspace-aware and filtered per agent

`skills.ts` exports workspace skill snapshot and prompt builders rather than a simplistic directory loader.

OpenClaw can:

- build workspace skill snapshots
- sync/install skills
- filter skills by effective agent allowlist
- combine agent-specific and shared skill roots
- feed skills into system prompt construction

This makes skills part of agent identity, not merely a convenience add-on.

## 10. Reliability engineering is built into the run loop

This is one of OpenClaw's strongest agent-runtime characteristics.

`runEmbeddedPiAgent()` includes machinery for:

- auth profile ordering/rotation
- runtime auth refresh
- provider/model failover
- overflow and compaction retries
- timeout handling
- rate-limit and overload backoff
- profile failure marking
- usage normalization/accumulation
- dynamic model resolution

That means the OpenClaw agent experience is optimized for **staying alive and producing a result** even under degraded provider conditions.

This is probably the strongest reliability posture among the harnesses explored so far.

## 11. AX strengths

- gateway-owned loop creates strong consistency and observability
- agent identity is deeply scoped: workspace, auth, sessions, skills, tools
- subagent system is one of the most fully engineered seen so far
- tool policy and owner-only restrictions are first-class
- system prompt composition is rich and environment-aware
- failover/auth rotation/retry behavior is unusually advanced
- embedded Pi runtime gives it a proven agent core inside a larger system

## 12. AX weaknesses

- the mental model is extremely large; the agent runs inside many surrounding systems
- heavy policy/context injection risks making default behavior hard to predict
- some core runtime files are very large and concentrated
- agent behavior depends on gateway/channel/runtime state much more than in local-only harnesses

## UX: User Experience

## 1. OpenClaw is truly omnichannel

The README is not exaggerating here.

OpenClaw's user experience is defined by the fact that users can interact via:

- WhatsApp
- Telegram
- Slack
- Discord
- Google Chat
- Signal
- iMessage / BlueBubbles
- Matrix / IRC / Teams / LINE / more
- WebChat and Control UI
- CLI/TUI
- macOS / iOS / Android nodes
- ACP bridge for IDEs

This is the broadest delivery surface of any harness examined so far.

## 2. The gateway is the UX anchor, not the CLI

Unlike Pi or Codebuff, where the CLI/TUI is the product center, OpenClaw's real center is the running gateway.

The CLI is one client among many.

User-facing benefits:
- persistent assistant presence
- one session model across multiple clients
- background daemons and always-on behavior
- remote access through Tailscale/SSH/tunnels

This gives OpenClaw a stronger "assistant lives with you" UX than the others.

## 3. Session UX is channel-aware and policy-aware

The session docs show that OpenClaw routes sessions based on source:

- shared DMs by default
- isolated groups/rooms/channels
- cron/webhook/task isolation
- configurable DM scopes
- identity linking for cross-channel continuity

This is very different from local coding harnesses where sessions are basically transcripts.

### Session routing model

```text
incoming message
  -> channel/account/peer/group/thread routing
  -> binding resolution to agentId
  -> session-key resolution
  -> session store + transcript update
  -> agent run in that scoped session
```

That is a major UX strength for real-world messaging workflows.

## 4. Delivery behavior is configurable and nuanced

From `server-methods/agent.ts` and docs:

- agent requests may deliver back to channels
- best-effort delivery downgrade exists
- session-only execution fallback exists
- reply tags and channel-native reply semantics are supported
- approval/card/native interaction capabilities depend on channel

This gives OpenClaw a richer outbound UX model than systems that only print text to one interface.

## 5. Nodes and device capabilities broaden UX beyond chat

OpenClaw isn't just a text assistant.

Nodes can expose capabilities like:
- camera
- canvas
- screen record
- location
- voice wake / talk mode
- notifications
- system.run on device side

So UX extends into device control and ambient computing.

This is a major differentiator from the other harnesses explored.

## 6. Control UI + WebSocket protocol make the platform inspectable

The gateway exposes:
- health
- presence
- sessions
- skills
- models
- approvals
- config
- tools catalog/effective inventory
- nodes
- cron and task state

That means users and operators are not trapped in an opaque conversation view; they can inspect and manage the running assistant system.

## 7. ACP bridge is practical, not decorative

`docs.acp.md` describes `openclaw acp` as a gateway-backed bridge:

- ACP over stdio
- maps ACP sessions to gateway sessions
- reuses gateway transcript/session model
- supports prompt/cancel/list/load with partial ACP features

This gives OpenClaw an IDE-access story without making ACP the native runtime.

That is an important UX/DX compromise: bridge, don't rewrite.

## 8. UX strengths

- unmatched channel and surface breadth
- strong persistent-assistant feel due to daemon/gateway architecture
- session routing/isolation model is much more realistic for messaging than chat-only harnesses
- node/device capabilities extend UX into voice, camera, location, canvas, notifications
- control UI and gateway APIs make the system inspectable and operable
- ACP gives it an IDE-compatible path without abandoning gateway ownership

## 9. UX weaknesses

- setup complexity is high compared to all other harnesses explored
- many UX features depend on proper channel/plugin/provider configuration
- breadth can dilute discoverability: there are many surfaces and concepts
- because the gateway is central, a broken or misconfigured gateway impacts everything at once

## DX: Developer Experience

## 1. Plugin architecture is the real platform surface

The docs and code both make this clear.

OpenClaw's plugin system supports capability registration for:

- text inference providers
- CLI inference backends
- speech providers
- realtime voice/transcription
- media understanding
- image generation
- web search/fetch
- channel/messaging plugins
- hooks
- services
- gateway methods and HTTP routes
- commands and CLI metadata

This is one of the richest plugin systems among the harnesses reviewed.

## 2. The plugin registry is serious infrastructure

`plugins/registry.ts` defines a central registry with tracked records for:

- tools
- hooks / typed hooks
- channels
- providers
- speech/media/web providers
- gateway handlers
- HTTP routes
- CLI registrars
- services
- commands
- conversation-binding callbacks
- diagnostics

That is not an incidental extension mechanism. It is a formal platform substrate.

## 3. Loader design is manifest-first and safety-aware

`plugins/loader.ts` is architecturally significant.

It includes:

- plugin discovery
- activation-state resolution
- cache keys and caching
- path-safety checks
- native/bundle distinction
- loader alias mapping
- runtime activation and registry assembly
- scoped plugin loading

Important design idea from docs:
- discovery and config validation should work from manifests/metadata before runtime code executes

That is a sophisticated DX and safety choice.

## 4. Plugin SDK is broad and opinionated

`plugin-sdk/agent-runtime.ts` exports many agent/runtime-related helpers from core agent modules.

Combined with the enormous `package.json` export map, OpenClaw is effectively shipping a very large internal SDK surface.

DX upside:
- many capabilities are reusable
- third-party integrations can hook into real runtime surfaces

DX downside:
- the SDK/export surface is huge
- stability expectations are harder to reason about
- contributors need to know which seams are truly stable vs merely exported

## 5. The repo embraces operational engineering

OpenClaw's DX is not just about coding features; it is also about operating a platform.

The repo includes:
- daemon/service flows
- Tailscale exposure
- startup auth/bootstrap logic
- secret runtime activation
- diagnostics and doctor tooling
- migration utilities
- extensive tests and policy checks

This is much closer to a systems product codebase than a narrow harness library.

## 6. Boundaries are powerful but expensive to learn

There are several important subsystems with real boundaries:

- gateway
- channels
- agents
- plugins
- secrets
- tasks
- sessions
- nodes
- web/Control UI

That is good architecture in one sense, but onboarding cost is very high.

## 7. Large-file pressure is real

Representative core file sizes:

- `src/gateway/server.impl.ts` ~1559 lines
- `src/agents/pi-embedded-runner/run.ts` ~1440 lines
- `src/agents/subagent-spawn.ts` ~931 lines
- `src/agents/agent-command.ts` ~921 lines

And those are only the biggest files directly inspected here.

So although the repo is modular in directories, complexity still concentrates in large orchestrators.

## 8. DX strengths

- one of the strongest plugin/capability platforms in the set
- manifest-first loading and diagnostics are thoughtful
- gateway protocol and runtime APIs make external integration practical
- strong operational tooling and security posture
- broad capability model supports many product directions without rewriting core

## 9. DX weaknesses

- enormous conceptual surface area
- difficult to identify the minimal stable extension contract inside such a large SDK/export map
- multiple large orchestration files hurt approachability
- contributors often need to understand runtime, gateway, channels, and plugin model together

## Context Window and Tool-Calling Diagrams

## Gateway-owned agent run

```text
incoming request/event
  -> gateway session + route resolution
  -> agentCommandInternal()
       -> config + secrets + auth-profile preparation
       -> session metadata + skill snapshot preparation
       -> model/default/thinking resolution
       -> runEmbeddedPiAgent()
            -> queue into session/global lanes
            -> create embedded Pi session
            -> stream assistant/tool/lifecycle events
            -> compaction/retry/failover as needed
  -> gateway emits responses/events back to client/channel
```

## Multi-agent structure

```text
OpenClaw multi-agent
├─ top-level isolated agents
│  ├─ workspace
│  ├─ agentDir
│  ├─ session store
│  ├─ auth profiles
│  └─ skills/tool/sandbox policy
└─ spawned subagents
   ├─ run mode or session mode
   ├─ child session keys
   ├─ attachment materialization
   ├─ thread/session binding
   └─ registry/lifecycle tracking
```

## Plugin platform

```text
plugin discovery
  -> manifest-first validation
  -> activation/enablement policy
  -> runtime load for native plugins
  -> register capabilities into central registry
  -> gateway/agent/channels consume registry
```

## Comparison Notes vs Pi, OpenCode, and Codebuff

### Compared to Pi

- OpenClaw is far broader and more infrastructure-oriented
- Pi is the cleaner local coding harness toolkit
- OpenClaw reuses/embeds Pi runtime concepts but wraps them in gateway/session/channel machinery
- Pi optimizes developer ergonomics for coding flows; OpenClaw optimizes persistent assistant deployment

### Compared to OpenCode

- both are productized and runtime-rich
- OpenCode is primarily a coding platform with client/server architecture
- OpenClaw is primarily a gateway platform with agent execution embedded inside it
- OpenClaw is much stronger on channels, routing, nodes, and operations
- OpenCode is easier to think about as a single coding product

### Compared to Codebuff

- Codebuff is more specialized around coding workflows and orchestrated worker agents
- OpenClaw is more generalized and operationally ambitious
- Codebuff's core differentiator is specialized agent composition
- OpenClaw's core differentiator is omnichannel persistent assistant infrastructure

## Preliminary Non-Scored Assessment

### AX

OpenClaw offers one of the strongest "real assistant" agent experiences because of:

- scoped agent identity
- gateway-managed sessions
- strong failover/retry behavior
- serious subagent infrastructure
- rich prompt/runtime policy

It is less clean and less minimal than the coding-focused harnesses, but more operationally robust.

### UX

OpenClaw's biggest UX advantage is breadth and persistence: the assistant can live across many channels/devices with one control plane. That makes it qualitatively different from terminal-only harnesses.

### DX

OpenClaw is probably the most powerful extension platform reviewed so far, but it is also the heaviest to learn. Its plugin architecture is impressive; its complexity cost is equally real.

## Final Takeaways

OpenClaw is engineered around a very different goal from the other harnesses explored so far.

It is not trying to be merely:
- a better local CLI agent
- a simpler coding harness
- a lightweight SDK wrapper

It is trying to be:

- a persistent assistant runtime
- a gateway for channels and devices
- a plugin-capability platform
- a secure and operable control plane
- an embedded-agent host with strong failure handling

Its strongest engineering traits are:

- gateway-first architecture
- highly structured agent scoping
- serious plugin/capability system
- operational reliability and failover design
- broad delivery and device surfaces
- subagent/session orchestration that is more formal than most peers

Its biggest tradeoff is scale:

- the codebase is massive
- the runtime model is multi-layered
- the cognitive load is very high

That makes OpenClaw less elegant as a minimal harness, but arguably the most ambitious and systems-oriented assistant platform in the set so far.
