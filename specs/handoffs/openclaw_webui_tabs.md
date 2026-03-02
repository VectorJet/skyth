# OpenClaw WebUI Tabs - Detailed Functionality

## Overview

The OpenClaw webui is located in `/refs/openclaw/ui/src/ui/views/` and uses Lit web components. The navigation is defined in `/refs/openclaw/ui/src/ui/navigation.ts`.

## Tab Groups and Functionality

---

### 1. Chat Tab (Default)
**Path:** `/chat`  
**Icon:** `messageSquare`  
**File:** `chat.ts`

**Functionality:**
- Main chat interface for interacting with agents
- Session management (create, switch, delete sessions)
- Message composition with rich text support
- Image attachments handling
- Streaming responses display
- Compaction indicator (session context compression)
- Fallback status indicator (model/agent fallback handling)
- Focus mode toggle
- Sidebar for markdown content
- Queue management for pending messages

**Key Features:**
- Session key management
- Thinking level control
- Draft auto-save
- Scroll control with "new messages" indicator
- Assistant avatar/name customization

---

### 2. Control Group

#### 2.1 Overview Tab
**Path:** `/overview`  
**Icon:** `barChart`  
**File:** `overview.ts`

**Functionality:**
- Connection status display (connected/disconnected)
- Gateway hello information (uptime, tick interval, auth mode)
- Password management
- Session key management
- Presence count display
- Sessions count
- Cron scheduler status and next run time
- Last channels refresh timestamp
- Device pairing hints and instructions
- Authentication hints

#### 2.2 Channels Tab
**Path:** `/channels`  
**Icon:** `link`  
**File:** `channels.ts` (+ channel-specific files)

**Functionality:**
- Manage all communication channels
- Channel health monitoring with status snapshots

**Supported Channels:**
- **WhatsApp** (`channels.whatsapp.ts`)
- **Telegram** (`channels.telegram.ts`)
- **Discord** (`channels.discord.ts`)
- **Google Chat** (`channels.googlechat.ts`)
- **Slack** (`channels.slack.ts`)
- **Signal** (`channels.signal.ts`)
- **iMessage** (`channels.imessage.ts`)
- **Nostr** (`channels.nostr.ts`, `channels.nostr-profile-form.ts`)

**Features:**
- Per-channel enable/disable toggles
- Channel account management
- Channel-specific configuration forms
- Status monitoring with last success timestamps

#### 2.3 Instances Tab
**Path:** `/instances`  
**Icon:** `radio`  
**File:** `instances.ts`

**Functionality:**
- Display connected instances (presence beacons)
- Show instance details:
  - Last input time
  - Mode (web, CLI, etc.)
  - Roles
  - Scopes
- Real-time presence information from gateway and clients

#### 2.4 Sessions Tab
**Path:** `/sessions`  
**Icon:** `fileText`  
**File:** `sessions.ts`

**Functionality:**
- List all agent sessions
- Filter sessions by:
  - Active minutes
  - Limit
  - Include global sessions
  - Include unknown sessions
- Session management:
  - Patch session labels
  - Adjust thinking level
  - Adjust verbose level
  - Adjust reasoning level
  - Delete sessions
- Session tokens display
- Session details panel

**Thinking Levels:** "", "off", "minimal", "low", "medium", "high", "xhigh"  
**Verbose Levels:** "inherit", "off (explicit)", "on", "full"  
**Reasoning Levels:** "", "off", "on", "stream"

#### 2.5 Usage Tab
**Path:** `/usage`  
**Icon:** `barChart`  
**File:** `usage.ts`, `usage-metrics.ts`, `usage-query.ts`, `usage-render-overview.ts`, `usage-render-details.ts`

**Functionality:**
- Usage analytics and metrics
- Cost breakdown by provider/model
- Daily usage charts
- Token usage tracking
- Peak error hours analysis
- Usage insights
- CSV export capabilities:
  - Daily CSV
  - Sessions CSV
- Query-based filtering
- Session detail panels
- Filter chips for quick filtering

**Metrics Displayed:**
- Total costs
- Token counts
- Daily charts (mosaic view)
- Cost breakdown by provider
- Usage insights

#### 2.6 Cron Tab
**Path:** `/cron`  
**Icon:** `loader`  
**File:** `cron.ts`

**Functionality:**
- Cron job management
- Job scheduling with cron expressions
- Job form with fields:
  - Schedule
  - Agent selection
  - Model selection
  - Thinking level
  - Timezone
  - Delivery settings
- Job CRUD operations:
  - Add new jobs
  - Edit existing jobs
  - Clone jobs
  - Delete jobs
- Cron run logs:
  - Run status tracking
  - Delivery status tracking
  - Scope filtering
- Job filtering and sorting
- Next run time display

---

### 3. Agent Group

