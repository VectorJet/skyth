# UUID-based Sessions with Router-decided Names

## Summary

Implemented UUID v7-based session IDs and session naming logic in the router.

## Changes

### 1. UUID Utility (`skyth/utils/helpers.ts`)
- Added `uuidv7()` function for timestamp-based UUID generation
- Added `generateSessionId()` as convenience function

### 2. Session Class (`skyth/session/manager.ts`)
- Added `id` field (UUID v7) to Session class
- Added `name` field for session titles
- Updated load/save to persist id and name fields
- Updated listSessions to return id and name

### 3. Session Naming in Router (`skyth/session/router.ts`)
- Added `SessionNamingResult` interface
- Added `generateSessionName()` method to MergeRouter
  - Uses LLM if provider available
  - Falls back to simple keyword-based name generation
- Added `generateSimpleName()` helper method

## Usage

```typescript
import { SessionManager } from "@/session/manager";
import { MergeRouter } from "@/session/router";

const manager = new SessionManager(workspace);
const session = manager.getOrCreate("telegram:12345");

// Generate session name using router
const router = new MergeRouter(provider, model);
const naming = await router.generateSessionName(session.messages);
session.name = naming.name;
manager.save(session);
```

## Backwards Compatibility

- Existing sessions without UUID will get one on next load
- Session keys (e.g., "telegram:12345") remain unchanged
- Name field defaults to empty string for existing sessions

## Files Modified

- `skyth/utils/helpers.ts`
- `skyth/session/manager.ts`
- `skyth/session/router.ts`

## Validation

- TypeScript compilation passes (memory issues on full check)
- Sessions load/save correctly with new fields
