//! Windows named pipe transport.
//!
//! Skeleton only — Tokio's `windows::named_pipe::NamedPipeServer` API is
//! the intended backing transport. v1 development happens on Unix
//! primarily; this is wired enough to compile and document the surface.

use super::server::IpcServer;
use crate::error::Result;
use crate::paths;
use std::sync::Arc;
use tokio::net::windows::named_pipe::ServerOptions;

pub async fn serve(server: Arc<IpcServer>) -> Result<()> {
    let addr = paths::ipc_endpoint()?;
    let addr_str = addr.to_string_lossy().to_string();

    loop {
        let mut server_pipe = ServerOptions::new()
            .first_pipe_instance(true)
            .create(&addr_str)?;

        server_pipe.connect().await?;

        let server = server.clone();
        tokio::spawn(async move {
            loop {
                match IpcServer::read_frame(&mut server_pipe).await {
                    Ok(req) => {
                        let resp = server.handle_request(req).await;
                        if let Err(e) = IpcServer::write_frame(&mut server_pipe, &resp).await {
                            tracing::debug!(error = %e, "write_frame failed; closing pipe");
                            break;
                        }
                    }
                    Err(e) => {
                        tracing::debug!(error = %e, "read_frame failed; closing pipe");
                        break;
                    }
                }
            }
        });
    }
}
