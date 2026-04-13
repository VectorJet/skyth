use anyhow::Result;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use dashmap::DashMap;
use chacha20poly1305::{aead::{Aead, KeyInit}, ChaCha20Poly1305, Nonce};
use rand::RngCore;

#[derive(Clone)]
pub struct DiskStore {
    data_dir: PathBuf,
    encryption_key: Vec<u8>,
    cache: Arc<DashMap<String, Vec<u8>>>,
}

impl DiskStore {
    pub async fn new(data_dir: PathBuf, password: &str) -> Result<Self> {
        fs::create_dir_all(&data_dir).await?;
        
        let key = derive_key(password);
        
        Ok(Self {
            data_dir,
            encryption_key: key,
            cache: Arc::new(DashMap::new()),
        })
    }

    pub async fn write(&self, path: &str, data: &[u8]) -> Result<()> {
        let encrypted = encrypt(data, &self.encryption_key)?;
        
        let full_path = self.data_dir.join(sanitize_path(path));
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).await?;
        }
        
        fs::write(&full_path, &encrypted).await?;
        self.cache.insert(path.to_string(), data.to_vec());
        
        Ok(())
    }

    pub async fn read(&self, path: &str) -> Result<Vec<u8>> {
        if let Some(cached) = self.cache.get(path) {
            return Ok(cached.clone());
        }
        
        let full_path = self.data_dir.join(sanitize_path(path));
        
        if !full_path.exists() {
            return Err(anyhow::anyhow!("file not found: {}", path));
        }
        
        let encrypted = fs::read(&full_path).await?;
        let decrypted = decrypt(&encrypted, &self.encryption_key)?;
        
        self.cache.insert(path.to_string(), decrypted.clone());
        
        Ok(decrypted)
    }

    pub async fn delete(&self, path: &str) -> Result<()> {
        let full_path = self.data_dir.join(sanitize_path(path));
        
        if full_path.exists() {
            fs::remove_file(&full_path).await?;
        }
        
        self.cache.remove(path);
        
        Ok(())
    }

    pub async fn list(&self, prefix: &str) -> Result<Vec<String>> {
        let mut entries = Vec::new();
        let search_prefix = sanitize_path(prefix);
        
        let mut dir = fs::read_dir(&self.data_dir).await?;
        while let Some(entry) = dir.next_entry().await? {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.starts_with(&search_prefix) {
                let path = name_str.strip_prefix(&search_prefix)
                    .unwrap_or(&name_str)
                    .trim_start_matches('/');
                if !path.is_empty() {
                    entries.push(unsanitize_path(path));
                }
            }
        }
        
        Ok(entries)
    }

    pub fn invalidate(&self, path: &str) {
        self.cache.remove(path);
    }
}

fn sanitize_path(path: &str) -> String {
    path.replace('/', "__slash__")
}

fn unsanitize_path(path: &str) -> String {
    path.replace("__slash__", "/")
}

fn derive_key(password: &str) -> Vec<u8> {
    use ring::pbkdf2;
    use std::num::NonZeroU32;
    
    let salt = b"quasar-vfs-v1";
    let mut key = vec![0u8; 32];
    pbkdf2::derive(
        pbkdf2::PBKDF2_HMAC_SHA256,
        NonZeroU32::new(100_000).unwrap(),
        salt,
        password.as_bytes(),
        &mut key,
    );
    key
}

fn encrypt(data: &[u8], key: &[u8]) -> Result<Vec<u8>> {
    let cipher = ChaCha20Poly1305::new_from_slice(key)
        .map_err(|_| anyhow::anyhow!("invalid key"))?;
    
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let ciphertext = cipher.encrypt(nonce, data)
        .map_err(|_| anyhow::anyhow!("encrypt failed"))?;
    
    let mut result = nonce_bytes.to_vec();
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

fn decrypt(data: &[u8], key: &[u8]) -> Result<Vec<u8>> {
    if data.len() < 12 {
        return Err(anyhow::anyhow!("data too short"));
    }
    
    let cipher = ChaCha20Poly1305::new_from_slice(key)
        .map_err(|_| anyhow::anyhow!("invalid key"))?;
    
    let nonce = Nonce::from_slice(&data[..12]);
    let ciphertext = &data[12..];
    
    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|_| anyhow::anyhow!("decrypt failed"))?;
    
    Ok(plaintext)
}