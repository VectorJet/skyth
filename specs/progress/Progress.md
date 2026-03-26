# Progress

## 2026-03-26: Feature Audit - OpenClaw vs Skyth

### Architecture Comparison

| Aspect | OpenClaw | Skyth |
|--------|----------|-------|
| **Paradigm** | Plugin-based with SDK | Registry-based with manifests |
| **Entry Point** | `src/entry.ts` → `src/gateway/server.impl.ts` | `skyth/cli/main.ts` → `skyth/base/base_agent/runtime.ts` |
| **Plugin Loading** | `src/plugins/registry.ts` + `openclaw.plugin.json` | `skyth/core/registry.ts` + manifests |
| **Distribution** | 84+ extensions (monorepo packages) | Built-in + skills |
| **SDK** | Full plugin SDK with 200+ exports | Minimal - basic registries |

### OpenClaw Architecture Details

**Core Runtime (`src/gateway/server.impl.ts`):**
- Gateway-centric: single server handles all connections
- Auto-reply system: `src/auto-reply/reply/get-reply.ts`
- Reply pipeline: model selection → subagent spawn → tool execution → payloads
- Plugin bootstrap: `src/gateway/server-plugin-bootstrap.ts:109-110`

**Plugin System:**
- `openclaw.plugin.json` manifests
- 200+ SDK exports in package.json
- Extension types: channel, provider, tool, hook
- Marketplace: `openclaw install npm <package>`

**Provider System:**
- `src/plugins/provider-runtime.ts` - runtime management
- Auth profiles: `src/agents/auth-profiles/` (OAuth, API key, setup-token)
- Model selection: `src/agents/model-selection.ts`
- Usage tracking: `src/agents/usage.ts`

**Security Layers:**
- Tool policy: `src/agents/tool-policy.ts`
- FS policy: `src/agents/tool-fs-policy.ts`
- SSRF protection: `src/infra/net/ssrf.js`
- Exec approval: `src/gateway/exec-approval-manager.ts`
- Role-based access: `src/gateway/role-policy.ts`

**Build System:**
- `tsdown` bundler
- 888-line package.json with 150+ scripts
- Apps: android, ios, macOS (native apps)

---

### Skyth Architecture Details

**Core Runtime (`skyth/base/base_agent/runtime/`):**
- Agent loop: `runtime/agent_loop_runner.ts` - iterative LLM tool-calling
- Message processor: `runtime/message_processor.ts` - context building, onboarding
- Rate limiting with exponential backoff (max 5 attempts)
- Loop detection to prevent infinite cycles

**Registry System (`skyth/core/registry.ts`):**
- `ManifestRegistry<T>` - domain-based registration
- Manifest contract: id, name, version, entrypoint, capabilities, dependencies, security
- Fail-fast on internal errors, fail-open on external plugins

**Tool Registry (`skyth/registries/tool_registry.ts`):**
- Auto-discovers from `skyth/tools/` and workspace
- Supports: .py, .js, .ts, .sh, .bash, etc.
- Dynamic command inference

**Provider Registry (`skyth/providers/registry.ts`):**
- Static: openrouter, openai_codex, github_copilot, anthropic, openai, deepseek
- Dynamic: models.dev API caching

**Security:**
- Permission system: tool allowlist/denylist, workspace restriction
- Dangerous command detection: pattern matching
- Audit system: severity levels (info, warn, critical)

**Session Management:**
- SessionManager: in-memory + JSONL persistence
- SessionGraph: branching, merge history, auto-merge decisions
- MergeRouter: LLM-based merge/separation decisions

---

### Key Architectural Differences

| Area | OpenClaw | Skyth |
|------|----------|-------|
| **Extensibility** | Full plugin SDK with marketplace | Basic registry + skills |
| **Channels** | 40+ via extensions | 11 built-in |
| **Providers** | 60+ via extensions | 6 static + dynamic |
| **Native Apps** | Android, iOS, macOS | None |
| **Config** | JSON5 + env substitution + schema-gen | YAML + runtime JSON |
| **Security** | Layered: audit, tool policy, FS, SSRF, RBAC | Basic: permission, dangerous detection |
| **Message Flow** | Gateway → reply dispatcher → subagent | MessageBus → AgentLoop → Channel |
| **Session** | Basic key-based | Graph with branching/linking |

---

### OpenClaw-Only Features (Skyth Missing)

#### Channels (23 more than Skyth)
| Feature | OpenClaw | Skyth Status |
|---------|----------|--------------|
| Signal | extension | Missing |
| Matrix | extension | Missing |
| iMessage (BlueBubbles) | extension | Missing |
| IRC | extension | Missing |
| Nostr | extension | Missing |
| Microsoft Teams | extension | Missing |
| Nextcloud Talk | extension | Missing |
| Synology Chat | extension | Missing |
| Twitch | extension | Missing |
| Tlon | extension | Missing |
| Voice Call | extension | Missing |
| ACP (Apple Communication Protocol) | extension | Missing |
| Phone Control | extension | Missing |
| Synthetic (test channel) | extension | Missing |

