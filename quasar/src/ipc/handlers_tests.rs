use super::{IpcServer, Request, RequestKind, ResponseKind};
use crate::auth::GENERALIST_ID;
use crate::branch::BranchKind;
use crate::services::gateway::MockGateway;
use base64::{Engine as _, engine::general_purpose};
use std::sync::{Arc, Mutex as StdMutex};
use tempfile::TempDir;

static ENV_LOCK: StdMutex<()> = StdMutex::new(());

fn req(id: &str, actor: &str, kind: RequestKind) -> Request {
    Request {
        id: id.to_string(),
        actor: actor.to_string(),
        kind,
    }
}

#[tokio::test]
async fn ipc_queue_claim_ack_and_release_roundtrip() {
    let _guard = ENV_LOCK.lock().unwrap();
    let tmp = TempDir::new().unwrap();
    unsafe {
        std::env::set_var("SKYTH_HOME", tmp.path());
    }

    let server = IpcServer::new(Arc::new(MockGateway));
    let onboard = server
        .handle_request(req(
            "q1",
            GENERALIST_ID,
            RequestKind::Onboard {
                username: "tester".into(),
                password_b64: password_b64(),
            },
        ))
        .await;
    assert!(matches!(onboard.kind, ResponseKind::Ok));

    let db_path = tmp
        .path()
        .join("queue.quasardb")
        .to_string_lossy()
        .to_string();
    let opened = server
        .handle_request(req(
            "q2",
            GENERALIST_ID,
            RequestKind::DbOpen {
                db_path: db_path.clone(),
                db_kind: "gateway".into(),
                create_if_missing: true,
            },
        ))
        .await;
    assert!(matches!(opened.kind, ResponseKind::DbOpened { .. }));

    let pushed = server
        .handle_request(req(
            "q3",
            GENERALIST_ID,
            RequestKind::QueuePushUser {
                db_path: db_path.clone(),
                payload: "{\"text\":\"hello\"}".into(),
                ts: 10,
                enqueued_at: 11,
            },
        ))
        .await;
    assert!(matches!(pushed.kind, ResponseKind::QueueRowId { id } if id > 0));

    let claimed = server
        .handle_request(req(
            "q4",
            GENERALIST_ID,
            RequestKind::QueueClaimAll {
                db_path: db_path.clone(),
            },
        ))
        .await;
    let row_id = match claimed.kind {
        ResponseKind::QueueRows { rows } => {
            assert_eq!(rows.len(), 1);
            assert_eq!(rows[0].status, "pending");
            rows[0].id
        }
        other => panic!("unexpected response: {other:?}"),
    };

    let stats = server
        .handle_request(req(
            "q5",
            GENERALIST_ID,
            RequestKind::QueuePendingStats {
                db_path: db_path.clone(),
            },
        ))
        .await;
    assert!(matches!(stats.kind, ResponseKind::QueueStats { stats } if stats.user == 0));

    let released = server
        .handle_request(req(
            "q6",
            GENERALIST_ID,
            RequestKind::QueueReleaseInflight {
                db_path: db_path.clone(),
                ids: vec![row_id],
            },
        ))
        .await;
    assert!(matches!(released.kind, ResponseKind::Ok));

    let stats = server
        .handle_request(req(
            "q7",
            GENERALIST_ID,
            RequestKind::QueuePendingStats {
                db_path: db_path.clone(),
            },
        ))
        .await;
    assert!(matches!(stats.kind, ResponseKind::QueueStats { stats } if stats.user == 1));

    let done = server
        .handle_request(req(
            "q8",
            GENERALIST_ID,
            RequestKind::QueueMarkDone {
                db_path,
                ids: vec![row_id],
            },
        ))
        .await;
    assert!(matches!(done.kind, ResponseKind::Ok));

    unsafe {
        std::env::remove_var("SKYTH_HOME");
    }
}

