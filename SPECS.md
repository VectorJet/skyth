# Skyth Frontend Upgrade Specification

## Comparing with OpenClaw: A Comprehensive Implementation Guide

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Target Architecture](#target-architecture)
4. [Phase 1: Foundation & Core Infrastructure](#phase-1-foundation--core-infrastructure)
5. [Phase 2: Session Management & Chat Enhancements](#phase-2-session-management--chat-enhancements)
6. [Phase 3: Multi-Tab Interface & Navigation](#phase-3-multi-tab-interface--navigation)
7. [Phase 4: Mobile Optimization](#phase-4-mobile-optimization)
8. [Phase 5: Advanced Features](#phase-5-advanced-features)
9. [Backend Protocol Requirements](#backend-protocol-requirements)
10. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

This document outlines a comprehensive plan to upgrade Skyth's web frontend to match the feature completeness and architectural sophistication of OpenClaw's control UI. The current Skyth frontend is a minimal Svelte implementation focused solely on chat, while OpenClaw provides a full-featured control interface with session management, agent configuration, tool discovery, channel management, cron jobs, health monitoring, and more.

**Key Goals:**
- Establish a robust WebSocket gateway client with reconnection and authentication
- Implement comprehensive session management and chat history
- Create a multi-tab navigation system (similar to OpenClaw)
- Ensure mobile-responsive design with proper touch interactions
- Add tool streaming, reasoning display, and rich message components

---

## Current State Analysis

### Skyth Frontend (platforms/web)

**Technology Stack:**
- Svelte 5 with SvelteKit
- TailwindCSS 4 for styling
- Custom `GlobalState` class for minimal state management

**Current Features:**
- Basic chat interface with WebSocket connection
- Simple streaming support (text-delta, reasoning-delta, tool-call, tool-result)
- Minimal authentication via localStorage token
- Basic tool display component
- Reasoning support (collapsed by default)
- Single-page chat view only

**Gaps:**
- No session management (cannot list/switch sessions)
- No history persistence or reload
- No multi-tab navigation
- Incomplete event handling (missing abort, error states)
- No tool catalog or effective tools display
- No agent panel (identity, files, skills)
- No configuration UI
- No mobile optimization
- Limited authentication options (token only)

### OpenClaw Frontend (refs/openclaw/ui)

**Technology Stack:**
- Lit (Web Components) framework
- Custom component library with ~50+ state properties
- Rich event-driven architecture

**Architecture:**
- Single `OpenClawApp` class with extensive state management
- Controllers for different concerns (chat, sessions, agents, config, etc.)
- Gateway client with auto-reconnection, device auth, TLS validation
- Comprehensive event system (chat, agent, presence, sessions.changed, cron, etc.)

---

## Target Architecture

### Recommended Structure

```
platforms/web/src/
├── lib/
│   ├── components/
│   │   ├── chat/                 # Chat-specific components
│   │   │   ├── ChatContainer.svelte
│   │   │   ├── Message.svelte
│   │   │   ├── MessageContent.svelte
│   │   │   ├── ToolCard.svelte
│   │   │   ├── Reasoning.svelte
│   │   │   ├── Compose.svelte
│   │   │   └── ...
│   │   ├── layout/               # Layout components
│   │   │   ├── AppLayout.svelte
│   │   │   ├── Sidebar.svelte
│   │   │   ├── Header.svelte
│   │   │   └── MobileNav.svelte
│   │   ├── navigation/           # Tab navigation
│   │   │   ├── TabBar.svelte
│   │   │   └── TabContent.svelte
│   │   ├── sessions/             # Session management
│   │   │   ├── SessionList.svelte
│   │   │   ├── SessionItem.svelte
│   │   │   └── SessionHistory.svelte
│   │   ├── agents/               # Agent panel
│   │   │   ├── AgentList.svelte
│   │   │   ├── AgentIdentity.svelte
│   │   │   └── ToolsCatalog.svelte
│   │   ├── config/               # Configuration UI
│   │   │   ├── ConfigForm.svelte
│   │   │   └── ChannelConfig.svelte
│   │   └── ui/                   # Shared UI components
│   │       ├── Button.svelte
│   │       ├── Input.svelte
│   │       ├── Modal.svelte
│   │       └── ...
│   ├── state/
│   │   ├── store.svelte.ts       # Global state (replacing GlobalState)
│   │   ├── gateway.ts            # Gateway client state
│   │   ├── sessions.ts           # Session state
│   │   └── settings.ts           # User settings
│   ├── gateway/
│   │   ├── client.ts             # WebSocket client with reconnection
│   │   ├── protocol.ts           # Protocol types and validation
│   │   ├── events.ts             # Event handlers
│   │   └── auth.ts               # Authentication helpers
│   ├── api/
│   │   ├── chat.ts               # Chat API methods
│   │   ├── sessions.ts           # Sessions API methods
│   │   ├── agents.ts             # Agents API methods
│   │   ├── config.ts             # Config API methods
│   │   └── health.ts             # Health/status methods
│   └── utils/
│       ├── format.ts             # Formatting utilities
│       ├── storage.ts            # Storage helpers
│       └── validation.ts         # Input validation
└── routes/
    ├── +layout.svelte            # App shell with navigation
    ├── +page.svelte              # Chat view (default tab)
    ├── sessions/+page.svelte     # Sessions tab
    ├── agents/+page.svelte       # Agents tab
    ├── config/+page.svelte       # Configuration tab
    ├── health/+page.svelte       # Health monitoring tab
    └── auth/+page.svelte         # Authentication page
```

---

## Phase 1: Foundation & Core Infrastructure

### 1.1 Enhanced Gateway Client

**Objective:** Replace the basic WebSocket handling with a robust client matching OpenClaw's `GatewayBrowserClient`.

**Required Features:**
- Automatic reconnection with exponential backoff
- Connect challenge/nonce handling
- Device authentication support (when secure context available)
- Token-based authentication with device token fallback
- Sequence tracking for event gap detection
- Proper error handling and recovery

**Implementation:**

```typescript
// platforms/web/src/lib/gateway/client.ts

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

export type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

export type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  server?: { version?: string; connId?: string };
  features?: { methods?: string[]; events?: string[] };
  snapshot?: unknown;
  auth?: { deviceToken?: string; role?: string; scopes?: string[] };
  policy?: { tickIntervalMs?: number };
};

export class GatewayBrowserClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private lastSeq: number | null = null;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: number | null = null;
  private backoffMs = 800;
  
  constructor(private opts: GatewayClientOptions) {}
  
  start() { /* ... */ }
  stop() { /* ... */ }
  request<T>(method: string, params?: unknown): Promise<T> { /* ... */ }
  // Handle connect challenge, auth, reconnection, etc.
}
```

**Key Methods to Implement:**
- `connect()` - Establish WebSocket connection with challenge
- `sendConnect()` - Send authentication with nonce
- `scheduleReconnect()` - Exponential backoff reconnection
- `handleMessage()` - Process events, responses, detect gaps

### 1.2 State Management Overhaul

**Objective:** Replace `GlobalState` with comprehensive state management.

**Required State Properties:**

```typescript
// platforms/web/src/lib/state/store.svelte.ts

export class AppState {
  // Connection state
  status = $state<"disconnected" | "connecting" | "connected">("disconnected");
  lastError = $state<string | null>(null);
  lastErrorCode = $state<string | null>(null);
  hello = $state<GatewayHelloOk | null>(null);
  
  // Authentication
  token = $state<string | null>(null);
  password = $state<string>("");
  authenticated = $state(false);
  
  // Session
  sessionKey = $state<string>("");
  sessionList = $state<SessionRow[]>([]);
  sessionLoading = $state(false);
  
  // Chat
  chatMessages = $state<unknown[]>([]);
  chatLoading = $state(false);
  chatSending = $state(false);
  chatMessage = $state("");
  chatAttachments = $state<ChatAttachment[]>([]);
  chatRunId = $state<string | null>(null);
  chatStream = $state<string | null>(null);
  chatStreamStartedAt = $state<number | null>(null);
  
  // Tool streaming
  toolStreamById = $state<Map<string, ToolStreamEntry>>(new Map());
  toolStreamOrder = $state<string[]>([]);
  
  // Reasoning
  chatThinkingLevel = $state<string | null>(null);
  
  // Navigation
  tab = $state<Tab>("chat");
  navDrawerOpen = $state(false);
  
  // Agents
  agentsList = $state<AgentsListResult | null>(null);
  agentsSelectedId = $state<string | null>(null);
  toolsCatalog = $state<ToolsCatalogResult | null>(null);
  toolsEffective = $state<ToolsEffectiveResult | null>(null);
  
  // Config
  configSnapshot = $state<ConfigSnapshot | null>(null);
  configSchema = $state<unknown>(null);
  configLoading = $state(false);
  configSaving = $state(false);
  
  // Channels
  channelsStatus = $state<ChannelsStatusSnapshot | null>(null);
  channelsLoading = $state(false);
  
  // Health
  healthResult = $state<HealthSummary | null>(null);
  healthLoading = $state(false);
  
  // Cron
  cronJobs = $state<CronJob[]>([]);
  cronStatus = $state<CronStatus | null>(null);
  cronLoading = $state(false);
  
  // Overview
  presenceEntries = $state<PresenceEntry[]>([]);
  attentionItems = $state<AttentionItem[]>([]);
  
  // Theme
  theme = $state<ThemeName>("claw");
  themeMode = $state<ThemeMode>("system");
}
```

### 1.3 Event Handling System

**Objective:** Implement comprehensive event handlers matching OpenClaw's patterns.

**Events to Handle:**
- `connect.challenge` - Initial nonce challenge
- `connect.ok` - Successful authentication
- `chat` - Chat stream events (delta, final, aborted, error)
- `agent` - Agent tool events (start, delta, result, error)
- `presence` - Gateway presence updates
- `sessions.changed` - Session list changed
- `cron` - Cron job status updates
- `device.pair.*` - Device pairing events
- `exec.approval.*` - Execution approval requests
- `shutdown` - Gateway shutdown/restart

---

## Phase 2: Session Management & Chat Enhancements

### 2.1 Session List & Selection

**Objective:** Allow users to view, select, and manage conversation sessions.

**UI Components:**

```svelte
<!-- platforms/web/src/lib/components/sessions/SessionList.svelte -->
<script lang="ts">
  import { appState } from "$lib/state/store.svelte";
  
  // Session row interface
  interface SessionRow {
    key: string;
    kind: "direct" | "group" | "global" | "unknown";
    label?: string;
    displayName?: string;
    surface?: string;
    updatedAt: number | null;
    status?: "running" | "done" | "failed" | "killed" | "timeout";
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    model?: string;
    modelProvider?: string;
  }
</script>

<div class="session-list">
  {#each appState.sessionList as session (session.key)}
    <button 
      class="session-item"
      class:active={appState.sessionKey === session.key}
      onclick={() => selectSession(session.key)}
    >
      <span class="session-name">{session.displayName || session.key}</span>
      <span class="session-meta">
        {formatTokens(session.totalTokens)} · {formatDate(session.updatedAt)}
      </span>
      {#if session.status === "running"}
        <span class="status-indicator running">●</span>
      {/if}
    </button>
  {/each}
</div>
```

**Features:**
- List all sessions with pagination
- Filter by active/recent/global
- Sort by key/kind/updated/tokens
- Search/filter sessions
- Display token usage per session
- Show run status (running, done, failed)

### 2.2 Chat History Persistence

**Objective:** Load and persist chat history across sessions.

**Implementation:**

```typescript
// platforms/web/src/lib/api/chat.ts

export async function loadChatHistory(
  client: GatewayBrowserClient,
  sessionKey: string,
  limit: number = 200
): Promise<ChatMessage[]> {
  const res = await client.request<{
    messages?: ChatMessage[];
    thinkingLevel?: string;
  }>("chat.history", { sessionKey, limit });
  
  return (res.messages || []).filter(msg => !isSilentReplyMessage(msg));
}

export async function sendChatMessage(
  client: GatewayBrowserClient,
  sessionKey: string,
  message: string,
  attachments?: ChatAttachment[]
): Promise<string> {
  const runId = crypto.randomUUID();
  
  await client.request("chat.send", {
    sessionKey,
    message: message.trim(),
    deliver: false,
    idempotencyKey: runId,
    attachments: attachments?.map(att => ({
      type: "image",
      mimeType: att.mimeType,
      content: att.content
    }))
  });
  
  return runId;
}

export async function abortChatRun(
  client: GatewayBrowserClient,
  sessionKey: string,
  runId?: string
): Promise<boolean> {
  try {
    await client.request(
      "chat.abort",
      runId ? { sessionKey, runId } : { sessionKey }
    );
    return true;
  } catch {
    return false;
  }
}
```

### 2.3 Enhanced Chat Streaming

**Objective:** Implement full streaming support including abort and error handling.

**Streaming Event Types:**

```typescript
// Chat event payload types
export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: ChatMessage;
  errorMessage?: string;
};

export type AgentEventPayload = {
  runId: string;
  sessionKey: string;
  toolCallId: string;
  toolName: string;
  state: "start" | "delta" | "result" | "error";
  input?: unknown;
  output?: unknown;
  error?: string;
};

export type ToolStreamEntry = {
  id: string;
  name: string;
  state: "running" | "completed" | "error";
  input?: unknown;
  output?: unknown;
  startedAt: number;
  resultAt?: number;
  error?: string;
};
```

**Handling Different States:**

1. **delta** - Append to streaming content
2. **final** - Add message to history, clear stream
3. **aborted** - Handle partial content, mark as aborted
4. **error** - Display error, clear stream state

### 2.4 Rich Message Components

**Objective:** Create comprehensive message rendering components.

**Message Component Hierarchy:**

```
Message.svelte
├── MessageContent.svelte
│   ├── MessageRole.svelte (avatar, name, timestamp)
│   ├── Reasoning.svelte (collapsible reasoning display)
│   │   ├── ReasoningTrigger.svelte
│   │   └── ReasoningContent.svelte (markdown rendered)
│   ├── ToolCards.svelte (tool call display)
│   │   ├── ToolCard.svelte
│   │   │   ├── ToolHeader.svelte (name, state indicator)
│   │   │   ├── ToolInput.svelte (JSON viewer)
│   │   │   └── ToolOutput.svelte (result display)
│   ├── Markdown.svelte (main content with code highlighting)
│   └── Attachments.svelte (image previews)
```

---

## Phase 3: Multi-Tab Interface & Navigation

### 3.1 Tab Navigation System

**Objective:** Implement comprehensive tab navigation matching OpenClaw.

**Tabs:**
1. **Chat** - Main conversation interface (current)
2. **Sessions** - Session management and history
3. **Agents** - Agent identity, files, tools, skills
4. **Config** - Gateway and channel configuration
5. **Channels** - Channel status and management
6. **Cron** - Cron job management
7. **Health** - System health monitoring
8. **Debug** - Developer debug tools
9. **Logs** - Log viewer with filtering
10. **Overview** - Dashboard with attention items

**Implementation:**

```svelte
<!-- platforms/web/src/lib/components/navigation/TabBar.svelte -->
<script lang="ts">
  import { appState } from "$lib/state/store.svelte";
  
  type Tab = "chat" | "sessions" | "agents" | "config" | "channels" | 
             "cron" | "health" | "debug" | "logs" | "overview";
  
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "chat", label: "Chat", icon: "💬" },
    { id: "sessions", label: "Sessions", icon: "📋" },
    { id: "agents", label: "Agents", icon: "🤖" },
    { id: "config", label: "Config", icon: "⚙️" },
    { id: "channels", label: "Channels", icon: "📡" },
    { id: "cron", label: "Cron", icon: "⏰" },
    { id: "health", label: "Health", icon: "💚" },
    { id: "debug", label: "Debug", icon: "🔧" },
    { id: "logs", label: "Logs", icon: "📜" },
    { id: "overview", label: "Overview", icon: "📊" },
  ];
</script>

<nav class="tab-bar">
  {#each tabs as tab}
    <button 
      class="tab"
      class:active={appState.tab === tab.id}
      onclick={() => appState.tab = tab.id}
    >
      <span class="tab-icon">{tab.icon}</span>
      <span class="tab-label">{tab.label}</span>
    </button>
  {/each}
</nav>
```

### 3.2 Agent Panel

**Objective:** Provide agent management including identity, files, tools, and skills.

**Sub-panels:**
- **Overview** - Agent list with status
- **Files** - Workspace file browser with edit capability
- **Tools** - Tools catalog and effective tools for session
- **Skills** - Skill status and management

```svelte
<!-- platforms/web/src/lib/components/agents/AgentList.svelte -->
<script lang="ts">
  import { appState } from "$lib/state/store.svelte";
  
  // Agent types
  interface AgentRow {
    id: string;
    name: string;
    description?: string;
    avatar?: string;
    emoji?: string;
  }
</script>

<div class="agents-panel">
  <div class="agents-list">
    {#each appState.agentsList?.agents ?? [] as agent}
      <button 
        class="agent-item"
        class:selected={appState.agentsSelectedId === agent.id}
        onclick={() => appState.agentsSelectedId = agent.id}
      >
        <span class="agent-avatar">{agent.emoji || "🤖"}</span>
        <span class="agent-name">{agent.name}</span>
      </button>
    {/each}
  </div>
  
  <div class="agent-detail">
    <!-- Selected agent detail view -->
    {#if appState.agentsPanel === "files"}
      <AgentFiles />
    {:else if appState.agentsPanel === "tools"}
      <ToolsCatalog />
    {:else if appState.agentsPanel === "skills"}
      <SkillStatus />
    {/if}
  </div>
</div>
```

### 3.3 Configuration UI

**Objective:** Allow users to view and modify gateway configuration.

**Features:**
- JSON editor with validation
- Form-based configuration (generated from schema)
- Section navigation (appearance, automation, infrastructure, etc.)
- Search within config
- Config history/diff view
- Import/export config

```svelte
<!-- platforms/web/src/lib/components/config/ConfigForm.svelte -->
<script lang="ts">
  import { appState } from "$lib/state/store.svelte";
  
  // Render form based on schema and UI hints
  // Support nested sections, validation, etc.
</script>

<div class="config-form">
  {#each Object.entries(appState.configForm) as [section, fields]}
    <section class="config-section">
      <h3>{section}</h3>
      {#each Object.entries(fields) as [key, value]}
        <ConfigField 
          {key} 
          {value}
          hint={appState.configUiHints[key]}
          onchange={(v) => updateConfig(section, key, v)}
        />
      {/each}
    </section>
  {/each}
</div>
```

---

## Phase 4: Mobile Optimization

### 4.1 Responsive Layout

**Objective:** Ensure all features work on mobile devices.

**Breakpoints:**
- Mobile: < 640px (single column, bottom nav)
- Tablet: 640px - 1024px (collapsible sidebar)
- Desktop: > 1024px (full sidebar)

```css
/* Mobile-first responsive design */
.tab-bar {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
}

@media (min-width: 1024px) {
  .tab-bar {
    flex-direction: column;
    width: 200px;
  }
}

.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

@media (min-width: 1024px) {
  .chat-container {
    flex-direction: row;
  }
}
```

### 4.2 Touch Interactions

**Objective:** Provide native-feeling touch interactions.

**Required Features:**
- Swipe to navigate between tabs
- Long-press for context menus
- Pull-to-refresh for session list
- Pinch-to-zoom for code/logs
- Keyboard shortcuts via physical keyboard

```svelte
<!-- Mobile navigation with swipe -->
<script lang="ts">
  let touchStartX = $state(0);
  let touchEndX = $state(0);
  
  function handleTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX;
  }
  
  function handleTouchEnd(e: TouchEvent) {
    touchEndX = e.changedTouches[0].clientX;
    handleSwipe();
  }
  
  function handleSwipe() {
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        nextTab(); // Swipe left = next
      } else {
        prevTab(); // Swipe right = prev
      }
    }
  }
</script>

<div 
  class="touch-container"
  ontouchstart={handleTouchStart}
  ontouchend={handleTouchEnd}
>
  <slot />
</div>
```

### 4.3 Mobile-Specific Components

**Objective:** Adapt UI for smaller screens.

**Changes:**
- Bottom tab bar instead of side navigation
- Collapsible sections with touch targets
- Larger touch targets (min 44px)
- Simplified input with voice input option
- Haptic feedback for important actions

---

## Phase 5: Advanced Features

### 5.1 Tool Streaming Display

**Objective:** Show real-time tool execution with input/output.

```svelte
<!-- platforms/web/src/lib/components/chat/ToolCard.svelte -->
<script lang="ts">
  interface Props {
    toolCall: ToolStreamEntry;
  }
  
  let { toolCall }: Props = $props();
  
  const stateColors = {
    running: "border-blue-500",
    completed: "border-green-500", 
    error: "border-red-500"
  };
</script>

<div class="tool-card border-l-4 {stateColors[toolCall.state]}">
  <div class="tool-header">
    <span class="tool-name">{toolCall.name}</span>
    <span class="tool-state">{toolCall.state}</span>
    {#if toolCall.startedAt}
      <span class="tool-duration">
        {Date.now() - toolCall.startedAt}ms
      </span>
    {/if}
  </div>
  
  {#if toolCall.input}
    <div class="tool-input">
      <pre>{JSON.stringify(toolCall.input, null, 2)}</pre>
    </div>
  {/if}
  
  {#if toolCall.output}
    <div class="tool-output">
      <pre>{JSON.stringify(toolCall.output, null, 2)}</pre>
    </div>
  {/if}
  
  {#if toolCall.error}
    <div class="tool-error">
      {toolCall.error}
    </div>
  {/if}
</div>
```

### 5.2 Reasoning Display

**Objective:** Show AI reasoning with proper formatting.

```svelte
<!-- platforms/web/src/lib/components/chat/Reasoning.svelte -->
<script lang="ts">
  interface Props {
    reasoning: string;
    collapsed?: boolean;
  }
  
  let { reasoning, collapsed = true }: Props = $props();
  let isOpen = $state(!collapsed);
</script>

<div class="reasoning">
  <button 
    class="reasoning-trigger"
    onclick={() => isOpen = !isOpen}
  >
    <span class="icon">{isOpen ? "▼" : "▶"}</span>
    <span>AI Reasoning</span>
    <span class="token-count">
      ~{Math.ceil(reasoning.length / 4)} tokens
    </span>
  </button>
  
  {#if isOpen}
    <div class="reasoning-content">
      <Markdown content={reasoning} />
    </div>
  {/if}
</div>
```

### 5.3 Presence & Status Indicators

**Objective:** Show connected clients and system status.

```svelte
<!-- platforms/web/src/lib/components/overview/PresenceList.svelte -->
<script lang="ts">
  import { appState } from "$lib/state/store.svelte";
</script>

<div class="presence-list">
  <h3>Connected Clients</h3>
  {#each appState.presenceEntries as entry}
    <div class="presence-entry">
      <span class="presence-host">{entry.host}</span>
      <span class="presence-ip">{entry.ip}</span>
      <span class="presence-mode">{entry.mode}</span>
      <span class="presence-last-input">
        {entry.lastInputSeconds}s ago
      </span>
    </div>
  {/each}
</div>
```

---

## Backend Protocol Requirements

### Required Gateway Methods

```typescript
// Current Skyth (4 methods)
const GATEWAY_METHODS = [
  "chat.send",
  "chat.history", 
  "health",
  "status",
] as const;

// Required for full feature parity (50+ methods in OpenClaw)
const REQUIRED_METHODS = [
  // Chat
  "chat.send",
  "chat.history",
  "chat.abort",
  "sessions.reset",
  "sessions.patch",
  
  // Sessions
  "sessions.list",
  "sessions.get",
  "sessions.history",
  
  // Agents
  "agents.list",
  "agents.identity",
  "agents.files.list",
  "agents.files.get",
  "agents.files.set",
  
  // Tools
  "tools.catalog",
  "tools.effective",
  
  // Config
  "config.snapshot",
  "config.schema",
  "config.apply",
  "config.validate",
  
  // Channels
  "channels.status",
  "channels.configure",
  
  // Cron
  "cron.status",
  "cron.jobs.list",
  "cron.jobs.get",
  "cron.jobs.set",
  "cron.jobs.delete",
  "cron.runs.list",
  
  // Health
  "health.summary",
  "health.probe",
  
  // Presence
  "presence.list",
  
  // Exec Approval
  "exec.approval.list",
  "exec.approval.resolve",
  
  // Model
  "models.catalog",
  "models.selected",
  "models.select",
] as const;
```

### Required Events

```typescript
const REQUIRED_EVENTS = [
  "connect.challenge",
  "connect.ok",
  "connect.error",
  "chat",
  "agent",
  "presence",
  "sessions.changed",
  "sessions.deleted",
  "cron",
  "cron.run",
  "device.pair.requested",
  "device.pair.resolved",
  "exec.approval.requested",
  "exec.approval.resolved",
  "update.available",
  "shutdown",
] as const;
```

### Protocol Enhancements

1. **Sequence Tracking**: Add `seq` field to events for gap detection
2. **Version Negotiation**: Support min/max protocol version
3. **Device Auth**: Implement device identity signing
4. **TLS Validation**: Add optional TLS fingerprint validation
5. **Request Timeouts**: Implement request timeout handling
6. **Final Responses**: Support "accepted" + "final" response pattern

---

## Implementation Roadmap

### Phase 1: Foundation (2-3 weeks)
- [ ] Enhanced Gateway client with reconnection
- [ ] State management overhaul
- [ ] Basic event handling (connect, chat)
- [ ] Project structure setup

### Phase 2: Chat & Sessions (2-3 weeks)
- [ ] Session list and selection
- [ ] Chat history loading
- [ ] Full streaming support (delta, final, abort, error)
- [ ] Rich message components

### Phase 3: Multi-Tab (2-3 weeks)
- [ ] Tab navigation system
- [ ] Agents panel
- [ ] Config UI
- [ ] Channel status

### Phase 4: Mobile (1-2 weeks)
- [ ] Responsive layout
- [ ] Touch interactions
- [ ] Mobile-specific components

### Phase 5: Advanced (2-3 weeks)
- [ ] Tool streaming display
- [ ] Reasoning display
- [ ] Presence indicators
- [ ] Cron management
- [ ] Health monitoring

---

## Appendix: Component Reference

### Type Definitions

```typescript
// Full type definitions would be in platforms/web/src/lib/types.ts
// Refer to OpenClaw's types.ts for complete interfaces

export interface GatewayClientOptions {
  url: string;
  token?: string;
  password?: string;
  clientName?: string;
  clientVersion?: string;
  mode?: "webchat" | "backend" | "probe";
  instanceId?: string;
  onHello?: (hello: GatewayHelloOk) => void;
  onEvent?: (evt: GatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string }) => void;
  onGap?: (info: { expected: number; received: number }) => void;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: ContentBlock[];
  timestamp?: number;
  metadata?: {
    reasoning?: string;
    tool_calls?: ToolCall[];
    model?: string;
  };
}

export interface ContentBlock {
  type: "text" | "image" | "tool-use" | "tool-result";
  text?: string;
  source?: { type: "base64"; media_type: string; data: string };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface SessionRow {
  key: string;
  kind: "direct" | "group" | "global" | "unknown";
  displayName?: string;
  updatedAt: number | null;
  status?: SessionRunStatus;
  totalTokens?: number;
  model?: string;
}

export interface AgentRow {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  emoji?: string;
}
```

### API Reference

```typescript
// Complete API methods would be in platforms/web/src/lib/api/index.ts

export class GatewayAPI {
  constructor(private client: GatewayBrowserClient) {}
  
  // Chat
  async sendMessage(sessionKey: string, message: string, attachments?: ChatAttachment[]): Promise<string>
  async loadHistory(sessionKey: string, limit?: number): Promise<ChatMessage[]>
  async abortRun(sessionKey: string, runId?: string): Promise<boolean>
  
  // Sessions
  async listSessions(filter?: SessionFilter): Promise<SessionsListResult>
  async getSession(key: string): Promise<SessionRow>
  async patchSession(key: string, patch: SessionPatch): Promise<void>
  async resetSession(key: string): Promise<void>
  
  // Agents
  async listAgents(): Promise<AgentsListResult>
  async getAgentIdentity(id: string): Promise<AgentIdentityResult>
  async listAgentFiles(id: string): Promise<AgentsFilesListResult>
  
  // Tools
  async getToolsCatalog(): Promise<ToolsCatalogResult>
  async getToolsEffective(sessionKey: string): Promise<ToolsEffectiveResult>
  
  // Config
  async getConfigSnapshot(): Promise<ConfigSnapshot>
  async getConfigSchema(): Promise<ConfigSchemaResponse>
  async applyConfig(config: Record<string, unknown>): Promise<void>
  
  // Channels
  async getChannelsStatus(): Promise<ChannelsStatusSnapshot>
  
  // Cron
  async getCronStatus(): Promise<CronStatus>
  async listCronJobs(filter?: CronFilter): Promise<CronJobsListResult>
  async setCronJob(job: CronJob): Promise<void>
  
  // Health
  async getHealthSummary(): Promise<HealthSummary>
}
```

---

*Document Version: 1.0*
*Last Updated: {current_date}*
*Reference: OpenClaw Control UI (refs/openclaw/ui)*