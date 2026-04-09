# Onboarding Wizard - Remaining Features

**Status:** 70% Complete  
**Updated:** 2026-02-07

## Completed ✅

- [x] Provider selection (grouped by category)
- [x] Password setup (Argon2id hashing)
- [x] Anthropic authentication (setup-token + API key)
- [x] Google Gemini authentication (API key)
- [x] Backend health checks
- [x] API client integration
- [x] Error handling and validation
- [x] Environment variable detection
- [x] API key preview (masked)

## Remaining Features ⏸

### 1. Model Selection (Primary + Secondary)

**Priority:** HIGH  
**Complexity:** Medium

**Requirements:**
- Fetch available models from backend
- Present primary model selection
- Present secondary/fallback model selection
- Save to backend config

**Implementation:**
```typescript
// After provider authentication
const primaryModel = await selectPrimaryModel(provider);
const secondaryModel = await selectSecondaryModel(provider);

// Save to config
await apiClient.post('/auth/config', {
  model_primary: primaryModel,
  model_secondary: secondaryModel
});
```

**Backend Endpoints Needed:**
- `GET /api/v1/models/list?provider={provider}` - List available models
- Update `/api/v1/auth/config` to accept model fields

---

### 2. User Nickname

**Priority:** HIGH  
**Complexity:** Low

**Requirements:**
- Prompt user for nickname (optional, default: "User")
- Validate nickname (alphanumeric + spaces, max 50 chars)
- Save to backend config

**Implementation:**
```typescript
const userNickname = await clack.text({
  message: 'Your nickname (optional)',
  placeholder: 'User',
  defaultValue: 'User',
  validate: (value) => {
    if (value.length > 50) return 'Nickname too long (max 50 chars)';
    if (!/^[a-zA-Z0-9\s]+$/.test(value)) return 'Only letters, numbers, and spaces';
  }
});
```

---

### 3. Agent Nickname

**Priority:** HIGH  
**Complexity:** Low

**Requirements:**
- Prompt agent nickname (optional, default: "Skyth")
- Validate nickname (alphanumeric + spaces, max 50 chars)
- Save to backend config

**Implementation:**
```typescript
const agentNickname = await clack.text({
  message: 'Agent nickname (optional)',
  placeholder: 'Skyth',
  defaultValue: 'Skyth',
  validate: (value) => {
    if (value.length > 50) return 'Nickname too long (max 50 chars)';
    if (!/^[a-zA-Z0-9\s]+$/.test(value)) return 'Only letters, numbers, and spaces';
  }
});
```

---

### 4. Router Mode Selection

**Priority:** MEDIUM  
**Complexity:** Low

**Requirements:**
- Ask yes/no: "Use router mode for agent selection?"
- Explain router vs generalist mode
- Save to backend config

**Implementation:**
```typescript
const useRouter = await clack.confirm({
  message: 'Use router mode for automatic agent selection?',
  initialValue: false
});

if (useRouter) {
  clack.note(
    'Router mode: A router model will choose which specialized agent to use.\n' +
    'Generalist mode: A single generalist agent handles all tasks.',
    'Router Mode'
  );
}
```

**Reference:** `spec/arch.md` - Agent System (Phase 2)

---

### 5. Router Model Selection

**Priority:** MEDIUM  
**Complexity:** Medium

**Requirements:**
- Only show if router mode is enabled
- Present list of suitable router models (fast, cheap)
- Default: Same as primary model
- Save to backend config

**Implementation:**
```typescript
if (useRouter) {
  const routerModel = await clack.select({
    message: 'Select router model',
    options: [
      { value: 'same', label: 'Same as primary model' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini (fast, cheap)' },
      { value: 'claude-3-haiku', label: 'Claude 3 Haiku (fast, cheap)' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (fast, cheap)' },
    ]
  });
}
```

---

### 6. Watcher/Gateway WebSocket

**Priority:** MEDIUM  
**Complexity:** Low

**Requirements:**
- Ask yes/no: "Enable WebSocket gateway for real-time updates?"
- Explain what it's for (CLI chat, live updates)
- Save to backend config
- Default: true for CLI, false otherwise

**Implementation:**
```typescript
const enableWebSocket = await clack.confirm({
  message: 'Enable WebSocket gateway for real-time chat?',
  initialValue: true
});

clack.note(
  'WebSocket enables:\n' +
  '- Real-time streaming responses\n' +
  '- Live agent status updates\n' +
  '- Interactive chat in CLI',
  'WebSocket Gateway'
);
```

---

### 7. Default MCP Config Path

**Priority:** LOW  
**Complexity:** Low

**Requirements:**
- Show default MCP config path: `~/.skyth/mcp/config.json`
- Ask if user wants to use default
- Save to backend config

**Implementation:**
```typescript
const defaultMcpPath = '~/.skyth/mcp/config.json';

const useDefaultMcp = await clack.confirm({
  message: `Use default MCP config path?\n  ${defaultMcpPath}`,
  initialValue: true
});
```

---

### 8. Custom MCP Config Path

