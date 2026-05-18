//! VFS read/write/edit/delete with audit event creation.
//!
//! All mutating operations append a row to the shared `events` table and
//! a corresponding row to `audit` when the action is security-relevant
//! (currently: delete + export — extended by callers). Reads are not
//! audited by default to keep the table size bounded.
//!
//! Policy hooks (permission checks, delete prompts) are wired in by the
//! gateway, not by the VFS itself — the VFS exposes raw mechanism.

use super::schema::VFS_SCHEMA;
use super::types::{Namespace, VfsEntry, VfsPath};
use crate::db::QuasarDb;
use crate::error::{Error, Result};
use rusqlite::{OptionalExtension, params};

/// Borrowed handle to the VFS of a quasardb. Cheap to construct per op.
pub struct Vfs<'a> {
    db: &'a QuasarDb,
}

impl<'a> Vfs<'a> {
    pub fn new(db: &'a QuasarDb) -> Result<Self> {
        db.conn().execute_batch(VFS_SCHEMA)?;
        Ok(Self { db })
    }

    /// Read the current bytes at `(namespace, path)`.
    pub fn read(&self, ns: &Namespace, path: &VfsPath) -> Result<Option<Vec<u8>>> {
        let bytes: Option<Vec<u8>> = self
            .db
            .conn()
            .query_row(
                "SELECT content FROM vfs_entries WHERE namespace = ?1 AND path = ?2",
                params![ns.as_str(), path.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        Ok(bytes)
    }

    /// Write or replace `(namespace, path)` with `content`. Appends an event.
    pub fn write(
        &self,
        actor: &str,
        ns: &Namespace,
        path: &VfsPath,
        content: &[u8],
    ) -> Result<i64> {
        let now_ms = chrono::Utc::now().timestamp_millis();
        let event_id = append_event(
            self.db,
            now_ms,
            "vfs.write",
            Some(ns),
            Some(path),
            actor,
            content,
        )?;
        let existed: Option<i64> = self
            .db
            .conn()
            .query_row(
                "SELECT created_ms FROM vfs_entries WHERE namespace = ?1 AND path = ?2",
                params![ns.as_str(), path.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        let created_ms = existed.unwrap_or(now_ms);
        self.db.conn().execute(
            "INSERT OR REPLACE INTO vfs_entries \
             (namespace, path, size, created_ms, updated_ms, event_id, content) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                ns.as_str(),
                path.as_str(),
                content.len() as i64,
                created_ms,
                now_ms,
                event_id,
                content,
            ],
        )?;
        Ok(event_id)
    }

    /// Edit = read-modify-write through a closure. Atomic per call.
    pub fn edit<F>(&self, actor: &str, ns: &Namespace, path: &VfsPath, f: F) -> Result<i64>
    where
        F: FnOnce(Option<Vec<u8>>) -> Vec<u8>,
    {
        let current = self.read(ns, path)?;
        let next = f(current);
        self.write(actor, ns, path, &next)
    }

    /// Delete `(namespace, path)`. Records an audit event.
    pub fn delete(&self, actor: &str, ns: &Namespace, path: &VfsPath) -> Result<()> {
        let removed = self.db.conn().execute(
            "DELETE FROM vfs_entries WHERE namespace = ?1 AND path = ?2",
            params![ns.as_str(), path.as_str()],
        )?;
        if removed == 0 {
            return Err(Error::other(format!(
                "vfs entry not found: {}{}",
                ns.as_str(),
                path.as_str()
            )));
        }
        let now_ms = chrono::Utc::now().timestamp_millis();
        append_event(
            self.db,
            now_ms,
            "vfs.delete",
            Some(ns),
            Some(path),
            actor,
            &[],
        )?;
        append_audit(
            self.db,
            now_ms,
            actor,
            "vfs.delete",
            Some(path.as_str()),
            None,
        )?;
        Ok(())
    }

    /// List entries in a namespace.
    pub fn list(&self, ns: &Namespace) -> Result<Vec<VfsEntry>> {
        let conn = self.db.conn();
        let mut stmt = conn.prepare(
            "SELECT namespace, path, size, created_ms, updated_ms, event_id \
             FROM vfs_entries WHERE namespace = ?1 ORDER BY path",
        )?;
        let rows = stmt
            .query_map(params![ns.as_str()], |row| {
                Ok(VfsEntry {
                    namespace: Namespace::new(row.get::<_, String>(0)?),
                    path: VfsPath::new(row.get::<_, String>(1)?).unwrap(),
                    size: row.get::<_, i64>(2)? as u64,
                    created_ms: row.get(3)?,
                    updated_ms: row.get(4)?,
                    event_id: row.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// List every current VFS entry across all namespaces.
    pub fn list_all(&self) -> Result<Vec<VfsEntry>> {
        let conn = self.db.conn();
        let mut stmt = conn.prepare(
            "SELECT namespace, path, size, created_ms, updated_ms, event_id \
             FROM vfs_entries ORDER BY namespace, path",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(VfsEntry {
                    namespace: Namespace::new(row.get::<_, String>(0)?),
                    path: VfsPath::new(row.get::<_, String>(1)?).unwrap(),
                    size: row.get::<_, i64>(2)? as u64,
                    created_ms: row.get(3)?,
                    updated_ms: row.get(4)?,
                    event_id: row.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// List entries written by a specific actor across all namespaces.
    pub fn list_by_actor(&self, actor: &str) -> Result<Vec<VfsEntry>> {
        let conn = self.db.conn();
        let mut stmt = conn.prepare(
            "SELECT v.namespace, v.path, v.size, v.created_ms, v.updated_ms, v.event_id \
             FROM vfs_entries v \
             JOIN events e ON v.event_id = e.id \
             WHERE e.actor = ?1 ORDER BY v.namespace, v.path",
        )?;
        let rows = stmt
            .query_map(params![actor], |row| {
                Ok(VfsEntry {
                    namespace: Namespace::new(row.get::<_, String>(0)?),
                    path: VfsPath::new(row.get::<_, String>(1)?).unwrap(),
                    size: row.get::<_, i64>(2)? as u64,
                    created_ms: row.get(3)?,
                    updated_ms: row.get(4)?,
                    event_id: row.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// List entries whose latest event falls within the given ID range.
    pub fn list_by_event_range(&self, start_id: i64, end_id: i64) -> Result<Vec<VfsEntry>> {
        let conn = self.db.conn();
        let mut stmt = conn.prepare(
            "SELECT namespace, path, size, created_ms, updated_ms, event_id \
             FROM vfs_entries WHERE event_id BETWEEN ?1 AND ?2 ORDER BY event_id",
        )?;
        let rows = stmt
            .query_map(params![start_id, end_id], |row| {
                Ok(VfsEntry {
                    namespace: Namespace::new(row.get::<_, String>(0)?),
                    path: VfsPath::new(row.get::<_, String>(1)?).unwrap(),
                    size: row.get::<_, i64>(2)? as u64,
                    created_ms: row.get(3)?,
                    updated_ms: row.get(4)?,
                    event_id: row.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Create a virtual vector table using `sqlite-vec`.
    /// `dimensions` is the size of the float vector.
    pub fn create_vector_table(&self, name: &str, dimensions: usize) -> Result<()> {
        let sql = format!(
            "CREATE VIRTUAL TABLE IF NOT EXISTS {} USING vec0(embedding float[{}])",
            name, dimensions
        );
        self.db.conn().execute(&sql, [])?;
        Ok(())
    }

    /// Perform a K-Nearest Neighbors (KNN) search on a vector table.
    /// Returns a list of (rowid, distance) pairs.
    pub fn vector_search(
        &self,
        table: &str,
        query_vector: &[f32],
        limit: usize,
    ) -> Result<Vec<(i64, f64)>> {
        use zerocopy::IntoBytes;
        let query_bytes = query_vector.as_bytes();
        let conn = self.db.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT rowid, distance FROM {} WHERE embedding MATCH ?1 ORDER BY distance LIMIT ?2",
            table
        ))?;
        let rows = stmt
            .query_map(params![query_bytes, limit as i64], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Insert a vector into a virtual vector table.
    pub fn insert_vector(&self, table: &str, rowid: i64, vector: &[f32]) -> Result<()> {
        use zerocopy::IntoBytes;
        let bytes = vector.as_bytes();
        self.db.conn().execute(
            &format!("INSERT INTO {}(rowid, embedding) VALUES (?1, ?2)", table),
            params![rowid, bytes],
        )?;
        Ok(())
    }
}

fn append_event(
    db: &QuasarDb,
    ts_ms: i64,
    kind: &str,
    ns: Option<&Namespace>,
    path: Option<&VfsPath>,
    actor: &str,
    payload: &[u8],
) -> Result<i64> {
    db.conn().execute(
        "INSERT INTO events (ts_unix_ms, kind, namespace, path, actor, payload) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            ts_ms,
            kind,
            ns.map(|n| n.as_str()),
            path.map(|p| p.as_str()),
            actor,
            payload,
        ],
    )?;
    Ok(db.conn().last_insert_rowid())
}

pub(crate) fn append_audit(
    db: &QuasarDb,
    ts_ms: i64,
    actor: &str,
    action: &str,
    target: Option<&str>,
    detail: Option<&str>,
) -> Result<i64> {
    db.conn().execute(
        "INSERT INTO audit (ts_unix_ms, actor, action, target, detail) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![ts_ms, actor, action, target, detail],
    )?;
    Ok(db.conn().last_insert_rowid())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{OpenMode, open_or_init};
    use crate::fingerprint::DeviceFingerprint;
    use tempfile::TempDir;

    fn fresh_db() -> (TempDir, QuasarDb) {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("vfs.quasardb");
        let fp = DeviceFingerprint::from_bytes([0u8; 32]);
        let db = open_or_init(
            &path,
            b"pw",
            OpenMode::CreateIfMissing {
                db_kind: "main".into(),
            },
            &fp,
        )
        .unwrap();
        (tmp, db)
    }

    #[test]
    fn write_read_list_delete() {
        let (_tmp, db) = fresh_db();
        let vfs = Vfs::new(&db).unwrap();
        let ns = Namespace::new("memory");
        let p = VfsPath::new("/notes/today.md").unwrap();

        vfs.write("generalist", &ns, &p, b"hello").unwrap();
        assert_eq!(vfs.read(&ns, &p).unwrap().unwrap(), b"hello");

        vfs.edit("generalist", &ns, &p, |cur| {
            let mut v = cur.unwrap_or_default();
            v.extend_from_slice(b" world");
            v
        })
        .unwrap();
        assert_eq!(vfs.read(&ns, &p).unwrap().unwrap(), b"hello world");

        let list = vfs.list(&ns).unwrap();
        assert_eq!(list.len(), 1);

        vfs.delete("generalist", &ns, &p).unwrap();
        assert!(vfs.read(&ns, &p).unwrap().is_none());
    }
}
