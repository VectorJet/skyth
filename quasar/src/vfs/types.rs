//! Value types used by the VFS.

use serde::{Deserialize, Serialize};

/// A VFS namespace, e.g. `memory`, `events`, `state`.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Namespace(pub String);

impl Namespace {
    pub fn new(name: impl Into<String>) -> Self {
        Self(name.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A POSIX-style path *inside* a namespace. Always starts with `/`.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct VfsPath(String);

impl VfsPath {
    /// Construct, normalizing leading slash. Rejects `..` traversal.
    pub fn new(path: impl Into<String>) -> Result<Self, &'static str> {
        let mut s: String = path.into();
        if s.is_empty() {
            return Err("empty path");
        }
        if !s.starts_with('/') {
            s.insert(0, '/');
        }
        if s.split('/').any(|seg| seg == "..") {
            return Err("`..` not allowed in vfs paths");
        }
        Ok(Self(s))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A logical VFS entry, returned by listing operations.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VfsEntry {
    pub namespace: Namespace,
    pub path: VfsPath,
    pub size: u64,
    pub created_ms: i64,
    pub updated_ms: i64,
    pub event_id: i64,
}
