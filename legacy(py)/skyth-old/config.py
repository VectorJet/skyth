import os
from quart import Quart
from dotenv import load_dotenv

# ==============================================================================
# INITIAL SETUP
# ==============================================================================
load_dotenv()
app = Quart(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "a-secret-key-for-self-hosting")

# --- NEW: Secret key for signing JSON Web Tokens ---
app.config["JWT_SECRET_KEY"] = os.getenv(
    "JWT_SECRET_KEY", "a-super-secret-jwt-key-that-is-long-and-secure"
)

# --- UPLOAD CONFIGURATION ---
app.config["UPLOAD_FOLDER"] = os.getenv("UPLOAD_FOLDER", "uploads")
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB limit

# ==============================================================================
# DATABASE SETUP (UPGRADED TO POSTGRESQL)
# ==============================================================================
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print(
        "🔴 CRITICAL WARNING: DATABASE_URL environment variable not found. App cannot connect to the database."
    )

# ==============================================================================
# REDIS SETUP (FOR CACHING ONLY)
# ==============================================================================
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB_CACHE = int(os.getenv("REDIS_DB_CACHE", 0))  # For application caching

# ==============================================================================
# AI MODEL CONFIGURATION
# ==============================================================================
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("🔴 CRITICAL WARNING: GEMINI_API_KEY environment variable not found.")

IMAGE_GENERATION_API_KEY = os.getenv("IMAGE_GENERATION_API_KEY", GEMINI_API_KEY)

# --- FIX: Correct model names with 'models/' prefix for the Python SDK ---
UTILITY_MODEL = "models/gemma-3-27b-it"

CONVERSATIONAL_MODELS = {
    "lite": "models/gemini-2.5-flash-lite",
    "flash": "models/gemini-2.5-flash",
    "pro": "models/gemini-2.5-pro",
}
AGENT_MODEL = CONVERSATIONAL_MODELS["lite"]
IMAGE_GENERATION_MODEL = "models/gemini-2.0-preview-image-generation"

print("✅ Config Loaded (Quart Async Mode):")
print(f"   - JWT Key Loaded: {'Yes' if app.config['JWT_SECRET_KEY'] else 'NO'}")
print(f"   - Utility/Routing Model: {UTILITY_MODEL}")
print(f"   - Default Agent Model: {AGENT_MODEL}")
print(f"   - Gemini Key Loaded: {'Yes' if GEMINI_API_KEY else 'NO'}")
print(f"   - Database URL Loaded: {'Yes' if DATABASE_URL else 'NO'}")
print(f"   - Redis for Cache: {REDIS_HOST}:{REDIS_PORT}/{REDIS_DB_CACHE}")
print(f"   - Upload Folder: {app.config['UPLOAD_FOLDER']}")
