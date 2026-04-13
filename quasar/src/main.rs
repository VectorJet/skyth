use quasar::disk::DiskStore;
use quasar::QuasarDaemon;
use std::path::PathBuf;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::new("info"))
        .init();

    let args: Vec<String> = std::env::args().collect();
    
    let mut qvfs_path: Option<PathBuf> = None;
    let mut mount_path: Option<PathBuf> = None;
    let mut socket_path = PathBuf::from("/tmp/quasard.sock");
    let mut flush_interval = 5u64;
    
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "-q" | "--qvfs" => {
                i += 1;
                qvfs_path = Some(PathBuf::from(&args[i]));
            }
            "-m" | "--mount" => {
                i += 1;
                mount_path = Some(PathBuf::from(&args[i]));
            }
            "-s" | "--socket" => {
                i += 1;
                socket_path = PathBuf::from(&args[i]);
            }
            "-f" | "--flush" => {
                i += 1;
                flush_interval = args[i].parse().unwrap_or(5);
            }
            _ => {}
        }
        i += 1;
    }
    
    let daemon = if let Some(qvfs) = qvfs_path {
        let password = std::env::var("QUASAR_PASSWORD")
            .expect("QUASAR_PASSWORD env required for encrypted storage");
        
        let data_dir = qvfs.parent().unwrap_or(&qvfs).to_path_buf();
        let disk = DiskStore::new(data_dir, &password).await?;
        
        if mount_path.is_none() {
            mount_path = Some(PathBuf::from("/mnt/quasar"));
        }
        
        QuasarDaemon::new(socket_path)
            .with_disk(disk, flush_interval)
    } else {
        QuasarDaemon::new(socket_path)
    };
    
    daemon.run().await
}