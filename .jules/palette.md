## 2024-03-27 - Missing ARIA Labels on Icon-Only Sidebar Buttons
**Learning:** Found multiple icon-only buttons in `AppSidebar.svelte` that toggle the sidebar but lack `aria-label` or equivalent accessible names, making them difficult for screen readers to interpret. This is a common pattern for icon-only components in this project that needs attention.
**Action:** Always verify `aria-label` attributes are present on `<button>` elements that primarily use SVG/icon content for visual representation.
