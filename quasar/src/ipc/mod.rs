use anyhow::Result;

pub struct IpcHandler;

impl IpcHandler {
    pub fn new() -> Self {
        Self
    }
}
pub type IpcHandlerRef = std::sync::Arc<IpcHandler>;
