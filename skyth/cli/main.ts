import { ensureDataDir, parseArgs, usage } from "@/cli/runtime_helpers";
import { CommandRegistry } from "@/cli/command_registry";
import { commands } from "@/cli/runtime";

export class AutoRegisteringCommandRegistry extends CommandRegistry {
  private _cmd: string = "";

  constructor() {
    super();
    for (const cmd of commands) {
      this.register(cmd.name, () => {
        const parsed = this.getLastParsedArgs();
        const remainingPositionals = parsed.positionals.slice(1);
        const remainingArgs = { positionals: remainingPositionals, flags: parsed.flags };
        return cmd.handler(remainingArgs);
      });
    }
  }

  setCommand(cmd: string): void {
    this._cmd = cmd;
  }

  private _lastParsedArgs: { positionals: string[]; flags: Record<string, string | boolean> } | null = null;

  setParsedArgs(args: { positionals: string[]; flags: Record<string, string | boolean> }): void {
    this._lastParsedArgs = args;
    if (args.positionals[0]) {
      this.setCommand(args.positionals[0]);
    }
  }

  getLastParsedArgs() {
    if (!this._lastParsedArgs) {
      return { positionals: [], flags: {} };
    }
    return this._lastParsedArgs;
  }
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  const { positionals, flags } = parsed;
  
  if (flags.version || flags.v) {
    console.log("skyth v0.1.0");
    return 0;
  }

  if (positionals.length === 0 || positionals[0] === "help" || flags.help) {
    console.log(usage());
    return 0;
  }

  const cmd = positionals[0]!;
  ensureDataDir();

  const registry = new AutoRegisteringCommandRegistry();
  registry.setParsedArgs(parsed);

  if (!registry.has(cmd)) {
    console.error(`Error: unknown command '${positionals.join(" ")}'`);
    console.log(usage());
    return 1;
  }

  return await registry.execute(cmd);
}

const code = await main();
process.exit(code);