#### Providers (50+ more than Skyth)
| Feature | OpenClaw | Skyth Status |
|---------|----------|--------------|
| Google/Gemini | extension | Missing |
| Microsoft/Azure | extension | Missing |
| Microsoft Foundry | extension | Missing |
| Ollama | extension | Missing |
| vLLM | extension | Missing |
| SGLang | extension | Missing |
| Groq | extension | Missing |
| Mistral | extension | Missing |
| HuggingFace | extension | Missing |
| Perplexity | extension | Missing |
| Together AI | extension | Missing |
| Cloudflare AI Gateway | extension | Missing |
| Vercel AI Gateway | extension | Missing |
| AWS Bedrock | extension | Missing (partially available) |
| Volcengine | extension | Missing |
| BytePlus | extension | Missing |
| Qianfan | extension | Missing |
| Moonshot (Kimi) | extension | Missing |
| Minimax | extension | Missing |
| NVIDIA NIM | extension | Missing |
| xAI (Grok) | extension | Missing |
| Firecrawl | extension | Missing |
| Exa | extension | Missing |
| Tavily | extension | Missing |
| Brave Search | extension | Missing |
| DuckDuckGo | extension | Missing |

#### Tools (20+ more than Skyth)
| Feature | OpenClaw | Skyth Status |
|---------|----------|--------------|
| Browser Automation (Playwright) | src/agents/tools/browser-tool.ts | Missing |
| Image Generation | src/agents/tools/image-generate-tool.ts | Missing |
| PDF Processing | src/agents/tools/pdf-tool.ts | Missing |
| Canvas Operations | src/agents/tools/canvas-tool.ts | Missing |
| Message Sending | src/agents/tools/message-tool.ts | Missing |
| Session Spawning | src/agents/tools/sessions-spawn-tool.ts | Missing |
| Agent Listing | src/agents/tools/agents-list-tool.ts | Missing |
| Subagent Management | src/agents/tools/subagents-tool.ts | Partial |
| MCP Tools | src/agents/pi-bundle-mcp-tools.ts | Missing |

#### Skills (50+ more than Skyth)
| Feature | OpenClaw | Skyth Status |
|---------|----------|--------------|
| Notion | skill | Missing |
| Obsidian | skill | Missing |
| Apple Notes | skill | Missing |
| Apple Reminders | skill | Missing |
| Bear Notes | skill | Missing |
| Things (Mac) | skill | Missing |
| Trello | skill | Missing |
| Slack (skill) | skill | Missing |
| GitHub | skill | Missing |
| GitHub Issues | skill | Missing |
| Spotify Player | skill | Missing |
| Sonos | skill | Missing |
| Philips Hue | skill | Missing |
| 1Password | skill | Missing |
| OpenHue | skill | Missing |
| Sonos CLI | skill | Missing |

#### Core Features
| Feature | OpenClaw | Skyth Status |
|---------|----------|--------------|
| Plugin SDK System | Full SDK with 200+ subpaths | Missing |
| Plugin Marketplace | openclaw install npm | Missing |
| MCP Protocol Support | @modelcontextprotocol/sdk | Missing |
| Docker Sandbox | src/agents/sandbox/ | Missing |
| Auto-Reply System | src/auto-reply/ | Missing |
| Image Generation Pipeline | src/image-generation/ | Missing |
| Media Understanding | src/media-understanding/ | Partial |
| TTS (Text-to-Speech) | src/tts/ | Missing |
| Cron System (advanced) | src/cron/ | Basic |
| Gateway (WebSocket) | src/gateway/ | Basic |
| Config Schema Generation | pnpm config:schema:gen | Missing |
| Plugin SDK API Baseline | pnpm plugin-sdk:api:gen | Missing |
| Protocol Code Generation | pnpm protocol:gen | Missing |
| i18n (zh-CN) | docs/zh-CN/ | Missing |
| Android App | apps/android/ | Missing |
| iOS App | apps/ios/ | Missing |
| macOS App | apps/macos/ | Missing |

---

### Skyth-Only Features (OpenClaw Missing)

#### Channels (7 more than OpenClaw)
| Feature | Skyth | OpenClaw Status |
|---------|-------|-----------------|
| DingTalk | skyth/channels/dingtalk.ts | Missing |
| QQ | skyth/channels/qq.ts | Missing |
| MoChat | skyth/channels/mochat.ts | Missing |
| Email (IMAP/SMTP) | skyth/channels/email.ts | Missing |

