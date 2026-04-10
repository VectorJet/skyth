# backend/database.py
import sqlite3
import os
from pathlib import Path

# Use absolute path for DB to avoid issues with CWD
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "chat_memory.db"

def get_db_connection():
    """Establishes a connection to the SQLite database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes common tables."""
    conn = get_db_connection()
    try:
        # User Connected Apps (from app_service migration)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_connected_apps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                app_name TEXT NOT NULL,
                connected_at REAL NOT NULL,
                UNIQUE(user_id, app_name)
            )
        """)
        
        # Messages (from chat_route migration)
        # Check if table exists
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
        if not cursor.fetchone():
            conn.execute("""
                CREATE TABLE messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    reasoning TEXT,
                    model TEXT,
                    timestamp REAL NOT NULL
                )
            """)
        
        # Users (Auth Migration)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                avatar_url TEXT,
                is_onboarded BOOLEAN DEFAULT 0,
                created_at REAL NOT NULL
            )
        """)
        
        # User Profiles (Auth Migration)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id TEXT PRIMARY KEY,
                email TEXT,
                full_name TEXT,
                bio TEXT,
                preferences TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        """)
        
        conn.commit()
    finally:
        conn.close()
