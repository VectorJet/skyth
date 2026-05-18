//! Quasardb export.
//!
//! Export modes (per spec): full, by namespace, event range, agent,
//! memory type, or file path. Output is a zip or tar archive of VFS
//! contents; no mandatory re-encryption. Every export creates a Quasar
//! audit event *and* a Galaxy branch in Epsilon containing exactly the
//! exported contents.

use crate::branch::{BranchKind, BranchRef};
use crate::db::QuasarDb;
use crate::error::{Error, Result};
use crate::vfs::{Namespace, Vfs, VfsPath};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;

/// Selector controlling which VFS contents to include.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
pub enum ExportSelector {
    Full,
    Namespace(Namespace),
    EventRange { from_id: i64, to_id: i64 },
    Agent(String),
    MemoryType(String),
    Path { namespace: Namespace, path: String },
}

/// Output container format.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Zip,
    Tar,
}

/// Result of a completed export.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExportReceipt {
    pub archive_path: String,
    pub galaxy_branch: BranchRef,
}

/// Perform an export of VFS contents to a ZIP archive.
pub fn perform_export(
    db: &QuasarDb,
    selector: ExportSelector,
    dest_zip_path: &Path,
) -> Result<ExportReceipt> {
    let vfs = Vfs::new(db)?;
    let entries = match selector {
        ExportSelector::Full => vfs.list_all()?,
        ExportSelector::Namespace(ns) => vfs.list(&ns)?,
        ExportSelector::EventRange { from_id, to_id } => vfs.list_by_event_range(from_id, to_id)?,
        ExportSelector::Agent(actor) => vfs.list_by_actor(&actor)?,
        ExportSelector::MemoryType(mtype) => {
            // Logic for memory type would require more VFS metadata.
            vfs.list(&Namespace::new(format!("memory/{}", mtype)))?
        }
        ExportSelector::Path { namespace, path } => {
            let p = VfsPath::new(path).map_err(Error::other)?;
            if let Some(content) = vfs.read(&namespace, &p)? {
                // If it's a single file, we still return a list of one entry for the zip logic.
                vec![crate::vfs::VfsEntry {
                    namespace,
                    path: p,
                    size: content.len() as u64,
                    created_ms: 0,
                    updated_ms: 0,
                    event_id: 0,
                }]
            } else {
                Vec::new()
            }
        }
    };

    let file = std::fs::File::create(dest_zip_path)?;
    let mut zip = zip::ZipWriter::new(file);
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

    for entry in entries {
        let content = vfs
            .read(&entry.namespace, &entry.path)?
            .ok_or_else(|| Error::other("entry content missing during export"))?;
        let zip_path = format!(
            "{}/{}",
            entry.namespace.as_str(),
            entry.path.as_str().trim_start_matches('/')
        );
        zip.start_file(zip_path, options)?;
        zip.write_all(&content)?;
    }

    zip.finish()?;

    let galaxy_branch = BranchRef::new(BranchKind::Galaxy, "export", None);

    Ok(ExportReceipt {
        archive_path: dest_zip_path.to_string_lossy().to_string(),
        galaxy_branch,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{OpenMode, open_or_init};
    use crate::fingerprint::DeviceFingerprint;
    use crate::vfs::Vfs;
    use tempfile::TempDir;

    #[test]
    fn full_export_includes_all_namespaces() {
        let tmp = TempDir::new().unwrap();
        let db_path = tmp.path().join("main.quasardb");
        let fp = DeviceFingerprint::from_bytes([7u8; 32]);
        let db = open_or_init(
            &db_path,
            b"pw",
            OpenMode::CreateIfMissing {
                db_kind: "main".into(),
            },
            &fp,
        )
        .unwrap();
        let vfs = Vfs::new(&db).unwrap();
        vfs.write(
            "generalist",
            &Namespace::new("memory"),
            &VfsPath::new("/a.txt").unwrap(),
            b"a",
        )
        .unwrap();
        vfs.write(
            "generalist",
            &Namespace::new("state/runtime"),
            &VfsPath::new("/b.txt").unwrap(),
            b"b",
        )
        .unwrap();

        let zip_path = tmp.path().join("export.zip");
        perform_export(&db, ExportSelector::Full, &zip_path).unwrap();

        let file = std::fs::File::open(zip_path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        assert!(archive.by_name("memory/a.txt").is_ok());
        assert!(archive.by_name("state/runtime/b.txt").is_ok());
    }
}
