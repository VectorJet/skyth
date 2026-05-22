import { startGateway } from "@/gateway/gateway";
import type { CommandHandler } from "@/cli/runtime/types";

export const gatewayHandler: CommandHandler = async (): Promise<number> => {
	await startGateway();
	return 0;
};
