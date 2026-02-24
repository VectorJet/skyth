# Progress

## Completed
- Improved `skyth configure models` interactive behavior to show a model selection flow instead of a plain text-only prompt.
- Added Clack-based model picker flow:
  - provider selection via autocomplete (`Model provider`)
  - model selection via autocomplete (`Primary model`)
  - manual-entry fallback option (`Enter model manually`)
- Kept flag-based and non-interactive usage unchanged.

## Validation
- Ran:
  - `bun test tests/configure_command.test.ts tests/commands.test.ts`
- Result: 18 passed, 0 failed.

## Notes
- Existing unrelated workspace changes were preserved.
- `./dist/skyth configure models` now opens a selectable model menu when running in TTY mode.
