//! Quasar binary entry point.
//!
//! Starts tracing, then runs the local IPC server (Unix socket on
//! Linux/macOS, named pipe on Windows — currently stubbed).

use quasar::ipc::IpcServer;

fn main() -> anyhow::Result<()> {
    init_tracing();
    quasar::db::register_extensions();

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;

    rt.block_on(async {
        let server = IpcServer::new();
        #[cfg(unix)]
        {
            quasar::ipc::unix::serve(server).await?;
        }
        #[cfg(windows)]
        {
            quasar::ipc::windows_pipe::serve(server).await?;
        }
        Ok::<_, anyhow::Error>(())
    })
}

fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();
}
