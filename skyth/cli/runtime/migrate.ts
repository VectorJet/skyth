import { migrateCommand } from "@/cli/commands";
import { type ParsedArgs } from "@/cli/runtime_helpers";

export async function migrateCommandHandler(parsed: ParsedArgs): Promise<number> {
  const { positionals } = parsed;
  
  const result = await migrateCommand({
    direction: positionals[0],
    target: positionals[1],
  });
  const sink = result.exitCode === 0 ? console.log : console.error;
  sink(result.output);
  return result.exitCode;
}
