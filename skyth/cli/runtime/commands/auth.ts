import type { CommandContext } from "@/cli/runtime/types";

export async function authCommandHandler(
	parsed: CommandContext,
): Promise<number> {
	const { authCommandHandler: handler } = await import("@/auth/cmd/auth");
	return await handler(parsed.positionals, parsed.flags);
}
