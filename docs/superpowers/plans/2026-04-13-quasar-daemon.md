# Quasar Daemon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Rust daemon (quasard) with encrypted VFS and pub/sub event bus, accessible via Unix socket IPC from Skyth harness.

**Architecture:** One Rust daemon (`quasard`) owns the VFS file exclusively. All access goes through it via JSON-lines protocol over Unix socket. The daemon serializes writes internally with RwLock per inode, and multiple clients talk to it over a socket. Includes an embedded event bus for agent-to-agent messaging.

**Tech Stack:** Rust (Tokio async runtime, serde, base64, ring for encryption), TypeScript/Bun (for client)

---

## File Structure

### Rust (quasar crate)
- `quasar/src/lib.rs` - library root, exports
- `quasar/src/vfs/mod.rs` - VFS engine with encryption
- `quasar/src/ipc/mod.rs` - Unix socket IPC handler
- `quasar/src/event_bus/mod.rs` - Pub/sub event bus
- `quasar/src/daemon/mod.rs` - Daemon orchestration
- `quasar/src/client.rs` - Embedded client for testing
- `quasar/src/types.rs` - Shared request/response types
- `quasar/Cargo.toml` - Dependencies (update)

### TypeScript (skyth crate)
- `skyth/core/quasar/client.ts` - QuasarClient for harness
- `skyth/core/quasar/types.ts` - TypeScript types matching Rust

---

## Phase 1: Rust Daemon Foundation

### Task 1: Cargo.toml Dependencies

**Files:**
- Modify: `quasar/Cargo.toml`

- [ ] **Step 1: Update Cargo.toml with required dependencies**

```toml
[package]
name = "quasar"
version = "0.1.0"
edition = "2024"

[dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
base64 = "0.22"
ring = "0.17"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
tracing-appender = "0.2"
anyhow = "1"
thiserror = "2"
dashmap = "6"
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 2: Commit**

```bash
git add quasar/Cargo.toml
git commit -m "feat(quasar): add core dependencies"
```

### Task 2: Types Module

**Files:**
- Create: `quasar/src/types.rs`
- Create: `quasar/src/lib.rs`

- [ ] **Step 1: Create types.rs with request/response types**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum QuasarRequest {
    Read { path: String },
    Write { path: String, data: String }, // base64 encoded
    Mkdir { path: String },
    Ls { path: String },
    Subscribe { pattern: String },
    Publish { topic: String, payload: serde_json::Value },
    Ping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum QuasarResponse {
    #[serde(rename = "response")]
    Success { id: String, result: serde_json::Value },
    Error { id: String, error: String },
    Event { topic: String, payload: serde_json::Value },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuasarMessage {
    pub id: String,
    #[serde(flatten)]
    pub request: QuasarRequest,
}
```

- [ ] **Step 2: Create lib.rs root**

```rust
pub mod types;
pub mod vfs;
pub mod ipc;
pub mod event_bus;
pub mod daemon;

pub use types::*;
pub use daemon::QuasarDaemon;
```

- [ ] **Step 3: Commit**

```bash
git add quasar/src/types.rs quasar/src/lib.rs
git commit -m "feat(quasar): add types module"
```

### Task 3: VFS Engine

**Files:**
- Create: `quasar/src/vfs/mod.rs`

- [ ] **Step 1: Create VFS engine with in-memory store**