**Priority:** LOW  
**Complexity:** Low

**Requirements:**
- Only show if user declined default path
- Prompt for custom path
- Validate path exists or can be created
- Save to backend config

**Implementation:**
```typescript
if (!useDefaultMcp) {
  const mcpPath = await clack.text({
    message: 'Enter custom MCP config path',
    placeholder: '~/.skyth/mcp/config.json',
    validate: (value) => {
      if (!value.trim()) return 'Path required';
      if (!value.endsWith('.json')) return 'Must be a .json file';
    }
  });
}
```

---

### 9. OpenAI Codex OAuth

**Priority:** HIGH  
**Complexity:** HIGH

**Requirements:**
- Implement PKCE OAuth flow
- Open browser for authentication
- Handle callback on localhost:1455
- VPS-aware (detect SSH, show URL for manual paste)
- Save OAuth credentials to backend

**Reference Files:**
- `refs/apps/openclaw/src/commands/auth-choice.apply.openai.ts`
- `refs/apps/openclaw/src/commands/oauth-flow.ts`

**Implementation Steps:**
1. Copy OAuth utilities from OpenClaw
2. Implement PKCE (Proof Key for Code Exchange)
3. Create local callback server (localhost:1455)
4. Handle browser OAuth flow
5. Store refresh tokens securely

**Dependencies:**
```bash
bun add @mariozechner/pi-ai
```

---

### 10. Google Gemini CLI OAuth

**Priority:** MEDIUM  
**Complexity:** HIGH

**Requirements:**
- Implement Google OAuth flow
- Use bundled Gemini CLI auth plugin
- Handle callback and token storage
- Save OAuth credentials to backend

**Reference Files:**
- OpenClaw auth handlers (similar pattern)

---

### 11. Google Antigravity OAuth

**Priority:** MEDIUM  
**Complexity:** HIGH

**Requirements:**
- Integrate with cloned repo: `refs/skyth-antigravity-auth/`
- Implement Google OAuth with Antigravity plugin
- Handle authentication flow
- Save OAuth credentials to backend

**Reference Files:**
- `refs/skyth-antigravity-auth/` (cloned repo)
- OpenClaw Antigravity integration

**Implementation:**
```typescript
async function handleGoogleAntigravity() {
  // Import Antigravity auth plugin
  const antigravity = await import('../../../refs/skyth-antigravity-auth');
  
  // Start OAuth flow
  const credentials = await antigravity.authenticate();
  
  // Save to backend
  await apiClient.post('/auth/profiles/google/antigravity-oauth', {
    credentials
  });
}
```

---

## Implementation Order (Recommended)

### Phase A: Core Config (Quick Wins)
1. User nickname
2. Agent nickname
3. Router mode boolean
4. Watcher/WebSocket boolean
5. MCP config paths

**Estimated Time:** 2-3 hours

### Phase B: Model Selection
6. Primary model selection
7. Secondary model selection
8. Router model selection

**Estimated Time:** 3-4 hours

### Phase C: OAuth Flows (Complex)
9. OpenAI Codex OAuth
10. Google Gemini CLI OAuth
11. Google Antigravity OAuth

**Estimated Time:** 6-8 hours

---

## Backend Changes Needed

### Config Schema Updates

Add to `core/backend/config/schema.py`:

```python
class ConfigSchema(BaseModel):
    # Existing fields...
    
    # NEW: Onboarding fields
    user_nickname: Optional[str] = "User"
    agent_nickname: Optional[str] = "Skyth"
    model_primary: Optional[str] = None
    model_secondary: Optional[str] = None
    router_mode: bool = False
    router_model: Optional[str] = None
    websocket_enabled: bool = True
    mcp_config_path: str = "~/.skyth/mcp/config.json"
```

### New Endpoints

```python
# Model listing
GET /api/v1/models/list?provider={provider}

# OAuth endpoints
POST /api/v1/auth/profiles/openai/codex-oauth
POST /api/v1/auth/profiles/google/gemini-cli-oauth
POST /api/v1/auth/profiles/google/antigravity-oauth
```

---

## Testing Checklist

- [ ] User nickname validation (length, characters)
- [ ] Agent nickname validation (length, characters)
- [ ] Router mode toggle
- [ ] Router model selection (only when enabled)
- [ ] WebSocket toggle
- [ ] Default MCP path acceptance
- [ ] Custom MCP path validation
- [ ] Primary model selection
- [ ] Secondary model selection
- [ ] All config saved to backend
- [ ] All OAuth flows working
- [ ] VPS-aware OAuth (manual paste mode)

---

## Documentation Needed

- [ ] Update CLI README with all onboarding steps
- [ ] Document OAuth setup requirements
- [ ] Add troubleshooting guide for OAuth failures
- [ ] Document model selection process
- [ ] Explain router vs generalist mode

---

## Notes

- Keep UX simple and guided
- Provide sensible defaults for everything
- Make all steps optional/skippable except password
- Show helpful explanations for complex choices
- Test on both local and VPS environments
- Handle network errors gracefully
