# Phase 1: Authentication System

**Status:** Specification Complete  
**Based on:** Q1.3 / A1.3  
**Date:** 2026-01-31

---

## Overview

Skyth implements a multi-tiered authentication system supporting both local-only usage and API access.

---

## Authentication Mechanisms

### 1. Local-Only Authentication

**Purpose:** CLI and desktop application usage  
**Method:** Username + superuser password  
**Storage:** `~/.skyth/auth/pass.json`

**Features:**
- No external authentication required
- Password hashed with Argon2id
- Salt generated per-user
- Verification on-the-fly during usage

---

### 2. API Key Authentication

**Purpose:** Programmatic access, scripts, integrations  
**Method:** Long-lived API keys  
**Storage:** `~/.skyth/auth/api_keys.json`

**Features:**
- Generate via: `skyth auth create-key --name "my-script"`
- Revoke via: `skyth auth revoke-key {key_id}`
- List keys: `skyth auth list-keys`
- Keys encrypted with AES-256

---

## Password Security

### Hashing Algorithm: Argon2id

**Why Argon2id?**
- Winner of Password Hashing Competition (2015)
- Resistant to GPU/ASIC attacks
- Memory-hard function
- Recommended by OWASP

**Configuration:**
```python
argon2id$v=19$m=65536,t=3,p=4
# m=65536: 64 MB memory cost
# t=3: 3 iterations
# p=4: 4 parallel threads
```

---

### Password Storage Format

**File:** `~/.skyth/auth/pass.json`

```json
{
  "password_hash": "argon2id$v=19$m=65536,t=3,p=4$base64_salt$base64_hash",
  "salt": "base64_encoded_salt",
  "created_at": "2026-01-31T14:00:00Z",
  "last_changed": "2026-01-31T14:00:00Z",
  "algorithm": "argon2id"
}
```

---

### Password Verification

**Process:**
1. User enters password
2. System retrieves salt from `pass.json`
3. Hash input password with same salt and parameters
4. Compare hashes in constant-time
5. Grant access if match

**Code:**
```python
from argon2 import PasswordHasher

ph = PasswordHasher()

# Hash password during setup
hash = ph.hash(password)

# Verify password during login
try:
    ph.verify(stored_hash, input_password)
    return True
except:
    return False
```

---

## Multi-User Support

### Phase 1: Single User Only

**Scope:** Phase 1 supports only single-user configuration  
**Storage:** One user per `~/.skyth/` directory

### Future Phases: Multi-User (with Quasar)

**Phase 3+:** Multi-user support via Quasar database  
**Storage:** User profiles in Layer 1+ (PostgreSQL)  
**Authentication:** User-specific sessions tracked in Quasar

---

## Superuser Approval Pattern

### Destructive Commands Require Approval

Inspired by Moltbot's superuser approval pattern.

**Triggers:**
- File deletion (`rm`, `delete`)
- System-level commands (`sudo`, `chmod +x`)
- Large-scale modifications (bulk renames, mass deletes)
- Potentially dangerous operations

**Flow:**
```
Agent: "I need to delete 150 files. Requesting superuser approval."
User: [Enter superuser password]
Agent: "Approved. Proceeding..."
```

**Implementation:**
```python
@require_superuser_approval
def delete_files(file_list: list[str]):
    """Delete multiple files - requires superuser approval"""
    prompt_for_password()
    if verify_password():
        proceed_with_deletion()
    else:
        abort("Incorrect password")
```

---

## Session Management

### Phase 1: UUID-based Sessions

**Session Creation:**
- Generate UUID on CLI/app startup
- Store session metadata in `~/.skyth/sessions/{uuid}.json`
- Link to Quasar event logs

**Session Data:**
```json
{
  "session_id": "uuid-here",
  "username": "tammy",
  "started_at": "2026-01-31T14:00:00Z",
  "last_activity": "2026-01-31T15:30:00Z",
  "platform": "cli",
  "status": "active"
}
```

**Session Timeout:**
- Inactive timeout: 30 minutes (configurable)
- Explicit end: User runs `/exit` or `Ctrl+D`
- Auto-save: Session saved to Quasar on end

---

### Future: JWT Tokens (Phase 2+)

For remote API access and multi-platform support.

