import { pairingTelegramCommand } from "@/cli/cmd/pairing";
import { boolFlag, strFlag } from "@/cli/runtime_helpers";
import type { CommandContext, CommandHandler } from "@/cli/runtime/types";

export const pairingHandler: CommandHandler = async ({ positionals, flags }: CommandContext): Promise<number> => {
  const sub = positionals[1];
  if (!sub || sub === "help" || boolFlag(flags, "help")) {
    console.log([
      "Usage: skyth pairing COMMAND [ARGS]...",
      "",
      "Commands:",
      "  telegram",
      "",
      "Options:",
      "  --reauth         Re-pair a previously configured channel",
      "  --token TOKEN    Provide bot token directly",
      "  --code CODE      Provide a specific pairing code",
      "  --timeout-ms MS  Pairing timeout in milliseconds (default: 120000)",
      "",
      "Requires superuser password if the channel was previously configured.",
      "",
      "Examples:",
      "  skyth pairing telegram",
      "  skyth pairing telegram --reauth",
      "  skyth pairing telegram --code ABC-123",
      "  skyth pairing telegram --timeout-ms 180000",
    ].join("\n"));
    return 0;
  }

  if (sub === "telegram") {
    const timeoutRaw = strFlag(flags, "timeout_ms") ?? strFlag(flags, "timeout");
    const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
    if (timeoutRaw && (!Number.isFinite(timeoutMs) || (timeoutMs ?? 0) <= 0)) {
      console.error("Error: --timeout-ms must be a positive number.");
      return 1;
    }

    const result = await pairingTelegramCommand({
      token: strFlag(flags, "token"),
      code: strFlag(flags, "code"),
      timeout_ms: timeoutMs,
      reauth: boolFlag(flags, "reauth", false),
    }, {
      write: (line) => console.log(line),
    });
    return result.exitCode;
  }

  console.error(`Error: unknown pairing command '${sub}'`);
  return 1;
};
