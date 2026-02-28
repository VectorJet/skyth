import { listProviderSpecs } from "@/providers/registry";
import { loadConfig, saveConfig } from "@/config/loader";
import { chooseProviderInteractive, promptInput, pythonCommand, pythonModuleAvailable, runCommand, saveProviderToken } from "@/cli/runtime_helpers";
import { boolFlag, strFlag, type ParsedArgs } from "@/cli/runtime_helpers";

export async function providerCommandHandler(parsed: ParsedArgs): Promise<number> {
  const { flags, positionals } = parsed;
  
  const sub = positionals[0];
  if (!sub || sub === "help" || flags.help) {
    console.log([
      "Usage: skyth provider COMMAND [ARGS]...",
      "",
      "Commands:",
      "  list",
      "  login PROVIDER",
    ].join("\n"));
    return 0;
  }
  if (sub === "list") {
    const specs = await listProviderSpecs({ includeDynamic: true });
    const ids = specs.map((s) => s.name).sort();
    console.log(`Providers (${ids.length})`);
    for (const id of ids) console.log(id);
    return 0;
  }
  if (sub === "login") {
    let provider = positionals[1]?.replaceAll("-", "_");
    const specs = await listProviderSpecs({ includeDynamic: true });
    const providerIDs = specs.map((s) => s.name).sort();
    if (!provider) {
      provider = await chooseProviderInteractive(providerIDs);
      if (!provider) {
        console.error("Error: provider is required");
        return 1;
      }
    }
    if (!providerIDs.includes(provider)) {
      console.error(`Unknown provider: ${provider}`);
      return 1;
    }

    if (provider === "openai_codex" || provider === "openai-codex") {
      if (!pythonModuleAvailable("oauth_cli_kit")) {
        console.error("Error: oauth_cli_kit is not installed in available python environment.");
        console.error("Install with: pip install oauth-cli-kit");
        return 1;
      }
      return await runCommand(pythonCommand(), [
        "-c",
        [
          "from oauth_cli_kit import get_token, login_oauth_interactive",
          "t=None",
          "try:",
          "    t=get_token()",
          "except Exception:",
          "    pass",
          "if not (t and getattr(t,'access',None)):",
          "    t=login_oauth_interactive(print_fn=print,prompt_fn=input)",
          "print('Authenticated with OpenAI Codex' if (t and getattr(t,'access',None)) else 'Authentication failed')",
          "raise SystemExit(0 if (t and getattr(t,'access',None)) else 1)",
        ].join("\n"),
      ]);
    }

    if (provider === "github_copilot" || provider === "github-copilot") {
      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      if (!token) {
        console.error("Error: GitHub Copilot login requires GITHUB_TOKEN or GH_TOKEN in this migration build.");
        return 1;
      }
      const cfg = loadConfig();
      cfg.providers.github_copilot.api_key = token;
      saveConfig(cfg);
      console.log("Configured github_copilot provider from environment token.");
      return 0;
    }

    const envToken = process.env[`${provider.toUpperCase()}_API_KEY`] || process.env.API_KEY || process.env.OPENAI_API_KEY || "";
    const key = envToken || (await promptInput(`API key for ${provider}: `));
    if (!key) {
      console.error("Error: API key is required.");
      return 1;
    }
    saveProviderToken(provider, key);
    console.log(`Saved credential for ${provider}.`);
    return 0;
  }

  console.error(`Error: unknown provider command '${sub}'`);
  return 1;
}
