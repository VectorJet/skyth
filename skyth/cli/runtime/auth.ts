import type { ParsedArgs } from "@/cli/runtime_helpers";

export async function authCommandHandler(parsed: ParsedArgs): Promise<number> {
  const { authCommandHandler: handler } = await import("@/auth/cmd/auth");
  return await handler(parsed.positionals, parsed.flags);
}
