//! Transport-agnostic IPC server.
//!
//! The platform-specific binding lives in [`super::unix`] (Linux/macOS)
//! or [`super::windows_pipe`] (Windows). Both delegate to
//! [`IpcServer::handle_request`] for request routing.

use super::protocol::{Request, RequestKind, Response, ResponseKind, MAX_FRAME_BYTES};
use crate::auth::{AuthDb, Right};
use crate::db::QuasarDb;
use crate::error::{Error, Result};
use crate::fingerprint::DeviceFingerprint;
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
}

impl IpcServer {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            auth: Mutex::new(None),
            dbs: Mutex::new(HashMap::new()),
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
        let (db, ns, path) = self.prepare_vfs_op(actor, Right::Read, db_path_str, ns_str, path_str).await?;
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
        let (db, ns, path) = self.prepare_vfs_op(actor, Right::Write, db_path_str, ns_str, path_str).await?;
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
        let (db, ns, path) = self.prepare_vfs_op(actor, Right::Delete, db_path_str, ns_str, path_str).await?;
        let vfs = Vfs::new(&db)?;
        vfs.delete(actor, &ns, &path)
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
