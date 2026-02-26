import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STEPS_DIR = __dirname;

export interface OnboardingStepManifest {
  id: string;
  name: string;
  description: string;
  order: number;
  requiresAuth?: boolean;
  requiresExistingConfig?: boolean;
  skipIfConfigured?: string[];
  optional?: boolean;
  group?: "identity" | "model" | "channels" | "websearch" | "skills" | "hooks" | "daemon";
}

export interface StepResult {
  cancelled: boolean;
  updates: Record<string, any>;
  notices: string[];
  patches?: any[];
}

export interface StepContext {
  cfg: any;
  args: any;
  deps: any;
  mode: "quickstart" | "manual";
  configMode: "keep" | "update";
  updates: Record<string, any>;
  notices: string[];
  patches: any[];
  stepResults: Map<string, StepResult>;
}

export type StepHandler = (ctx: StepContext) => Promise<StepResult>;

export interface OnboardingStep {
  manifest: OnboardingStepManifest;
  handler: StepHandler;
}

let stepCache: OnboardingStep[] | null = null;

function toPascalCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^([a-z])/, (_, c) => c.toUpperCase());
}

const STEP_IMPORTS: Record<string, () => Promise<any>> = {
  "01-security-warning": () => import("./01-security-warning"),
  "02-mode-selection": () => import("./02-mode-selection"),
  "03-config-handling": () => import("./03-config-handling"),
  "04-identity": () => import("./04-identity"),
  "05-model-selection": () => import("./05-model-selection"),
  "06-channel-selection": () => import("./06-channel-selection"),
  "07-websearch": () => import("./07-websearch"),
  "08-session-graph": () => import("./08-session-graph"),
  "09-daemon": () => import("./09-daemon"),
};

export async function discoverSteps(): Promise<OnboardingStep[]> {
  if (stepCache) return stepCache;

  const steps: OnboardingStep[] = [];

  for (const [id, importFn] of Object.entries(STEP_IMPORTS)) {
    try {
      const module = await importFn();
      if (module && module.STEP_MANIFEST) {
        const handler = module.runStep || module["run" + toPascalCase(id.replace(/^\d+-/, "")) + "Step"];
        if (handler) {
          steps.push({
            manifest: module.STEP_MANIFEST,
            handler,
          });
        }
      }
    } catch (err) {
      console.warn(`Failed to load step ${id}:`, err);
    }
  }

  steps.sort((a, b) => a.manifest.order - b.manifest.order);
  stepCache = steps;
  return steps;
}

export function getStepsByGroup(group: OnboardingStepManifest["group"]): OnboardingStep[] {
  return discoverSteps().filter((s) => s.manifest.group === group);
}

export function getStepById(id: string): OnboardingStep | undefined {
  return discoverSteps().find((s) => s.manifest.id === id);
}

export function shouldSkipStep(step: OnboardingStep, ctx: StepContext): boolean {
  if (step.manifest.requiresAuth && !ctx.deps.authDir) return true;
  if (step.manifest.requiresExistingConfig && !ctx.deps.existingConfigDetected) return true;
  if (step.manifest.skipIfConfigured) {
    for (const key of step.manifest.skipIfConfigured) {
      if (ctx.cfg[key]) return true;
    }
  }
  return false;
}
