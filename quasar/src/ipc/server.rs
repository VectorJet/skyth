//! Transport-agnostic IPC server.
//!
//! The platform-specific binding lives in [`super::unix`] (Linux/macOS)
//! or [`super::windows_pipe`] (Windows). Both delegate to
//! [`IpcServer::handle_request`] for request routing.

use super::protocol::{Request, RequestKind, Response, ResponseKind, MAX_FRAME_BYTES};
use crate::auth::{AuthDb, Right};
use crate::db::QuasarDb;
use crate::epsilon::{EpsilonStore, Restore, RestoreDecision, Snapshot};
use crate::error::{Error, Result};
use crate::fingerprint::DeviceFingerprint;
use crate::services::cron::CronJob;
use crate::services::gateway::{Decision, Gateway, MediatedAction};
use crate::services::heartbeat::{Heartbeat, HeartbeatEntry};
use crate::vfs::{Namespace, Vfs, VfsPath};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;

/// Server state shared across connections.
pub struct IpcServer {
    version: String,
    auth: Mutex<Option<AuthDb>>,
    // Cache of opened databases.
    dbs: Mutex<HashMap<PathBuf, Arc<QuasarDb>>>,
    epsilon: Arc<EpsilonStore>,
    heartbeat: Arc<Heartbeat>,
    gateway: Arc<dyn Gateway>,
}

