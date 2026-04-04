# Skyth

Skyth is a comprehensive personal AI assistant featuring a modular architecture, flexible communication channels, and a robust frontend interface. It leverages a backend written in TypeScript running on Bun and a SvelteKit-based web application.

## Core Features

- **Extensible Architecture:** Registry-based auto-discovery for providers, channels, tools, agents, and skills.
- **Advanced Agent Capabilities:** Supports delegation hierarchies, session tracking, and structured event handling.
- **Multiple Integrations:** Connects seamlessly with various AI providers (OpenAI, Anthropic, Bedrock, etc.) and messaging platforms (Telegram, Slack, Discord, LINE).
- **Scheduled Tasks:** Integrated Cron job management for automated workflows.
- **Secure By Design:** Strict policies against plain-text secrets, enforcing hashing and encryption with explicit approval flows.
- **Cross-Platform:** Mobile-responsive frontend interface featuring real-time tool execution displays and chat capabilities.

## Architecture Highlights

The repository maintains a layered architecture composed of:

1. **Backend (`skyth/`)**: The core engine running on Bun, handling routing, session states, protocol adapters, tool execution, and the main agent loop.
2. **Frontend (`platforms/web/`)**: A SvelteKit application utilizing TailwindCSS, designed to provide a rich user interface with multi-tab navigation, session management, and configuration UI.

For an extensive overview of frontend architecture and implementation, refer to `SPECS.md`.

## Prerequisites

- [Bun](https://bun.com) v1.x or later (Default runtime and package manager for TypeScript/JS)
- [uv](https://github.com/astral-sh/uv) (For Python dependencies and flows, where applicable)

## Installation

To set up the development environment and install dependencies:

```bash
bun install
```

*Note: The repository uses local workspace file dependencies. Do not use `bun add <package>` or `bun install <package>` for internal packages.*

## Usage

Skyth offers a robust CLI. Here is a brief overview of available commands:

To run the CLI:
```bash
bun run skyth/cli/main.ts [OPTIONS] COMMAND [ARGS]...
```

Alternatively, you can build a binary first:
```bash
bun run build:bin
./dist/skyth [OPTIONS] COMMAND [ARGS]...
```

### Common Commands

- `init` / `onboard`: Interactive onboarding wizard.
- `gateway`: Start the skyth gateway server (`--port`, `--verbose`, etc.).
- `agent`: Interact with the agent directly.
- `status`: Show Skyth status.
- `channels`: Manage and configure channels (e.g., telegram, slack).
- `configure`: Modify configuration settings (e.g., set up a provider or change a model).
- `auth`: Manage authentication tokens and API keys.

For detailed command options and usage patterns, run `bun run skyth/cli/main.ts --help`.

## Development Guidelines

- **Style:** No emojis in logs, CLI output, documentation, or code comments. Code should be styled using Biome.
- **Tooling:** Use `bun run typecheck` to run typechecking. `bun test tests/` to execute tests. Do not run format and lint with ESLint right now as there's a missing configuration.
- **Code Size Limit:** All files should be kept under 400 lines of code. The `./scripts/loc_check.sh` script monitors this.
- **Modules & Imports:** Use absolute imports mapping to the `skyth/` directory with `@/` prefix. Use barrel exports (`index.ts`) for cleaner code organization.

For an exhaustive outline of the agent operational rules, read `AGENTS.md`.

## License

MIT
