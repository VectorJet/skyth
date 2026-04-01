## 2025-02-24 - [Timing Attack Prevention for Variable-Length Strings]
**Vulnerability:** The codebase had multiple `secureCompare` implementations that padded buffers with 0s and used `timingSafeEqual`. This fails to mask timing leaks caused by the time taken to construct the strings, the allocation overhead of the padded buffer, and the length properties, leading to potential variable-length string timing attacks. Additionally, the lack of an overall string length limit left the application vulnerable to memory exhaustion DoS attacks through huge payload comparisons.
**Learning:** For comparing variable-length secrets (like API keys, tokens, or JWT signatures) where an attacker can supply one side, merely padding the lengths or using `timingSafeEqual` is insufficient. An attacker could still exploit early-bailing string length checks or memory allocation timing differences.
**Prevention:** Always compare the *hashes* of strings instead of the strings themselves. By generating a random 32-byte key for every comparison and hashing both inputs via HMAC-SHA256, the length is immediately fixed to 32 bytes and all length-based timing leaks are intrinsically neutralized. Furthermore, enforce a strict upper bound (e.g., 4096 characters) on input sizes before cryptographic operations to thwart DoS attacks.

## 2025-02-24 - JWT Signature Verification Timing Attack
**Vulnerability:** The `verifyJWT` function in `skyth/auth/jwt.ts` was vulnerable to timing attacks due to an inadequate custom implementation of constant-time comparison logic combined with a short-circuit length check. Even though it padded buffers, an early bail negated timing safety, allowing attackers to distinguish valid signature bytes via timing differences.
**Learning:** Custom implementations of constant-time comparisons using bitwise logic or padding are extremely error-prone. Short-circuit length checks combined with timing-safe operations circumvent security.
**Prevention:** Rely on established and heavily-tested security utilities like `secureCompare` from the codebase rather than attempting manual padding and bitwise logic.

## 2024-05-24 - JWT Verification Memory Exhaustion and Timing Leak
**Vulnerability:** The previous JWT verification path allocated buffers based on attacker-controlled signature length before comparing them. A very large signature could trigger excessive memory allocation and produce observable timing differences or process instability.
**Learning:** Constant-time comparison helpers must avoid allocations that scale with untrusted input length when validating signatures or tokens.
**Prevention:** Use the centralized `secureCompare` flow directly on the encoded signature values instead of padding attacker-controlled buffers in `verifyJWT`.

## 2026-03-24 - Path Traversal Bypass in Shell Execution Tool
**Vulnerability:** The `exec` shell tool sandbox checked the command text for traversal sequences but did not validate the user-provided `working_dir` (`cwd`). A request such as `{"command":"cat /etc/passwd","working_dir":"../../../"}` could escape the intended workspace boundary.
**Learning:** Sandbox checks must cover all execution context inputs, not just the command string. Parameters that influence process location are part of the attack surface.
**Prevention:** Validate both command text and `working_dir` for traversal patterns whenever workspace restriction is enabled.

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

## 2024-05-24 - Timing Attack Vulnerability in Pairing Code Validation
**Vulnerability:** The pairing endpoints (`skyth/auth/cmd/token/pairing.ts`, `skyth/auth/cmd/token/pairing-manager.ts`, `skyth/auth/cmd/token/pairing-http.ts`) were using standard equality operators (`===`) to compare received pairing codes with expected codes. This allows an attacker to perform a timing attack to forge pairing codes by measuring response times.
**Learning:** All security-critical string comparisons, including short-lived pairing codes, must be compared in constant time to prevent timing side-channels.
**Prevention:** Always use `timingSafeEqual` from `node:crypto` via a robust wrapper like `secureCompare` that pads inputs to the same length when checking different sized inputs.

## 2025-03-08 - [High] Prevent Timing Attacks on Telegram Pairing Validation
**Vulnerability:** The telegram pairing module (`skyth/cli/cmd/onboarding/module/telegram_pairing.ts`) was using standard equality operators (`===`) to compare received pairing codes with expected codes. This allows an attacker to perform a timing attack to forge pairing codes by measuring response times.
**Learning:** All security-critical string comparisons, including short-lived pairing codes used in bot integrations, must be compared in constant time to prevent timing side-channels.
**Prevention:** Always use `timingSafeEqual` from `node:crypto` via a robust wrapper like `secureCompare` that pads inputs to the same length when checking different sized inputs.
## 2025-02-14 - Fix secure directory creation race condition
**Vulnerability:** A race condition existed where the `.skyth/auth` directory was created asynchronously via `import("node:fs").then(...)` but sensitive API keys were written synchronously immediately after.
**Learning:** This could cause the write to fail or, if the file was written to a directory created insecurely beforehand, allow the sensitive data to be stored with permissive permissions. Secure directories must be fully created and permissions explicitly set to `0o700` before sensitive operations proceed.
**Prevention:** Always use synchronous directory creation (`fs.mkdirSync`) and permission setting (`fs.chmodSync`) when establishing secure storage locations for sensitive credentials or keys before performing the write operation.

## 2025-02-25 - Predictable ID Generation in External Content Wrappers
**Vulnerability:** The `skyth/security/external-content.ts` module used `Math.random().toString(16).slice(2, 10)` to generate unique identifiers that delimited untrusted external content. `Math.random()` is not a cryptographically secure pseudo-random number generator (CSPRNG), making these IDs predictable and potentially allowing an attacker to inject matching boundaries and breakout of the wrapper, bypassing prompt security isolation.
**Learning:** Never use `Math.random()` for generating bounding tokens, session identifiers, or unique identifiers where unpredictability is required, especially in security boundaries.
**Prevention:** Always use `randomBytes` from `node:crypto` instead of `Math.random()` to generate cryptographically secure identifiers for bounding strings and tokens.

## 2024-05-24 - [MEDIUM] Insecure Random Number Generation for Execution Approval IDs
**Vulnerability:** Execution approval IDs (`generateId` in `skyth/gateway/handlers/exec-approvals.ts`) used `Math.random().toString(36)` instead of a cryptographically secure pseudo-random number generator (CSPRNG).
**Learning:** This codebase handles sensitive execution commands over a gateway. Weakly generated identifiers for these records are predictable and could be vulnerable to spoofing, hijacking, or brute forcing if the identifier acts as an authorization key.
**Prevention:** Always use `node:crypto`'s `randomBytes` (for Node.js) or `crypto.randomUUID()` / `crypto.getRandomValues()` (in browsers) instead of `Math.random()` when generating IDs for sensitive objects like session tokens or execution approvals.

## 2024-05-25 - [Fix Path Traversal on Windows environments]
**Vulnerability:** Several filesystem tools (`read_file`, `write_file`, `edit_file`, `list_dir`) were using hardcoded checks `path.startsWith("/")` to determine absolute paths and `!finalPath.startsWith(`${root}/`)` for directory boundary validation. These checks fail on Windows due to different path separators (`\`) and drive letters (`C:\`), allowing path traversal outside the allowed directory.
**Learning:** Hardcoded Unix path separators break cross-platform security mechanisms.
**Prevention:** Always use `node:path` utilities like `isAbsolute` and `sep` for path manipulation and validation to ensure robust cross-platform security.
