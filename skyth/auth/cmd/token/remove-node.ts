import { strFlag } from "@/cli/runtime_helpers";
import { removeNode, listNodes, hasDeviceToken } from "./shared";

export async function removeNodeCommandHandler(args: string[], passedFlags?: Record<string, string | boolean>): Promise<number> {
  if (!hasDeviceToken()) {
    console.error("Error: No device token exists.");
    console.log("Create one with: skyth auth token create");
    return 1;
  }

  const flags = passedFlags || {};
  const nodeId = strFlag(flags, "id");
  const channel = strFlag(flags, "channel");

  if (!nodeId && !channel) {
    console.error("Error: --id or --channel is required.");
    console.log("Usage: skyth auth token remove-node --id {node_id}");
    console.log("   or: skyth auth token remove-node --channel telegram");
    return 1;
  }

  const nodes = listNodes();
  
  let targetNode = null;
  if (nodeId) {
    targetNode = nodes.find((n) => n.id === nodeId);
  } else if (channel) {
    targetNode = nodes.find((n) => n.channel === channel);
  }

  if (!targetNode) {
    console.error("Error: Node not found.");
    return 1;
  }

  const removed = removeNode(targetNode.id);

  if (removed) {
    console.log(`Node removed successfully!`);
    console.log(`Removed: ${targetNode.channel} (${targetNode.id})`);
    return 0;
  } else {
    console.error("Error: Failed to remove node.");
    return 1;
  }
}
