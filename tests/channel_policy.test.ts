import { describe, expect, test } from "bun:test";
import type { InboundMessage } from "../skyth/bus/events";
import { evaluateInboundAllowlistPolicy, isSenderAllowed } from "../skyth/channels/policy";
import { Config } from "../skyth/config/schema";

function inbound(overrides: Partial<InboundMessage>): InboundMessage {
  return {
    channel: "telegram",
    senderId: "123",
    chatId: "chat-1",
    content: "hello",
    ...overrides,
  };
}

describe("channel allowlist policy", () => {
  test("isSenderAllowed permits composite sender when one identity matches", () => {
    expect(isSenderAllowed(["7405"], "7405|username")).toBeTrue();
    expect(isSenderAllowed(["alice"], "7405|username")).toBeFalse();
  });

  test("telegram allow_from blocks non-allowlisted sender", () => {
    const cfg = new Config();
    cfg.channels.telegram.allow_from = ["111"];

    const decision = evaluateInboundAllowlistPolicy(
      cfg,
      inbound({ channel: "telegram", senderId: "222" }),
    );
    expect(decision.allowed).toBeFalse();
    expect(decision.reason).toContain("allowlist");
  });

  test("telegram allow_from allows listed sender", () => {
    const cfg = new Config();
    cfg.channels.telegram.allow_from = ["111"];

    const decision = evaluateInboundAllowlistPolicy(
      cfg,
      inbound({ channel: "telegram", senderId: "111" }),
    );
    expect(decision.allowed).toBeTrue();
  });

  test("slack dm allowlist policy enforced", () => {
    const cfg = new Config();
    cfg.channels.slack.dm.policy = "allowlist";
    cfg.channels.slack.dm.allow_from = ["U-1"];

    const blocked = evaluateInboundAllowlistPolicy(
      cfg,
      inbound({
        channel: "slack",
        senderId: "U-2",
        metadata: { slack: { channel_type: "im" } },
      }),
    );
    expect(blocked.allowed).toBeFalse();

    const allowed = evaluateInboundAllowlistPolicy(
      cfg,
      inbound({
        channel: "slack",
        senderId: "U-1",
        metadata: { slack: { channel_type: "im" } },
      }),
    );
    expect(allowed.allowed).toBeTrue();
  });

  test("slack group allowlist policy enforced by chat id", () => {
    const cfg = new Config();
    cfg.channels.slack.group_policy = "allowlist";
    cfg.channels.slack.group_allow_from = ["C-allowed"];

    const blocked = evaluateInboundAllowlistPolicy(
      cfg,
      inbound({
        channel: "slack",
        senderId: "U-1",
        chatId: "C-other",
        metadata: { slack: { channel_type: "channel" } },
      }),
    );
    expect(blocked.allowed).toBeFalse();

    const allowed = evaluateInboundAllowlistPolicy(
      cfg,
      inbound({
        channel: "slack",
        senderId: "U-1",
        chatId: "C-allowed",
        metadata: { slack: { channel_type: "channel" } },
      }),
    );
    expect(allowed.allowed).toBeTrue();
  });

  test("system and cli messages bypass allowlist policy", () => {
    const cfg = new Config();
    cfg.channels.telegram.allow_from = ["111"];

    const cliDecision = evaluateInboundAllowlistPolicy(
      cfg,
      inbound({ channel: "cli", senderId: "not-listed" }),
    );
    expect(cliDecision.allowed).toBeTrue();

    const systemDecision = evaluateInboundAllowlistPolicy(
      cfg,
      inbound({ channel: "system", senderId: "not-listed" }),
    );
    expect(systemDecision.allowed).toBeTrue();
  });

  test("web channel allowlist policy enforced", () => {
    const cfg = new Config();
    cfg.channels.web.enabled = true;
    cfg.channels.web.allow_from = ["authorized-user"];

    const blocked = evaluateInboundAllowlistPolicy(
      cfg,
      inbound({ channel: "web", senderId: "random-user" }),
    );
    expect(blocked.allowed).toBeFalse();

    const allowed = evaluateInboundAllowlistPolicy(
      cfg,
      inbound({ channel: "web", senderId: "authorized-user" }),
    );
    expect(allowed.allowed).toBeTrue();
  });
});

