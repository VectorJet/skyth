# Phase 1: Messaging Apps Integration

**Status:** Optional Feature  
**Based on:** A1.4 (Additional Phase 1 features)  
**Date:** 2026-01-31  
**Reference:** `@refs/apps/nanobot`

---

## Overview

Skyth supports integration with messaging platforms to provide multi-platform AI agent access. This feature is **optional** in Phase 1 and can be deferred.

---

## Reference Implementation

**Source:** `@refs/apps/nanobot`  
**Pattern:** Moltbot's multi-platform messaging integration

The reference implementation demonstrates:
- Unified session management across platforms
- Platform-agnostic message routing
- Quasar memory shared across all platforms
- Authentication per platform

---

## Supported Platforms

### Phase 1 Support (Optional)

1. **Telegram**
   - Bot API integration
   - Webhook or polling mode
   - Rich formatting (markdown)
   - File uploads/downloads

2. **WhatsApp**
   - WhatsApp Business API
   - Message templates
   - Media support
   - Read receipts

3. **CLI/TUI**
   - Primary interface (mandatory)
   - TypeScript-based
   - Bun runtime

### Future Platforms (Phase 4+)

4. **Discord**
5. **Slack**
6. **Matrix**
7. **Signal**

---

## Architecture

### Platform-Agnostic Design

```
┌─────────────┐
│   Telegram  │──┐
└─────────────┘  │
                 │
┌─────────────┐  │     ┌──────────────┐
│  WhatsApp   │──┼────▶│   Backend    │
└─────────────┘  │     │   (FastAPI)  │
                 │     └──────────────┘
┌─────────────┐  │            │
│   CLI/TUI   │──┘            │
└─────────────┘               ▼
                       ┌──────────────┐
                       │   Quasar     │
                       │   (Memory)   │
                       └──────────────┘
```

**Key Principle:** All platforms connect to unified backend. Memory and sessions are shared.

---

## Session Management

### Unified Session Tracking

**Problem:** User interacts with Skyth via multiple platforms  
**Solution:** Single UUID-based session system across all platforms

**Session Data:**
```json
{
  "session_id": "uuid-here",
  "user_id": "user-uuid",
  "username": "tammy",
  "platform": "telegram",  // or "whatsapp", "cli"
  "platform_user_id": "telegram_chat_id_12345",
  "started_at": "2026-01-31T14:00:00Z",
  "last_activity": "2026-01-31T15:30:00Z",
  "status": "active"
}
```

---

### Cross-Platform Memory

**Scenario:**
1. User chats with Skyth on Telegram
2. Later, user opens CLI
3. CLI agent has access to Telegram conversation history

**Implementation:**
- All platforms write to same Quasar memory
- Session summaries available across platforms
- User identity linked via `user_id` (not platform-specific ID)

---

## Platform-Specific Implementation

### Telegram Integration

**Library:** `python-telegram-bot` or `telethon`

**Features:**
- Bot commands (`/start`, `/help`, `/session`)
- Rich message formatting (markdown, HTML)
- File uploads (images, documents)
- Inline keyboards for actions
- Callback query handling

