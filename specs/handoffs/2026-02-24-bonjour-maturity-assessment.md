# Handoff - Bonjour Maturity Assessment (2026-02-24)

## Context
User asked whether Skyth is mature enough to implement an OpenClaw-style Bonjour gateway discovery flow.
Reference discussed: `https://docs.openclaw.ai/gateway/bonjour`.

## Assessment Summary
Skyth is **not yet mature enough for production-grade Bonjour integration**.
It is viable for a **prototype** only.

## Key Findings

1. No real gateway WS listener in current runtime path
- `skyth/cli/main.ts` gateway command starts internal loops (bus, channels, cron, heartbeat), but does not start a network WebSocket gateway endpoint bound to configured host/port.

2. Gateway config exists but is not wired to a server surface
- `skyth/config/schema.ts` includes `gateway = { host, port }`, but those values are not currently used to run a public gateway API/WS service.

3. No discovery stack yet
- No mDNS/DNS-SD advertisement or browse implementation detected.
- No service record naming flow (e.g., `_openclaw-gw._tcp` equivalent for Skyth).
- No wide-area DNS-SD configuration path.

4. Missing security envelope required for safe discovery
- No gateway-level pairing/auth flow bound to a WS endpoint.
- No ACL/rate-limit controls tied to discovered endpoint access.
- Discovery without these controls would be risky.

## Practical Readiness
- Prototype readiness: **Yes**
- Production readiness: **No**

## Recommended Implementation Sequence

1. Implement a real Gateway WS/API server
- Bind to configured host/port.
- Define request/response/session protocol and health endpoint.

2. Add auth + pairing flow
- Introduce explicit token-based auth and pairing bootstrap.
- Store credentials under `~/.skyth/` with secure permissions.

3. Add ACL + rate limiting
- Per-client and per-session controls.
- Explicit allow/deny and failure telemetry.

4. Add mDNS discovery (LAN)
- Advertise a Skyth service name (e.g., `_skyth-gw._tcp`).
- Keep TXT records non-sensitive (no secrets).

5. Add optional wide-area DNS-SD support
- Config-gated; fail-open behavior for discovery plugins/components.

6. Add operator tooling
- `skyth gateway discover`
- `skyth gateway doctor` / health checks
- structured logs for discovery/auth failures

## Notes
Given the current architecture quality (modular channels, cron/heartbeat runtime, config loader, logging improvements), Skyth is a good foundation for this work once the gateway server/auth layer is added first.
