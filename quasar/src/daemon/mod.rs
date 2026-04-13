use anyhow::Result;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::net::UnixListener;
use tokio::sync::RwLock;
use tracing::{info, error, warn};

use crate::vfs_mem::QuasarVfs;
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
        
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let vfs = vfs.clone();
                    let event_bus = event_bus.clone();
                    let handler = Arc::new(IpcHandler::new(vfs, event_bus));
                    let handler = Arc::new(handler);
                    
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