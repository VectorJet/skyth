# Backend Development Components

## Overview

Since emojis are strictly prohibited in the codebase, this document provides a standardized set of visual components and indicators to use in backend development for logging, status reporting, and user feedback.

---

## Status Indicators

### Symbols

```
[✓] Success / Completed
[✗] Error / Failed
[!] Warning / Attention Required
[?] Unknown / Undefined
[i] Information
[*] In Progress / Active
[-] Disabled / Inactive
[+] Added / Created
[~] Modified / Updated
[>] Next / Forward
[<] Previous / Back
```

### Usage in Logs

```python
# Good
logger.info("[✓] Agent registered successfully")
logger.error("[✗] Failed to connect to database")
logger.warning("[!] Fallback to SQLite database")

# Bad - No emojis
logger.info("✅ Agent registered successfully")  # Prohibited
```

---

## Progress Indicators

### Text-Based Progress

```
[####------] 40% Complete
[##########] 100% Complete
[----------] 0% Complete
```

### Stage Indicators

```
[1/5] Initializing...
[2/5] Loading agents...
[3/5] Registering tools...
[4/5] Starting services...
[5/5] Complete
```

---

## Component States

### Service States

```
[RUNNING]   Service is active
[STOPPED]   Service is not running
[STARTING]  Service is initializing
[ERROR]     Service encountered an error
[READY]     Service is ready to accept requests
```

### Agent States

```
[IDLE]       Agent is waiting for tasks
[WORKING]    Agent is executing a task
[COMPLETED]  Agent finished task successfully
[FAILED]     Agent task failed
[SUSPENDED]  Agent is temporarily suspended
```

### Tool States

```
[AVAILABLE]     Tool is ready to use
[UNAVAILABLE]   Tool cannot be accessed
[EXECUTING]     Tool is currently running
[REGISTERED]    Tool is registered in registry
[UNREGISTERED]  Tool is not registered
```

---

## Log Level Indicators

```
[DEBUG]    Detailed debugging information
[INFO]     General informational messages
[WARNING]  Warning messages for potential issues
[ERROR]    Error messages for failures
[CRITICAL] Critical system failures
```

---

## Database Connection States

```
[CONNECTED]     Successfully connected
[DISCONNECTED]  Not connected
[CONNECTING]    Connection in progress
[FALLBACK]      Using fallback database
[TIMEOUT]       Connection timeout
```

---

## API Response Prefixes

```
[GET]     HTTP GET request
[POST]    HTTP POST request
[PUT]     HTTP PUT request
[DELETE]  HTTP DELETE request
[PATCH]   HTTP PATCH request
```

---

## Visual Separators

### Section Dividers

```
========================================
----------------------------------------
****************************************
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

### Subsection Dividers

```
----
....
~~~~
____
```

---

## Status Messages Format

### Success Messages

```
[✓] Operation completed successfully
[✓] Agent 'example_agent' loaded
[✓] Database connection established
```

### Error Messages

```
[✗] Failed to load agent: <agent_name>
[✗] Database connection failed: <error>
[✗] Tool execution error: <details>
```

### Warning Messages

```
[!] Configuration missing, using defaults
[!] Deprecated method used: <method_name>
[!] Rate limit approaching
```

### Info Messages

```
[i] Server starting on port 8000
[i] Loading 5 agents...
[i] Registry initialized with 12 tools
```

---

## Box Drawing Components

### Simple Boxes

```
┌─────────────────┐
│ Agent: Demo     │
│ Status: Ready   │
└─────────────────┘
```

### Nested Boxes

```
┌─────────────────────────┐
│ Agent Registry          │
├─────────────────────────┤
│ ├─ demo_agent          │
│ ├─ browser_agent       │
│ └─ generalist_agent    │
└─────────────────────────┘
```

### Tree Structure

```
Agent System
├── Agents
│   ├── demo_agent
│   ├── browser_agent
│   └── generalist_agent
├── Tools
│   ├── calculator
│   └── search
└── Pipelines
    └── enrichment
```

---

## Color Codes (Terminal)

When using terminal output, ANSI color codes can be used:

```python
# Color constants
RESET = "\033[0m"
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
MAGENTA = "\033[95m"
CYAN = "\033[96m"

# Usage
print(f"{GREEN}[✓] Success{RESET}")
print(f"{RED}[✗] Error{RESET}")
print(f"{YELLOW}[!] Warning{RESET}")
print(f"{BLUE}[i] Info{RESET}")
```

---

## Table Formatting

### Simple Table

```
+----------------+----------+---------+
| Agent Name     | Status   | Tasks   |
+----------------+----------+---------+
| demo_agent     | RUNNING  | 5       |
| browser_agent  | IDLE     | 0       |
+----------------+----------+---------+
```

### Detailed Table

```
╔════════════════╦══════════╦═════════╗
║ Agent Name     ║ Status   ║ Tasks   ║
╠════════════════╬══════════╬═════════╣
║ demo_agent     ║ RUNNING  ║ 5       ║
║ browser_agent  ║ IDLE     ║ 0       ║
╚════════════════╩══════════╩═════════╝
```

---

## Usage Guidelines

1. **Consistency**: Always use the same symbol for the same meaning
2. **Clarity**: Choose symbols that clearly communicate status
3. **No Emojis**: Never use emoji characters (🚀, ✨, 🔥, etc.)
4. **Readability**: Ensure symbols work in all terminal environments
5. **Documentation**: Comment code that uses these symbols for clarity

---

## Example Implementation

```python
from typing import Literal

class ComponentLogger:
    """Standardized logger with component indicators"""
    
    STATUS = {
        "success": "[✓]",
        "error": "[✗]",
        "warning": "[!]",
        "info": "[i]",
        "progress": "[*]"
    }
    
    @staticmethod
    def log(status: Literal["success", "error", "warning", "info", "progress"], message: str):
        indicator = ComponentLogger.STATUS.get(status, "[?]")
        print(f"{indicator} {message}")

# Usage
ComponentLogger.log("success", "Agent registered successfully")
ComponentLogger.log("error", "Failed to connect to database")
ComponentLogger.log("warning", "Using fallback configuration")
ComponentLogger.log("info", "Starting server on port 8000")
ComponentLogger.log("progress", "Loading agents...")
```

---

## Prohibited

The following are explicitly prohibited:

- Emoji characters (🚀, ✨, 🎉, 💡, 🔥, ⚡, etc.)
- Unicode emoticons (😀, 😎, 👍, etc.)
- Decorative Unicode that doesn't serve a functional purpose

Use only the standardized ASCII-based symbols defined in this document.
