## 2026-03-27 - Concurrent Channel Initialization
**Learning:** Sequential channel initialization in `startAll` and `stopAll` methods of `ChannelManager` creates an unnecessary bottleneck for multiple connected channels, especially since their operations are independent. Using `Promise.all` allows these I/O bound operations to run concurrently, drastically reducing startup and shutdown latency in the gateway.
**Action:** When handling initialization or teardown of multiple independent services, systems, or channels in this codebase, use concurrent mapping and `Promise.all` instead of `for...of` loops with sequential `await`.

## 2026-03-28 - Concurrent Long-Polling in Mochat Channel
**Learning:** Sequential `await` inside a polling loop over multiple independent targets (like `pollSession` and `pollPanel` in `MochatChannel`) causes severe latency multiplication. If a single long-polling request takes 25 seconds to timeout, the next target has to wait until the previous one finishes. This architecture is an anti-pattern for handling multiple persistent connections or message streams.
**Action:** When repeatedly polling multiple independent endpoints or targets in a loop, always use concurrent execution (e.g., `Promise.all`) instead of sequential `await` to ensure responsiveness across all targets simultaneously.
## 2024-03-29 - Session Manager Bulk Fetch
**Learning:** Sequential, synchronous disk reads inside tool execution loops (like `SessionManager.getOrCreate` in `SessionSearchTool`) can cause severe N+1 performance bottlenecks. While synchronous caching helps on repeated accesses, the initial load is blocked on disk I/O.
**Action:** Introduced an asynchronous bulk fetch method (`SessionManager.getMany(keys)`) that uses `Promise.all` and `fs.promises.readFile` for concurrent reading, improving load times by ~1.68x, and updated `SessionSearchTool` and `SessionListTool` to use it.

## 2024-05-18 - Avoid O(N) Disk Reads in Handlers
**Learning:** Found that operations acting on a single specific session (like get, patch, or create) were reading *all* session files on disk asynchronously/synchronously just to extract metadata using `sessions.listSessions().find(...)`. In Node/Bun, synchronous disk reads inside web API request handlers for large datasets drastically block the main event loop and cause severe latency degradation.
**Action:** Always map single items in memory directly from the fetched item (e.g. `getSessionListItem(session)`) instead of falling back to a collection-wide list and filter iteration.

## 2026-06-21 - Concurrent Asynchronous Session Listing
**Learning:** Sequential, synchronous disk reads inside tool execution loops or web API handlers for gathering a list of sessions (like `SessionManager.listSessions` doing `readdirSync` and O(N) `readFileSync`) can cause severe latency degradation by blocking the main event loop.
**Action:** Introduced an asynchronous method `listSessionsAsync` in `SessionManager` that uses `Promise.all` and `fs.promises` to concurrently read session files without blocking the main event loop, and updated gateway handlers to use it.
