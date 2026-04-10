from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
import sys
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from backend.services.auth_service import AuthService

router = APIRouter(prefix="/api/auth", tags=["auth"])
auth_service = AuthService()

# --- Pydantic Models ---
class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[EmailStr] = None

class LoginRequest(BaseModel):
    username: str
    password: str

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

# --- Helpers ---
# In a real app, use JWT tokens. For migration demo, we return raw user info or ID.
# Middleware should validate tokens and populate 'current_user'.
# For now, we mimic the behavior with simple endpoints.

@router.post("/register")
async def register(request: RegisterRequest):
    try:
        user = auth_service.register_user(request.username, request.password, request.email)
        access_token = auth_service.create_access_token(data={"sub": user["user_id"]})
        return {"success": True, "user": user, "access_token": access_token}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Registration failed")

@router.post("/login")
async def login(request: LoginRequest):
    user = auth_service.authenticate_user(request.username, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = auth_service.create_access_token(data={"sub": user["id"]})
    return {"success": True, "user": user, "access_token": access_token}

@router.get("/profile/{user_id}", response_model=UserProfileResponse)
async def get_profile(user_id: str):
    # Determine if requesting own profile or public
    profile = auth_service.get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return profile

@router.put("/profile/{user_id}")
async def update_profile(user_id: str, request: UpdateProfileRequest):
    # In production: Verify current_user.id == user_id
    updates = request.model_dump(exclude_unset=True)
    success = auth_service.update_user_profile(user_id, updates)
    if success:
        return {"success": True}
    raise HTTPException(status_code=500, detail="Failed to update profile")

