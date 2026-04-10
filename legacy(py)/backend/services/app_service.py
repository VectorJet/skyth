# backend/services/app_service.py
import sqlite3
import json
from pathlib import Path
from typing import List, Dict, Optional, Any
from backend.database import get_db_connection

class AppService:
    @staticmethod
    def init_db():
        """Ensures the user_connected_apps table exists."""
        conn = get_db_connection()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_connected_apps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                app_name TEXT NOT NULL,
                connected_at REAL NOT NULL,
                UNIQUE(user_id, app_name)
            )
        """)
        conn.commit()
        conn.close()

    def get_connected_apps(self, user_id: str) -> List[str]:
        conn = get_db_connection()
        cursor = conn.execute(
            "SELECT app_name FROM user_connected_apps WHERE user_id = ?", 
            (str(user_id),)
        )
        rows = cursor.fetchall()
        conn.close()
        return [row["app_name"] for row in rows]

    def is_app_connected(self, user_id: str, app_name: str) -> bool:
        conn = get_db_connection()
        cursor = conn.execute(
            "SELECT 1 FROM user_connected_apps WHERE user_id = ? AND app_name = ?", 
            (str(user_id), app_name)
        )
        exists = cursor.fetchone()
        conn.close()
        return exists is not None

    def connect_app(self, user_id: str, app_name: str) -> bool:
        import time
        conn = get_db_connection()
        try:
            conn.execute(
                "INSERT OR IGNORE INTO user_connected_apps (user_id, app_name, connected_at) VALUES (?, ?, ?)",
                (str(user_id), app_name, time.time())
            )
            conn.commit()
            return True
        except Exception as e:
            print(f"Error connecting app: {e}")
            return False
        finally:
            conn.close()

    def disconnect_app(self, user_id: str, app_name: str) -> bool:
        conn = get_db_connection()
        try:
            conn.execute(
                "DELETE FROM user_connected_apps WHERE user_id = ? AND app_name = ?",
                (str(user_id), app_name)
            )
            conn.commit()
            return True
        except Exception as e:
            print(f"Error disconnecting app: {e}")
            return False
        finally:
            conn.close()
