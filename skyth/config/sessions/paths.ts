import * as os from "node:os";
import path from "node:path";

function resolveRequiredHomeDir(env: NodeJS.ProcessEnv, homedir: () => string): string {
  const override = env.SKYTH_HOME?.trim() || env.OPENCLAW_HOME?.trim();
  if (override) {
    return override.startsWith("~")
      ? path.resolve(override.replace(/^~/, homedir()))
      : path.resolve(override);
  }
  return homedir();
}

function envHomedir(env: NodeJS.ProcessEnv): () => string {
  return () => resolveRequiredHomeDir(env, os.homedir);
}

export function resolveStateDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = envHomedir(env),
): string {
  const effectiveHomedir = () => resolveRequiredHomeDir(env, homedir);
  const override = env.SKYTH_STATE_DIR?.trim();
  if (override) {
    return override.startsWith("~")
      ? path.resolve(override.replace(/^~/, effectiveHomedir()))
      : path.resolve(override);
  }
  return path.join(effectiveHomedir(), ".skyth");
}

export function resolveSessionTranscriptsDirForAgent(
  agentId?: string,
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = envHomedir(env),
): string {
  const root = resolveStateDir(env, homedir);
  const id = agentId ?? "main";
  return path.join(root, "workspace", "agents", id, "sessions");
}