**Token Structure:**
```json
{
  "user_id": "uuid",
  "session_id": "uuid",
  "issued_at": 1234567890,
  "expires_at": 1234571490,
  "scopes": ["read", "write", "admin"]
}
```

**Token Refresh:**
- Access token: 1 hour TTL
- Refresh token: 30 days TTL
- Automatic rotation on refresh

---

## API Key Management

### Creating API Keys

**Command:**
```bash
skyth auth create-key --name "automation-script" --scopes read,write
```

**Output:**
```
✓ API key created: sk_skyth_abc123...xyz789

  Name: automation-script
  Scopes: read, write
  Created: 2026-01-31 14:00:00
  
  ⚠ Save this key securely. It won't be shown again.
```

---

### API Key Storage

**File:** `~/.skyth/auth/api_keys.json`

```json
{
  "keys": [
    {
      "key_id": "key_uuid",
      "key_hash": "sha256_hash_of_key",
      "name": "automation-script",
      "scopes": ["read", "write"],
      "created_at": "2026-01-31T14:00:00Z",
      "last_used": "2026-01-31T15:00:00Z",
      "usage_count": 42
    }
  ]
}
```

**Security:**
- Only hash is stored, not plaintext key
- User must save full key when generated
- Keys encrypted with AES-256

---

### Revoking API Keys

**Command:**
```bash
skyth auth revoke-key {key_id}
# or
skyth auth revoke-key --name "automation-script"
```

**Confirmation:**
```
⚠ Revoke API key "automation-script"?
  Created: 2026-01-31 14:00:00
  Last used: 2026-01-31 15:00:00
  Usage count: 42

  [y/N]: y

✓ API key revoked and deleted
```

---

## Authentication Scope

### Phase 1: Local CLI Use

**Requirement:** Minimal authentication  
**Implementation:**
- Username + superuser password (local only)
- No network authentication needed
- Session tracking via UUIDs

---

### Phase 2+: Remote API Access

**Requirement:** API authentication for remote clients  
**Implementation:**
- JWT tokens for web/mobile
- API keys for scripts
- Session-based auth for web UI
- Multi-factor authentication (optional)

---

## Security Best Practices

### Password Requirements

**Minimum Requirements:**
- Length: 8+ characters
- Complexity: Not enforced (user choice)
- Storage: Never plaintext, always hashed

**Recommendations:**
- Use password manager
- Avoid common passwords
- Change periodically (optional)

---

### Key Rotation

**API Keys:**
- Rotate every 90 days (recommended)
- Automatic expiration (optional)
- Notification before expiration

**Encryption Keys:**
- Quasar encryption key rotation (manual)
- OAuth token refresh (automatic)

---

## Config Validation on Startup

### Validation Steps

1. **Check auth files exist:**
   - `~/.skyth/auth/pass.json`
   - `~/.skyth/auth/api_keys.json` (if API mode enabled)

2. **Validate password hash format:**
   - Correct Argon2id format
   - Valid salt

3. **Check API keys:**
   - Verify key format
   - Remove expired keys
   - Update last_used timestamps

4. **Session cleanup:**
   - Remove expired sessions
   - Archive old sessions to Quasar

---

## Error Handling

### Invalid Password

```
❌ Incorrect password
   Attempts remaining: 2

   Forgot password? Run: skyth auth reset
```

**Lockout After 3 Failed Attempts:**
```
🔒 Account locked due to failed login attempts
   Wait 5 minutes or reset password
   
   Reset: skyth auth reset
```

---

### Missing Auth Files

```
⚠ Authentication not configured
   
   Run onboarding: skyth init
   Or manually configure: ~/.skyth/auth/
```

---

### Corrupted Auth Files

```
❌ Authentication data corrupted
   
   Backup found: ~/.skyth/auth/pass.json.backup
   Restore? [y/N]: y
   
   Or reset: skyth auth reset
```

---

## Testing Checklist

- [ ] Password hashing with Argon2id works correctly
- [ ] Password verification succeeds with correct password
- [ ] Password verification fails with incorrect password
- [ ] API key creation generates valid keys
- [ ] API key revocation removes keys
- [ ] API key hashes match correctly
- [ ] Session UUID generation is unique
- [ ] Session timeout works correctly
- [ ] Superuser approval prompts for destructive commands
- [ ] Auth file corruption detected and handled
- [ ] Lockout after failed attempts works
- [ ] Config validation runs on startup
