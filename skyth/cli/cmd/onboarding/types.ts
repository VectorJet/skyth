export interface OnboardingArgs {
  username?: string;
  nickname?: string;
  primary_provider?: string;
  primary_model?: string;
  api_key?: string;
  use_secondary?: boolean;
  use_router?: boolean;
  watcher?: boolean;
  skip_mcp?: boolean;
}

export interface OnboardingDeps {
  workspacePath?: string;
  configPath?: string;
}
