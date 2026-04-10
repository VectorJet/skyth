import asyncio
import sys
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from backend.memory.memory_manager import SkythMemory

def test_mem0_integration():
    print("--- Testing Mem0 Integration ---")
    
    try:
        mem = SkythMemory.get_instance()
        print("PASS: Initialized SkythMemory")
        
        user_id = "test_user"
        
        # 1. Add Memory
        messages = [
            {"role": "user", "content": "My favorite color is blue."},
            {"role": "assistant", "content": "Noted, your favorite color is blue."}
        ]
        print("Adding memory...")
        mem.add(messages, user_id=user_id)
        print("PASS: Added memory")
        
        # 2. Search Memory
        query = "What is my favorite color?"
        print(f"Searching for: '{query}'...")
        results = mem.search(query, user_id=user_id)
        
        print(f"Results: {results}")
        
        found = False
        for res in results:
            if "blue" in str(res).lower():
                found = True
                break
        
        if found:
            print("PASS: Retrieved relevant memory (blue)")
        else:
            print("FAIL: Did not retrieve 'blue'")
            
    except Exception as e:
        print(f"FAIL: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_mem0_integration()