import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

export function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getDataPath(): string {
  return ensureDir(join(homedir(), ".skyth"));
}

export function getWorkspacePath(): string {
  return join(getDataPath(), "workspace");
}
