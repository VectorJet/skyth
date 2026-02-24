import { describe, expect, test } from "bun:test";
import {
  generateTelegramPairingCode,
  parseTelegramStartCode,
  waitForTelegramPairing,
} from "../skyth/cli/cmd/onboarding/module/telegram_pairing";

describe("telegram pairing helper", () => {
  test("generate code returns XXX-123 format", () => {
    const code = generateTelegramPairingCode();
    expect(code).toMatch(/^[A-Z]{3}-\d{3}$/);
  });

  test("parse /start command with optional mention and code", () => {
    expect(parseTelegramStartCode("/start")).toBe("");
    expect(parseTelegramStartCode("/start ABC-123")).toBe("ABC-123");
    expect(parseTelegramStartCode("/start@SkythBot ABC-123")).toBe("ABC-123");
    expect(parseTelegramStartCode("ABC-123")).toBe("ABC-123");
    expect(parseTelegramStartCode("ABC123")).toBe("ABC123");
    expect(parseTelegramStartCode("hello")).toBeUndefined();
  });

  test("waitForTelegramPairing matches /start code and returns sender id", async () => {
    const calls: Array<{ method: string; payload: any }> = [];
    let updatesCallCount = 0;

    const fetchImpl: typeof fetch = (async (input, init) => {
      const url = String(input);
      const method = url.split("/").at(-1) || "";
      const payload = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ method, payload });

      if (method === "getUpdates") {
        updatesCallCount += 1;
        if (updatesCallCount === 1) {
          return new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({
          ok: true,
          result: [
            {
              update_id: 10,
              message: {
                message_id: 5,
                text: "/start ABC-123",
                from: { id: 7405495226 },
                chat: { id: 7405495226 },
              },
            },
          ],
        }), { status: 200 });
      }

      if (method === "sendMessage") {
        return new Response(JSON.stringify({ ok: true, result: { message_id: 6 } }), { status: 200 });
      }

      return new Response(JSON.stringify({ ok: false, description: "unexpected method" }), { status: 500 });
    }) as any;

    const result = await waitForTelegramPairing({
      token: "123:abc",
      code: "ABC-123",
      timeoutMs: 2000,
      fetchImpl,
    });

    expect(result.status).toBe("paired");
    expect(result.senderId).toBe("7405495226");
    expect(calls.some((call) => call.method === "sendMessage")).toBeTrue();
  });

  test("waitForTelegramPairing does not echo auth code in Telegram replies", async () => {
    const calls: Array<{ method: string; payload: any }> = [];
    let updatesCallCount = 0;

    const fetchImpl: typeof fetch = (async (input, init) => {
      const url = String(input);
      const method = url.split("/").at(-1) || "";
      const payload = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ method, payload });

      if (method === "getUpdates") {
        updatesCallCount += 1;
        if (updatesCallCount === 1) {
          return new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 });
        }
        if (updatesCallCount === 2) {
          return new Response(JSON.stringify({
            ok: true,
            result: [
              {
                update_id: 11,
                message: {
                  message_id: 6,
                  text: "/start",
                  from: { id: 1001 },
                  chat: { id: 1001 },
                },
              },
            ],
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 });
      }

      if (method === "sendMessage") {
        return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 });
      }

      return new Response(JSON.stringify({ ok: false, description: "unexpected method" }), { status: 500 });
    }) as any;

    const result = await waitForTelegramPairing({
      token: "123:abc",
      code: "ABC-123",
      timeoutMs: 900,
      requestTimeoutMs: 300,
      fetchImpl,
    });

    expect(result.status).toBe("timeout");
    const warnings = calls.filter((call) => call.method === "sendMessage");
    expect(warnings.length).toBeGreaterThan(0);
    const joined = warnings.map((call) => String(call.payload?.text ?? "")).join("\n");
    expect(joined).not.toContain("ABC-123");
    expect(joined).toContain("terminal");
  });

  test("waitForTelegramPairing accepts direct code message without /start", async () => {
    let updatesCallCount = 0;
    const fetchImpl: typeof fetch = (async (input, init) => {
      const url = String(input);
      const method = url.split("/").at(-1) || "";

      if (method === "getUpdates") {
        updatesCallCount += 1;
        if (updatesCallCount === 1) {
          return new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({
          ok: true,
          result: [
            {
              update_id: 12,
              message: {
                message_id: 7,
                text: "ABC-123",
                from: { id: 42 },
                chat: { id: 42 },
              },
            },
          ],
        }), { status: 200 });
      }

      if (method === "sendMessage") {
        return new Response(JSON.stringify({ ok: true, result: { message_id: 8 } }), { status: 200 });
      }

      return new Response(JSON.stringify({ ok: false, description: "unexpected method" }), { status: 500 });
    }) as any;

    const result = await waitForTelegramPairing({
      token: "123:abc",
      code: "ABC-123",
      timeoutMs: 2000,
      fetchImpl,
    });

    expect(result.status).toBe("paired");
    expect(result.senderId).toBe("42");
  });
});
