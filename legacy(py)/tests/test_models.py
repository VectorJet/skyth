#!/usr/bin/env python3
import asyncio
import os
import sys
from pathlib import Path

# Add project root to path (tests/../)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT))

try:
    from backend.converters.provider import Provider, generate_response
except ImportError as e:
    print(f"Error importing provider logic: {e}")
    sys.exit(1)

def load_env():
    env_file = PROJECT_ROOT / ".env"
    if env_file.exists():
        print(f"Loading .env from {env_file}...")
        with open(env_file, "r") as f:
            for line in f:
                if line.strip() and "=" in line and not line.startswith("#"):
                    k, v = line.strip().split("=", 1)
                    os.environ[k] = v

async def test_model(label: str, model_id: str):
    print(f"\n--- Testing {label} ({model_id}) ---")
    
    if not model_id:
        print("❌ No model configured.")
        return

    try:
        print(f"Sending request to {model_id}...")
        response = await generate_response(
            model_id=model_id,
            messages=[{"role": "user", "content": "Hello, are you working? Reply with 'Yes, I am working'."}]
        )
        
        content = response.choices[0].message.content
        print(f"✅ Success! Response: {content}")
        
    except Exception as e:
        print(f"❌ Failed: {e}")
        # Hint for common errors
        if "api_key" in str(e).lower():
            print("  -> Hint: Check your API key in .env")
        if "not found" in str(e).lower():
            print("  -> Hint: Check if the model name is correct in config.yml")

async def main():
    load_env()
    config = Provider.load_config()
    
    primary = config.get("model")
    small = config.get("small_model")
    
    await test_model("Primary Model", primary)
    await test_model("Small/Secondary Model", small)

if __name__ == "__main__":
    asyncio.run(main())
