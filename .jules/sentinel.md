## 2025-03-04 - [High] Prevent Timing Attacks on JWT and Device Identities
**Vulnerability:** The application was using standard equality operators (`!==`) to compare cryptographic signatures and hashes in `skyth/auth/jwt.ts` and `skyth/auth/device-fingerprint.ts`. This allows an attacker to perform a timing attack to forge signatures byte-by-byte.
**Learning:** Security-critical string comparisons, especially for authentication tokens and device identities, must be done in constant time to prevent timing side-channels.
**Prevention:** Always use `timingSafeEqual` from `node:crypto` when comparing cryptographic hashes, signatures, or MACs. Ensure length checks are performed before the constant-time comparison to avoid throwing exceptions from `timingSafeEqual`.