#### 3.1 Agents Tab
**Path:** `/agents`  
**Icon:** `folder`  
**File:** `agents.ts`, `agents-utils.ts`, `agents-panels-*.ts`

**Functionality:**
- Agent configuration and management
- Sub-panels:
  - **Overview** - Agent identity and status
  - **Files** - Workspace files management (edit, save, reset)
  - **Tools** - Tool catalog and profile management
  - **Skills** - Skill management per agent
  - **Channels** - Channel assignment per agent
  - **Cron** - Cron job assignment per agent
- Model selection and fallback configuration
- Agent identity (name, emoji)
- Tools profile management:
  - Profile selection
  - Also-allow tool list
  - Deny list
- Multi-agent support

#### 3.2 Skills Tab
**Path:** `/skills`  
**Icon:** `zap`  
**File:** `skills.ts`, `skills-grouping.ts`, `skills-shared.ts`

**Functionality:**
- Browse all available skills
- and search
- Skill Skill filtering status display:
  - Enabled/disabled state
  - Missing dependencies
  - Error reasons
- Skill management:
  - Toggle skills on/off
  - Edit skill values
  - Save skill configurations
  - Install new skills
- Skill grouping (bundled, managed, workspace)
- Skill messages display

#### 3.3 Nodes Tab
**Path:** `/nodes`  
**Icon:** `monitor`  
**File:** `nodes.ts`, `nodes-exec-approvals.ts`

**Functionality:**
- **Exec Approvals** - Command execution approval rules
  - Gateway-level approvals
  - Per-node approvals
  - Agent-specific rules
  - Form and raw editing modes
- **Bindings** - Device to agent binding
  - Default gateway binding
  - Per-agent node bindings
  - Bind/save operations
- **Devices** - Paired device management
  - Device listing
  - Device approval (approve/reject pending)
  - Device role management
  - Device revocation
  - Token rotation
- **Node Configuration** - Node-specific config loading

---

### 4. Settings Group

#### 4.1 Config Tab
**Path:** `/config`  
**Icon:** `settings`  
**File:** `config.ts`, `config-form.ts`, `config-search.ts`

**Functionality:**
- Gateway configuration management
- Two editing modes:
  - **Form mode** - Structured form with sections
  - **Raw mode** - Direct JSON editing
- Configuration sections:
  - Security
  - Auth
  - Network
  - Access
  - Privacy
  - Observability
  - Performance
  - Reliability
  - Storage
  - Models
  - Media
  - Automation
  - Channels
  - Tools
  - Advanced
- Search functionality with tag filters
- Config validation
- Save, apply, and update operations
- Reload configuration

**Tag Search Presets:** security, auth, network, access, privacy, observability, performance, reliability, storage, models, media, automation, channels, tools, advanced

#### 4.2 Debug Tab
**Path:** `/debug`  
**Icon:** `bug`  
**File:** `debug.ts`

**Functionality:**
- **Snapshots:**
  - Status data display
  - Health data display
  - Heartbeat data display
- Security audit summary:
  - Critical issues count
  - Warnings count
  - Info count
- **Event Log:**
  - Real-time event logging
  - Event payload formatting
- **RPC Testing:**
  - Method calling interface
  - Parameter input
  - Result/Error display
- Manual refresh capability
- Gateway method exploration

#### 4.3 Logs Tab
**Path:** `/logs`  
**Icon:** `scrollText`  
**File:** `logs.ts`

**Functionality:**
- Log viewing interface
- Log level filtering:
  - trace
  - debug
  - info
  - warn
  - error
  - fatal
- Text search/filtering
- Auto-follow mode
- Log export functionality
- Multiple log files support
- Scroll management
- Truncation handling

---

## Tab Navigation Structure

```
TAB_GROUPS = [
  { label: "chat", tabs: ["chat"] },
  { label: "control", tabs: ["overview", "channels", "instances", "sessions", "usage", "cron"] },
  { label: "agent", tabs: ["agents", "skills", "nodes"] },
  { label: "settings", tabs: ["config", "debug", "logs"] },
]
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `navigation.ts` | Tab definitions, paths, icons, titles |
| `chat.ts` | Main chat interface |
| `overview.ts` | Dashboard/overview |
| `channels.ts` | Channel management |
| `instances.ts` | Connected instances |
| `sessions.ts` | Session management |
| `usage.ts` | Usage analytics |
| `cron.ts` | Cron job management |
| `agents.ts` | Agent configuration |
| `skills.ts` | Skills management |
| `nodes.ts` | Nodes/devices management |
| `config.ts` | Configuration editor |
| `debug.ts` | Debug utilities |
| `logs.ts` | Log viewer |

---

## Technology Stack

- **UI Framework:** Lit (Web Components)
- **Styling:** Custom CSS with design system
- **State Management:** Lit reactive properties
- **Routing:** Custom path-based routing with normalizePath()
- **i18n:** Custom i18n system with locale files
