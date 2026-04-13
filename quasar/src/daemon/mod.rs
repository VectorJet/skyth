use anyhow::Result;
use std::path::PathBuf;

pub struct QuasarDaemon {
    socket_path: PathBuf,
}

impl QuasarDaemon {
    pub fn new(socket_path: impl Into<PathBuf>) -> Self {
        Self {
            socket_path: socket_path.into(),
        }
    }

    pub async fn run(self) -> Result<()> {
        Ok(())
    }
}