#### Providers (partial)
| Feature | Skyth | OpenClaw Status |
|---------|-------|-----------------|
| DeepSeek | skyth/providers/ | Extension available |
| OpenAI Codex | skyth/providers/openai_codex_provider.ts | Extension available |

#### Core Features
| Feature | Skyth | OpenClaw Status |
|---------|-------|-----------------|
| Session Graph | skyth/session/graph.ts | Missing (has basic sessions) |
| Session Bridging | skyth/session/router/ | Has session key routing |
| Memory Consolidation | skyth/memory/ | Has memory-core extension |
| Sticky Channel Bridging | skyth/session/router/patterns.ts | Missing |
| Multi-Agent Delegation | skyth/base/base_agent/delegation/ | Has subagent-registry |
| Python Tool Support | skyth/base/base_agent/tools/workspace.ts | Has workspace tools |

---

### Shared Features (Parity Notes)

| Feature | OpenClaw | Skyth | Parity |
|---------|----------|-------|--------|
| Web Channel | src/web | skyth/channels/web.ts | Skyth has streaming, OC has advanced |
| Telegram | src/telegram | skyth/channels/telegram/ | OC more mature |
| Discord | src/discord | skyth/channels/discord.ts | OC more mature |
| Slack | src/slack | skyth/channels/slack.ts | OC more mature |
| WhatsApp | extension | skyth/channels/whatsapp.ts | OC has Baileys, Skyth has Baileys |
| Feishu | extension | skyth/channels/feishu.ts | Similar |
| Anthropic | extension | skyth/providers/ | OC has more models |
| OpenAI | extension | skyth/providers/ | Similar |
| Exec Tool | src/agents/tools/bash-tools.exec.ts | skyth/tools/exec_tool.ts | OC has more policies |
| Read File | src/agents/tools/pi-tools.read.ts | skyth/tools/read_file_tool.ts | Similar |
| Write File | - | skyth/tools/write_file_tool.ts | OC uses different approach |
| Edit File | src/agents/tools/pi-tools.host-edit.ts | skyth/tools/edit_file_tool.ts | Similar |
| Web Search | extension (exa, tavily, etc.) | skyth/tools/websearch_tool.ts | OC has more providers |
| Weather Skill | skills/weather | skyth/skills/weather | Similar |
| GitHub Skill | skills/github | skyth/skills/github | Similar |
| Tmux Skill | skills/tmux | skyth/skills/tmux | Similar |
| Security/Audit | src/security/ | skyth/security/ | OC more comprehensive |
| Heartbeat | - | skyth/heartbeat/ | Missing in OC |
| Message Bus | - | skyth/bus/ | Missing in OC |
| ID System | - | skyth/id/ | Missing in OC |
| CLI | src/cli/, src/commands/ | skyth/cli/ | OC more commands |
| Config System | src/config/ | skyth/config/ | OC schema-generated |
| Tool Registry | plugin discovery | skyth/registries/ | Different patterns |
| Provider Registry | plugin discovery | skyth/providers/registry.ts | Different patterns |

---

### Summary

| Category | OpenClaw | Skyth | Gap |
|----------|----------|-------|-----|
| Channels | ~40 | ~11 | 29 more in OC |
| Providers | ~60 | ~6 | 54 more in OC |
| Skills | ~50 | ~7 | 43 more in OC |
| Core Features | Full plugin SDK, MCP, sandbox, mobile apps | Basic multi-channel, providers, tools | OC far ahead |

### Priority Additions for Skyth

1. **High**: MCP support, more channels (Signal, Matrix), more providers (Ollama, Google)
2. **Medium**: Plugin SDK, marketplace, browser automation, more skills
3. **Low**: Mobile apps, i18n, config schema generation tools

---

### Cherry-Pick Recommendations

Based on adaptability and implementation effort, here are the top elements to copy from OpenClaw:

#### Tier 1: High Impact, Low Effort

| Feature | OpenClaw Source | Effort | Skyth Benefit |
|---------|----------------|--------|---------------|
| **MCP Support** | `src/agents/pi-bundle-mcp-tools.ts` + `@modelcontextprotocol/sdk` | Low | Enable 100+ MCP servers |
| **OAuth Auth Profiles** | `src/agents/auth-profiles/` | Medium | Support GitHub Copilot, Codex OAuth |
| **Tool Schema Types** | `src/agents/tools/common.ts` | Low | Better type safety for tools |
| **Provider Discovery** | `src/plugins/provider-discovery.ts` | Medium | Auto-detect provider from API key |
| **Config Env Substitution** | `src/config/env-substitution.ts` | Low | Use `${ENV_VAR}` in config |

#### Tier 2: High Impact, Medium Effort