```rust
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use dashmap::DashMap;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

type Inode = u64;

#[derive(Debug, Clone)]
pub struct FileMetadata {
    pub inode: Inode,
    pub size: usize,
    pub created_at: u64,
    pub modified_at: u64,
}

pub struct QuasarVfs {
    data: Arc<DashMap<Inode, Vec<u8>>>,
    metadata: Arc<DashMap<Inode, FileMetadata>>,
    by_name: Arc<DashMap<String, Inode>>,
    next_inode: Arc<std::sync::atomic::AtomicU64>,
}

impl QuasarVfs {
    pub fn new() -> Self {
        Self {
            data: Arc::new(DashMap::new()),
            metadata: Arc::new(DashMap::new()),
            by_name: Arc::new(DashMap::new()),
            next_inode: Arc::new(std::sync::atomic::AtomicU64::new(1)),
        }
    }

    pub async fn read_file(&self, path: &str) -> Result<String> {
        let inode = self.by_name.get(path)
            .ok_or_else(|| anyhow::anyhow!("path not found: {}", path))?;
        
        let data = self.data.get(&inode)
            .ok_or_else(|| anyhow::anyhow!("inode not found: {}", inode))?;
        
        Ok(BASE64.encode(&*data))
    }

    pub async fn write_file(&self, path: &str, data: &str) -> Result<()> {
        let decoded = BASE64.decode(data)?;
        let inode = self.by_name.get(path)
            .copied()
            .unwrap_or_else(|| {
                let inode = self.next_inode.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                self.by_name.insert(path.to_string(), inode);
                inode
            });
        
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        self.data.insert(inode, decoded.clone());
        self.metadata.insert(inode, FileMetadata {
            inode,
            size: decoded.len(),
            created_at: now,
            modified_at: now,
        });
        
        Ok(())
    }

    pub async fn mkdir(&self, path: &str) -> Result<()> {
        if self.by_name.contains_key(path) {
            return Err(anyhow::anyhow!("path exists: {}", path));
        }
        
        let inode = self.next_inode.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        self.by_name.insert(path.to_string(), inode);
        self.data.insert(inode, Vec::new());
        
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        self.metadata.insert(inode, FileMetadata {
            inode,
            size: 0,
            created_at: now,
            modified_at: now,
        });
        
        Ok(())
    }

    pub async fn ls(&self, path: &str) -> Result<Vec<String>> {
        let prefix = if path == "/" { "" } else { path };
        let prefix_len = prefix.len();
        
        Ok(self.by_name
            .iter()
            .filter(|(name, _)| {
                name.starts_with(prefix) && name.len() > prefix_len
            })
            .map(|(name, _)| {
                let after = &name[prefix_len + 1..];
                after.split('/').next().unwrap_or(after).to_string()
            })
            .collect())
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add quasar/src/vfs/mod.rs
git commit -m "feat(quasar): add VFS engine"
```

### Task 4: Event Bus

**Files:**
- Create: `quasar/src/event_bus/mod.rs`

- [ ] **Step 1: Create event bus with pub/sub**

```rust
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::broadcast;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone)]
pub struct EventBus {
    channels: Arc<DashMap<String, broadcast::Sender<Value>>>,
}

impl EventBus {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(DashMap::new()),
        }
    }

    pub async fn publish(&self, topic: &str, payload: Value) -> Result<()> {
        let tx = self.channels.get(topic)
            .map(|c| c.value().clone())
            .unwrap_or_else(|| {
                let (tx, _) = broadcast::channel(128);
                self.channels.insert(topic.to_string(), tx.clone());
                tx
            });
        
        tx.send(payload)
            .map_err(|_| anyhow::anyhow!("subscriber dropped"))?;
        
        Ok(())
    }

    pub fn subscribe(&self, topic: &str) -> broadcast::Receiver<Value> {
        if !self.channels.contains_key(topic) {
            let (tx, _) = broadcast::channel(128);
            self.channels.insert(topic.to_string(), tx);
        }
        self.channels.get(topic).unwrap().subscribe()
    }

    pub fn matches(&self, topic: &str, pattern: &str) -> bool {
        glob_match(pattern, topic)
    }
}

fn glob_match(pattern: &str, topic: &str) -> bool {
    if pattern.contains('*') {
        let parts: Vec<&str> = pattern.split('/').collect();
        let topic_parts: Vec<&str> = topic.split('/').collect();
        
        for (i, part) in parts.iter().enumerate() {
            if *part == "*" {
                continue;
            }
            if *part == "+" {
                if i >= topic_parts.len() {
                    return false;
                }
                continue;
            }
            if i >= topic_parts.len() || part != &topic_parts[i] {
                return false;
            }
        }
        true
    } else {
        pattern == topic
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add quasar/src/event_bus/mod.rs
git commit -m "feat(quasar): add event bus"
```

---

## Phase 2: IPC and Daemon

### Task 5: IPC Handler

**Files:**
- Create: `quasar/src/ipc/mod.rs`

- [ ] **Step 1: Create IPC handler for Unix socket**

