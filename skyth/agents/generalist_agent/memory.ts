import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Session } from "../../session/manager";

export class MemoryStore {
  readonly workspace: string;

  constructor(workspace: string) {
    this.workspace = workspace;
  }

  getMemoryContext(): string {
    const memoryPath = join(this.workspace, "memory", "MEMORY.md");
    if (!existsSync(memoryPath)) return "";
    try {
      return readFileSync(memoryPath, "utf-8").trim();
    } catch {
      return "";
    }
  }

  async consolidate(_session: Session, _provider: any, _model: string, _opts: { archive_all: boolean; memory_window: number }): Promise<boolean> {
    try {
      mkdirSync(join(this.workspace, "memory"), { recursive: true });
      return true;
    } catch {
      return false;
    }
  }
}
