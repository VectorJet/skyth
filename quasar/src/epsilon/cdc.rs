//! Content-defined chunking for Epsilon.
//!
//! Backed by [`fastcdc`]. Chunks are addressed by their BLAKE3 hash, so
//! identical chunks across snapshots dedupe automatically when written
//! into the [`super::store::EpsilonStore`].

use blake3::Hasher;
use fastcdc::v2020::FastCDC;

/// Minimum, average, and maximum chunk sizes used by Epsilon.
///
/// Conservative defaults aimed at small-to-medium VFS payloads. Tunable
/// at the call site if needed.
pub const MIN_CHUNK: u32 = 4 * 1024;
pub const AVG_CHUNK: u32 = 16 * 1024;
pub const MAX_CHUNK: u32 = 64 * 1024;

/// A content-addressed chunk produced by [`chunk_bytes`].
#[derive(Clone, Debug)]
pub struct Chunk {
    pub hash: [u8; 32],
    pub data: Vec<u8>,
}

impl Chunk {
    pub fn hash_hex(&self) -> String {
        hex::encode(self.hash)
    }
}

/// Split `data` into content-defined chunks. Empty input yields no chunks.
pub fn chunk_bytes(data: &[u8]) -> Vec<Chunk> {
    if data.is_empty() {
        return Vec::new();
    }
    let cdc = FastCDC::new(data, MIN_CHUNK, AVG_CHUNK, MAX_CHUNK);
    let mut out = Vec::new();
    for c in cdc {
        let slice = &data[c.offset..c.offset + c.length];
        let mut hasher = Hasher::new();
        hasher.update(slice);
        let mut hash = [0u8; 32];
        hash.copy_from_slice(hasher.finalize().as_bytes());
        out.push(Chunk {
            hash,
            data: slice.to_vec(),
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_yields_no_chunks() {
        assert!(chunk_bytes(&[]).is_empty());
    }

    #[test]
    fn identical_input_yields_identical_hashes() {
        let data = vec![7u8; 200 * 1024];
        let a = chunk_bytes(&data);
        let b = chunk_bytes(&data);
        assert_eq!(a.len(), b.len());
        for (x, y) in a.iter().zip(b.iter()) {
            assert_eq!(x.hash, y.hash);
        }
    }
}
