import type { Session } from "@/session/manager";
import type {
	RuntimeContext,
	RuntimeInbound,
} from "@/base/base_agent/runtime/types";
import { handlePlatformSwitchMerge } from "@/base/base_agent/session/switch_merge";

export async function runSwitchMerge(params: {
	runtime: RuntimeContext;
	msg: RuntimeInbound;
	key: string;
	session: Session;
	outboundHandoff?: {
		sourceKey: string;
		sourceChannel: string;
		sourceChatId: string;
	};
}): Promise<{
	previousChannel?: string;
	previousChatId?: string;
	platformChanged: boolean;
}> {
	return handlePlatformSwitchMerge(params);
}