impl IpcServer {
    pub fn new(gateway: Arc<dyn Gateway>) -> Arc<Self> {
        let epsilon = EpsilonStore::open_default().expect("could not open default epsilon store");
        let heartbeat = Heartbeat::open_default().expect("could not open default heartbeat store");
        Arc::new(Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            auth: Mutex::new(None),
            dbs: Mutex::new(HashMap::new()),
            epsilon: Arc::new(epsilon),
            heartbeat: Arc::new(heartbeat),
            gateway,
        })
    }

    /// Route a parsed request to a response.
    pub async fn handle_request(&self, req: Request) -> Response {
        let id = req.id.clone();
        let actor = req.actor.clone();

        let kind = match req.kind {
            RequestKind::Ping => ResponseKind::Pong,
            RequestKind::Status => {
                let auth_locked = self.auth.lock().await;
                ResponseKind::Status {
                    version: self.version.clone(),
                    auth_initialized: auth_locked.is_some(),
                }
            }
            RequestKind::Onboard {
                username,
                password_b64,
            } => match self.handle_onboard(&username, &password_b64).await {
                Ok(_) => ResponseKind::Ok,
                Err(e) => ResponseKind::Error {
                    message: e.to_string(),
                },
            },
            RequestKind::Unlock { password_b64 } => match self.handle_unlock(&password_b64).await {
                Ok(_) => ResponseKind::Ok,
                Err(e) => ResponseKind::Error {
                    message: e.to_string(),
                },
            },
            RequestKind::VfsRead {
                db_path,
                namespace,
                path,
            } => match self.handle_vfs_read(&actor, &db_path, &namespace, &path).await {
                Ok(content) => ResponseKind::VfsBytes {
                    content_b64: content.map(base64_encode),
                },
                Err(e) => ResponseKind::Error {
                    message: e.to_string(),
                },
            },
            RequestKind::VfsWrite {
                db_path,
                namespace,
                path,
                content_b64,
            } => {
                match self
                    .handle_vfs_write(&actor, &db_path, &namespace, &path, &content_b64)
                    .await
                {
                    Ok(event_id) => ResponseKind::VfsEventId { event_id },
                    Err(e) => ResponseKind::Error {
                        message: e.to_string(),
                    },
                }
            }
            RequestKind::VfsDelete {
                db_path,
                namespace,
                path,
            } => match self.handle_vfs_delete(&actor, &db_path, &namespace, &path).await {
                Ok(_) => ResponseKind::Ok,
                Err(e) => ResponseKind::Error {
                    message: e.to_string(),
                },
            },
            RequestKind::VfsList { db_path, namespace } => {
                match self.handle_vfs_list(&actor, &db_path, &namespace).await {
                    Ok(entries) => ResponseKind::VfsEntries { entries },
                    Err(e) => ResponseKind::Error {
                        message: e.to_string(),
                    },
                }
            }
            RequestKind::EpsilonSnapshot {
                db_path,
                namespace,
                path,
                branch_name,
            } => {
                match self
                    .handle_epsilon_snapshot(&actor, &db_path, &namespace, &path, &branch_name)
                    .await
                {
                    Ok(snapshot_id) => ResponseKind::SnapshotId { snapshot_id },
                    Err(e) => ResponseKind::Error {
                        message: e.to_string(),
                    },
                }
            }
            RequestKind::EpsilonRestore {
                snapshot_id,
                dest_path,
            } => match self.handle_epsilon_restore(&actor, &snapshot_id, &dest_path).await {
                Ok(_) => ResponseKind::Ok,
                Err(e) => ResponseKind::Error {
                    message: e.to_string(),
                },
            },
            RequestKind::HeartbeatAppend { kind, note } => {
                match self.handle_heartbeat_append(&actor, &kind, note).await {
                    Ok(_) => ResponseKind::Ok,
                    Err(e) => ResponseKind::Error {
                        message: e.to_string(),
                    },
                }
            }
            RequestKind::CronRegister {
                schedule,
                target_agent_id,
                payload,
            } => {
                match self
                    .handle_cron_register(&actor, &schedule, &target_agent_id, payload)
                    .await
                {
                    Ok(_) => ResponseKind::Ok,
                    Err(e) => ResponseKind::Error {
                        message: e.to_string(),
                    },
                }
            }
        };

        Response { id, kind }
    }

    async fn handle_onboard(&self, username: &str, password_b64: &str) -> Result<()> {
        let password = base64_decode(password_b64)?;
        let fp = DeviceFingerprint::derive();
        let mut auth = AuthDb::open_or_init(&password, &fp)?;
        auth.set_identity(username, &password)?;
        let mut lock = self.auth.lock().await;
        *lock = Some(auth);
        Ok(())
    }

    async fn handle_unlock(&self, password_b64: &str) -> Result<()> {
        let password = base64_decode(password_b64)?;
        let fp = DeviceFingerprint::derive();
        let auth = AuthDb::open_or_init(&password, &fp)?;
        let mut lock = self.auth.lock().await;
        *lock = Some(auth);
        Ok(())
    }

    async fn handle_vfs_read(
        &self,
        actor: &str,
        db_path_str: &str,
        ns_str: &str,
        path_str: &str,
    ) -> Result<Option<Vec<u8>>> {
        let (db, ns, path) = self
            .prepare_vfs_op(actor, Right::Read, db_path_str, ns_str, path_str)
            .await?;
        let vfs = Vfs::new(&db)?;
        vfs.read(&ns, &path)
    }

    async fn handle_vfs_write(
        &self,
        actor: &str,
        db_path_str: &str,
        ns_str: &str,
        path_str: &str,
        content_b64: &str,
    ) -> Result<i64> {
        let (db, ns, path) = self
            .prepare_vfs_op(actor, Right::Write, db_path_str, ns_str, path_str)
            .await?;
        let content = base64_decode(content_b64)?;
        let vfs = Vfs::new(&db)?;
        vfs.write(actor, &ns, &path, &content)
    }

    async fn handle_vfs_delete(
        &self,
        actor: &str,
        db_path_str: &str,
        ns_str: &str,
        path_str: &str,
    ) -> Result<()> {
        let (db, ns, path) = self
            .prepare_vfs_op(actor, Right::Delete, db_path_str, ns_str, path_str)
            .await?;

        // Prompt if delete.
        let action = MediatedAction::DeleteVfsEntry {
            db_path: db_path_str.to_string(),
            namespace: ns_str.to_string(),
            path: path_str.to_string(),
        };
        if self.gateway.prompt(&action)? != Decision::Allow {
            return Err(Error::PermissionDenied("delete denied by user".into()));
        }

        let vfs = Vfs::new(&db)?;
        vfs.delete(actor, &ns, &path)
    }

    async fn handle_vfs_list(
        &self,
        actor: &str,
        db_path_str: &str,
        ns_str: &str,
    ) -> Result<Vec<crate::vfs::VfsEntry>> {
        // Prepare op with dummy path for permission check (namespace level check would be better).
        let (db, ns, _) = self
            .prepare_vfs_op(actor, Right::Read, db_path_str, ns_str, "/")
            .await?;
        let vfs = Vfs::new(&db)?;
        vfs.list(&ns)
    }

    async fn handle_epsilon_snapshot(
        &self,
        actor: &str,
        db_path_str: &str,
        ns_str: &str,
        path_str: &str,
        branch_name: &str,
    ) -> Result<String> {
        let (db, ns, path) = self
            .prepare_vfs_op(actor, Right::Read, db_path_str, ns_str, path_str)
            .await?;
        let vfs = Vfs::new(&db)?;
        let content = vfs
            .read(&ns, &path)?
            .ok_or_else(|| Error::other("vfs entry not found"))?;

        let hashes = self.epsilon.write_bytes(&content)?;
        let branch = crate::branch::BranchRef::new(crate::branch::BranchKind::Nebula, branch_name, None);
        let snap = Snapshot {
            id: uuid::Uuid::now_v7().to_string(),
            branch,
            created_ms: chrono::Utc::now().timestamp_millis(),
            chunk_hashes: hashes,
        };
        self.epsilon.put_snapshot(&snap)
    }

    async fn handle_epsilon_restore(
        &self,
        _actor: &str,
        snapshot_id: &str,
        dest_path_str: &str,
    ) -> Result<()> {
        let snaps = self.epsilon.list_snapshots()?;
        let snap_summary = snaps
            .iter()
            .find(|s| s.id == snapshot_id)
            .ok_or_else(|| Error::other("snapshot not found"))?;

        // We need the full snapshot record.
        let snap_path = self
            .epsilon
            .root()
            .join("snapshots")
            .join(format!("{}.json", snap_summary.id));
        let snap_bytes = std::fs::read(snap_path)?;
        let snap: Snapshot = serde_json::from_slice(&snap_bytes)?;

        let dest_path = PathBuf::from(dest_path_str);

        let gateway = self.gateway.clone();
        let prompt: crate::epsilon::PromptFn = Box::new(move |_snap, path| {
            let action = MediatedAction::DeleteVfsEntry {
                db_path: "epsilon-restore".into(),
                namespace: "fs".into(),
                path: path.to_string_lossy().to_string(),
            };
            match gateway.prompt(&action) {
                Ok(Decision::Allow) => RestoreDecision::Approve,
                _ => RestoreDecision::Deny,
            }
        });

        let restore = Restore::new(&self.epsilon, prompt);
        restore.restore_to(&snap, &dest_path)?;
        Ok(())
    }

    async fn prepare_vfs_op(
        &self,
        actor: &str,
        right: Right,
        db_path_str: &str,
        ns_str: &str,
        path_str: &str,
    ) -> Result<(Arc<QuasarDb>, Namespace, VfsPath)> {
        let db_path = PathBuf::from(db_path_str);
        let ns = Namespace::new(ns_str);
        let path = VfsPath::new(path_str).map_err(Error::other)?;

        // Check permission if auth is unlocked.
        {
            let auth_lock = self.auth.lock().await;
            if let Some(auth) = auth_lock.as_ref() {
                use crate::auth::PermissionStore;
                let conn = auth.inner().conn();
                let store = PermissionStore::new(&conn);
                let scope = crate::auth::PermissionScope::Path {
                    db_path: db_path_str.to_string(),
                    namespace: ns_str.to_string(),
                    path: path_str.to_string(),
                };
                store.require(actor, right, &scope)?;
            } else {
                return Err(Error::other("system locked"));
            }
        }

        // Get or open DB.
        let db = {
            let dbs_lock = self.dbs.lock().await;
            if let Some(db) = dbs_lock.get(&db_path) {
                db.clone()
            } else {
                drop(dbs_lock);
                // We need the password to open. For v1, we assume the superuser password
                // is used for all databases. We'd need to cache the password in memory
                // or have a way to retrieve it from the AuthDb (sealed).
                return Err(Error::other("database not opened (auto-open pending password cache)"));
            }
        };

        Ok((db, ns, path))
    }

    async fn handle_heartbeat_append(
        &self,
        actor: &str,
        kind: &str,
        note: Option<String>,
    ) -> Result<()> {
        // Heartbeats are Generalist-only.
        if actor != crate::auth::GENERALIST_ID {
            return Err(Error::PermissionDenied("heartbeats are generalist-only".into()));
        }
        let entry = HeartbeatEntry {
            ts_unix_ms: chrono::Utc::now().timestamp_millis(),
            kind: kind.to_string(),
            note,
        };
        self.heartbeat.append(&entry)
    }

    async fn handle_cron_register(
        &self,
        actor: &str,
        schedule: &str,
        target_agent_id: &str,
        payload: serde_json::Value,
    ) -> Result<()> {
        // Cron is Generalist-first.
        if actor != crate::auth::GENERALIST_ID {
            return Err(Error::PermissionDenied("cron registration is generalist-first".into()));
        }
        let job = CronJob::new(schedule, target_agent_id, payload);
        let job_json = serde_json::to_vec(&job)?;

        // Store in global main.quasardb if opened, otherwise fail.
        let main_db_path = crate::paths::global_main_db_path()?;
        let dbs = self.dbs.lock().await;
        let db = dbs.get(&main_db_path).ok_or_else(|| {
            Error::other("global main.quasardb must be opened to register cron jobs")
        })?;

        let vfs = Vfs::new(db)?;
        let ns = Namespace::new("system/cron");
        let path = VfsPath::new(format!("/{}.json", job.id)).unwrap();
        vfs.write(actor, &ns, &path, &job_json)?;
        Ok(())
    }

    /// Read one length-prefixed JSON frame from `stream`.
    pub async fn read_frame<R: AsyncReadExt + Unpin>(stream: &mut R) -> Result<Request> {
        let mut len_buf = [0u8; 4];
        stream.read_exact(&mut len_buf).await?;
        let len = u32::from_be_bytes(len_buf) as usize;
        if len > MAX_FRAME_BYTES {
            return Err(Error::other(format!("frame too large: {len} bytes")));
        }
        let mut body = vec![0u8; len];
        stream.read_exact(&mut body).await?;
        let req: Request = serde_json::from_slice(&body)?;
        Ok(req)
    }

    /// Write one length-prefixed JSON frame to `stream`.
    pub async fn write_frame<W: AsyncWriteExt + Unpin>(
        stream: &mut W,
        resp: &Response,
    ) -> Result<()> {
        let body = serde_json::to_vec(resp)?;
        let len = (body.len() as u32).to_be_bytes();
        stream.write_all(&len).await?;
        stream.write_all(&body).await?;
        stream.flush().await?;
        Ok(())
    }
}

fn base64_encode(data: Vec<u8>) -> String {
    use base64::{Engine as _, engine::general_purpose};
    general_purpose::STANDARD.encode(data)
}

fn base64_decode(s: &str) -> Result<Vec<u8>> {
    use base64::{Engine as _, engine::general_purpose};
    general_purpose::STANDARD
        .decode(s)
        .map_err(|e| Error::other(format!("invalid base64: {e}")))
}