```rust
use anyhow::Result;
use tokio::net::UnixStream;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::types::{QuasarRequest, QuasarResponse};
use crate::vfs::QuasarVfs;
use crate::event_bus::EventBus;

pub struct IpcHandler {
    vfs: Arc<RwLock<QuasarVfs>>,
    event_bus: EventBus,
}

impl IpcHandler {
    pub fn new(vfs: Arc<RwLock<QuasarVfs>>, event_bus: EventBus) -> Self {
        Self { vfs, event_bus }
    }

    pub async fn handle_client(self: Arc<Self>, stream: UnixStream) -> Result<()> {
        let (reader, mut writer) = stream.into_split();
        let mut lines = BufReader::new(reader).lines();

        while let Some(line) = lines.next_line().await? {
            let req: crate::types::QuasarMessage = serde_json::from_str(&line)?;
            let id = req.id.clone();
            let op = req.request;

            let result = match op {
                QuasarRequest::Read { path } => {
                    let vfs = self.vfs.read().await;
                    vfs.read_file(&path).await
                        .map(|r| serde_json::json!(r))
                }
                QuasarRequest::Write { path, data } => {
                    let mut vfs = self.vfs.write().await;
                    vfs.write_file(&path, &data).await
                        .map(|_| serde_json::json!(null))
                }
                QuasarRequest::Mkdir { path } => {
                    let mut vfs = self.vfs.write().await;
                    vfs.mkdir(&path).await
                        .map(|_| serde_json::json!(null))
                }
                QuasarRequest::Ls { path } => {
                    let vfs = self.vfs.read().await;
                    vfs.ls(&path).await
                        .map(|r| serde_json::json!(r))
                }
                QuasarRequest::Subscribe { pattern } => {
                    self.event_bus.subscribe(&pattern);
                    Ok(serde_json::json!(null))
                }
                QuasarRequest::Publish { topic, payload } => {
                    self.event_bus.publish(&topic, payload).await
                        .map(|_| serde_json::json!(null))
                }
                QuasarRequest::Ping => Ok(serde_json::json!("pong")),
            };

            let resp = match result {
                Ok(r) => QuasarResponse::Success { id, result: r },
                Err(e) => QuasarResponse::Error { id, error: e.to_string() },
            };

            writer.write_all((serde_json::to_string(&resp)? + "\n").as_bytes()).await?;
            writer.flush().await?;
        }

        Ok(())
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add quasar/src/ipc/mod.rs
git commit -m "feat(quasar): add IPC handler"
```

### Task 6: Daemon Orchestration

**Files:**
- Create: `quasar/src/daemon/mod.rs`

- [ ] **Step 1: Create daemon that ties it all together**

```rust
use anyhow::Result;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::net::UnixListener;
use tokio::sync::RwLock;
use tracing::{info, error};

use crate::vfs::QuasarVfs;
use crate::event_bus::EventBus;
use crate::ipc::IpcHandler;

pub struct QuasarDaemon {
    socket_path: PathBuf,
    vfs: Arc<RwLock<QuasarVfs>>,
    event_bus: EventBus,
}

impl QuasarDaemon {
    pub fn new(socket_path: impl Into<PathBuf>) -> Self {
        Self {
            socket_path: socket_path.into(),
            vfs: Arc::new(RwLock::new(QuasarVfs::new())),
            event_bus: EventBus::new(),
        }
    }

    pub async fn run(self) -> Result<()> {
        let socket_path = &self.socket_path;
        
        if socket_path.exists() {
            std::fs::remove_file(socket_path)?;
        }
        
        let listener = UnixListener::bind(socket_path)?;
        info!("quasard listening on {}", socket_path.display());
        
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let vfs = self.vfs.clone();
                    let event_bus = self.event_bus.clone();
                    let handler = Arc::new(IpcHandler::new(vfs, event_bus));
                    
                    tokio::spawn(async move {
                        if let Err(e) = handler.handle_client(stream).await {
                            error!("client error: {}", e);
                        }
                    });
                }
                Err(e) => {
                    error!("accept error: {}", e);
                }
            }
        }
    }
}
```

- [ ] **Step 2: Update main.rs to run daemon**

