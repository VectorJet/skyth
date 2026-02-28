import { listNodes, hasDeviceToken } from "./shared";

export async function listNodesCommandHandler(args: string[], passedFlags?: Record<string, string | boolean>): Promise<number> {
  if (!hasDeviceToken()) {
    console.error("Error: No device token exists.");
    console.log("Create one with: skyth auth token create");
    return 1;
  }

  const nodes = listNodes();

  if (nodes.length === 0) {
    console.log("No trusted nodes registered.");
    console.log("Add one with: skyth auth token add-node --channel telegram");
    return 0;
  }

  console.log(`Trusted Nodes (${nodes.length})`);
  console.log("");

  for (const node of nodes) {
    console.log(`  ${node.channel} (${node.id})`);
    console.log(`    Sender ID:  ${node.sender_id}`);
    console.log(`    Node Token: ${node.token}`);
    console.log(`    Trusted:    ${node.trusted_at}`);
    console.log("");
  }

  return 0;
}
