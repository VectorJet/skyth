import { statusCommand } from "@/cli/commands";

export function statusCommandHandler(): number {
  console.log(statusCommand());
  return 0;
}
