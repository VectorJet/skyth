//! Cryptographic primitives used by Quasar.
//!
//! Two distinct concerns live here:
//!
//! 1. [`kdf`] — Argon2id password-to-key derivation, used to derive the
//!    SQLCipher database key from the user's superuser password and the
//!    per-database random salt.
//! 2. [`seal`] — AES-256-GCM "header seal" used to encrypt each
//!    quasardb's database password inside its own header/footer, enabling
//!    the deferred recovery path.

pub mod kdf;
pub mod seal;

pub use kdf::{Argon2Params, DerivedKey, derive_key};
pub use seal::{SealedBlob, seal, unseal};
