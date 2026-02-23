# Skyth Agent Operating Rules

This document defines repository-wide execution and architecture rules for agents and contributors.

## 1. Core Policy

- Preserve and evolve current Skyth behavior while reusing viable architecture from `.trash/spec/`.
- Prefer implementation over placeholders: if a component is declared, either wire it end-to-end.
- Keep architecture modular and registry-driven; avoid hard-coded service/provider/channel wiring.
- Do not use emoji in logs, CLI output, docs, status markers, or code comments or the code itself. See specs/components.md.

## 2. Preferred Tooling (Fast Path)

- Python dependency/runtime tasks use `uv` by default.
- TypeScript/JS tooling uses `bun` by default.
- Prefer fast local tooling (`rg`, `fd`, `uv`, `bun`) before slower alternatives.
- Keep commands reproducible and non-interactive for CI and automation.

## 3. Architecture Direction (Reintroduced Components)

- Keep a layered architecture with clear ownership:
  - Runtime/agent loop
  - Tool execution and safety controls
  - Memory/session state
  - Channel/platform adapters
  - Provider/model integration
- Reintroduce selected legacy concepts where they add value:
  - Delegation hierarchy with bounded depth and circular-call prevention
  - Structured event/session tracking
  - Optional advanced memory pipeline components (LGP/Quasar/Epsilon-style), only behind explicit interfaces
- All optional/advanced components must be feature-gated and degrade gracefully when disabled.

## 4. Registry-Based Auto-Discovery (Required)

- New extensible capabilities must register via registry + manifest, not hard-coded imports.
- Registry domains include:
  - Providers
  - Channels
  - Tools
  - Agents/subagents
  - Skills/plugins
- Auto-discovery must support deterministic load order, duplicate detection, and clear error reporting.
- Fail-open policy for external plugins: a broken external plugin must not block internal/core discovery.

## 5. Manifest JSON Contract

- Every discoverable module must expose a manifest JSON (or generated equivalent) with, at minimum:
  - `id`
  - `name`
  - `version`
  - `entrypoint`
  - `capabilities`
  - `dependencies`
  - `security` (permissions/sandbox expectations)
- Manifests must be schema-validated at load time.
- Invalid manifests must produce actionable diagnostics (file, field, reason).
- Keep manifests machine-readable and stable for tooling/automation.

## 6. Security and Encryption Rules

- Never store secrets in plaintext.
- Hash passwords/keys where hashing is appropriate; encrypt stored credentials/tokens where retrieval is required.
- Never commit tokens, secrets, or credential-bearing files to version control.
- Destructive operations require explicit approval/confirmation flow.
- Validate and sanitize untrusted inputs (messages, files, command parameters, external payloads).
- Keep security-sensitive configuration under `~/.skyth/` with restrictive file permissions.

## 7. Configuration and Validation

- Enforce required config fields with strict schema validation.
- Startup validation must detect missing/invalid critical config before runtime actions.
- Validation output must be explicit and actionable.
- Prefer safe defaults; risky behaviors must be opt-in.

## 8. Output, UX, and Documentation

- No emoji policy applies universally.
- Keep terminal/UI status symbols consistent and readable across environments.
- Document architecture decisions and migration notes as code-adjacent docs.
- Update docs with behavioral changes in the same PR/commit.

## 9. Migration and Compatibility Rules

- For renamed modules/paths (for example `nanobot` -> `skyth`), keep compatibility shims only where required and time-box their removal.
- Preserve user data compatibility under `~/.skyth/` and provide migration steps for breaking changes.
- Do not silently change manifest or registry contracts.

## 10. Non-Negotiable Implementation Checklist

- Use `uv` for Python flows and `bun` for TS/JS flows.
- Use registry + manifest auto-discovery for extensible systems.
- Enforce schema validation for config and manifests.
- Enforce secret handling and encryption policy.
- Enforce no-emoji output policy.
- Keep delegation safety controls (bounded depth + no circular delegation).

---

- you will be asked to refer to certain points in refs/ you can either copy the files directly or use references from refs/

---

- If you have any questions leave them in specs/agents/questions/*.md

- The User will get back with The answers in specs/agents/answers/*.md

---

- specs can be found in specs/ see specs, progress and handoff notes before starting to work.
- Document Progress in specs/progress/Progress.md
(**This file is to be overwritten not edited**)

- Leave Handoff notes in specs/handoffs/ for another agents **do not be lazy and leave handoff notes if the task is not completed**

---