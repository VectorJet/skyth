export type CommandHandler = () => Promise<number> | number;

export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();

  register(command: string, handler: CommandHandler): void {
    this.handlers.set(command, handler);
  }

  has(command: string): boolean {
    return this.handlers.has(command);
  }

  async execute(command: string): Promise<number> {
    const handler = this.handlers.get(command);
    if (!handler) return 1;
    return await handler();
  }
}
