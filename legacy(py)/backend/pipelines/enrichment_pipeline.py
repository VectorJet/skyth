import sys
import asyncio
from pathlib import Path
from typing import Any, AsyncGenerator

# Add backend to path
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
from backend.base_classes.basepipeline import BasePipeline

class EnrichmentPipeline(BasePipeline):
    """
    A demo pipeline that simulates data enrichment.
    """

    @property
    def name(self) -> str:
        return "enrichment_pipeline"
    
    @property
    def description(self) -> str:
        return "Takes a string input and appends a timestamp and status (mock enrichment)."

    async def run(self, initial_input: Any) -> AsyncGenerator[Any, None]:
        import time
        
        yield f"Starting enrichment for: {initial_input}...\n"
        await asyncio.sleep(0.5)
        
        # Simulating a multi-step process
        step_1 = f"Step 1: Cleaned data.\n"
        yield step_1
        await asyncio.sleep(0.5)
        
        step_2 = f"Step 2: Appended metadata (Timestamp: {time.time()}).\n"
        yield step_2
        await asyncio.sleep(0.5)
        
        final_output = f"Final Output: {initial_input} | Status: ENRICHED"
        yield final_output
