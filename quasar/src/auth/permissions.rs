//! Permission model.
//!
//! Per the v1 spec:
//!
//! - Read access is open by default across all agents.
//! - Write access requires an explicit grant from the Generalist.
//! - The Generalist (id: `generalist`) has unconditional read/write to
//!   every agent workspace.
//!
//! Enforcement is *Quasar-layer*, not OS-layer. The IPC/Gateway is the
//! single chokepoint that consults this store before every mutating op.

use crate::error::{Error, Result};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

/// Stable id reserved for the system-level Generalist agent.
pub const GENERALIST_ID: &str = "generalist";

/// Operation classes that can be granted.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Right {
    Read,
    Write,
    Delete,
    Export,
}

impl Right {
    pub fn as_str(self) -> &'static str {
        match self {
            Right::Read => "read",
            Right::Write => "write",
            Right::Delete => "delete",
            Right::Export => "export",
        }
    }
}

/// Scope a grant applies to.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PermissionScope {
    /// Whole quasardb identified by header `db_kind` + path.
    Database { path: String },
    /// VFS namespace within any database.
    Namespace { db_path: String, namespace: String },
    /// Exact VFS path inside a namespace.
    Path {
        db_path: String,
        namespace: String,
        path: String,
    },
}

/// A single (agent, right, scope) grant row.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Grant {
    pub agent_id: String,
    pub right: Right,
    pub scope: PermissionScope,
}

/// SQL schema additive to the base schema. Lives only in `auth.quasardb`.
pub const GRANTS_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS grants (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id  TEXT NOT NULL,
    right     TEXT NOT NULL,
    scope     TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS grants_agent_idx ON grants (agent_id);
"#;

/// Read/write store over the `grants` table.
pub struct PermissionStore<'a> {
    conn: &'a Connection,
}

impl<'a> PermissionStore<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    /// Apply the grants schema. Idempotent.
    pub fn ensure_schema(conn: &Connection) -> Result<()> {
        conn.execute_batch(GRANTS_SCHEMA)?;
        Ok(())
    }

    pub fn grant(&self, g: &Grant) -> Result<()> {
        let scope_json = serde_json::to_string(&g.scope)?;
        self.conn.execute(
            "INSERT INTO grants (agent_id, right, scope) VALUES (?1, ?2, ?3)",
            params![g.agent_id, g.right.as_str(), scope_json],
        )?;
        Ok(())
    }

    pub fn revoke(&self, agent_id: &str, right: Right, scope: &PermissionScope) -> Result<()> {
        let scope_json = serde_json::to_string(scope)?;
        self.conn.execute(
            "DELETE FROM grants WHERE agent_id = ?1 AND right = ?2 AND scope = ?3",
            params![agent_id, right.as_str(), scope_json],
        )?;
        Ok(())
    }

    /// Check whether `agent_id` has `right` on `scope`.
    ///
    /// Implements the default rules: generalist god-mode, open reads,
    /// explicit grants for everything else.
    pub fn check(
        &self,
        agent_id: &str,
        right: Right,
        scope: &PermissionScope,
    ) -> Result<bool> {
        if agent_id == GENERALIST_ID {
            return Ok(true);
        }
        if right == Right::Read {
            return Ok(true);
        }
        let scope_json = serde_json::to_string(scope)?;
        let mut stmt = self.conn.prepare(
            "SELECT 1 FROM grants WHERE agent_id = ?1 AND right = ?2 AND scope = ?3 LIMIT 1",
        )?;
        let found = stmt
            .query_row(params![agent_id, right.as_str(), scope_json], |_| Ok(()))
            .optional()?
            .is_some();
        Ok(found)
    }

    /// Convenience: error if check fails.
    pub fn require(
        &self,
        agent_id: &str,
        right: Right,
        scope: &PermissionScope,
    ) -> Result<()> {
        if self.check(agent_id, right, scope)? {
            Ok(())
        } else {
            Err(Error::PermissionDenied(format!(
                "agent {agent_id} lacks {} on scope",
                right.as_str()
            )))
        }
    }
}

use rusqlite::OptionalExtension;
