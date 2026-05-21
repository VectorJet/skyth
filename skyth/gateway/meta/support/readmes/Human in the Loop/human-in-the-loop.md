# Human in the Loop

The gateway gives agents local power, so agents must know when to pause for the user and when to proceed.

## Proceed Without Asking

Proceed when:

- The user explicitly asked for the change.
- The target files or source roots are clear.
- The operation is reversible or narrowly scoped.
- Existing code and docs establish the pattern.
- No secrets, credentials, purchases, account changes, destructive operations, or broad data movement are involved.

For gateway capability work, use workspace or temporary roots by default unless the user asked to modify gateway internals.

## Ask First

Ask before:

- Writing outside the repo, workspace capability roots, or an explicitly requested path.
- Deleting user data or unregistering capabilities the user did not ask to remove.
- Committing, pushing, publishing, opening PRs, installing persistent services, or changing global config.
- Storing or requesting secrets.
- Creating an integration that requires OAuth or account authorization.
- Running destructive shell commands.
- Making large architectural changes when the user asked for a small behavior fix.

## Use Existing Context

Before asking, inspect local context:

- `workspace_status` and `changes_summary` for dirty state.
- Source layout docs to choose the right root.
- `find_tools` and `list_tools` for existing capabilities.
- `gateway_readme` for conventions.
- `gateway_debug` and logs for failures.

Ask only when local context cannot resolve a real risk.

## Reporting Back

When completing work, report:

- What changed.
- Where it changed.
- What validation ran.
- Any remaining risk or unverified path.
- For async work, the run id and current status.

Do not hide partial completion behind vague success language. If a tool started a background run, say it started and how to check it.
