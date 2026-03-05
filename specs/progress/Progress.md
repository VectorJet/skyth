# Progress

## 2026-03-05: Onboarding Password Prompt Visibility and Layout

### Completed
- Kept onboarding secret prompts fully on `@clack/prompts` `password` to preserve proper Clack layout and spacing.
- Restored visible masked input using `▣` (U+25A3) so password/API key typing is not visually ambiguous.
- Identity/auth ordering remains after mode selection (`order: 25`).
- Removed temporary Inquirer path and dependency from previous attempt.

### Behavior Change
- Password/API key prompts now show `▣` while typing.
- Prompt layout remains properly integrated in Clack flow (header + prompt spacing).

### Verification
- `bun run typecheck` still has pre-existing failures in `skyth/providers/ai_sdk_provider.ts`.
- No onboarding-specific typecheck regressions were introduced by this mask change.

### Files Changed
- `skyth/cli/cmd/onboarding/module/clack_helpers.ts`
- `skyth/cli/cmd/onboarding/module/steps/02-identity-auth.ts`
- `package.json`
- `bun.lock`
- `specs/progress/Progress.md`
