# Progress

## Completed
- Implemented gateway-level inbound allowlist enforcement to prevent unapproved senders from reaching the agent loop.
- Added new shared policy module: `skyth/channels/policy.ts`.
  - `isSenderAllowed(allowFrom, senderId)` normalizes and enforces sender allowlists.
  - `evaluateInboundAllowlistPolicy(cfg, msg)` evaluates per-channel inbound policy decisions.
- Wired policy check in gateway runtime consumer:
  - `skyth/cli/main.ts` now blocks inbound messages before `agent.processMessage(...)` when policy denies access.
  - Verbose mode logs blocked inbound events with reason.
- Aligned base channel sender checks with shared policy logic:
  - `skyth/channels/base.ts` now uses `isSenderAllowed(...)`.
- Added regression tests for allowlist enforcement:
  - New `tests/channel_policy.test.ts` covering:
    - composite sender identity matching (`id|alias`)
    - telegram sender allowlist block/allow
    - slack DM allowlist policy
    - slack group allowlist policy
    - system/cli bypass behavior

## Validation
- Ran:
  - `bun test tests/channel_policy.test.ts tests/commands.test.ts tests/agent_migration.test.ts tests/heartbeat_service.test.ts`
- Result: 24 passed, 0 failed.

## Notes
- Existing unrelated workspace changes were preserved.
