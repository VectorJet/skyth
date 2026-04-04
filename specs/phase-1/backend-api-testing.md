# Skyth Backend API Testing Guide

## Running the Backend

```bash
cd core
uv run python backend/routes/api.py
```

Server starts on: `http://127.0.0.1:8000`

## API Endpoints

### Health Check

```bash
curl http://127.0.0.1:8000/
```

**Response:**
```json
{
  "message": "Skyth API v0.1.0",
  "status": "operational"
}
```

---

## Password Management

### Check if Password Exists

```bash
curl http://127.0.0.1:8000/auth/password/exists
```

### Set Superuser Password

```bash
curl -X POST http://127.0.0.1:8000/auth/password/set \
  -H "Content-Type: application/json" \
  -d '{"password": "YourSecurePassword123!"}'
```

### Verify Password

```bash
curl -X POST http://127.0.0.1:8000/auth/password/verify \
  -H "Content-Type: application/json" \
  -d '{"password": "YourSecurePassword123!"}'
```

**Success Response:**
```json
{
  "valid": true,
  "message": "Password verified"
}
```

### Get Password Info

```bash
curl http://127.0.0.1:8000/auth/password/info
```

**Response:**
```json
{
  "algorithm": "argon2id",
  "created_at": "2026-02-07T13:26:09.810848Z",
  "last_changed": "2026-02-07T13:26:09.810848Z"
}
```

---

## Authentication Profiles

### Add API Key Profile

```bash
curl -X POST http://127.0.0.1:8000/auth/profiles \
  -H "Content-Type: application/json" \
  -d '{
    "profile_id": "anthropic:default",
    "credential_type": "api_key",
    "provider": "anthropic",
    "key_or_token": "sk-ant-your-api-key",
    "email": "user@example.com"
  }'
```

### Add Setup-Token Profile (Claude Pro/Max)

```bash
curl -X POST http://127.0.0.1:8000/auth/profiles \
  -H "Content-Type: application/json" \
  -d '{
    "profile_id": "anthropic:work",
    "credential_type": "token",
    "provider": "anthropic",
    "key_or_token": "sk-ant-setup-token-from-claude-cli",
    "email": "work@company.com"
  }'
```

### List All Profiles

```bash
curl http://127.0.0.1:8000/auth/profiles
```

**Response:**
```json
{
  "profiles": {
    "anthropic:default": {
      "type": "api_key",
      "provider": "anthropic",
      "email": "user@example.com"
    },
    "anthropic:work": {
      "type": "token",
      "provider": "anthropic",
      "email": "work@company.com"
    }
  }
}
```

### Get Specific Profile

```bash
curl http://127.0.0.1:8000/auth/profiles/anthropic:default
```

### Delete Profile

```bash
curl -X DELETE http://127.0.0.1:8000/auth/profiles/anthropic:work
```

---

## Configuration

### Save Configuration

```bash
curl -X POST http://127.0.0.1:8000/config \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "username": "tammy",
      "nickname": "Atlas",
      "primary_model_provider": "anthropic",
      "primary_model": "anthropic/claude-sonnet-4",
      "primary_auth_profile": "anthropic:default",
      "use_secondary_model": false,
      "use_router": false,
      "watcher": false,
      "mcp_config_path": "~/.skyth/config/mcp/"
    }
  }'
```

### Get Configuration

```bash
curl http://127.0.0.1:8000/config
```

### Check if Config Exists

```bash
curl http://127.0.0.1:8000/config/exists
```

---

## File Locations

All data is stored in `~/.skyth/`:

```
~/.skyth/
├── auth/
│   ├── pass.json                    # Argon2id hashed password (600 permissions)
│   └── auth_profiles.json           # AES-256 encrypted profiles (600 permissions)
├── config/
│   └── config.yml                   # Main configuration (YAML)
└── identity/
    └── device_auth/
        └── encryption_key           # AES-256 key for profiles (600 permissions)
```

---

## Security Features

### Password Hashing
- **Algorithm:** Argon2id
- **Parameters:** m=65536 (64MB), t=3 iterations, p=4 parallelism
- **Salt:** 32 bytes (256-bit)
- **Hash:** 32 bytes (256-bit)

### Profile Encryption
- **Algorithm:** Fernet (AES-256 in CBC mode)
- **Key Storage:** `~/.skyth/identity/device_auth/encryption_key`
- **Permissions:** 600 (owner read/write only)

### File Permissions
- All sensitive files: `600` (owner read/write only)
- Config file: `644` (world-readable, only owner writes)

---

## Testing Script

A comprehensive test script is available at `core/test_api.sh`:

```bash
cd core
./test_api.sh
```

This tests all endpoints in sequence.

---

## Next Steps

1. **Anthropic Setup-Token Handler** - Implement handler for Claude Pro/Max subscriptions
2. **OpenAI Codex OAuth** - Implement OAuth flow for ChatGPT Plus/Pro
3. **Generic API Key Handler** - Support all providers
4. **Provider Registry** - Complete list of supported providers
5. **CLI (TUI)** - Build Ink-based wizard that calls these APIs

---

## Development Notes

- Server runs on single-threaded uvicorn (development mode)
- For production, use: `uvicorn backend.routes.api:app --workers 4`
- Add CORS middleware if accessing from web UI
- Authentication middleware needed for protected endpoints (future)
