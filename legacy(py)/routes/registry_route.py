import sys
from pathlib import Path
from fastapi import APIRouter

# Add backend to path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from backend.registries.tool_registry import ToolRegistry
from backend.registries.pipeline_registry import PipelineRegistry
from backend.registries.app_registry import AppRegistry
from backend.registries.agent_registry import AgentRegistry

router = APIRouter(prefix="/api/registry", tags=["registry"])

def startup_scan():
    """Run discovery for all registries on startup."""
    print("--- 🔍 Starting Registry Discovery ---")
    ToolRegistry.discover()
    PipelineRegistry.discover()
    AppRegistry.discover()
    AgentRegistry.discover()
    print("--- ✅ Registry Discovery Complete ---")

# Trigger scan immediately on import (Startup)
startup_scan()

@router.get("/status")
async def get_registry_status():
    """Returns a summary of all registered components."""
    return {
        "tools": ToolRegistry.list_tools(),
        "pipelines": PipelineRegistry.list_pipelines(),
        "apps": AppRegistry.list_apps(),
        "agents": AgentRegistry.list_agents()
    }

@router.post("/refresh")
async def refresh_registries():
    """Forces a re-scan of the backend directory."""
    startup_scan()
    return {"status": "Registries refreshed successfully"}