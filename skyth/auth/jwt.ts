import { createHmac, timingSafeEqual } from "node:crypto";
import { randomBytes } from "node:crypto";

// For production, you'd pull this from your config or a secure keystore.
// We'll generate a secure runtime fallback so it doesn't instantly break in dev.
const JWT_SECRET = process.env.SKYTH_JWT_SECRET || randomBytes(32).toString("hex");

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function signJWT(payload: object, expiresInSec: number = 86400): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const encodedPayload = base64url(JSON.stringify({ ...payload, exp }));

  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  return `${encodedHeader}.${encodedPayload}.${base64url(signature)}`;
}

export function verifyJWT(token: string): any {
  if (!token) throw new Error("No token provided");

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const encodedHeader = parts[0]!;
  const encodedPayload = parts[1]!;
  const encodedSignature = parts[2]!;

  const expectedSignature = createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  const expectedSigBuffer = Buffer.from(base64url(expectedSignature), "utf-8");
  const actualSigBuffer = Buffer.from(encodedSignature, "utf-8");

  // Constant-time comparison: pad shorter buffer with zeros to match lengths
  // This prevents timing leaks from length checks
  const maxLen = Math.max(expectedSigBuffer.length, actualSigBuffer.length);
  const paddedExpected = Buffer.alloc(maxLen);
  const paddedActual = Buffer.alloc(maxLen);
  expectedSigBuffer.copy(paddedExpected);
  actualSigBuffer.copy(paddedActual);
  
  // Constant-time length check using bitwise operations to prevent early bail timing leaks
  const lenDiff = expectedSigBuffer.length ^ actualSigBuffer.length;
  const lengthMatch = lenDiff === 0;
  
  // Always do the timing-safe comparison regardless of length match
  // This ensures constant time even when lengths differ
  const timingMatch = timingSafeEqual(paddedExpected, paddedActual);
  
  // Use bitwise AND to combine results in constant time
  if (!(lengthMatch && timingMatch)) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64").toString("utf-8"));
  
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }

  return payload;
}
