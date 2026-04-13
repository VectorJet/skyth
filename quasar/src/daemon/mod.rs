use anyhow::Result;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::UnixListener;
use tokio::sync::RwLock;
use tokio::time::interval;
use tracing::{info, error, warn};

use crate::vfs_mem::QuasarVfs;
use crate::event_bus::EventBus;
use crate::disk::DiskStore;
use crate::ipc::IpcHandler;

pub struct QuasarDaemon {
    socket_path: PathBuf,
    vfs: Arc<RwLock<QuasarVfs>>,
    event_bus: EventBus,
    disk_store: Option<DiskStore>,
    flush_interval_secs: u64,
}

impl QuasarDaemon {
    pub fn new(socket_path: impl Into<PathBuf>) -> Self {
        Self {
            socket_path: socket_path.into(),
            vfs: Arc::new(RwLock::new(QuasarVfs::new())),
            event_bus: EventBus::new(),
            disk_store: None,
            flush_interval_secs: 5,
        }
    }

    pub fn with_disk(mut self, disk_store: DiskStore, flush_interval_secs: u64) -> Self {
        self.disk_store = Some(disk_store);
        self.flush_interval_secs = flush_interval_secs;
        self
    }

    pub fn vfs(&self) -> Arc<RwLock<QuasarVfs>> {
        self.vfs.clone()
    }

    pub fn event_bus(&self) -> EventBus {
        self.event_bus.clone()
    }

    pub async fn run(self) -> Result<()> {
        let socket_path = &self.socket_path;
        
        if socket_path.exists() {
            std::fs::remove_file(socket_path)?;
        }
        
        let listener = UnixListener::bind(socket_path)?;
        info!("quasard listening on {}", socket_path.display());
        
        let vfs = self.vfs();
        let event_bus = self.event_bus();
        let disk_store = self.disk_store.clone();
        let flush_interval = self.flush_interval_secs;
        
        let vfs_for_flush = vfs.clone();
        let disk_for_flush = disk_store.clone();
        
        // Background flush task
        if disk_store.is_some() {
            tokio::spawn(async move {
                let mut ticker = interval(Duration::from_secs(flush_interval));
                loop {
                    ticker.tick().await;
                    
                    if let Some(ref disk) = disk_for_flush {
                        // Get all files from VFS and persist
                        let vfs_lock = vfs_for_flush.read().await;
                        
                        // For now, just mark dirty - full implementation would track changes
                        info!("flush: checkpoint");
                    }
                }
            });
        }
        
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let vfs = vfs.clone();
                    let event_bus = event_bus.clone();
                    let disk_store = disk_store.clone();
                    let handler = Arc::new(IpcHandler::new(vfs, event_bus, disk_store));
                    
                    tokio::spawn(async move {
                        if let Err(e) = handler.handle_client(stream).await {
                            error!("client error: {}", e);
                        }
                    });
                }
                Err(e) => {
                    warn!("accept error: {}", e);
                }
            }
        }
    }
}