import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { ManifestValidationError, ModuleManifest, manifestFromPath } from "./manifest";

export interface RegisteredModule<T> {
  manifest: ModuleManifest;
  root: string;
  manifestPath: string;
  internal: boolean;
  implementation?: T;
}

export class ManifestRegistry<T> {
  readonly domain: string;
  private readonly entries = new Map<string, RegisteredModule<T>>();
  private readonly _diagnostics: string[] = [];

  constructor(domain: string) {
    this.domain = domain;
  }

  get diagnostics(): string[] {
    return [...this._diagnostics];
  }

  get ids(): string[] {
    return [...this.entries.keys()].sort();
  }

  get(moduleId: string): RegisteredModule<T> | undefined {
    return this.entries.get(moduleId);
  }

  register(entry: RegisteredModule<T>, failOnDuplicate = true): boolean {
    const existing = this.entries.get(entry.manifest.id);
    if (existing) {
      const message = `[${this.domain}] duplicate id '${entry.manifest.id}': ${entry.manifestPath} conflicts with ${existing.manifestPath}`;
      this._diagnostics.push(message);
      if (failOnDuplicate) throw new Error(message);
      return false;
    }
    this.entries.set(entry.manifest.id, entry);
    return true;
  }

  discover(internalPaths: string[], externalPaths: string[] = [], manifestName = "manifest.json"): void {
    for (const path of [...internalPaths].sort()) this.discoverUnder(path, true, manifestName);
    for (const path of [...externalPaths].sort()) this.discoverUnder(path, false, manifestName);
  }

  private discoverUnder(basePath: string, internal: boolean, manifestName: string): void {
    if (!existsSync(basePath) || !statSync(basePath).isDirectory()) return;

    const dirs = readdirSync(basePath)
      .map((name) => join(basePath, name))
      .filter((p) => existsSync(p) && statSync(p).isDirectory())
      .sort();

    for (const dir of dirs) {
      const manifestPath = join(dir, manifestName);
      if (!existsSync(manifestPath)) continue;
      try {
        const manifest = manifestFromPath(manifestPath);
        this.register({
          manifest,
          root: resolve(dir),
          manifestPath: resolve(manifestPath),
          internal,
        }, internal);
      } catch (error) {
        if (!(error instanceof ManifestValidationError) && !(error instanceof Error)) continue;
        const message = error instanceof Error ? error.message : String(error);
        this._diagnostics.push(message);
        if (internal) throw error;
      }
    }
  }
}
