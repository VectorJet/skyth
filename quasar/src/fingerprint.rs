//! Device fingerprint derivation.
//!
//! Per the v1 spec the device fingerprint is a hash derived from local
//! system facts (kernel version, architecture, OS version, and related
//! system strings). Raw system strings are never stored — only the hash.
//!
//! The fingerprint is stored inside `auth.quasardb` and is required, in
//! combination with the superuser password, for primary unlock. A raw
//! database copy carried to a different machine will not unlock without
//! the recovery path (deferred to v2).

use blake3::Hasher;
use serde::{Deserialize, Serialize};
use std::fmt;

/// A 32-byte BLAKE3 hash of mangled system identifying strings.
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeviceFingerprint([u8; 32]);

impl DeviceFingerprint {
    /// Derive a fingerprint from the current host.
    pub fn derive() -> Self {
        let mut hasher = Hasher::new();
        hasher.update(b"skyth-quasar-fingerprint-v1");
        for fact in collect_system_facts() {
            hasher.update(b"\x1f");
            hasher.update(fact.as_bytes());
        }
        let mut out = [0u8; 32];
        out.copy_from_slice(hasher.finalize().as_bytes());
        Self(out)
    }

    /// Construct from raw bytes (e.g. when read from `auth.quasardb`).
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Raw byte access.
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// Hex-encoded representation suitable for logs.
    pub fn to_hex(&self) -> String {
        hex::encode(self.0)
    }
}

impl fmt::Debug for DeviceFingerprint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Truncate so accidental debug prints don't leak the full id.
        let hex = self.to_hex();
        write!(f, "DeviceFingerprint({}…)", &hex[..8.min(hex.len())])
    }
}

fn collect_system_facts() -> Vec<String> {
    let mut facts = Vec::new();
    facts.push(format!("os={}", std::env::consts::OS));
    facts.push(format!("family={}", std::env::consts::FAMILY));
    facts.push(format!("arch={}", std::env::consts::ARCH));

    // Hostname (best-effort)
    if let Ok(host) = std::env::var("HOSTNAME") {
        facts.push(format!("host={host}"));
    } else if let Ok(host) = std::env::var("COMPUTERNAME") {
        facts.push(format!("host={host}"));
    }

    // Linux/macOS: kernel version via /proc or uname-style env hints
    #[cfg(unix)]
    {
        if let Ok(kernel) = std::fs::read_to_string("/proc/version") {
            facts.push(format!("kernel={}", kernel.trim()));
        }
        if let Ok(machine_id) = std::fs::read_to_string("/etc/machine-id") {
            facts.push(format!("machine_id={}", machine_id.trim()));
        }
    }

    facts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_is_deterministic_within_process() {
        let a = DeviceFingerprint::derive();
        let b = DeviceFingerprint::derive();
        assert_eq!(a, b);
    }

    #[test]
    fn fingerprint_hex_is_64_chars() {
        let fp = DeviceFingerprint::derive();
        assert_eq!(fp.to_hex().len(), 64);
    }
}
