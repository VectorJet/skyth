#!/usr/bin/env python3
import asyncio
import os
import sys
from pathlib import Path

# Add project root to path
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

async def test_thinking(model_id: str):
    print(f"\n--- Testing Thinking/Reasoning with {model_id} ---")
    
    if not model_id:
        print("❌ No model configured.")
        return

    # A math problem that typically benefits from Chain-of-Thought
    prompt = "Solve this: A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost?"
    
    messages = [{"role": "user", "content": prompt}]

    try:
        print(f"Sending request to {model_id}...")
        response = await generate_response(
            model_id=model_id,
            messages=messages,
            stream=True
        )
        
        print("\nResponse Stream:")
        print("-" * 20)
        
        reasoning_buffer = ""
        content_buffer = ""
        
        async for chunk in response:
            if not chunk.choices:
                continue
                
            delta = chunk.choices[0].delta
            
            # 1. Capture structured reasoning (DeepSeek R1 / OpenAI o1/o3 via LiteLLM)
            if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                text = delta.reasoning_content
                print(f"\033[90m{text}\033[0m", end="", flush=True) # Gray color
                reasoning_buffer += text
            
            # 2. Capture standard content (may contain <think> tags for some models)
            if delta.content:
                text = delta.content
                # Heuristic visualization for <think> tags in content
                if "<think>" in text:
                    text = text.replace("<think>", "\033[90m<think>")
                if "</think>" in text:
                    text = text.replace("</think>", "</think>\033[0m")
                
                print(text, end="", flush=True)
                content_buffer += text

        print("\n" + "-" * 20)
        print("\n--- Summary ---")
        
        has_thinking = False
        if reasoning_buffer:
            print(f"✅ Structured Reasoning Detected ({len(reasoning_buffer)} chars)")
            has_thinking = True
        elif "<think>" in content_buffer:
            print(f"✅ Tag-based Reasoning Detected in content")
            has_thinking = True
        
        # Check answer correctness
        # Correct answer is $0.05 or 5 cents
        if "0.05" in content_buffer or "5 cents" in content_buffer.lower():
             print("✅ Answer appears correct ($0.05)")
        else:
             print("⚠️ Answer check failed (Expected $0.05). Check the output above.")

        if not has_thinking:
            print("ℹ️ No explicit thinking/reasoning blocks detected. (Model might not support it or used internal CoT)")

    except Exception as e:
        print(f"❌ Failed: {e}")
        # import traceback
        # traceback.print_exc()

async def main():
    load_env()
    config = Provider.load_config()
    
    # Allow user to pass model arg, otherwise use default
    import sys
    model = sys.argv[1] if len(sys.argv) > 1 else config.get("model")
    
    await test_thinking(model)

if __name__ == "__main__":
    asyncio.run(main())
