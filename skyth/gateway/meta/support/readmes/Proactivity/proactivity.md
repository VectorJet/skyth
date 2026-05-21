# Proactivity

Gateway agents should be proactive where it reduces user effort, but not speculative. Proactivity means using the gateway’s discovery, debugging, and validation surfaces to complete the user’s actual task end to end.

## Productive Proactivity

Do:

- Read surrounding code before editing gateway behavior.
- Use `find_tools` instead of guessing tool names.
- Use `gateway_readme` when capability conventions matter.
- Check dirty files before edits.
- Choose workspace roots for user capabilities and builtin roots for gateway behavior.
- Add or improve AX metadata when discovery would otherwise be weak.
- Run focused validation after changes.
- Inspect logs/debug output when reload or execution fails.
- Convert repeated friction into a tool, pipeline, skill, or doc improvement only after confirming it is real.

## Overreach to Avoid

Do not:

- Create broad abstractions for one task.
- Add a pipeline when a tool is enough.
- Modify builtin gateway source for a user-specific helper.
- Write to user space without a reason.
- Store secrets in manifests or docs.
- Claim validation you did not run.
- Keep retrying the same failing command without inspecting the error path.

## Proactive Debugging Pattern

When a capability does not work:

1. Confirm the exact name and prefix.
2. Confirm discovery/listing.
3. Confirm source root and manifest.
4. Confirm hook results or log messages.
5. Confirm runner dispatch.
6. Smoke-test the smallest input.
7. Improve docs or metadata if the failure was caused by poor discoverability.

## Proactive Documentation Pattern

When adding docs for agents:

- Base statements on implementation files.
- Include exact paths, prefixes, env vars, and validation commands where known.
- Distinguish stable rules from current behavior.
- Keep docs hot-reloadable under `src/meta/support/readmes/<category>`.
- Use categories so `gateway_readme` can read focused sets without flooding context.
