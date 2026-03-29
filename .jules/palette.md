## 2024-03-27 - Missing ARIA Labels on Icon-Only Sidebar Buttons
**Learning:** Found multiple icon-only buttons in `AppSidebar.svelte` that toggle the sidebar but lack `aria-label` or equivalent accessible names, making them difficult for screen readers to interpret. This is a common pattern for icon-only components in this project that needs attention.
**Action:** Always verify `aria-label` attributes are present on `<button>` elements that primarily use SVG/icon content for visual representation.
## 2024-03-20 - Empty State Collision with Streaming
**Learning:** In chat interfaces, static empty states (e.g. "No messages yet") visually collide with temporary streaming or loading indicators if not conditionally hidden, leading to confusing overlapping UI states.
**Action:** Always wrap empty state components with strict conditions (`!isLoading && !streamingMessage`) to ensure they immediately disappear when an interaction begins, rather than waiting for the first actual message to be added to the array.