| Feature | OpenClaw Source | Effort | Skyth Benefit |
|---------|----------------|--------|---------------|
| **Plugin SDK Structure** | `src/plugin-sdk/` (200+ exports) | High | Full extensibility |
| **Browser Automation** | `src/agents/tools/browser-tool.ts` + `src/browser/` | Medium | Web automation, testing |
| **Channel Plugin Pattern** | `extensions/telegram/index.ts` | Medium | Standardized channel extension |
| **Provider Plugin Pattern** | `extensions/anthropic/index.ts` | Medium | Standardized provider extension |
| **Auth Profile System** | `src/agents/auth-profiles/types.ts` | Medium | Multi-profile rotation, OAuth |

#### Tier 3: Medium Impact, High Effort

| Feature | OpenClaw Source | Effort | Skyth Benefit |
|---------|----------------|--------|---------------|
| **Auto-Reply Pipeline** | `src/auto-reply/reply/get-reply.ts` | High | Sophisticated message handling |
| **Plugin Marketplace** | `openclaw install npm` | High | Community plugins |
| **Security Layers (RBAC)** | `src/gateway/role-policy.ts` | High | Role-based access control |
| **SSRF Protection** | `src/infra/net/ssrf.js` | Medium | Network security |
| **Usage Tracking** | `src/agents/usage.ts` | Medium | Cost monitoring |

---

#### Specific Files to Reference

**MCP Integration:**
- `refs/openclaw/src/agents/pi-bundle-mcp-tools.ts` - MCP client wrapper
- `refs/openclaw/src/agents/mcp-stdio.ts` - stdio transport
- `refs/openclaw/src/config/mcp-config.ts` - MCP config loading

**Plugin SDK:**
- `refs/openclaw/src/plugin-sdk/core.ts` - definePluginEntry, defineChannelPluginEntry
- `refs/openclaw/src/plugin-sdk/plugin-entry.ts` - plugin entry types
- `refs/openclaw/src/plugins/registry.ts` - plugin registry

**Auth Profiles:**
- `refs/openclaw/src/agents/auth-profiles/types.ts` - credential types (api_key, token, oauth)
- `refs/openclaw/src/agents/auth-profiles/oauth.ts` - OAuth flow

**Browser:**
- `refs/openclaw/src/agents/tools/browser-tool.ts` - main browser tool
- `refs/openclaw/src/browser/client.ts` - Playwright browser client

**Provider Pattern:**
- `refs/openclaw/extensions/anthropic/index.ts` - example provider plugin
- `refs/openclaw/src/plugins/provider-runtime.ts` - provider runtime

---

#### Recommended Implementation Order

1. **MCP Support** - Low effort, huge value, enables thousands of tools
2. **OAuth Auth** - Medium effort, enables Codex/Copilot
3. **Config Env Substitution** - Low effort, improves DX
4. **Provider Discovery** - Medium effort, simplifies setup
5. **Channel/Provider Plugin Patterns** - High effort, enables extensibility

---

## 2026-03-24: Merged Open Security PRs and Resolved Conflicts

### Completed
- Fast-forwarded local `main` to `origin/main`.
- Merged PR branch `sentinel/fix-string-comparison-timing-leaks-10569663541650304859` and kept the remaining net-new security updates in `skyth/auth/secret_store.ts` and `skyth/auth/device-fingerprint.ts`.
- Merged PR branch `sentinel-fix-path-traversal-exec-17772354415312226188` and applied the workspace traversal guard to both command text and `working_dir` in:
  - `skyth/base/base_agent/tools/shell.ts`
  - `skyth/tools/exec_tool.ts`
- Merged PR branch `sentinel-jwt-dos-fix-new` and resolved the JWT conflict by keeping the centralized `secureCompare` path in `skyth/auth/jwt.ts`, avoiding attacker-sized padding allocations.
- Rebuilt `.jules/sentinel.md` into a clean, deduplicated journal while preserving the relevant security notes introduced by the merged branches.

### Conflict Resolution Notes
- `skyth/auth/jwt.ts` had overlapping stale fixes from multiple PRs and `origin/main`. The final result keeps the current `secureCompare(base64url(expectedSignature), encodedSignature)` verification path.
- `.jules/sentinel.md` conflicted across all three PRs due to overlapping generated entries. The file was rewritten to preserve the meaningful notes without duplicated sections or unresolved shell interpolation text.

### Verification
- `bun run typecheck` passed.
- `bun test tests/` advanced through the merged auth timing tests successfully.
- `bun test tests/` also reported an unrelated existing timeout in `commands and provider matching > interactive flow skips config handling select when no config exists`.

### Files Changed
- `.jules/sentinel.md`
- `skyth/auth/device-fingerprint.ts`
- `skyth/auth/jwt.ts`
- `skyth/auth/secret_store.ts`
- `skyth/base/base_agent/tools/shell.ts`
- `skyth/tools/exec_tool.ts`
- `specs/progress/Progress.md`
