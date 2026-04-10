import sys
from typing import List, Dict, Any, Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

# Add backend to path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from backend.services.app_service import AppService
from backend.registries.app_registry import AppRegistry
from backend.dependencies import get_current_user_id

router = APIRouter(prefix="/api", tags=["apps"])
app_service = AppService()

# Initialize DB table for apps
app_service.init_db()

# --- Pydantic Models ---
class ConnectAppRequest(BaseModel):
    app_name: str

class AppInfo(BaseModel):
    name: str
    description: str = ""
    icon_url: str = ""
    mcp_server_id: Optional[str] = None
    is_connected: bool = False

# --- Routes ---

@router.get("/apps", response_model=List[AppInfo])
async def get_available_apps(user_id: str = Depends(get_current_user_id)):
    """List all apps and their connection status for the current user."""
    
    # Ensure apps are discovered
    AppRegistry.discover()
    
    # Get all apps from registry
    registry_apps = AppRegistry.list_apps() 
    
    connected_apps = app_service.get_connected_apps(user_id)
    
    result = []
    for name, info in registry_apps.items():
        app_obj = AppRegistry.get_app(name)
        
        mcp_val = info.get("mcp")
        # If mcp_val is a boolean (e.g. False), we treat it as None for the ID
        mcp_id = mcp_val if isinstance(mcp_val, str) else None

        result.append(AppInfo(
            name=name,
            description=app_obj.description if app_obj else "",
            icon_url=info.get("icon", ""),
            mcp_server_id=mcp_id,
            is_connected=(name in connected_apps)
        ))
        
    return result

@router.post("/user/apps/connect")
async def connect_user_app(request: ConnectAppRequest, user_id: str = Depends(get_current_user_id)):
    
    # Verify app exists
    if not AppRegistry.get_app(request.app_name):
        raise HTTPException(status_code=404, detail=f"App '{request.app_name}' not found")
        
    success = app_service.connect_app(user_id, request.app_name)
    if success:
        return {"success": True}
    raise HTTPException(status_code=500, detail="Failed to connect app")

@router.post("/user/apps/disconnect")
async def disconnect_user_app(request: ConnectAppRequest, user_id: str = Depends(get_current_user_id)):
    
    success = app_service.disconnect_app(user_id, request.app_name)
    if success:
        return {"success": True}
    raise HTTPException(status_code=500, detail="Failed to disconnect app")
