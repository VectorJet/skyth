# Handoff: Separate Model/Provider Configuration

## Date: 2026-03-05

## Context
The onboarding flow now handles username, password, and channel pairing correctly. The config schema supports secondary model, router model, and utility model fields but the onboarding UI does not yet expose separate configuration for each.

## Remaining Work

### Add Separate Model/Provider Selection Steps
Per the config.yml schema, these fields need onboarding UI support:

```yaml
# Secondary/Fallback Model
use_secondary_model: bool
secondary_model_provider: string
secondary_model: string

# Router Model
use_router: bool
router_model_provider: string
router_model: string

# Utility Model
use_utility: bool
provider: string
model: string
```

Currently `05-model-selection.ts` only handles the primary model/provider. It needs to optionally prompt for secondary, router, and utility models when the user selects "Manual" mode or enables these features.

### Implementation Notes
- The existing `buildProviderOptions()` and `buildModelOptions()` helpers in `05-model-selection.ts` can be reused for all model types
- In QuickStart mode, secondary/router/utility should default to disabled
- In Manual mode, prompt for each after primary model selection
- Validate model format: `{providerID}/{modelID}`
- Validate provider against registry (`listProviderSpecs`)
- Each model type can have its own API key if using a different provider

### Testing Checklist
- [ ] Config file validates correctly on load
- [ ] Invalid provider throws error
- [ ] Invalid model throws error
- [ ] Secondary model dependencies enforced (provider required when enabled)
- [ ] Router model dependencies enforced (provider required when enabled)
- [ ] Model format validation works (`provider/model`)
- [ ] Config updates persist correctly
- [ ] Sensitive data (API keys) not stored in config.yml

### Old Step File
`skyth/cli/cmd/onboarding/module/steps/04-identity.ts` is still on disk but removed from the registry. Can be deleted or kept as reference.

### Password Storage
Dual-write is in place: both `superuser_password.jsonl` (legacy) and `pass.json` (new). Future work should migrate to `pass.json` only and remove the legacy superuser module dependency from onboarding.
