# Web Chat Event Buffering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Copy OpenClaw's chat buffering/throttling approach into Skyth to prevent flooding frontend with multiple streaming events.

**Architecture:** Add buffering state and throttled emission to gateway's web handling. Buffer text deltas, throttle at 150ms, flush before tool events, emit single final state.

**Tech Stack:** TypeScript, existing Skyth web channel infrastructure.

---

## File Structure

```
skyth/channels/web.ts                    # Add buffering state to WebChannel, add streamFinal()
skyth/cli/runtime/commands/gateway.ts    # Create chat run state, throttled emit, wire into streaming
```

---

## Task 1: Add buffering state and streamFinal to WebChannel

**Files:**
- Modify: `skyth/channels/web.ts`

- [ ] **Step 1: Add ChatRunState types and buffer maps to WebChannel**

Modify `WebChannel` class to add:
```typescript
private chatBuffers = new Map<string, string>();
private deltaSentAt = new Map<string, number>();
private deltaLastBroadcastLen = new Map<string, number>();
private abortedRuns = new Map<string, number>();
```

- [ ] **Step 2: Add resolveMergedAssistantText helper**

Add private method to merge incoming text with buffered text:
```typescript
private resolveMergedAssistantText(previousText: string, nextText: string, nextDelta: string): string {
  if (nextText && previousText) {
    if (nextText.startsWith(previousText)) return nextText;
    if (previousText.startsWith(nextText) && !nextDelta) return previousText;
  }
  if (nextDelta) return previousText + nextDelta;
  if (nextText) return nextText;
  return previousText;
}
```

- [ ] **Step 3: Add streamFinal method to WebChannel**

Add new method that emits final state and clears buffers:
```typescript
streamFinal(
  chatId: string,
  event: {
    text?: string;
    stopReason?: string;
    errorMessage?: string;
  },
): void {
  const text = event.text ?? "";
  const seq = Date.now();
  if (this.broadcastFn) {
    this.broadcastFn("chat.final", {
      channel: this.name,
      chatId,
      state: "final",
      message: {
        role: "assistant",
        content: [{ type: "text", text }],
        timestamp: seq,
      },
      ...(event.stopReason && { stopReason: event.stopReason }),
      ...(event.errorMessage && { errorMessage: event.errorMessage }),
      timestamp: new Date().toISOString(),
    });
  }
  this.chatBuffers.delete(chatId);
  this.deltaSentAt.delete(chatId);
  this.deltaLastBroadcastLen.delete(chatId);
}
```

- [ ] **Step 4: Modify streamDelta to use buffering and throttling**

Replace current `streamDelta` implementation with buffered version:
```typescript
streamDelta(
  chatId: string,
  event: {
    type: string;
    text?: string;
    toolCallId?: string;
    toolName?: string;
    args?: string;
    result?: any;
  },
): void {
  if (event.type === "text-delta" || event.type === "reasoning-delta") {
    const now = Date.now();
    const last = this.deltaSentAt.get(chatId) ?? 0;
    if (now - last < 150) {
      return; // Throttle: skip if less than 150ms since last broadcast
    }
    
    const previousText = this.chatBuffers.get(chatId) ?? "";
    const mergedText = this.resolveMergedAssistantText(previousText, "", event.text ?? "");
    
    if (!mergedText || mergedText.length <= (this.deltaLastBroadcastLen.get(chatId) ?? 0)) {
      return; // Length-based dedup: don't re-send if text didn't grow
    }
    
    this.chatBuffers.set(chatId, mergedText);
    this.deltaSentAt.set(chatId, now);
    this.deltaLastBroadcastLen.set(chatId, mergedText.length);
    
    if (this.broadcastFn) {
      this.broadcastFn("chat.stream", {
        channel: this.name,
        chatId,
        type: event.type,
        message: {
          role: "assistant",
          content: [{ type: "text", text: mergedText }],
          timestamp: now,
        },
        timestamp: new Date().toISOString(),
      });
    }
  } else {
    // Non-text events (tool-call, tool-result) broadcast immediately
    if (this.broadcastFn) {
      this.broadcastFn("chat.stream", {
        channel: this.name,
        chatId,
        ...event,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
```

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add skyth/channels/web.ts
git commit -m "feat(web): add chat buffering, throttling, and streamFinal to WebChannel"
```

---

## Task 2: Wire runId through streaming and emit final state

**Files:**
- Modify: `skyth/cli/runtime/commands/gateway.ts:502-538`

- [ ] **Step 1: Capture runId from processMessage return or track it**

Currently the streaming callback in gateway.ts doesn't have access to runId. We need to track it. Add a variable before the Promise.resolve():

```typescript
let currentRunId: string | undefined;
const streamCb: import("@/providers/base").StreamCallback | undefined = normalizedMsg.channel === "web"
  ? (evt) => {
      // Use chatId as clientRunId proxy for now
    }
  : undefined;
```

Actually, since runId is generated inside agent_loop_runner per iteration, we need a different approach. Let me reconsider...

The simplest approach is to not track runId per se (use chatId as the run identifier) and emit `chat.final` after processMessage completes.

In gateway.ts after line 538 where `processMessage` returns, emit final:
```typescript
// After processMessage completes successfully, emit final for web channel
if (normalizedMsg.channel === "web") {
  const webCh = channels.getChannel("web");
  if (webCh instanceof WebChannel) {
    webCh.streamFinal(normalizedMsg.chatId, {
      text: response?.content,
      stopReason: "stop",
    });
  }
}
```

Wait, but this would emit final even for error cases. Let me look at the full try/catch structure again.

Looking at lines 532-559:
- Promise.resolve().then(async () => { try { response = await agent.processMessage(...) } catch { error handling } })

We should emit final in both success and error cases, with appropriate fields.

- [ ] **Step 2: Modify the streamCb to use throttled streamDelta**

The existing code already has the streaming callback at lines 506-529. We need to modify it to use the new buffered streamDelta. The current code calls `webCh.streamDelta` directly - with our new implementation in Task 1, this will automatically be throttled.

- [ ] **Step 3: Add final emission after processMessage completes**

After line 538 (successful response) and in the catch block (error case), emit final state:

For success (after line 544):
```typescript
if (normalizedMsg.channel === "web") {
  const webCh = channels.getChannel("web");
  if (webCh instanceof WebChannel) {
    webCh.streamFinal(normalizedMsg.chatId, {
      text: response?.content,
      stopReason: "stop",
    });
  }
}
```

For error (after line 557):
```typescript
if (normalizedMsg.channel === "web") {
  const webCh = channels.getChannel("web");
  if (webCh instanceof WebChannel) {
    webCh.streamFinal(normalizedMsg.chatId, {
      errorMessage: message,
    });
  }
}
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Run tests**

Run: `bun test tests/`
Expected: PASS (existing tests still work)

- [ ] **Step 6: Commit**

```bash
git add skyth/cli/runtime/commands/gateway.ts
git commit -m "feat(gateway): wire web chat buffering and emit final state after processMessage"
```

---

## Task 3: Verify build and run

- [ ] **Step 1: Run full build**

Run: `bun run build:bin`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `bunx @biomejs/biome lint skyth/channels/web.ts skyth/cli/runtime/commands/gateway.ts`
Expected: PASS (fix any issues)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add OpenClaw-style chat buffering to web channel"
```
