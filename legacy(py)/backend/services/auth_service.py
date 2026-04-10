# backend/services/auth_service.py
import sqlite3
import uuid
import time
import bcrypt
import json
import jwt
import datetime
from typing import Optional, Dict, Any
from backend.database import get_db_connection, init_db

SECRET_KEY = "supersecretkey_dev_only" # In production, use env var
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 24 hours

class AuthService:
    def __init__(self):
        # Ensure tables exist
        init_db()

    def create_access_token(self, data: dict, expires_delta: Optional[datetime.timedelta] = None):
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.datetime.utcnow() + expires_delta
        else:
            expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt

    def decode_token(self, token: str) -> Optional[Dict[str, Any]]:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except jwt.PyJWTError:
            return None

    def register_user(self, username: str, password: str, email: Optional[str] = None) -> Dict[str, Any]:
        """Registers a new user."""
        conn = get_db_connection()
        try:
            # Check if username exists
            cursor = conn.execute("SELECT 1 FROM users WHERE username = ?", (username,))
            if cursor.fetchone():
                raise ValueError("Username already taken")

            # Hash password
            # encode password to bytes, salt and hash
            pwd_bytes = password.encode('utf-8')
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw(pwd_bytes, salt)
            
            user_id = str(uuid.uuid4())
            now = time.time()
            
            conn.execute(
                "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (user_id, username, hashed.decode('utf-8'), now)
            )
            
            # Create default profile
            conn.execute(
                "INSERT INTO user_profiles (user_id, email) VALUES (?, ?)",
                (user_id, email)
            )
            
            conn.commit()
            return {"user_id": user_id, "username": username}
            
        finally:
            conn.close()

    def authenticate_user(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        """Authenticates a user and returns user info if successful."""
        conn = get_db_connection()
        try:
            cursor = conn.execute(
                "SELECT id, username, password_hash, avatar_url FROM users WHERE username = ?", 
                (username,)
            )
            user = cursor.fetchone()
            
            if not user:
                return None
                
            stored_hash = user["password_hash"].encode('utf-8')
            if bcrypt.checkpw(password.encode('utf-8'), stored_hash):
                return {
                    "id": user["id"],
                    "username": user["username"],
                    "avatar_url": user["avatar_url"]
                }
            return None
        finally:
            conn.close()

    def get_user_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            cursor = conn.execute("""
                SELECT u.id, u.username, u.avatar_url, u.is_onboarded, p.email, p.full_name, p.bio, p.preferences
                FROM users u
                LEFT JOIN user_profiles p ON u.id = p.user_id
                WHERE u.id = ?
            """, (user_id,))
            
            row = cursor.fetchone()
            if not row:
                return None
            
            data = dict(row)
            # Ensure boolean
            data["is_onboarded"] = bool(data["is_onboarded"])
            # Parse preferences if stored as JSON string
            if data.get("preferences"):
                try:
                    data["preferences"] = json.loads(data["preferences"])
                except:
                    pass
            return data
        finally:
            conn.close()

    def update_user_profile(self, user_id: str, updates: Dict[str, Any]) -> bool:
        conn = get_db_connection()
        try:
            # Separate user table updates and profile table updates
            user_fields = ["avatar_url", "is_onboarded", "username"]
            profile_fields = ["email", "full_name", "bio", "preferences"]
            
            user_updates = {k: v for k, v in updates.items() if k in user_fields}
            profile_updates = {k: v for k, v in updates.items() if k in profile_fields}
            
            if user_updates:
                set_clause = ", ".join([f"{k} = ?" for k in user_updates.keys()])
                values = list(user_updates.values()) + [user_id]
                conn.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
                
            if profile_updates:
                # Handle preferences JSON serialization
                if "preferences" in profile_updates and isinstance(profile_updates["preferences"], dict):
                     profile_updates["preferences"] = json.dumps(profile_updates["preferences"])

                set_clause = ", ".join([f"{k} = ?" for k in profile_updates.keys()])
                values = list(profile_updates.values()) + [user_id]
                # Upsert profile logic implicitly handled by initial insert in register
                conn.execute(f"UPDATE user_profiles SET {set_clause} WHERE user_id = ?", values)
                
            conn.commit()
            return True
        except Exception as e:
            print(f"Error updating profile: {e}")
            return False
        finally:
            conn.close()
