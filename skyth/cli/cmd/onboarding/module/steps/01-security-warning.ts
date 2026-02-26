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

export const STEP_MANIFEST: OnboardingStepManifest = {
  id: "security-warning",
  name: "Security Warning",
  description: "Display security warnings and get user acknowledgment",
  order: 10,
  group: "identity",
};

export async function runSecurityWarningStep(ctx: StepContext): Promise<StepResult> {
  const { clackConfirmValue, clackCancel: cancel, clackNote: note } = await import("../clack_helpers");

  note(
    [
      "Security warning - please read.",
      "",
      "Skyth can read files and run commands when tools are enabled.",
      "Treat this as privileged automation and keep credentials locked down.",
      "",
      "Recommended baseline:",
      "- Use allowlists and mention/pairing controls.",
      "- Keep sandboxing enabled for tool execution.",
      "- Keep secrets outside the agent-reachable workspace.",
      "",
      "Run regularly:",
      "skyth status",
      "Review ~/.skyth/config and ~/.skyth/channels/*.json",
    ].join("\n"),
    "Security",
  );

  const acceptedRisk = await clackConfirmValue(
    "I understand this is powerful and inherently risky. Continue?",
    false,
  );

  if (acceptedRisk !== true) {
    cancel("Onboarding cancelled.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  return { cancelled: false, updates: {}, notices: [], patches: [] };
}
