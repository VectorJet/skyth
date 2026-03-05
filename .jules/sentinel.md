## 2025-03-04 - [High] Prevent Timing Attacks on JWT and Device Identities
**Vulnerability:** The application was using standard equality operators (`!==`) to compare cryptographic signatures and hashes in `skyth/auth/jwt.ts` and `skyth/auth/device-fingerprint.ts`. This allows an attacker to perform a timing attack to forge signatures byte-by-byte.
**Learning:** Security-critical string comparisons, especially for authentication tokens and device identities, must be done in constant time to prevent timing side-channels.
**Prevention:** Always use `timingSafeEqual` from `node:crypto` when comparing cryptographic hashes, signatures, or MACs. Ensure length checks are performed before the constant-time comparison to avoid throwing exceptions from `timingSafeEqual`.

## 2025-03-05 - [Critical] Prevent Predictable Authentication Tokens and Identifiers
**Vulnerability:** The application was using `Math.random().toString(36).slice(2)` combined with `Date.now()` to generate authentication tokens in `skyth/api/routes/authRoute.ts` and identifiers in `skyth/id/id.ts`. `Math.random()` is not a cryptographically secure pseudo-random number generator (CSPRNG), making these tokens predictable and susceptible to brute-force attacks.
**Learning:** Never use `Math.random()` for generating any form of security token, session identifier, or unique identifier where unpredictability is a requirement.
**Prevention:** Always use `randomBytes` from `node:crypto` to generate cryptographically secure random values. For example, `randomBytes(16).toString("hex")` generates 32 characters of high-entropy randomness.
