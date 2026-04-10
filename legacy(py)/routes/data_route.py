from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any, Optional
from backend.services.data_service import data_service

router = APIRouter(prefix="/api/data", tags=["data"])

@router.get("/export")
async def export_data(session_id: Optional[str] = None):
    return data_service.export_all_user_data(session_id)

@router.delete("/clear")
async def clear_data(session_id: Optional[str] = None):
    success = data_service.clear_all_data(session_id)
    if success:
        return {"success": True}
    raise HTTPException(status_code=500, detail="Failed to clear data")
