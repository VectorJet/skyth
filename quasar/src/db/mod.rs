//! Encrypted SQLite + sqlite-vec backing store for every `*.quasardb`.
//!
//! Every quasardb is a single SQLite file encrypted at rest with
//! SQLCipher (AES-256). The key is derived from the superuser password
//! and the per-database Argon2id salt stored in plaintext at the head of
//! the file's metadata table.
//!
//! `main.quasardb` doubles as event store and vector database via the
//! `sqlite-vec` extension. The vector extension is loaded lazily on first
//! open if available; absence is non-fatal and only disables vector ops
//! (the spec's detailed schema is deferred — this module pins the open
//! protocol and base metadata table only).

pub mod open;
pub mod schema;

pub use open::{OpenMode, QuasarDb, open_or_init};