```rust
use quasar::QuasarDaemon;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::new("info"))
        .init();

    let daemon = QuasarDaemon::new("/tmp/quasard.sock");
    daemon.run().await
}
```

- [ ] **Step 3: Commit**

```bash
git add quasar/src/daemon/mod.rs quasar/src/main.rs
git commit -m "feat(quasar): add daemon orchestration"
```

---

## Phase 3: TypeScript Client

### Task 7: TypeScript Types

**Files:**
- Create: `skyth/src/lib/quasar/types.ts`

- [ ] **Step 1: Create TypeScript types**

```typescript
export type QuasarRequest =
  | { id: string; op: "read"; path: string }
  | { id: string; op: "write"; path: string; data: string }
  | { id: string; op: "mkdir"; path: string }
  | { id: string; op: "ls"; path: string }
  | { id: string; op: "subscribe"; pattern: string }
  | { id: string; op: "publish"; topic: string; payload: unknown }
  | { id: string; op: "ping" };

export type QuasarResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string }
  | { type: "event"; topic: string; payload: unknown };
```

- [ ] **Step 2: Commit**

```bash
git add skyth/src/lib/quasar/types.ts
git commit -m "feat(skyth): add quasar types"
```

### Task 8: QuasarClient

**Files:**
- Create: `skyth/src/lib/quasar/client.ts`

- [ ] **Step 1: Create QuasarClient**

```typescript
import net from "net";
import { createInterface } from "readline";
import type { QuasarRequest, QuasarResponse } from "./types.js";

export class QuasarClient {
  private socket: net.Socket;
  private pending = new Map<string, { resolve: Function; reject: Function }>();
  private subs = new Map<string, Set<(payload: unknown) => void>>();
  private rl: ReturnType<typeof createInterface>;

  constructor(socketPath = "/tmp/quasard.sock") {
    this.socket = net.createConnection(socketPath);
    this.rl = createInterface({ input: this.socket });

    this.rl.on("line", (line: string) => {
      const msg = JSON.parse(line) as QuasarResponse;
      if (msg.type === "event") {
        this.subs.get(msg.topic)?.forEach(fn => fn(msg.payload));
        return;
      }
      const prom = this.pending.get(msg.id);
      if (!prom) return;
      this.pending.delete(msg.id);
      if ("ok" in msg && msg.ok) {
        prom.resolve(msg.result);
      } else {
        prom.reject(new Error(msg.error));
      }
    });
  }

  private send<T>(req: Omit<QuasarRequest, "id">): Promise<T> {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(JSON.stringify({ id, ...req }) + "\n");
    });
  }

  async read(path: string): Promise<string> {
    return this.send<string>({ op: "read", path });
  }

  async write(path: string, data: string): Promise<void> {
    return this.send<void>({ op: "write", path, data });
  }

  async mkdir(path: string): Promise<void> {
    return this.send<void>({ op: "mkdir", path });
  }

  async ls(path: string): Promise<string[]> {
    return this.send<string[]>({ op: "ls", path });
  }

  async subscribe(pattern: string, fn: (payload: unknown) => void): Promise<void> {
    if (!this.subs.has(pattern)) this.subs.set(pattern, new Set());
    this.subs.get(pattern)!.add(fn);
    return this.send<void>({ op: "subscribe", pattern });
  }

  async publish(topic: string, payload: unknown): Promise<void> {
    return this.send<void>({ op: "publish", topic, payload });
  }

  async ping(): Promise<string> {
    return this.send<string>({ op: "ping" });
  }

  close(): void {
    this.socket.destroy();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add skyth/src/lib/quasar/client.ts
git commit -m "feat(skyth): add QuasarClient"
```

---

## Phase 4: Build and Test

### Task 9: Build Verification

**Files:**
- N/A

- [ ] **Step 1: Build Rust daemon**

```bash
cd quasar && cargo build
```

Expected: BUILD SUCCESS

- [ ] **Step 2: Run TypeScript typecheck**

```bash
bun run typecheck
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: complete quasar daemon baseline"
```

---

## Execution Options

**Plan complete. Two execution options:**

1. **Subagent-Driven (recommended)** - Dispatch subagents per task, review between tasks
2. **Inline Execution** - Execute tasks in this session using executing-plans

**Which approach?**