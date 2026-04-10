# backend/services/auth_service.py
import re
import psycopg2
import psycopg2.extras
from werkzeug.security import check_password_hash
from typing import Dict, Any, Optional

from backend.database import get_db_connection
from backend.services.utils import (
    EMAIL_REGEX,
    MAX_CUSTOM_PERSONALITY_CHARS,
    sanitize_html,
)


class AuthService:
    def _ensure_user_profile(self, cursor, user_id: int):
        """Helper to create a default profile for a user if it doesn't exist."""
        cursor.execute(
            "SELECT user_id FROM user_profiles WHERE user_id = %s", (user_id,)
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO user_profiles (user_id) VALUES (%s)", (user_id,)
            )

    def is_username_taken(
        self, username: str, user_id_to_exclude: Optional[int] = None
    ) -> bool:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                if user_id_to_exclude:
                    cur.execute(
                        "SELECT id FROM users WHERE username = %s AND id != %s",
                        (username, user_id_to_exclude),
                    )
                else:
                    cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                return cur.fetchone() is not None
        finally:
            conn.close()

    def register_user(self, username: str, password_hash: str) -> Optional[int]:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO users (username, password_hash, is_onboarded) VALUES (%s, %s, %s) RETURNING id",
                    (username, password_hash, False),
                )
                user_id = cur.fetchone()[0]
                self._ensure_user_profile(cur, user_id)
            conn.commit()
            return user_id
        except (Exception, psycopg2.Error) as e:
            print(f"🔴 [AuthService] Error registering user: {e}")
            conn.rollback()
            return None
        finally:
            conn.close()

    def authenticate_user(
        self, username: str, password: str
    ) -> Optional[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                cur.execute(
                    "SELECT id, password_hash FROM users WHERE username = %s",
                    (username,),
                )
                user = cur.fetchone()
                if (
                    user
                    and user["password_hash"]
                    and check_password_hash(user["password_hash"], password)
                ):
                    return dict(user)
                return None
        finally:
            conn.close()

    def get_user_with_profile(self, user_id: int) -> Optional[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                self._ensure_user_profile(cur, user_id)
                cur.execute(
                    """
                    SELECT 
                        u.id, u.username, u.avatar_url, u.is_onboarded,
                        p.color_scheme, p.accent_color, p.preferred_language, p.email,
                        p.enable_customisation, p.skyth_personality, p.custom_personality,
                        p.occupation, p.about_user
                    FROM users u
                    LEFT JOIN user_profiles p ON u.id = p.user_id
                    WHERE u.id = %s
                """,
                    (user_id,),
                )
                user_data = cur.fetchone()
                return dict(user_data) if user_data else None
        except (Exception, psycopg2.Error) as e:
            print(
                f"🔴 [AuthService] Error getting user profile for user {user_id}: {e}"
            )
            return None
        finally:
            conn.close()

    def update_user_profile(
        self, user_id: int, updates: Dict[str, Any], current_username: str
    ) -> bool:
        user_fields = {"username", "is_onboarded"}
        profile_fields = {
            "color_scheme",
            "accent_color",
            "preferred_language",
            "email",
            "enable_customisation",
            "skyth_personality",
            "custom_personality",
            "occupation",
            "about_user",
        }

        if "username" in updates:
            new_username = updates["username"]
            if len(new_username) < 3:
                raise ValueError("Username must be at least 3 characters.")
            if new_username != current_username and self.is_username_taken(
                new_username, user_id
            ):
                raise ValueError("Username is already taken.")

        if (
            "email" in updates
            and updates["email"]
            and not re.fullmatch(EMAIL_REGEX, updates["email"])
        ):
            raise ValueError("Invalid email format.")

        if "custom_personality" in updates and updates["custom_personality"]:
            if len(updates["custom_personality"]) > MAX_CUSTOM_PERSONALITY_CHARS:
                raise ValueError("Custom personality exceeds maximum length.")
            updates["custom_personality"] = sanitize_html(updates["custom_personality"])

        if "occupation" in updates:
            updates["occupation"] = sanitize_html(updates["occupation"])
        if "about_user" in updates:
            updates["about_user"] = sanitize_html(updates["about_user"])

        user_updates = {k: v for k, v in updates.items() if k in user_fields}
        profile_updates = {k: v for k, v in updates.items() if k in profile_fields}

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                if user_updates:
                    set_clause = ", ".join([f"{key} = %s" for key in user_updates])
                    params = list(user_updates.values()) + [user_id]
                    cur.execute(f"UPDATE users SET {set_clause} WHERE id = %s", params)

                if profile_updates:
                    self._ensure_user_profile(cur, user_id)
                    set_clause = ", ".join([f"{key} = %s" for key in profile_updates])
                    params = list(profile_updates.values()) + [user_id]
                    cur.execute(
                        f"UPDATE user_profiles SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE user_id = %s",
                        params,
                    )

            conn.commit()
            return True
        except (Exception, psycopg2.Error) as e:
            print(f"🔴 [AuthService] Error updating profile for user {user_id}: {e}")
            conn.rollback()
            if isinstance(e, psycopg2.IntegrityError):
                raise ValueError("A value you entered (like email) is already in use.")
            return False
        finally:
            conn.close()

    def update_avatar_url(self, user_id: int, avatar_url: Optional[str]) -> bool:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE users SET avatar_url = %s WHERE id = %s",
                    (avatar_url, user_id),
                )
            conn.commit()
            return True
        except (Exception, psycopg2.Error) as e:
            print(f"🔴 [AuthService] Error updating avatar for user {user_id}: {e}")
            conn.rollback()
            return False
        finally:
            conn.close()
