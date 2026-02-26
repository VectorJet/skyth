import { channelsEditCommand, requireSuperuserForConfiguredChannel } from "@/cli/cmd/channels";
import { waitForTelegramPairing, generateTelegramPairingCode } from "@/cli/cmd/onboarding/module/telegram_pairing";
import { loadConfig } from "@/cli/cmd/../../config/loader";
import type { Config } from "@/cli/cmd/../../config/schema";
import { promptInput, promptPassword as promptPasswordHelper } from "@/cli/cmd/../runtime_helpers";
import { isRedactedBlock } from "@/cli/cmd/../../auth/secret_store";

export interface PairingTelegramArgs {
  token?: string;
  code?: string;
  timeout_ms?: number;
  reauth?: boolean;
}

export interface PairingTelegramDeps {
  loadConfigFn?: () => Config;
  promptInputFn?: (prompt: string) => Promise<string>;
  promptPasswordFn?: (prompt: string) => Promise<string>;
  write?: (line: string) => void;
  fetchImpl?: typeof fetch;
  channelsDir?: string;
  authDir?: string;
}

function normalizeAllowFrom(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    const value = String(item ?? "").trim();
    if (!value) continue;
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

export async function pairingTelegramCommand(
  args: PairingTelegramArgs,
  deps?: PairingTelegramDeps,
): Promise<{ exitCode: number; output: string }> {
  const cfg = deps?.loadConfigFn ? deps.loadConfigFn() : loadConfig();
  const ask = deps?.promptInputFn ?? promptInput;
  const lines: string[] = [];
  const write = deps?.write ?? (() => {});
  const emit = (line: string): void => {
    lines.push(line);
    write(line);
  };

  const askPassword = deps?.promptPasswordFn ?? (process.stdin.isTTY ? promptPasswordHelper : undefined);
  const gate = await requireSuperuserForConfiguredChannel("telegram", {
    promptPasswordFn: askPassword,
    channelsDir: deps?.channelsDir,
    authDir: deps?.authDir,
  });
  if (!gate.allowed) {
    return { exitCode: 1, output: gate.reason ?? "Authorization required." };
  }

  let token = (args.token ?? "").trim();
  if (!token && !args.reauth) {
    const cfgToken = String(cfg.channels.telegram?.token ?? "").trim();
    if (!isRedactedBlock(cfgToken)) token = cfgToken;
  }
  if (!token) {
    if (!deps?.promptInputFn && !process.stdin.isTTY) {
      return { exitCode: 1, output: "Error: Telegram bot token is required (provide --token in non-interactive mode)." };
    }
    const askToken = deps?.promptPasswordFn ?? (process.stdin.isTTY ? promptPasswordHelper : ask);
    token = (await askToken("Telegram bot token: ")).trim();
  }
  if (!token) {
    return { exitCode: 1, output: "Error: Telegram bot token is required." };
  }

  const code = (args.code ?? "").trim() || generateTelegramPairingCode();
  const timeoutMs = Number.isFinite(args.timeout_ms) && (args.timeout_ms ?? 0) > 0
    ? Number(args.timeout_ms)
    : 120_000;

  emit("Telegram pairing");
  emit(`Send this pairing code to your bot: ${code}`);
  emit(`Waiting up to ${Math.ceil(timeoutMs / 1000)} seconds for authorization...`);

  const result = await waitForTelegramPairing({
    token,
    code,
    timeoutMs,
    requestTimeoutMs: Math.min(35_000, Math.max(10_000, timeoutMs)),
    fetchImpl: deps?.fetchImpl,
  });

  if (result.status !== "paired" || !result.senderId) {
    if (result.status === "timeout") {
      emit("Pairing timed out. Try again and send the shown code to your bot.");
    } else {
      emit(`Pairing failed: ${result.error || "unknown error"}`);
    }
    return { exitCode: 1, output: lines.join("\n") };
  }

  const allowFrom = normalizeAllowFrom(cfg.channels.telegram?.allow_from);
  if (!allowFrom.includes(result.senderId)) allowFrom.push(result.senderId);

  const saveResult = channelsEditCommand(
    {
      channel: "telegram",
      json: JSON.stringify({
        enabled: true,
        token,
        allow_from: allowFrom,
      }),
    },
    {
      channelsDir: deps?.channelsDir,
      authDir: deps?.authDir,
    },
  );

  emit(`Paired Telegram user ${result.senderId}.`);
  if (saveResult.exitCode === 0) {
    emit("Updated Telegram allowlist.");
    return { exitCode: 0, output: lines.join("\n") };
  }

  emit(saveResult.output);
  return { exitCode: 1, output: lines.join("\n") };
}
