from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
import sys
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from backend.services.auth_service import AuthService
from backend.dependencies import get_current_user_id

router = APIRouter(prefix="/api/user", tags=["user"])
auth_service = AuthService()

# --- Pydantic Models ---
class UpdateProfileRequest(BaseModel):
    avatar_url: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    bio: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None
    is_onboarded: Optional[bool] = None

class UserProfileResponse(BaseModel):
    id: str
    username: str
    avatar_url: Optional[str]
    email: Optional[str]
    full_name: Optional[str]
    bio: Optional[str]
    preferences: Optional[Dict[str, Any]]
    is_onboarded: bool = False

@router.get("/profile", response_model=UserProfileResponse)
async def get_current_user_profile(user_id: str = Depends(get_current_user_id)):
    profile = auth_service.get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return profile

@router.put("/profile", response_model=UserProfileResponse)
async def update_current_user_profile(request: UpdateProfileRequest, user_id: str = Depends(get_current_user_id)):
    updates = request.model_dump(exclude_unset=True)
    success = auth_service.update_user_profile(user_id, updates)
    if success:
        # Fetch and return the updated profile
        updated_profile = auth_service.get_user_profile(user_id)
        if updated_profile:
            return updated_profile
    raise HTTPException(status_code=500, detail="Failed to update profile")

@router.get("/greeting")
async def get_user_greeting():
    """Returns a personalized greeting for the user."""
    # In a real app, logic could depend on time of day, user name, etc.
    return {"greeting": "Hello, Human!"}
