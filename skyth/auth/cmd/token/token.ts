import { boolFlag, parseArgs, strFlag } from "@/cli/runtime_helpers";
import { requireSuperuser } from "@/auth/cmd/gate";

const GATED_COMMANDS = new Set(["view", "add-node", "list-nodes", "remove-node"]);

export async function tokenCommandHandler(args: string[], passedFlags?: Record<string, string | boolean>): Promise<number> {
  const { flags, positionals } = passedFlags
    ? { flags: passedFlags, positionals: args }
    : parseArgs(args);
  
  const sub = positionals[0];
  if (!sub || sub === "help" || boolFlag(flags, "help")) {
    console.log([
      "Usage: skyth auth token COMMAND [ARGS]...",
      "",
      "Commands:",
      "  create    Create a new device identity token",
      "  view      View current device identity token info",
      "  change    Change the device identity token (requires current password)",
      "  rotate    Rotate the device identity token",
      "  add-node  Register a channel as a trusted node",
      "  list-nodes List all registered trusted nodes",
      "  remove-node Remove a trusted node",
      "",
      "Examples:",
      "  skyth auth token create",
      "  skyth auth token view",
      "  skyth auth token view device",
      "  skyth auth token view discord",
      "  skyth auth token change --password 'supersecret'",
      "  skyth auth token rotate",
      "  skyth auth token add-node --channel telegram --code ABC-123",
    ].join("\n"));
    return 0;
  }

  if (GATED_COMMANDS.has(sub)) {
    if (!(await requireSuperuser())) return 1;
  }

  if (sub === "create") {
    const { createTokenCommandHandler } = await import("./create");
    return await createTokenCommandHandler(args.slice(1), flags);
  }

  if (sub === "view") {
    const { viewTokenCommandHandler } = await import("./view");
    return await viewTokenCommandHandler(args.slice(1), flags);
  }

  if (sub === "change") {
    const { changeTokenCommandHandler } = await import("./change");
    return await changeTokenCommandHandler(args.slice(1), flags);
  }

  if (sub === "rotate") {
    const { rotateTokenCommandHandler } = await import("./rotate");
    return await rotateTokenCommandHandler(args.slice(1), flags);
  }

  if (sub === "add-node") {
    const { addNodeCommandHandler } = await import("./add-node");
    return await addNodeCommandHandler(args.slice(1), flags);
  }

  if (sub === "list-nodes") {
    const { listNodesCommandHandler } = await import("./list-nodes");
    return await listNodesCommandHandler(args.slice(1), flags);
  }

  if (sub === "remove-node") {
    const { removeNodeCommandHandler } = await import("./remove-node");
    return await removeNodeCommandHandler(args.slice(1), flags);
  }

  console.error(`Error: unknown token command '${sub}'`);
  return 1;
}
