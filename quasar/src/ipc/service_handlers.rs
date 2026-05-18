use super::server::IpcServer;
use crate::epsilon::Snapshot;
use crate::error::{Error, Result};
use crate::services::cron::CronJob;
use crate::services::heartbeat::HeartbeatEntry;
use crate::vfs::{Namespace, Vfs, VfsPath};
use std::path::{Path, PathBuf};

impl IpcServer {
    pub(super) async fn handle_heartbeat_append(
        &self,
        actor: &str,
        kind: &str,
        note: Option<String>,
    ) -> Result<()> {
        if actor != crate::auth::GENERALIST_ID {
            return Err(Error::PermissionDenied(
                "heartbeats are generalist-only".into(),
            ));
        }
        let entry = HeartbeatEntry {
            ts_unix_ms: chrono::Utc::now().timestamp_millis(),
            kind: kind.to_string(),
            note,
        };
        self.heartbeat.append(&entry)
    }

    pub(super) async fn handle_cron_register(
        &self,
        actor: &str,
        schedule: &str,
        target_agent_id: &str,
        payload: serde_json::Value,
    ) -> Result<()> {
        if actor != crate::auth::GENERALIST_ID {
            return Err(Error::PermissionDenied(
                "cron registration is generalist-first".into(),
            ));
        }
        let job = CronJob::new(schedule, target_agent_id, payload);
        let job_json = serde_json::to_vec(&job)?;
        let main_db_path = crate::paths::global_main_db_path()?;
        let dbs = self.dbs.lock().await;
        let db = dbs.get(&main_db_path).ok_or_else(|| {
            Error::other("global main.quasardb must be opened to register cron jobs")
        })?;
        let ns = Namespace::new("system/cron");
        let path = VfsPath::new(format!("/{}.json", job.id)).unwrap();
        Vfs::new(db)?.write(actor, &ns, &path, &job_json)?;
        Ok(())
    }

    pub(super) async fn handle_quasar_export(
        &self,
        actor: &str,
        db_path_str: &str,
        selector: crate::services::export::ExportSelector,
        dest_zip_path: &str,
    ) -> Result<crate::services::export::ExportReceipt> {
        if actor != crate::auth::GENERALIST_ID {
            return Err(Error::PermissionDenied("export is generalist-only".into()));
        }
        let db_path = PathBuf::from(db_path_str);
        let dbs = self.dbs.lock().await;
        let db = dbs
            .get(&db_path)
            .ok_or_else(|| Error::other("database must be opened to export"))?;
        let now_ms = chrono::Utc::now().timestamp_millis();
        crate::vfs::ops::append_audit(db, now_ms, actor, "export", Some(db_path_str), None)?;
        let receipt =
            crate::services::export::perform_export(db, selector, Path::new(dest_zip_path))?;
        let archive_bytes = std::fs::read(&receipt.archive_path)?;
        let chunk_hashes = self.epsilon.write_bytes(&archive_bytes)?;
        let snapshot = Snapshot {
            id: uuid::Uuid::now_v7().to_string(),
            branch: receipt.galaxy_branch.clone(),
            created_ms: chrono::Utc::now().timestamp_millis(),
            chunk_hashes,
        };
        self.epsilon.put_snapshot(&snapshot)?;
        Ok(receipt)
    }
}
