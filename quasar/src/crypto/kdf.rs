//! Argon2id key derivation.
//!
//! Quasar derives a 32-byte symmetric key from the superuser password and
//! a per-database 16-byte random salt. Parameters are conservative
//! interactive-login defaults; they can be tuned at onboarding time and
//! are stored alongside the salt so future opens reproduce the same key.

use crate::error::{Error, Result};
use argon2::{Algorithm, Argon2, Params, Version};
use serde::{Deserialize, Serialize};
use zeroize::ZeroizeOnDrop;

/// Length of the derived key in bytes. Matches AES-256 / SQLCipher key length.
pub const KEY_LEN: usize = 32;

/// Length of the random salt in bytes.
pub const SALT_LEN: usize = 16;

/// Tunable Argon2id parameters captured per database so derivation is
/// reproducible on subsequent opens.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Argon2Params {
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

impl Default for Argon2Params {
    /// Default interactive parameters: 64 MiB, 3 iterations, 1 lane.
    /// Conservative for laptops and Android-class devices.
    fn default() -> Self {
        Self {
            memory_kib: 64 * 1024,
            iterations: 3,
            parallelism: 1,
        }
    }
}

/// A derived symmetric key. Zeroed on drop.
#[derive(ZeroizeOnDrop)]
pub struct DerivedKey([u8; KEY_LEN]);

impl DerivedKey {
    pub fn as_bytes(&self) -> &[u8; KEY_LEN] {
        &self.0
    }

    /// Hex encoding for use as a SQLCipher key (`PRAGMA key = "x'..'";`).
    pub fn to_sqlcipher_hex(&self) -> String {
        hex::encode(self.0)
    }
}

/// Derive a key from `password` + `salt` using the supplied Argon2id params.
pub fn derive_key(password: &[u8], salt: &[u8], params: &Argon2Params) -> Result<DerivedKey> {
    if salt.len() != SALT_LEN {
        return Err(Error::Crypto(format!(
            "salt must be {SALT_LEN} bytes, got {}",
            salt.len()
        )));
    }
    let argon_params = Params::new(
        params.memory_kib,
        params.iterations,
        params.parallelism,
        Some(KEY_LEN),
    )
    .map_err(|e| Error::Crypto(format!("invalid argon2 params: {e}")))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon_params);
    let mut out = [0u8; KEY_LEN];
    argon
        .hash_password_into(password, salt, &mut out)
        .map_err(|e| Error::Crypto(format!("argon2 hash failed: {e}")))?;
    let key = DerivedKey(out);
    Ok(key)
}

/// Generate a fresh random salt suitable for [`derive_key`].
pub fn random_salt() -> [u8; SALT_LEN] {
    use rand::TryRngCore;
    let mut salt = [0u8; SALT_LEN];
    rand::rngs::OsRng
        .try_fill_bytes(&mut salt)
        .expect("OS RNG must produce salt bytes");
    salt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_is_deterministic() {
        let salt = [7u8; SALT_LEN];
        let params = Argon2Params {
            memory_kib: 1024,
            iterations: 1,
            parallelism: 1,
        };
        let a = derive_key(b"hunter2", &salt, &params).unwrap();
        let b = derive_key(b"hunter2", &salt, &params).unwrap();
        assert_eq!(a.as_bytes(), b.as_bytes());
    }

    #[test]
    fn distinct_salts_distinct_keys() {
        let params = Argon2Params {
            memory_kib: 1024,
            iterations: 1,
            parallelism: 1,
        };
        let a = derive_key(b"pw", &[1u8; SALT_LEN], &params).unwrap();
        let b = derive_key(b"pw", &[2u8; SALT_LEN], &params).unwrap();
        assert_ne!(a.as_bytes(), b.as_bytes());
    }
}
