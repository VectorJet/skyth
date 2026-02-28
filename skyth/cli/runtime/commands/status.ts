import { statusCommand } from "@/cli/cmd/status";
import type { CommandContext, CommandHandler } from "@/cli/runtime/types";

export const statusHandler: CommandHandler = async (): Promise<number> => {
  console.log(statusCommand());
  return 0;
};
