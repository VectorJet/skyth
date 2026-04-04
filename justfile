# Skyth Justfile - Common development commands

# Default recipe - show help
default:
    @just --list

# === Bun Commands ===

# Install dependencies
install:
    bun install

# Run tests
test:
    bun test tests/

# Start the CLI
start:
    bun run skyth/cli/main.ts

# Build everything
build: build-bin build-web

# Build binary
build-bin:
    bun run build:bin

# Typecheck
typecheck:
    bun run typecheck

# === Biome Commands ===

# Format code
fmt:
    bunx @biomejs/biome format --write .

# Lint code
lint:
    bunx @biomejs/biome lint .

# Check formatting and linting (non-destructive)
check:
    bunx @biomejs/biome format --check . && bunx @biomejs/biome lint .

# === Shell Scripts ===

# Check LOC (lines of code) for files >= 400 LOC
loc-check:
    ./scripts/loc_check.sh

# Count core TypeScript lines
count-lines:
    ./scripts/count_core_lines.sh

# Count files in skyth/
count-files:
    ./scripts/count_skyth_files.sh

# === Frontend ===

# Run frontend dev server with gateway in parallel (requires bunx concurrently)
dev:
    bunx concurrently -k "just run-dev-gateway" "cd platforms/web && bun run dev"

# Run gateway for development mode (port 18797, verbose, no mDNS discovery, no heartbeat)
run-dev-gateway:
    bun run skyth/cli/main.ts gateway --verbose --print-logs --no-discovery --no-heartbeat --no-ws

# Build frontend web (SvelteKit with adapter-node)
build-web:
    cd platforms/web && bun run build

# === Development ===

# Watch mode for development (requires setup)
watch:
    bun --watch run skyth/cli/main.ts

# Run a specific test file
test-file file:
    bun test {{file}}

# Run tests with coverage (if configured)
test-cov:
    bun test --coverage

# === Utility ===

# Clean build artifacts
clean:
    rm -rf dist/ .cache/

# Show version
version:
    bun run skyth/cli/main.ts -- --version

# Show help
help:
    bun run skyth/cli/main.ts -- help