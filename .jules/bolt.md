## 2026-03-27 - Concurrent Channel Initialization
**Learning:** Sequential channel initialization in `startAll` and `stopAll` methods of `ChannelManager` creates an unnecessary bottleneck for multiple connected channels, especially since their operations are independent. Using `Promise.all` allows these I/O bound operations to run concurrently, drastically reducing startup and shutdown latency in the gateway.
**Action:** When handling initialization or teardown of multiple independent services, systems, or channels in this codebase, use concurrent mapping and `Promise.all` instead of `for...of` loops with sequential `await`.

## 2026-03-28 - Concurrent Long-Polling in Mochat Channel
**Learning:** Sequential `await` inside a polling loop over multiple independent targets (like `pollSession` and `pollPanel` in `MochatChannel`) causes severe latency multiplication. If a single long-polling request takes 25 seconds to timeout, the next target has to wait until the previous one finishes. This architecture is an anti-pattern for handling multiple persistent connections or message streams.
**Action:** When repeatedly polling multiple independent endpoints or targets in a loop, always use concurrent execution (e.g., `Promise.all`) instead of sequential `await` to ensure responsiveness across all targets simultaneously.
## 2024-03-24 - Optimizing Session Loading N+1 Query
**Learning:** Sequential disk reads inside an array loop can cause significant latency when processing multiple sessions (N+1 query problem). Unbounded concurrent fetching of thousands of files with Promise.all can trigger EMFILE limits and cache stampedes.
**Action:** Implemented a chunked concurrent fetch using Promise.all with chunks of 100 sessions to safely prevent N+1 query and EMFILE limits. Added a pending loads map to prevent cache stampedes during concurrent fetching.
