import { spawn } from "node:child_process";

export type ArgMap = Record<string, string | boolean>;

export function parseArgs(argv: string[]): { positionals: string[]; flags: ArgMap } {
  const positionals: string[] = [];
  const flags: ArgMap = {};

  let i = 0;
  while (i < argv.length) {
    const token = argv[i]!;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      if (key.startsWith("no-")) {
        flags[key.slice(3).replaceAll("-", "_")] = false;
        i += 1;
        continue;
      }
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key.replaceAll("-", "_")] = next;
        i += 2;
        continue;
      }
      flags[key.replaceAll("-", "_")] = true;
      i += 1;
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      const key = token.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i += 2;
        continue;
      }
      flags[key] = true;
      i += 1;
      continue;
    }
    positionals.push(token);
    i += 1;
  }

  return { positionals, flags };
}

export function boolFlag(flags: ArgMap, key: string, fallback = false): boolean {
  const val = flags[key];
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return ["1", "true", "yes", "on"].includes(val.toLowerCase());
  return fallback;
}

export function optionalBoolFlag(flags: ArgMap, key: string): boolean | undefined {
  if (!(key in flags)) return undefined;
  const val = flags[key];
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return ["1", "true", "yes", "on"].includes(val.toLowerCase());
  return undefined;
}

export function strFlag(flags: ArgMap, key: string): string | undefined {
  const val = flags[key];
  return typeof val === "string" ? val : undefined;
}

export async function runCommand(command: string, args: string[], cwd?: string, extraEnv?: Record<string, string>): Promise<number> {
  return await new Promise<number>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, ...(extraEnv ?? {}) },
    });
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}
