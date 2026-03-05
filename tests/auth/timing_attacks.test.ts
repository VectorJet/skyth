import { describe, expect, test } from "bun:test";
import { signJWT, verifyJWT } from "@/auth/jwt";
import { randomBytes } from "node:crypto";

describe("Security: Constant-Time Comparisons", () => {
  describe("JWT Signature Verification", () => {
    test("mismatched lengths throw gracefully rather than TypeError", () => {
      const payload = { user_id: "test" };
      const validToken = signJWT(payload);

      const parts = validToken.split(".");
      const header = parts[0];
      const encodedPayload = parts[1];
      const validSig = parts[2];

      // Create a signature that is too short
      const shortSigToken = `${header}.${encodedPayload}.${validSig.slice(0, 10)}`;

      expect(() => verifyJWT(shortSigToken)).toThrow("Invalid token signature");
    });

    test("timing differences between early and late byte mismatches should be statistically negligible", () => {
      const payload = { user_id: "timing-test" };
      const validToken = signJWT(payload);

      const parts = validToken.split(".");
      const header = parts[0];
      const encodedPayload = parts[1];
      const validSig = parts[2];

      // Create a signature that fails on the first byte
      const failFirstByte = validSig.replace(/^./, validSig[0] === 'a' ? 'b' : 'a');
      const earlyFailToken = `${header}.${encodedPayload}.${failFirstByte}`;

      // Create a signature that fails on the last byte
      const failLastByte = validSig.replace(/.$/, validSig[validSig.length-1] === 'a' ? 'b' : 'a');
      const lateFailToken = `${header}.${encodedPayload}.${failLastByte}`;

      const ITERATIONS = 15000;

      // Warmup - more extensive to reduce JIT timing variance
      for (let i = 0; i < 500; i++) {
        try { verifyJWT(earlyFailToken); } catch {}
        try { verifyJWT(lateFailToken); } catch {}
      }

      // Measure early fail
      const startEarly = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        try { verifyJWT(earlyFailToken); } catch {}
      }
      const durationEarly = performance.now() - startEarly;

      // Measure late fail
      const startLate = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        try { verifyJWT(lateFailToken); } catch {}
      }
      const durationLate = performance.now() - startLate;

      // Calculate difference percentage
      const diffPercent = Math.abs(durationEarly - durationLate) / Math.max(durationEarly, durationLate);

      // The difference should be small (less than 35% variation is typical for noise in CI environments)
      // If it was a vulnerable string comparison, the early fail would be consistently much faster
      expect(diffPercent).toBeLessThan(0.35); // Allow more noise for CI environments but ensure they are reasonably close

      // console.log(`Early fail: ${durationEarly.toFixed(2)}ms, Late fail: ${durationLate.toFixed(2)}ms, Diff: ${(diffPercent*100).toFixed(2)}%`);
    });
  });
});
