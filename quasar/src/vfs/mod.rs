use anyhow::Result;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use dashmap::DashMap;
use std::sync::Arc;

type Inode = u64;

#[derive(Debug, Clone)]
pub struct FileMetadata {
    pub inode: Inode,
    pub size: usize,
    pub is_dir: bool,
    pub created_at: u64,
    pub modified_at: u64,
}

pub struct QuasarVfs {
    data: Arc<DashMap<Inode, Vec<u8>>>,
    metadata: Arc<DashMap<Inode, FileMetadata>>,
    by_name: Arc<DashMap<String, Inode>>,
    next_inode: Arc<std::sync::atomic::AtomicU64>,
}

impl QuasarVfs {
    pub fn new() -> Self {
        Self {
            data: Arc::new(DashMap::new()),
            metadata: Arc::new(DashMap::new()),
            by_name: Arc::new(DashMap::new()),
            next_inode: Arc::new(std::sync::atomic::AtomicU64::new(1)),
        }
    }

    pub fn read_file(&self, path: &str) -> Result<String> {
        let inode = self
            .by_name
            .get(path)
            .map(|r| *r)
            .ok_or_else(|| anyhow::anyhow!("path not found: {}", path))?;

        let meta = self
            .metadata
            .get(&inode)
            .ok_or_else(|| anyhow::anyhow!("inode not found: {}", inode))?;

        if meta.is_dir {
            return Err(anyhow::anyhow!("is a directory: {}", path));
        }

        let data = self
            .data
            .get(&inode)
            .ok_or_else(|| anyhow::anyhow!("no data for inode: {}", inode))?;

        Ok(BASE64.encode(&*data))
    }

    pub fn write_file(&self, path: &str, data: &str) -> Result<()> {
        let decoded = BASE64.decode(data)?;

        if let Some(inode) = self.by_name.get(path) {
            if let Some(meta) = self.metadata.get(&inode) {
                if meta.is_dir {
                    return Err(anyhow::anyhow!("is a directory: {}", path));
                }
            }
        }

        let inode = self.by_name.get(path).map(|r| *r).unwrap_or_else(|| {
            let inode = self
                .next_inode
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            self.by_name.insert(path.to_string(), inode);
            inode
        });

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        self.data.insert(inode, decoded.clone());
        self.metadata.insert(
            inode,
            FileMetadata {
                inode,
                size: decoded.len(),
                is_dir: false,
                created_at: now,
                modified_at: now,
            },
        );

        Ok(())
    }

    pub fn mkdir(&self, path: &str) -> Result<()> {
        if let Some(inode) = self.by_name.get(path) {
            if let Some(meta) = self.metadata.get(&inode) {
                if meta.is_dir {
                    return Err(anyhow::anyhow!("path exists: {}", path));
                }
                return Err(anyhow::anyhow!("path is a file: {}", path));
            }
        }

        let inode = self
            .next_inode
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        self.by_name.insert(path.to_string(), inode);
        self.data.insert(inode, Vec::new());

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        self.metadata.insert(
            inode,
            FileMetadata {
                inode,
                size: 0,
                is_dir: true,
                created_at: now,
                modified_at: now,
            },
        );

        Ok(())
    }

    pub fn is_dir(&self, path: &str) -> bool {
        if let Some(inode) = self.by_name.get(path) {
            if let Some(meta) = self.metadata.get(&inode) {
                return meta.is_dir;
            }
        }
        false
    }

    pub fn ls(&self, path: &str) -> Result<Vec<String>> {
        let prefix = if path == "/" { "" } else { path };
        let prefix_len = prefix.len();

        if let Some(inode) = self.by_name.get(path) {
            if let Some(meta) = self.metadata.get(&inode) {
                if !meta.is_dir {
                    return Err(anyhow::anyhow!("not a directory: {}", path));
                }
            }
        } else {
            return Err(anyhow::anyhow!("path not found: {}", path));
        }

        let mut seen = std::collections::HashSet::new();
        let mut results: Vec<String> = self
            .by_name
            .iter()
            .filter_map(|r| {
                let name = r.key();
                if !name.starts_with(prefix) || name.len() <= prefix_len {
                    return None;
                }
                let rest = &name[prefix_len + 1..];
                if rest.is_empty() {
                    return None;
                }
                let child = rest.split('/').next().unwrap_or(rest);
                if seen.contains(child) {
                    return None;
                }
                seen.insert(child.to_string());
                Some(child.to_string())
            })
            .collect();

        results.sort();
        Ok(results)
    }
}
