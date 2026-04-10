#!/usr/bin/env python3
import asyncio
import sys
import os
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT))

from backend.registries.pipeline_registry import PipelineRegistry

# --- SYSTEM PROMPT ---
# Pipelines generally run deterministically in code, but if we add LLM-based pipelines later,
# we would add a prompt here. For now, this tests the Registry/Code logic.

async def test_pipelines():
    print("\n--- Testing Pipeline Registry ---")
    
    # 1. Discover
    print("🔍 Scanning for pipelines...")
    PipelineRegistry.discover("backend")
    
    pipelines = PipelineRegistry.list_pipelines()
    if not pipelines:
        print("❌ No pipelines found!")
        return
        
    print(f"✅ Found {len(pipelines)} pipelines: {list(pipelines.keys())}")
    
    # 2. Run Enrichment Pipeline (if it exists)
    target = "enrichment_pipeline"
    if target in pipelines:
        print(f"\n🏃 Running '{target}'...")
        pipeline_instance = PipelineRegistry.get_pipeline(target)
        
        try:
            input_data = "user_test_data"
            result = await pipeline_instance.run(input_data)
            print(f"  -> Input:  {input_data}")
            print(f"  -> Output: {result}")
            
            if "ENRICHED" in str(result):
                print(f"✅ Pipeline '{target}' passed execution test.")
            else:
                print(f"⚠️ Pipeline '{target}' ran but output was unexpected.")
        except Exception as e:
            print(f"❌ Pipeline execution failed: {e}")
    else:
        print(f"⚠️ Skipping execution test: '{target}' not found.")

if __name__ == "__main__":
    asyncio.run(test_pipelines())