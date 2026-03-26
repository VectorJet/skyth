import { describe, expect, test } from "bun:test";
import { formatChannelFieldLabels, getSupportedPairingChannels } from "../skyth/cli/cmd/configure/pointer_helpers";

describe("channel pointer helpers", () => {
  test("formats channel field labels consistently", () => {
    expect(formatChannelFieldLabels("telegram")).toEqual({
      token: "Bot token",
      allow_from: "Allowed user IDs (comma-separated)",
    });
    expect(formatChannelFieldLabels("email")).toEqual({
      imap_host: "IMAP host",
      imap_port: "IMAP port", 
      imap_user: "IMAP user",
      imap_password: "IMAP password",
      smtp_host: "SMTP host",
      smtp_port: "SMTP port",
      smtp_user: "SMTP user", 
      smtp_password: "SMTP password",
    });
    expect(formatChannelFieldLabels("unknown")).toEqual({});
  });

  test("identifies channels supporting pairing", () => {
    expect(getSupportedPairingChannels()).toEqual(["telegram", "discord", "slack", "whatsapp"]);
  });
});