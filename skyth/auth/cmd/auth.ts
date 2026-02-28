import { boolFlag, parseArgs, strFlag } from "@/cli/runtime_helpers";
import { requireSuperuser } from "@/auth/cmd/gate";

export async function authCommandHandler(args: string[], passedFlags?: Record<string, string | boolean>): Promise<number> {
  const { flags, positionals } = passedFlags 
    ? { flags: passedFlags, positionals: args }
    : parseArgs(args);
  
  const sub = positionals[0];
  if (!sub || sub === "help" || boolFlag(flags, "help")) {
    console.log([
      "Usage: skyth auth COMMAND [ARGS]...",
      "",
      "Commands:",
      "  create-key    Create a new API key",
      "  revoke-key    Revoke an API key",
      "  list-keys     List all API keys",
      "  token         Manage device identity tokens (create, view, rotate, nodes)",
      "",
      "Examples:",
      "  skyth auth create-key --name 'my-script' --scopes read,write",
      "  skyth auth revoke-key key_uuid",
      "  skyth auth list-keys",
      "  skyth auth token create",
      "  skyth auth token view",
      "  skyth auth token add-node --channel telegram --code ABC-123",
    ].join("\n"));
    return 0;
  }

  if (sub === "token") {
    const { tokenCommandHandler } = await import("./token/token");
    return await tokenCommandHandler(args.slice(1), flags);
  }

  if (!(await requireSuperuser())) return 1;

  if (sub === "create-key") {
    const { createKeyCommandHandler } = await import("./create-key");
    return await createKeyCommandHandler(args.slice(1), flags);
  }

  if (sub === "revoke-key") {
    const { revokeKeyCommandHandler } = await import("./revoke-key");
    return await revokeKeyCommandHandler(args.slice(1), flags);
  }

  if (sub === "list-keys") {
    const { listKeysCommandHandler } = await import("./list-keys");
    return await listKeysCommandHandler(args.slice(1), flags);
  }

  console.error(`Error: unknown auth command '${sub}'`);
  return 1;
}
