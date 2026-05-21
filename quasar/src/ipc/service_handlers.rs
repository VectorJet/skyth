use super::server::IpcServer;
use crate::epsilon::Snapshot;
use crate::error::{Error, Result};
use crate::services::cron::CronJob;
use crate::services::heartbeat::HeartbeatEntry;
use crate::services::memory::{Memory, MemoryHit};
use crate::services::queue::{Queue, QueueRow, QueueStats};
use crate::services::state_store::{StateStore, StateTransition};
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

    pub(super) async fn handle_queue_push_user(
        &self,
        actor: &str,
        db_path_str: &str,
        payload: &str,
        ts: i64,
        enqueued_at: i64,
    ) -> Result<i64> {
        self.require_generalist_queue_actor(actor)?;
        let db = self.opened_db(db_path_str).await?;
        Queue::new(&db)?.push_user(payload, ts, enqueued_at)
    }

    pub(super) async fn handle_queue_push_gateway(
        &self,
        actor: &str,
        db_path_str: &str,
        payload: &str,
        tag: Option<&str>,
        ts: i64,
        enqueued_at: i64,
    ) -> Result<i64> {
        self.require_generalist_queue_actor(actor)?;
        let db = self.opened_db(db_path_str).await?;
        Queue::new(&db)?.push_gateway(payload, tag, ts, enqueued_at)
    }

    pub(super) async fn handle_queue_claim_all(
        &self,
        actor: &str,
        db_path_str: &str,
    ) -> Result<Vec<QueueRow>> {
        self.require_generalist_queue_actor(actor)?;
        let db = self.opened_db(db_path_str).await?;
        Queue::new(&db)?.claim_all()
    }

    pub(super) async fn handle_queue_mark_done(
        &self,
        actor: &str,
        db_path_str: &str,
        ids: &[i64],
    ) -> Result<()> {
        self.require_generalist_queue_actor(actor)?;
        let db = self.opened_db(db_path_str).await?;
        Queue::new(&db)?.mark_done(ids)
    }

    pub(super) async fn handle_queue_release_inflight(
        &self,
        actor: &str,
        db_path_str: &str,
        ids: &[i64],
    ) -> Result<()> {
        self.require_generalist_queue_actor(actor)?;
        let db = self.opened_db(db_path_str).await?;
        Queue::new(&db)?.release_inflight(ids)
    }

    pub(super) async fn handle_queue_pending_stats(
        &self,
        actor: &str,
        db_path_str: &str,
    ) -> Result<QueueStats> {
        self.require_generalist_queue_actor(actor)?;
        let db = self.opened_db(db_path_str).await?;
        Queue::new(&db)?.pending_stats()
    }

    pub(super) async fn handle_state_record(
        &self,
        actor: &str,
        db_path_str: &str,
        domain: &str,
        from_state: Option<&str>,
        to_state: &str,
        reason: Option<&str>,
        metadata: serde_json::Value,
    ) -> Result<i64> {
        self.require_generalist_queue_actor(actor)?;
        let db = self.opened_db(db_path_str).await?;
        StateStore::new(&db)?.record(actor, domain, from_state, to_state, reason, metadata)
    }

    pub(super) async fn handle_state_latest(
        &self,
        actor: &str,
        db_path_str: &str,
        domain: &str,
    ) -> Result<Option<StateTransition>> {
        self.require_generalist_queue_actor(actor)?;
        let db = self.opened_db(db_path_str).await?;
        StateStore::new(&db)?.latest(domain)
    }

    pub(super) async fn handle_memory_record_gateway_turn(
        &self,
        actor: &str,
        db_path_str: &str,
        channel: &str,
        chat_id: &str,
        user_text: Option<&str>,
        assistant_text: Option<&str>,
        user_message_id: Option<&str>,
        ts_unix_ms: i64,
    ) -> Result<Vec<i64>> {
        self.require_generalist_queue_actor(actor)?;
        let db = self.opened_db(db_path_str).await?;
        Memory::new(&db)?.record_gateway_turn(
            channel,
            chat_id,
            user_text,
            assistant_text,
            user_message_id,
            ts_unix_ms,
        )
    }

    pub(super) async fn handle_memory_search(
        &self,
        actor: &str,
        db_path_str: &str,
        query: &str,
        limit: i64,
    ) -> Result<Vec<MemoryHit>> {
        self.require_generalist_queue_actor(actor)?;
        let db = self.opened_db(db_path_str).await?;
        Memory::new(&db)?.search(query, limit)
    }

    fn require_generalist_queue_actor(&self, actor: &str) -> Result<()> {
        if actor != crate::auth::GENERALIST_ID {
            return Err(Error::PermissionDenied(
                "gateway queue is generalist-only".into(),
            ));
        }
        Ok(())
    }

    async fn opened_db(&self, db_path_str: &str) -> Result<std::sync::Arc<crate::db::QuasarDb>> {
        let db_path = PathBuf::from(db_path_str);
        let dbs = self.dbs.lock().await;
        dbs.get(&db_path)
            .cloned()
            .ok_or_else(|| Error::other("database must be opened before queue operations"))
    }
}
