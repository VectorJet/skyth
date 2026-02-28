# Progress

## Date
2026-02-28

## Work Completed
- Enforced trusted-node runtime admission in gateway consumer:
  - If a device token exists, only paired/trusted nodes are allowed inbound.
  - Trust is based on `channel + sender_id` from established pairing.
- Removed per-message `/auth <token>` runtime challenge and removed time-limited session behavior.
  - Pairing trust is now sufficient for ongoing channel inbound I/O.
- Added gateway startup trust diagnostics:
  - Logs total trusted node count at startup.
  - Logs per-enabled-channel trusted sender IDs.
  - Emits explicit warning when enabled channels have no trusted nodes.
  - Emits warning when device token is missing (trust enforcement disabled).
- Kept WS gateway node-token binding for machine clients:
  - `connect.auth` token is attached to client metadata.
  - `chat.send` resolves to trusted node `channel/sender` and cannot impersonate arbitrary channels.
- Hardened node-token-at-rest handling:
  - New nodes now store token digests (`sha256:...`) instead of plaintext in node records.
  - Verification is backward-compatible with legacy plaintext records.
- Fixed channel policy sender checks to pass channel context consistently.
- Reduced token exposure in CLI UX:
  - Node token no longer printed in onboarding/configure/add-node success output.
  - Node token display in list/view is hidden.

## Files Changed
- `skyth/auth/cmd/token/runtime-auth.ts` (new)
- `skyth/auth/cmd/token/shared.ts`
- `skyth/channels/policy.ts`
- `skyth/cli/runtime/gateway.ts`
- `skyth/gateway/ws-connection.ts`
- `skyth/gateway/server.ts`
- `skyth/auth/cmd/token/add-node.ts`
- `skyth/auth/cmd/token/list-nodes.ts`
- `skyth/auth/cmd/token/view.ts`
- `skyth/cli/cmd/onboarding/module/steps/06-channel-selection.ts`
- `skyth/cli/cmd/configure/pointers/channel.ts`
- `tests/node_runtime_auth.test.ts` (new)

## Validation
- `bun test tests/node_runtime_auth.test.ts tests/commands.test.ts tests/gateway_delivery.test.ts`
  - Result: pass (20 passed, 0 failed)
- `bun run typecheck`
  - Result: fails due to pre-existing repository-wide TypeScript issues unrelated to this patch.

## Notes
- Runtime now uses pairing-established trust for channel I/O (no `/auth` command flow, no session TTL).
- WS gateway still uses token at connection handshake to bind machine clients to trusted node identity.