**Bot Setup:**
1. Create bot via [@BotFather](https://t.me/botfather)
2. Get API token
3. Store in `~/.skyth/config/messaging/telegram.yml`

**Config:**
```yaml
telegram:
  bot_token: "YOUR_BOT_TOKEN"
  allowed_users:
    - telegram_user_id_1
    - telegram_user_id_2
  webhook_url: "https://your-domain.com/telegram/webhook"  # optional
```

---

### WhatsApp Integration

**Library:** `whatsapp-web.js` or WhatsApp Business API

**Features:**
- Text messages
- Media messages (images, videos, documents)
- Message templates (for Business API)
- Read receipts
- Typing indicators

**Setup:**
1. Use WhatsApp Business API (official)
2. OR use whatsapp-web.js (unofficial, requires QR code scan)

**Config:**
```yaml
whatsapp:
  mode: "business_api"  # or "web_js"
  phone_number: "+1234567890"
  api_token: "YOUR_API_TOKEN"  # if using Business API
  allowed_numbers:
    - "+1234567890"
    - "+0987654321"
```

---

## Authentication

### Per-Platform Auth

**Problem:** How to authenticate users on messaging platforms?

**Solution:** Link messaging platform user ID to Skyth user

**Flow:**
1. User sends first message to bot
2. Bot requests authentication code
3. User enters code (generated via CLI: `skyth auth generate-code`)
4. Bot links platform user ID to Skyth user ID
5. Future messages authenticated automatically

**Example:**
```
User (Telegram): /start
Bot: Welcome! Enter your authentication code:
     (Generate code via: skyth auth generate-code)

User: ABC123XYZ
Bot: ✓ Authenticated as tammy
     You can now use Skyth via Telegram
```

---

### Superuser Approval

**Problem:** Should destructive commands work via messaging apps?

**Solution:** Require extra confirmation for dangerous operations

**Flow:**
```
User (WhatsApp): Delete all files in /tmp
Bot: ⚠ This will delete 150 files. Confirm with superuser password.
User: [password]
Bot: ✓ Approved. Deleting files...
```

---

## Message Routing

### Backend Message Handler

```python
@app.post("/api/v1/message")
async def handle_message(message: IncomingMessage):
    """Handle incoming message from any platform"""
    
    # Extract platform and user
    platform = message.platform  # "telegram", "whatsapp", "cli"
    platform_user_id = message.user_id
    
    # Get or create Skyth user session
    user = await get_user_by_platform_id(platform, platform_user_id)
    session = await get_or_create_session(user.id, platform)
    
    # Load Quasar context
    context = await quasar.get_session_context(session.id)
    
    # Process with agent
    response = await agent.process(message.content, context)
    
    # Send response back to platform
    await send_message(platform, platform_user_id, response)
    
    # Update Quasar
    await quasar.log_event(session.id, message, response)
```

---

## Rich Formatting

### Platform Capabilities

| Feature | Telegram | WhatsApp | CLI |
|---------|----------|----------|-----|
| Markdown | ✅ | ✅ | ✅ |
| HTML | ✅ | ❌ | ❌ |
| Code blocks | ✅ | ✅ | ✅ |
| Images | ✅ | ✅ | ✅ |
| Files | ✅ | ✅ | ✅ |
| Buttons | ✅ | ❌ | ✅ |
| Inline queries | ✅ | ❌ | ❌ |

---

### Message Formatting

**Input (Platform-agnostic):**
```markdown
## Analysis Results

File count: **150**
Total size: *2.3 GB*

```python
def analyze():
    return "complete"
```
```

**Output (Telegram):**
```html
<b>Analysis Results</b>

File count: <b>150</b>
Total size: <i>2.3 GB</i>

<code>
def analyze():
    return "complete"
</code>
```

**Output (WhatsApp):**
```
*Analysis Results*

File count: *150*
Total size: _2.3 GB_

```
def analyze():
    return "complete"
```
```

---

## File Handling

### Receiving Files

**Telegram:**
```python
@bot.message_handler(content_types=['document', 'photo'])
async def handle_file(message):
    file_id = message.document.file_id
    file_info = await bot.get_file(file_id)
    file_url = f"https://api.telegram.org/file/bot{TOKEN}/{file_info.file_path}"
    
    # Download and process
    await process_file(file_url, message.chat.id)
```

**WhatsApp:**
```javascript
client.on('message', async (msg) => {
    if (msg.hasMedia) {
        const media = await msg.downloadMedia();
        await processFile(media, msg.from);
    }
});
```

---

### Sending Files

**Telegram:**
```python
await bot.send_document(
    chat_id=chat_id,
    document=open('report.pdf', 'rb'),
    caption="Your analysis report"
)
```

**WhatsApp:**
```javascript
await client.sendMessage(
    msg.from,
    media,
    { caption: 'Your analysis report' }
);
```

---

## Rate Limiting

### Platform Limits

**Telegram:**
- 30 messages/second per bot
- 20 messages/minute per chat

**WhatsApp:**
- Business API: 1000 messages/day (default tier)
- Web.js: No official limits (use carefully)

**Implementation:**
```python
from ratelimit import limits, sleep_and_retry

@sleep_and_retry
@limits(calls=30, period=1)  # 30 calls per second
async def send_telegram_message(chat_id, text):
    await bot.send_message(chat_id, text)
```

---

## Error Handling

### Network Errors

```python
try:
    await send_message(platform, user_id, message)
except NetworkError:
    # Retry with exponential backoff
    await retry_send(platform, user_id, message, max_retries=3)
```

---

### Platform-Specific Errors

**Telegram:**
```python
except telegram.error.BadRequest as e:
    if "chat not found" in str(e):
        log_error("User deleted bot conversation")
    elif "message too long" in str(e):
        # Split message into chunks
        await send_chunked_message(chat_id, message)
```

**WhatsApp:**
```javascript
client.on('message_create', async (msg) => {
    try {
        await processMessage(msg);
    } catch (error) {
        if (error.message.includes('rate limit')) {
            await wait(5000);  // Wait 5 seconds
            await processMessage(msg);
        }
    }
});
```

---

## Configuration

### Messaging Config File

**Location:** `~/.skyth/config/messaging/platforms.yml`

```yaml
enabled_platforms:
  - telegram
  - whatsapp

telegram:
  bot_token: "YOUR_TELEGRAM_BOT_TOKEN"
  allowed_users:
    - 123456789
    - 987654321
  webhook_url: null  # Use polling mode
  
whatsapp:
  mode: "web_js"
  qr_code_auth: true
  allowed_numbers:
    - "+1234567890"

general:
  message_timeout: 30  # seconds
  max_message_length: 4096
  file_upload_max_size: 50  # MB
```

---

## Setup Commands

### Enable Messaging Platform

```bash
# Enable Telegram
skyth messaging enable telegram

# Interactive setup
> Enter bot token: YOUR_BOT_TOKEN
> Add allowed user ID: 123456789
> Add another? [y/N]: n
> Use webhook? [y/N]: n

✓ Telegram enabled

# Test connection
skyth messaging test telegram
```

---

### Link User Account

```bash
# Generate auth code for messaging platform
skyth auth generate-code --platform telegram

> Auth code: ABC123XYZ
  Valid for: 5 minutes
  Share this code with your Telegram bot
```

**In Telegram:**
```
You: /start
Bot: Welcome! Enter your authentication code:
You: ABC123XYZ
Bot: ✓ Authenticated as tammy
```

---

## Implementation Priority

### Phase 1: Optional

Messaging app integration is **optional** in Phase 1.

**Reason:**
- Core CLI/TUI functionality is priority
- Messaging adds complexity
- Can be added incrementally

**Recommendation:**
- Defer to Phase 2 or 3
- Implement after core backend is stable
- Use Nanobot reference for quick implementation

---

### Phase 2-3: Integration

If implementing messaging in Phase 2-3:

**Week 1:**
1. Setup Telegram bot integration
2. Implement message routing to backend
3. Test basic send/receive

**Week 2:**
4. Add WhatsApp integration
5. Implement file handling
6. Add authentication flow

**Week 3:**
7. Cross-platform session management
8. Quasar memory integration
9. Rich formatting support

**Week 4:**
10. Rate limiting
11. Error handling
12. Testing and documentation

---

## Testing Checklist

- [ ] Telegram bot responds to messages
- [ ] WhatsApp integration works
- [ ] Cross-platform sessions tracked correctly
- [ ] Quasar memory shared across platforms
- [ ] File uploads/downloads work
- [ ] Rich formatting renders correctly
- [ ] Rate limiting prevents API errors
- [ ] Authentication flow works
- [ ] Superuser approval required for destructive commands

---

## Security Considerations

### API Tokens

- Store bot tokens in encrypted config
- Never commit tokens to version control
- Rotate tokens periodically

### User Verification

- Whitelist allowed user IDs
- Require authentication code for first use
- Log all authentication attempts

### Message Validation

- Sanitize incoming messages
- Prevent command injection
- Limit message length
- Validate file types before download

---

## Reference

**Implementation:** See `@refs/apps/nanobot` for complete working example
**Platforms:** Telegram, WhatsApp, CLI integration
**Architecture:** Unified backend with platform-specific adapters
