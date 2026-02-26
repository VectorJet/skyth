import type { OnboardingStepManifest, StepContext, StepResult } from "@/cli/cmd/onboarding/module/steps/registry";

export const STEP_MANIFEST: OnboardingStepManifest = {
  id: "daemon",
  name: "Gateway Service",
  description: "Install and configure the Skyth gateway service",
  order: 90,
  group: "daemon",
};

export async function runDaemonStep(ctx: StepContext): Promise<StepResult> {
  const { clackConfirmValue, clackCancel: cancel, clackNote: note } = await import("../clack_helpers");

  const hasSystemd = process.platform === "linux" && Boolean(process.env.SYSTEMD_EXEC_PID || process.env.INVOCATION_ID);

  if (!hasSystemd) {
    note(
      [
        "Systemd user services are unavailable.",
        "Skipping service install checks.",
      ].join("\n"),
      "Systemd",
    );
    return { cancelled: false, updates: {}, notices: ["Systemd not detected, daemon install skipped."], patches: [] };
  }

  note(
    hasSystemd
      ? "Systemd detected. You can install a user service after onboarding."
      : "No systemd user session detected. Use your own process supervisor.",
    "Gateway service",
  );

  if (ctx.args.no_install_daemon) {
    return { cancelled: false, updates: {}, notices: [], patches: [] };
  }

  const installChoice = await clackConfirmValue("Install gateway service now?", false);
  if (installChoice === undefined) {
    cancel("Onboarding cancelled.");
    return { cancelled: true, updates: {}, notices: [], patches: [] };
  }

  return {
    cancelled: false,
    updates: {},
    notices: [],
    patches: [],
    installDaemon: installChoice,
  };
}