#[tokio::test]
async fn ipc_state_and_memory_roundtrip() {
    let _guard = ENV_LOCK.lock().unwrap();
    let tmp = TempDir::new().unwrap();
    unsafe {
        std::env::set_var("SKYTH_HOME", tmp.path());
    }

    let server = IpcServer::new(Arc::new(MockGateway));
    let onboard = server
        .handle_request(req(
            "sm1",
            GENERALIST_ID,
            RequestKind::Onboard {
                username: "tester".into(),
                password_b64: password_b64(),
            },
        ))
        .await;
    assert!(matches!(onboard.kind, ResponseKind::Ok));

    let db_path = tmp
        .path()
        .join("gateway.quasardb")
        .to_string_lossy()
        .to_string();
    let opened = server
        .handle_request(req(
            "sm2",
            GENERALIST_ID,
            RequestKind::DbOpen {
                db_path: db_path.clone(),
                db_kind: "gateway".into(),
                create_if_missing: true,
            },
        ))
        .await;
    assert!(matches!(opened.kind, ResponseKind::DbOpened { .. }));

    let state = server
        .handle_request(req(
            "sm3",
            GENERALIST_ID,
            RequestKind::StateRecord {
                db_path: db_path.clone(),
                domain: "gateway".into(),
                from_state: None,
                to_state: "started".into(),
                reason: Some("test".into()),
                metadata: serde_json::json!({"ok": true}),
            },
        ))
        .await;
    assert!(matches!(state.kind, ResponseKind::StateTransitionId { id } if id > 0));

    let memory = server
        .handle_request(req(
            "sm4",
            GENERALIST_ID,
            RequestKind::MemoryRecordGatewayTurn {
                db_path: db_path.clone(),
                channel: "web".into(),
                chat_id: "tab-a".into(),
                user_text: Some("remember durable quasar memory".into()),
                assistant_text: None,
                user_message_id: Some("m1".into()),
                ts_unix_ms: 42,
            },
        ))
        .await;
    assert!(matches!(memory.kind, ResponseKind::MemoryRecordIds { ids } if ids.len() == 1));

    let search = server
        .handle_request(req(
            "sm5",
            GENERALIST_ID,
            RequestKind::MemorySearch {
                db_path,
                query: "durable".into(),
                limit: 5,
            },
        ))
        .await;
    assert!(matches!(search.kind, ResponseKind::MemoryHits { hits } if hits.len() == 1));

    unsafe {
        std::env::remove_var("SKYTH_HOME");
    }
}

fn password_b64() -> String {
    general_purpose::STANDARD.encode(b"test-password")
}

#[tokio::test]
async fn ipc_can_open_db_and_roundtrip_vfs_without_harness_specific_state() {
    let _guard = ENV_LOCK.lock().unwrap();
    let tmp = TempDir::new().unwrap();
    unsafe {
        std::env::set_var("SKYTH_HOME", tmp.path());
    }

    let server = IpcServer::new(Arc::new(MockGateway));
    let onboard = server
        .handle_request(req(
            "1",
            GENERALIST_ID,
            RequestKind::Onboard {
                username: "tester".into(),
                password_b64: password_b64(),
            },
        ))
        .await;
    assert!(matches!(onboard.kind, ResponseKind::Ok));

    let db_path = tmp
        .path()
        .join("main.quasardb")
        .to_string_lossy()
        .to_string();
    let opened = server
        .handle_request(req(
            "2",
            GENERALIST_ID,
            RequestKind::DbOpen {
                db_path: db_path.clone(),
                db_kind: "main".into(),
                create_if_missing: true,
            },
        ))
        .await;
    assert!(matches!(
        opened.kind,
        ResponseKind::DbOpened { db_kind, .. } if db_kind == "main"
    ));

    let content_b64 = general_purpose::STANDARD.encode(b"harness neutral");
    let write = server
        .handle_request(req(
            "3",
            GENERALIST_ID,
            RequestKind::VfsWrite {
                db_path: db_path.clone(),
                namespace: "memory".into(),
                path: "/note.txt".into(),
                content_b64,
            },
        ))
        .await;
    assert!(matches!(write.kind, ResponseKind::VfsEventId { event_id } if event_id > 0));

    let read = server
        .handle_request(req(
            "4",
            "agent-a",
            RequestKind::VfsRead {
                db_path: db_path.clone(),
                namespace: "memory".into(),
                path: "/note.txt".into(),
            },
        ))
        .await;
    match read.kind {
        ResponseKind::VfsBytes {
            content_b64: Some(content),
        } => {
            let bytes = general_purpose::STANDARD.decode(content).unwrap();
            assert_eq!(bytes, b"harness neutral");
        }
        other => panic!("unexpected response: {other:?}"),
    }

    let export_path = tmp
        .path()
        .join("full-export.zip")
        .to_string_lossy()
        .to_string();
    let export = server
        .handle_request(req(
            "5",
            GENERALIST_ID,
            RequestKind::QuasarExport {
                db_path: db_path.clone(),
                selector: crate::services::export::ExportSelector::Full,
                dest_zip_path: export_path,
            },
        ))
        .await;
    let galaxy_branch_id = match export.kind {
        ResponseKind::ExportReceipt { receipt } => {
            assert_eq!(receipt.galaxy_branch.kind, BranchKind::Galaxy);
            receipt.galaxy_branch.id
        }
        other => panic!("unexpected response: {other:?}"),
    };
    let snapshots = server.epsilon.list_snapshots().unwrap();
    assert!(
        snapshots
            .iter()
            .any(|snap| snap.branch_id == galaxy_branch_id)
    );

    unsafe {
        std::env::remove_var("SKYTH_HOME");
    }
}
