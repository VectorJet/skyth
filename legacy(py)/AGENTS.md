# AGENTS.md

## Scope & Intent

This document defines **how automated agents (AI developers, coding agents, tool-using models)** are expected to operate inside **Skyth**.

Skyth is a **generalist AI agent platform designed to get things done**. It is not a demo repo, not a toy, and not a place for random refactors-for-fun. Agents are trusted with wide latitude, but that trust comes with structure.

This AGENTS.md applies to the **root project**. Subprojects (Quasar, LGP, MCP implementations, and individual agents) may define stricter or more specific rules in their own `AGENTS.md` files.

---

## High-Level Architecture Awareness (Required)

Before making changes, agents **must understand the architectural intent**:

* **Skyth** orchestrates backend + frontend
* **Backend:** FastAPI-based, Python, tool/agent-driven
* **Frontend:** Next.js (App Router), Bun-based tooling
* **Quasar:** Memory orchestration + immutable event logging
* **LGP (Logic Gate Protocol):** Tool chaining & orchestration protocol
* **MCP:** Model Context Protocol for tooling and development workflow

Agents must **not fight the architecture**. Extend it. Respect it.

---

## Required Tooling & Stack Preferences

Agents are expected to use and respect the following:

### Backend

* **Python package management:** `uv`
* **Backend framework:** FastAPI
* **Async-first design** where applicable

### Frontend

* **Framework:** Next.js
* **Package manager:** Bun
* **Component system:** shadcn/ui (mandatory where UI components are involved)

Do **not** introduce alternative tooling without explicit instruction.

---

## Project Structure (Authoritative)

### Root

* Orchestrates backend and frontend
* Contains a critical `refs/` directory (see below)

### backend/

* `tools/` – Native Python tools inheriting from base tool classes; auto-registered
* `pipelines/` – Sequential or conditional chains of tools and events
* `converters/` – Tool-calling logic, reasoning vs non-reasoning providers, API abstractions
* `apps/` – UI-facing tool groups rendered as interactive widgets
* `agents/` – Self-contained agents

  * Each agent **must** have:

    * Its own folder
    * Its own `AGENTS.md`
    * `agent_manifest.json`
    * Optional local `tools/`, `pipelines/`, or `apps/`
* `base_classes/` – Foundational abstractions (BaseTool, BaseAgent, BaseApp, etc.)
* `registries/` – Auto-detection and registration logic (agents, tools, apps, pipelines)
* Agents are REQUIRED to use absolute imports ONLY

Agents **must place code in the correct layer**. No dumping logic wherever it fits.

---

## refs/ Directory (Mandatory Usage)

The `refs/` directory contains **reference repositories and canonical implementations**.

Rules:

* Agents **must consult refs when relevant**
* Agents **are explicitly allowed to copy code, patterns, and logic** from refs
* Refs take priority over external guesswork

Ignoring refs when applicable is considered incorrect behavior.

---

## Dependency Management (Strict)

Whenever an agent **adds a dependency**:

* **Backend:** update `requirements.txt`
* **Frontend:** update `package.json`

No exceptions. No silent deps.

Do not remove dependencies unless explicitly instructed.

---

## Modification Rules

### Allowed

* Agents may **add and modify code freely** to accomplish the task
* Agents may create new files and folders as needed
* Agents may refactor for clarity, modularity, and extensibility

### Forbidden

* **Do NOT remove existing code** unless:

  * Explicitly instructed
  * Or given direct permission
* Do NOT perform mass rewrites without necessity
* Do NOT change behavior “just to improve it” unless requested

Default stance: **extend, don’t erase**.

---

## MCP (Model Context Protocol) Requirements

Agents are required to stay **up-to-date and compliant** with MCP servers used in the development workflow.

### Mandatory MCP Servers

* **Context7 MCP** – Fetch latest documentation
* **shadcn MCP** – Required for frontend/UI work
* **Exa MCP** – Research and external knowledge gathering

These must be **integrated naturally into the workflow**, not bolted on as an afterthought.

---

## Code Quality Expectations

Agents are expected to:

* Keep code **readable, modular, and explicit**
* Prefer clear abstractions over clever hacks
* Respect existing base classes and registries
* Comment intent where logic is non-obvious
* Avoid unnecessary coupling between layers
* YOU ARE STRICTLY PROHIBITED FROM USING ANY SORTS OF EMOJIS IN THE CODE 

Skyth is an agent platform. Your code will be read by other agents.

Make it legible.

---

## Behavioral Defaults

When uncertain:

1. Pause
2. Re-read this file
3. Check refs
4. Ask for clarification if needed

Silently doing the wrong thing is worse than doing nothing.

---

## Final Principle

Agents are collaborators, not authors.

Skyth has a direction. Your job is to **move it forward without breaking its spine**.
