# Progress

## Completed
- Strengthened generalist agent system context so identity/onboarding behavior is explicit and persistent:
  - Added persistence rules in system prompt (write stable user/assistant facts to workspace files in-turn).
  - Added loaded workspace context section with `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, and `BOOTSTRAP.md` when present.
  - Added a `Known Identity Facts` section derived from `USER.md`/`IDENTITY.md` so the model treats known names as established facts and avoids re-asking.
  - Added onboarding directives in context: if onboarding facts are complete and `BOOTSTRAP.md` exists, remove it.
- Implemented bootstrap completion fallback in agent loop:
  - On each normal message turn, if `IDENTITY.md` has assistant name and `USER.md` has user preferred address/name, `BOOTSTRAP.md` is removed automatically.
  - This enforces completion even when the model fails to run deletion itself.
- Hardened markdown field parsing for `- Name: ...`, `- **Name:** ...`, and similar formats to avoid false positives.

## Validation
- Ran:
  - `bun test tests/agent_migration.test.ts tests/channel_policy.test.ts tests/telegram_channel_ingress.test.ts tests/telegram_pairing.test.ts`
- Result: 20 passed, 0 failed.

## Notes
- Existing unrelated workspace changes were preserved.
- This update keeps OpenClaw-style model-driven behavior while adding a minimal onboarding completion safeguard for `BOOTSTRAP.md` removal.
