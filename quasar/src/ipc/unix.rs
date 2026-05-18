//! Unix domain socket transport.

use super::server::IpcServer;
use crate::error::Result;
use crate::paths;
use std::sync::Arc;
use tokio::net::UnixListener;

/// Bind and serve on the default IPC endpoint. Loops until the process exits.
pub async fn serve(server: Arc<IpcServer>) -> Result<()> {
    let endpoint = paths::ipc_endpoint()?;
    if endpoint.exists() {
        // Reclaim a stale socket left behind by an unclean shutdown.
        let _ = std::fs::remove_file(&endpoint);
    }
    if let Some(parent) = endpoint.parent() {
        paths::ensure_dir(parent)?;
    }
    let listener = UnixListener::bind(&endpoint)?;
    tracing::info!(?endpoint, "quasar ipc listening");

    loop {
        let (mut stream, _addr) = listener.accept().await?;
        let server = server.clone();
        tokio::spawn(async move {
            loop {
                match IpcServer::read_frame(&mut stream).await {
                    Ok(req) => {
                        let resp = server.handle_request(req).await;
                        if let Err(e) = IpcServer::write_frame(&mut stream, &resp).await {
                            tracing::debug!(error = %e, "write_frame failed; closing peer");
                            break;
                        }
                    }
                    Err(e) => {
                        tracing::debug!(error = %e, "read_frame failed; closing peer");
                        break;
                    }
                }
            }
        });
    }
}
