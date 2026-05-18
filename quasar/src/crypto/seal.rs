//! AES-256-GCM authenticated encryption for sealing small blobs.
//!
//! Used to embed each quasardb's database password inside its own header
//! or footer so the deferred recovery path (`quasar-cli recovery`) can
//! unlock the database with just the password, independent of the device
//! fingerprint.
//!
//! This is not the bulk encryption used for database pages — that is
//! handled by SQLCipher, configured in [`crate::db`].

use crate::error::{Error, Result};
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use rand::TryRngCore;
use serde::{Deserialize, Serialize};

/// 12-byte GCM nonce length.
pub const NONCE_LEN: usize = 12;

/// A sealed blob: nonce + ciphertext+tag.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SealedBlob {
    pub nonce: [u8; NONCE_LEN],
    pub ciphertext: Vec<u8>,
}

/// Seal `plaintext` under `key` with a random nonce.
pub fn seal(key: &[u8; 32], plaintext: &[u8]) -> Result<SealedBlob> {
    let cipher = Aes256Gcm::new(key.into());
    let mut nonce = [0u8; NONCE_LEN];
    rand::rngs::OsRng
        .try_fill_bytes(&mut nonce)
        .map_err(|e| Error::Crypto(format!("os rng failed: {e}")))?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext)
        .map_err(|e| Error::Crypto(format!("seal failed: {e}")))?;
    Ok(SealedBlob { nonce, ciphertext })
}

/// Unseal a previously sealed blob. Returns plaintext bytes.
pub fn unseal(key: &[u8; 32], blob: &SealedBlob) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new(key.into());
    cipher
        .decrypt(Nonce::from_slice(&blob.nonce), blob.ciphertext.as_ref())
        .map_err(|_| Error::AuthFailed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_roundtrips() {
        let key = [9u8; 32];
        let pt = b"db-password";
        let sealed = seal(&key, pt).unwrap();
        let opened = unseal(&key, &sealed).unwrap();
        assert_eq!(opened, pt);
    }

    #[test]
    fn wrong_key_fails() {
        let sealed = seal(&[1u8; 32], b"x").unwrap();
        assert!(unseal(&[2u8; 32], &sealed).is_err());
    }
}
