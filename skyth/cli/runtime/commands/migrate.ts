import { migrateCommand } from "@/cli/cmd/migrate";
import type { CommandContext, CommandHandler } from "@/cli/runtime/types";

export const migrateHandler: CommandHandler = async ({ positionals }: CommandContext): Promise<number> => {
  const result = await migrateCommand({
    direction: positionals[1],
    target: positionals[2],
  });
  const sink = result.exitCode === 0 ? console.log : console.error;
  sink(result.output);
  return result.exitCode;
};
