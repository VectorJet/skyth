## 2026-03-27 - Concurrent Channel Initialization
**Learning:** Sequential channel initialization in `startAll` and `stopAll` methods of `ChannelManager` creates an unnecessary bottleneck for multiple connected channels, especially since their operations are independent. Using `Promise.all` allows these I/O bound operations to run concurrently, drastically reducing startup and shutdown latency in the gateway.
**Action:** When handling initialization or teardown of multiple independent services, systems, or channels in this codebase, use concurrent mapping and `Promise.all` instead of `for...of` loops with sequential `await`.

## 2026-03-28 - Concurrent Long-Polling in Mochat Channel
**Learning:** Sequential `await` inside a polling loop over multiple independent targets (like `pollSession` and `pollPanel` in `MochatChannel`) causes severe latency multiplication. If a single long-polling request takes 25 seconds to timeout, the next target has to wait until the previous one finishes. This architecture is an anti-pattern for handling multiple persistent connections or message streams.
**Action:** When repeatedly polling multiple independent endpoints or targets in a loop, always use concurrent execution (e.g., `Promise.all`) instead of sequential `await` to ensure responsiveness across all targets simultaneously.

## 2024-05-17 - Eliminate N+1 Query in Session Search Tool
**Learning:** `ctx.sessions.getOrCreate(key)` inside loops blocks the event loop with synchronous disk reads, resulting in an N+1 query problem when loading multiple sessions.
**Action:** Implemented `getOrCreateManyAsync` in `SessionManager` to concurrently read session metadata with `fs.promises.readFile` and refactored search tools to fetch session arrays concurrently prior to searching. This reduced baseline search time by ~60%.
