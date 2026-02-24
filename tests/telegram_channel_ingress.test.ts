import { describe, expect, test } from "bun:test";
import { MessageBus } from "../skyth/bus/queue";
import { TelegramChannel } from "../skyth/channels/telegram";

interface FakeUpdate {
  update_id: number;
  message: {
    message_id: number;
    text: string;
    from: { id: number };
    chat: { id: number };
  };
}

function ok(result: unknown): Response {
  return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
}

async function runChannelWithFirstUpdate(update: FakeUpdate): Promise<MessageBus> {
  const bus = new MessageBus();
  const channel = new TelegramChannel(
    { token: "123:abc", allow_from: ["7405495226"] },
    bus,
  );

  const originalFetch = globalThis.fetch;
  let updatesCalls = 0;

  globalThis.fetch = (async (input) => {
    const method = String(input).split("/").at(-1) || "";
    if (method === "getMe") return ok({ id: 1, username: "skyth_test_bot" });
    if (method === "sendChatAction") return ok(true);
    if (method === "sendMessage") return ok({ message_id: 99 });
    if (method === "getUpdates") {
      updatesCalls += 1;
      if (updatesCalls === 1) return ok([update]);
      await new Promise((resolve) => setTimeout(resolve, 15));
      return ok([]);
    }
    return new Response(JSON.stringify({ ok: false, description: "unexpected method" }), { status: 500 });
  }) as typeof fetch;

  try {
    await channel.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await channel.stop();
  } finally {
    globalThis.fetch = originalFetch;
  }

  return bus;
}

describe("telegram channel ingress filtering", () => {
  test("drops raw pairing codes before publishing inbound", async () => {
    const bus = await runChannelWithFirstUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        text: "DQQ-028",
        from: { id: 7405495226 },
        chat: { id: 7405495226 },
      },
    });

    const inbound = await bus.consumeInboundWithTimeout(20);
    expect(inbound).toBeNull();
  });

  test("drops /start pairing code payloads before publishing inbound", async () => {
    const bus = await runChannelWithFirstUpdate({
      update_id: 2,
      message: {
        message_id: 11,
        text: "/start DQQ-028",
        from: { id: 7405495226 },
        chat: { id: 7405495226 },
      },
    });

    const inbound = await bus.consumeInboundWithTimeout(20);
    expect(inbound).toBeNull();
  });

  test("publishes normal messages", async () => {
    const bus = await runChannelWithFirstUpdate({
      update_id: 3,
      message: {
        message_id: 12,
        text: "hello",
        from: { id: 7405495226 },
        chat: { id: 7405495226 },
      },
    });

    const inbound = await bus.consumeInboundWithTimeout(100);
    expect(inbound).not.toBeNull();
    expect(inbound?.content).toBe("hello");
    expect(inbound?.senderId).toBe("7405495226");
  });
});
