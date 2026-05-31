# File Splitting and OMP-to-Skyth Migration Handoff (2026-05-31)

This handoff details the codebase constraints regarding file sizes (LOC check) and the migration pathway from `omp` to `skyth` as development proceeds.

---

## 1. File Size Management and Modularization

As per repository policies, we must actively maintain a highly modular codebase. Any files exceeding size limits must be split into smaller, focused modules.

### Rules and Process
- **Threshold**: Any code file **>= 400 lines of code (LOC)** must be split.
- **LOC Verification**: Always run the LOC check script after tasks:
  ```bash
  ./scripts/loc_check.sh
  ```
- **Splitting Strategy**:
  - Split files exceeding the limit into **3 or more smaller modules**, each with a single focused responsibility.
  - Exclude documentation files from this requirement.
  - Use barrel exports (`index.ts`) in module directories to expose public surfaces.
  - **Avoid adding new features to large existing files**; instead, implement new capabilities as separate, focused modules.
- **Imports**: All TypeScript imports within `skyth/` must use absolute paths prefixed with `@/` (mapping to the `skyth/` directory), rather than relative paths (`../../`).

---

## 2. OMP to Skyth Migration Roadmap

Our first step was changing the final binary output from `omp` to `skyth`. Moving forward, the migration from the upstream `omp` (Oh My Pi) footprint to `skyth` requires systematic updates across several layers:

### A. Configuration & Directory Isolation
- Currently, config paths and session logs resolve to XDG directory `/home/tammy/.omp/agent`.
- This needs to be migrated to `~/.skyth/` with restrictive permissions (as per security rules).
- Make sure password/credentials caching is fully encrypted and stored securely within `~/.skyth/`.

### B. Command-Line Interface (CLI) & Help Text
- The CLI parser, usage instructions, help menus, and interactive messages still print `omp` for commands, flags, and examples (e.g. `Usage: omp setup`).
- These should be systematically updated to refer to `skyth` (e.g., `Usage: skyth setup`).

### C. Protocols & Schemes
- The internal protocol loader currently registers the `omp://` schema.
- This will be transitioned to the `skyth://` schema for resource resolution.

### D. Package Scope & Identity
- Upstream packages are named with the `@oh-my-pi/pi-*` namespace and versioned as `15.7.2`.
- As we specialize the runtime loop and build our custom TUI, we should declare new packages (e.g., `@skyth/agent`, `@skyth/tui`, `@skyth/cli`) in the workspace, replacing or wrapping the legacy pi packages.
