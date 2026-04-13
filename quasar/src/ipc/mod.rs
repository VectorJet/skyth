use anyhow::Result;
use std::sync::Arc;
use tokio::net::UnixStream;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::RwLock;

use crate::types::{QuasarMessage, QuasarRequest, QuasarResponse};
use crate::vfs_mem::QuasarVfs;
use crate::event_bus::EventBus;
use crate::disk::DiskStore;

pub struct IpcHandler {
    vfs: Arc<RwLock<QuasarVfs>>,
    event_bus: EventBus,
    disk_store: Option<DiskStore>,
}

impl IpcHandler {
    pub fn new(vfs: Arc<RwLock<QuasarVfs>>, event_bus: EventBus, disk_store: Option<DiskStore>) -> Self {
        Self { vfs, event_bus, disk_store }
    }

    pub async fn handle_client(self: &Arc<Self>, stream: UnixStream) -> Result<()> {
        let (reader, mut writer) = stream.into_split();
        let mut lines = BufReader::new(reader).lines();

        while let Some(line) = lines.next_line().await? {
            let req: QuasarMessage = serde_json::from_str(&line)?;
            let id = req.id.clone();
            let op = req.request;

            let result = match op {
                QuasarRequest::Read { path } => {
                    let vfs = self.vfs.read().await;
                    vfs.read_file(&path).map(|r| serde_json::json!(r))
                }
                QuasarRequest::Write { path, data } => {
                    let mut vfs = self.vfs.write().await;
                    vfs.write_file(&path, &data).map(|_| serde_json::json!(null))?;
                    
                    if let Some(ref disk) = self.disk_store {
                        let path_clone = path.clone();
                        let data_clone = data.clone();
                        let disk_clone = disk.clone();
                        tokio::spawn(async move {
                            if let Err(e) = disk_clone.write(&path_clone, data_clone.as_bytes()).await {
                                tracing::warn!("disk flush failed: {}", e);
                            }
                        });
                    }
                    
                    Ok(serde_json::Value::Null)
                }
                QuasarRequest::Mkdir { path } => {
                    let mut vfs = self.vfs.write().await;
                    vfs.mkdir(&path).map(|_| serde_json::Value::Null)
                }
                QuasarRequest::Ls { path } => {
                    let vfs = self.vfs.read().await;
                    vfs.ls(&path).map(|r| serde_json::json!(r))
                }
                QuasarRequest::Subscribe { pattern: _ } => {
                    Ok(serde_json::Value::Null)
                }
                QuasarRequest::Publish { topic, payload } => {
                    self.event_bus.publish(&topic, payload).map(|_| serde_json::Value::Null)
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