//! Transport-agnostic IPC server.
//!
//! The platform-specific binding lives in [`super::unix`] (Linux/macOS)
//! or [`super::windows_pipe`] (Windows). Both delegate to
//! [`IpcServer::handle_request`] for request routing.

use super::protocol::{MAX_FRAME_BYTES, Request, Response};
use crate::auth::AuthDb;
use crate::db::QuasarDb;
use crate::epsilon::EpsilonStore;
use crate::error::{Error, Result};
use crate::services::gateway::Gateway;
use crate::services::heartbeat::Heartbeat;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;

/// Server state shared across connections.
pub struct IpcServer {
    pub(super) version: String,
    pub(super) auth: Mutex<Option<AuthDb>>,
    pub(super) unlock_password: Mutex<Option<Vec<u8>>>,
    // Cache of opened databases.
    pub(super) dbs: Mutex<HashMap<PathBuf, Arc<QuasarDb>>>,
    pub(super) epsilon: Arc<EpsilonStore>,
    pub(super) heartbeat: Arc<Heartbeat>,
    pub(super) gateway: Arc<dyn Gateway>,
}

impl IpcServer {
    pub fn new(gateway: Arc<dyn Gateway>) -> Arc<Self> {
        let epsilon = EpsilonStore::open_default().expect("could not open default epsilon store");
        let heartbeat = Heartbeat::open_default().expect("could not open default heartbeat store");
        Arc::new(Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            auth: Mutex::new(None),
            unlock_password: Mutex::new(None),
            dbs: Mutex::new(HashMap::new()),
            epsilon: Arc::new(epsilon),
            heartbeat: Arc::new(heartbeat),
            gateway,
        })
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
