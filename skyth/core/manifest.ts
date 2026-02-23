import { readFileSync } from "node:fs";

export class ManifestValidationError extends Error {}

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  entrypoint: string;
  capabilities: string[];
  dependencies: string[];
  security: Record<string, unknown>;
}

function fmt(source: string | undefined, field: string, reason: string): string {
  return source ? `${source}:${field}: ${reason}` : `${field}: ${reason}`;
}

export function manifestFromObject(data: unknown, source?: string): ModuleManifest {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ManifestValidationError(fmt(source, "<root>", "manifest root must be an object"));
  }
  const obj = data as Record<string, unknown>;
  const required = ["id", "name", "version", "entrypoint", "capabilities", "dependencies", "security"];
  for (const key of required) {
    if (!(key in obj)) {
      throw new ManifestValidationError(fmt(source, key, "missing required field"));
    }
  }

  const errors: string[] = [];
  const nonEmptyString = (k: string) => typeof obj[k] === "string" && String(obj[k]).trim().length > 0;
  if (!nonEmptyString("id")) errors.push(fmt(source, "id", "must be a non-empty string"));
  if (!nonEmptyString("name")) errors.push(fmt(source, "name", "must be a non-empty string"));
  if (!nonEmptyString("version")) errors.push(fmt(source, "version", "must be a non-empty string"));
  if (!nonEmptyString("entrypoint")) errors.push(fmt(source, "entrypoint", "must be a non-empty string"));
  if (!Array.isArray(obj.capabilities) || !obj.capabilities.every((v) => typeof v === "string")) {
    errors.push(fmt(source, "capabilities", "must be a list of strings"));
  }
  if (!Array.isArray(obj.dependencies) || !obj.dependencies.every((v) => typeof v === "string")) {
    errors.push(fmt(source, "dependencies", "must be a list of strings"));
  }
  if (!obj.security || typeof obj.security !== "object" || Array.isArray(obj.security)) {
    errors.push(fmt(source, "security", "must be an object"));
  }
  if (errors.length) throw new ManifestValidationError(errors.join("; "));

  return {
    id: String(obj.id).trim(),
    name: String(obj.name).trim(),
    version: String(obj.version).trim(),
    entrypoint: String(obj.entrypoint).trim(),
    capabilities: [...(obj.capabilities as string[])],
    dependencies: [...(obj.dependencies as string[])],
    security: { ...(obj.security as Record<string, unknown>) },
  };
}

export function manifestFromPath(path: string): ModuleManifest {
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return manifestFromObject(raw, path);
  } catch (error) {
    if (error instanceof ManifestValidationError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ManifestValidationError(fmt(path, "<json>", `invalid JSON: ${message}`));
  }
}
