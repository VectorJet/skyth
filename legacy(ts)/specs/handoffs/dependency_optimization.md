# Handoff - Dependency Optimization

## Work Completed
- **Dependency Purge**: Removed 37 completely unused dependencies and devDependencies from `package.json` that were inflating the `node_modules` size and install time. The bloated transitive dependencies (like `koffi`, `@rolldown`, etc.) were removed as a result.
- **Phantom Dependency Resolution**: Added `glob`, `@types/glob`, `@homebridge/ciao`, and `@types/ws` which were previously functioning as phantom transitive dependencies but were actually required at runtime or compile time.
- **Bun Setup Lockdown**: Updated `bunfig.toml` and created `.bunignore` so `bun i` will never scan `refs/` or `legacy/` again.
- **Tests**: Ran typecheck and the full test suite (172 tests). Everything passes perfectly.

## Notes for Next Agent
- `package.json` is extremely clean now (~100 dependencies vs ~570 previously). Do not arbitrarily add large toolkits or frontend deps unless they are actively imported by the `skyth/` tree.
- LOC Check script passing cleanly. No files over 400 lines.
