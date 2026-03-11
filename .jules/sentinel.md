## 2025-03-07 - [High] Prevent Timing Attacks on Device Node Token Comparisons
**Vulnerability:** The application was using standard equality operators (`===`) to compare device tokens in `matchesNodeToken` within `skyth/auth/cmd/token/shared.ts`. This allows an attacker to perform a timing attack to forge authentication tokens by measuring response times.
**Learning:** Security-critical string comparisons, especially for authentication tokens, must be done in constant time to prevent timing side-channels.
**Prevention:** Always use `timingSafeEqual` from `node:crypto` when comparing cryptographic hashes, signatures, MACs, or tokens. Implement a `secureCompare` helper to pad buffers to the same length when checking different sized inputs so `timingSafeEqual` execution time doesn't vary.

## 2025-03-04 - [High] Prevent Timing Attacks on JWT and Device Identities
**Vulnerability:** The application was using standard equality operators (`!==`) to compare cryptographic signatures and hashes in `skyth/auth/jwt.ts` and `skyth/auth/device-fingerprint.ts`. This allows an attacker to perform a timing attack to forge signatures byte-by-byte.
**Learning:** Security-critical string comparisons, especially for authentication tokens and device identities, must be done in constant time to prevent timing side-channels.
**Prevention:** Always use `timingSafeEqual` from `node:crypto` when comparing cryptographic hashes, signatures, or MACs. Ensure length checks are performed before the constant-time comparison to avoid throwing exceptions from `timingSafeEqual`.

## 2025-03-05 - [Critical] Prevent Predictable Authentication Tokens and Identifiers
**Vulnerability:** The application was using `Math.random().toString(36).slice(2)` combined with `Date.now()` to generate authentication tokens in `skyth/api/routes/authRoute.ts` and identifiers in `skyth/id/id.ts`. `Math.random()` is not a cryptographically secure pseudo-random number generator (CSPRNG), making these tokens predictable and susceptible to brute-force attacks.
**Learning:** Never use `Math.random()` for generating any form of security token, session identifier, or unique identifier where unpredictability is a requirement.
**Prevention:** Always use `randomBytes` from `node:crypto` to generate cryptographically secure random values. For example, `randomBytes(16).toString("hex")` generates 32 characters of high-entropy randomness.

## 2025-03-06 - [Critical] Prevent Predictable Values in Authentication and Identifiers
**Vulnerability:** The codebase had remaining usages of `Math.random()` to generate pairing codes for telegram in `skyth/cli/cmd/onboarding/module/telegram_pairing.ts` and to generate identifiers in `skyth/cli/cmd/migrate/index.ts`. Pairing codes based on `Math.random()` can be brute-forced or guessed due to predictable random number sequences.
**Learning:** All modules, especially CLI and onboarding flows generating codes, must rely on CSPRNGs to ensure full unpredictability.
**Prevention:** Always use `randomBytes` or `randomInt` from `node:crypto` instead of `Math.random()` to generate codes, identifiers, or tokens.

## 2025-03-07 - [Critical] Prevent Predictable Unique Identifiers in Frontend
**Vulnerability:** The `platforms/web/src/lib/components/Chat.svelte` component used `Math.random().toString(36).slice(2)` to generate unique identifiers for chat messages, streaming content, and tool calls.
**Learning:** `Math.random()` is not a cryptographically secure pseudo-random number generator (CSPRNG), which leads to predictable random number sequences and IDs. While these are client-side message IDs, using insecure RNG patterns is an anti-pattern.
**Prevention:** Always use the Web Crypto API `crypto.randomUUID()` to generate globally unique identifiers (UUID v4) securely.

## 2025-03-07 - [High] Prevent Timing Attacks on Gateway Token Comparison
**Vulnerability:** The gateway server was using standard equality (`token === gwToken`) to validate authentication tokens in `skyth/cli/runtime/commands/gateway.ts`. This allows an attacker to perform a timing attack to forge the gateway token by measuring response times.
**Learning:** All authentication token comparisons, including those at the application entry points or web sockets, must be done in constant time.
**Prevention:** Always use `timingSafeEqual` from `node:crypto` and implement a padding mechanism to ensure constant-time comparison even when input lengths differ.

## 2024-05-24 - [Timing Attack Prevention on Pairing Codes]
**Vulnerability:** Pairing codes were being compared using standard equality operators (`===`), making them susceptible to timing side-channel attacks.
**Learning:** Standard string comparison operators (`===` or `==`) fail early if a character mismatch is detected, leaking timing information about the validity of the string.
**Prevention:** Use a constant-time comparison utility (e.g., `timingSafeEqual` in `node:crypto`) padded to equal length, like the existing `secureCompare` function, to securely verify sensitive strings like codes or tokens.
