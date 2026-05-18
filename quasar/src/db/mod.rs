//! Encrypted SQLite + sqlite-vec backing store for every `*.quasardb`.
//!
//! Every quasardb is a single SQLite file encrypted at rest with
//! SQLCipher (AES-256). The key is derived from the superuser password
//! and the per-database Argon2id salt stored in plaintext at the head of
//! the file's metadata table.
//!
//! `main.quasardb` doubles as event store and vector database via the
//! `sqlite-vec` extension.

pub mod open;
pub mod schema;

pub use open::{OpenMode, QuasarDb, open_or_init};

/// Register global SQLite extensions (e.g. `sqlite-vec`).
/// Must be called before opening any database connections.
pub fn register_extensions() {
    use sqlite_vec::sqlite3_vec_init;
    use std::sync::Once;

    static INIT: Once = Once::new();
    INIT.call_once(|| unsafe {
        rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute::<
            *const (),
            unsafe extern "C" fn(
                *mut rusqlite::ffi::sqlite3,
                *mut *mut u8,
                *const rusqlite::ffi::sqlite3_api_routines,
            ) -> i32,
        >(sqlite3_vec_init as *const ())));
    });
}
