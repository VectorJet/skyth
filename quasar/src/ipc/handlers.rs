//! IPC request routing and operation handlers.

use super::handler_utils::{base64_decode, base64_encode, error_response, ok_response};
use super::protocol::{Request, RequestKind, Response, ResponseKind};
use super::server::IpcServer;
use crate::auth::{AuthDb, Right};
use crate::db::{OpenMode, QuasarDb, open_or_init};
use crate::epsilon::{Restore, RestoreDecision, Snapshot};
use crate::error::{Error, Result};
use crate::fingerprint::DeviceFingerprint;
use crate::services::gateway::{Decision, MediatedAction};
use crate::vfs::{Namespace, Vfs, VfsPath};
use std::path::PathBuf;
use std::sync::Arc;

impl IpcServer {
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
            } => ok_response(self.handle_onboard(&username, &password_b64).await),
            RequestKind::Unlock { password_b64 } => {
                ok_response(self.handle_unlock(&password_b64).await)
            }
            RequestKind::DbOpen {
                db_path,
                db_kind,
                create_if_missing,
            } => match self
                .handle_db_open(&actor, &db_path, &db_kind, create_if_missing)
                .await
            {
                Ok(kind) => ResponseKind::DbOpened {
                    db_path,
                    db_kind: kind,
                },
                Err(e) => error_response(e),
            },
            RequestKind::VfsRead {
                db_path,
                namespace,
                path,
            } => match self
                .handle_vfs_read(&actor, &db_path, &namespace, &path)
                .await
            {
                Ok(content) => ResponseKind::VfsBytes {
                    content_b64: content.map(base64_encode),
                },
                Err(e) => error_response(e),
            },
            RequestKind::VfsWrite {
                db_path,
                namespace,
                path,
                content_b64,
            } => match self
                .handle_vfs_write(&actor, &db_path, &namespace, &path, &content_b64)
                .await
            {
                Ok(event_id) => ResponseKind::VfsEventId { event_id },
                Err(e) => error_response(e),
            },
            RequestKind::VfsDelete {
                db_path,
                namespace,
                path,
            } => ok_response(
                self.handle_vfs_delete(&actor, &db_path, &namespace, &path)
                    .await,
            ),
            RequestKind::VfsList { db_path, namespace } => {
                match self.handle_vfs_list(&actor, &db_path, &namespace).await {
                    Ok(entries) => ResponseKind::VfsEntries { entries },
                    Err(e) => error_response(e),
                }
            }
            RequestKind::EpsilonSnapshot {
                db_path,
                namespace,
                path,
                branch_name,
            } => match self
                .handle_epsilon_snapshot(&actor, &db_path, &namespace, &path, &branch_name)
                .await
            {
                Ok(snapshot_id) => ResponseKind::SnapshotId { snapshot_id },
                Err(e) => error_response(e),
            },
            RequestKind::EpsilonRestore {
                snapshot_id,
                dest_path,
            } => ok_response(self.handle_epsilon_restore(&snapshot_id, &dest_path).await),
            RequestKind::HeartbeatAppend { kind, note } => {
                ok_response(self.handle_heartbeat_append(&actor, &kind, note).await)
            }
            RequestKind::CronRegister {
                schedule,
                target_agent_id,
                payload,
            } => ok_response(
                self.handle_cron_register(&actor, &schedule, &target_agent_id, payload)
                    .await,
            ),
            RequestKind::QueuePushUser {
                db_path,
                payload,
                ts,
                enqueued_at,
            } => match self
                .handle_queue_push_user(&actor, &db_path, &payload, ts, enqueued_at)
                .await
            {
                Ok(row_id) => ResponseKind::QueueRowId { id: row_id },
                Err(e) => error_response(e),
            },
            RequestKind::QueuePushGateway {
                db_path,
                payload,
                tag,
                ts,
                enqueued_at,
            } => match self
                .handle_queue_push_gateway(
                    &actor,
                    &db_path,
                    &payload,
                    tag.as_deref(),
                    ts,
                    enqueued_at,
                )
                .await
            {
                Ok(row_id) => ResponseKind::QueueRowId { id: row_id },
                Err(e) => error_response(e),
            },
            RequestKind::QueueClaimAll { db_path } => {
                match self.handle_queue_claim_all(&actor, &db_path).await {
                    Ok(rows) => ResponseKind::QueueRows { rows },
                    Err(e) => error_response(e),
                }
            }
            RequestKind::QueueMarkDone { db_path, ids } => {
                ok_response(self.handle_queue_mark_done(&actor, &db_path, &ids).await)
            }
            RequestKind::QueueReleaseInflight { db_path, ids } => ok_response(
                self.handle_queue_release_inflight(&actor, &db_path, &ids)
                    .await,
            ),
            RequestKind::QueuePendingStats { db_path } => {
                match self.handle_queue_pending_stats(&actor, &db_path).await {
                    Ok(stats) => ResponseKind::QueueStats { stats },
                    Err(e) => error_response(e),
                }
            }
            RequestKind::QuasarExport {
                db_path,
                selector,
                dest_zip_path,
            } => match self
                .handle_quasar_export(&actor, &db_path, selector, &dest_zip_path)
                .await
            {
                Ok(receipt) => ResponseKind::ExportReceipt { receipt },
                Err(e) => error_response(e),
            },
        };

        Response { id, kind }
    }

    async fn handle_onboard(&self, username: &str, password_b64: &str) -> Result<()> {
        let password = base64_decode(password_b64)?;
        let fp = DeviceFingerprint::derive();
        let mut auth = AuthDb::open_or_init(&password, &fp)?;
        auth.set_identity(username, &password)?;
        *self.auth.lock().await = Some(auth);
        *self.unlock_password.lock().await = Some(password);
        Ok(())
    }

    async fn handle_unlock(&self, password_b64: &str) -> Result<()> {
        let password = base64_decode(password_b64)?;
        let fp = DeviceFingerprint::derive();
        let auth = AuthDb::open_or_init(&password, &fp)?;
        *self.auth.lock().await = Some(auth);
        *self.unlock_password.lock().await = Some(password);
        Ok(())
    }

    async fn handle_db_open(
        &self,
        actor: &str,
        db_path_str: &str,
        db_kind: &str,
        create_if_missing: bool,
    ) -> Result<String> {
        if actor != crate::auth::GENERALIST_ID {
            return Err(Error::PermissionDenied(
                "only generalist can open quasardbs".into(),
            ));
        }

        let db_path = PathBuf::from(db_path_str);
        let password = self
            .unlock_password
            .lock()
            .await
            .as_ref()
            .cloned()
            .ok_or_else(|| Error::other("system locked"))?;
        let mode = if create_if_missing {
            OpenMode::CreateIfMissing {
                db_kind: db_kind.to_string(),
            }
        } else {
            OpenMode::OpenExisting
        };
        let fp = DeviceFingerprint::derive();
        let db = open_or_init(&db_path, &password, mode, &fp)?;
        let opened_kind = db.header().db_kind.clone();
        self.dbs.lock().await.insert(db_path, Arc::new(db));
        Ok(opened_kind)
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
        Vfs::new(&db)?.read(&ns, &path)
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
        Vfs::new(&db)?.write(actor, &ns, &path, &content)
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
        let action = MediatedAction::DeleteVfsEntry {
            db_path: db_path_str.to_string(),
            namespace: ns_str.to_string(),
            path: path_str.to_string(),
        };
        if self.gateway.prompt(&action)? != Decision::Allow {
            return Err(Error::PermissionDenied("delete denied by user".into()));
        }
        Vfs::new(&db)?.delete(actor, &ns, &path)
    }

    async fn handle_vfs_list(
        &self,
        actor: &str,
        db_path_str: &str,
        ns_str: &str,
    ) -> Result<Vec<crate::vfs::VfsEntry>> {
        let (db, ns, _) = self
            .prepare_vfs_op(actor, Right::Read, db_path_str, ns_str, "/")
            .await?;
        Vfs::new(&db)?.list(&ns)
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
        let content = Vfs::new(&db)?
            .read(&ns, &path)?
            .ok_or_else(|| Error::other("vfs entry not found"))?;
        let hashes = self.epsilon.write_bytes(&content)?;
        let branch =
            crate::branch::BranchRef::new(crate::branch::BranchKind::Nebula, branch_name, None);
        let snap = Snapshot {
            id: uuid::Uuid::now_v7().to_string(),
            branch,
            created_ms: chrono::Utc::now().timestamp_millis(),
            chunk_hashes: hashes,
        };
        self.epsilon.put_snapshot(&snap)
    }

    async fn handle_epsilon_restore(&self, snapshot_id: &str, dest_path_str: &str) -> Result<()> {
        let snaps = self.epsilon.list_snapshots()?;
        let snap_summary = snaps
            .iter()
            .find(|s| s.id == snapshot_id)
            .ok_or_else(|| Error::other("snapshot not found"))?;
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
        Restore::new(&self.epsilon, prompt).restore_to(&snap, &dest_path)?;
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
        drop(auth_lock);

        let dbs_lock = self.dbs.lock().await;
        let db = dbs_lock
            .get(&db_path)
            .cloned()
            .ok_or_else(|| Error::other("database not opened; send db_open first"))?;
        Ok((db, ns, path))
    }
}
