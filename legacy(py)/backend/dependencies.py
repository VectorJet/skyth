from fastapi import Header, HTTPException
from typing import Optional
from backend.services.auth_service import AuthService

auth_service = AuthService()

async def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authentication")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authentication scheme")
    
    token = authorization.split(" ")[1]
    payload = auth_service.decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
        
    return payload["sub"]
