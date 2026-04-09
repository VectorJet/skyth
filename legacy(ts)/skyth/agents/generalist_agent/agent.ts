import { defineAgent } from "@/sdks/agent-sdk/define";
import { join } from "node:path";

export default defineAgent({
	manifest: join(__dirname, "agent_manifest.json"),
});
