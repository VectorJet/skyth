# backend/database.py
import psycopg2
import psycopg2.extras
from config import DATABASE_URL


def get_db_connection():
    """Establishes a connection to the PostgreSQL database."""
    conn = psycopg2.connect(DATABASE_URL)
    return conn


def init_db():
    """Initializes and migrates the database schema to include authentication, personalization, and message versioning."""
    base_schema = """
    -- Enable required extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        avatar_url TEXT,
        is_onboarded BOOLEAN DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS user_profiles (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS chats (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title TEXT,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS episodic_memory (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT,
        final_data_json JSONB,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS user_connected_apps (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        app_name TEXT NOT NULL,
        connected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, app_name)
    );
    """

    versioning_schema = """
    -- Add versioning columns to episodic_memory if they don't exist
    ALTER TABLE episodic_memory ADD COLUMN IF NOT EXISTS parent_message_id INTEGER REFERENCES episodic_memory(id) ON DELETE SET NULL;
    ALTER TABLE episodic_memory ADD COLUMN IF NOT EXISTS message_group_uuid UUID;
    ALTER TABLE episodic_memory ADD COLUMN IF NOT EXISTS version INTEGER;
    ALTER TABLE episodic_memory ADD COLUMN IF NOT EXISTS is_active BOOLEAN;

    -- Create indexes for performance if they don't exist
    CREATE INDEX IF NOT EXISTS idx_episodic_memory_parent_id ON episodic_memory(parent_message_id);
    CREATE INDEX IF NOT EXISTS idx_episodic_memory_group_uuid ON episodic_memory(message_group_uuid);
    CREATE INDEX IF NOT EXISTS idx_episodic_memory_chat_id_active ON episodic_memory(chat_id, is_active);
    """

    search_indexes = """
    CREATE INDEX IF NOT EXISTS idx_chats_title_trgm ON chats USING gin (title gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_episodic_memory_content_trgm ON episodic_memory USING gin (content gin_trgm_ops);
    -- NEW: Index for searching the content within the JSONB field for AI responses
    CREATE INDEX IF NOT EXISTS idx_episodic_memory_json_content_trgm ON episodic_memory USING gin ((final_data_json ->> 'content') gin_trgm_ops);
    """

    migration_logic = """
    -- Set defaults for new columns on existing data where they are NULL
    UPDATE episodic_memory SET version = 1 WHERE version IS NULL;
    UPDATE episodic_memory SET is_active = TRUE WHERE is_active IS NULL;
    UPDATE episodic_memory SET message_group_uuid = uuid_generate_v4() WHERE message_group_uuid IS NULL;

    -- Now that defaults are set, make columns NOT NULL
    ALTER TABLE episodic_memory ALTER COLUMN version SET NOT NULL;
    ALTER TABLE episodic_memory ALTER COLUMN is_active SET NOT NULL;
    ALTER TABLE episodic_memory ALTER COLUMN message_group_uuid SET NOT NULL;

    -- Populate parent_message_id for existing linear chats in a temporary table
    CREATE TEMP TABLE parent_mapping AS
    WITH message_order AS (
        SELECT
            id,
            chat_id,
            LAG(id, 1) OVER (PARTITION BY chat_id ORDER BY timestamp, id) as prev_message_id
        FROM
            episodic_memory
    )
    SELECT id, prev_message_id FROM message_order WHERE prev_message_id IS NOT NULL;

    -- Update based on the temporary table
    UPDATE episodic_memory em
    SET parent_message_id = pm.prev_message_id
    FROM parent_mapping pm
    WHERE em.id = pm.id AND em.parent_message_id IS NULL;

    DROP TABLE parent_mapping;
    """

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(base_schema)
            cur.execute(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;"
            )
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;")
            cur.execute(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN DEFAULT FALSE;"
            )
            cur.execute(
                "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS color_scheme TEXT DEFAULT 'system';"
            )
            cur.execute(
                "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT 'blue';"
            )
            cur.execute(
                "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en-US';"
            )
            cur.execute(
                "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;"
            )
            cur.execute(
                "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS enable_customisation BOOLEAN DEFAULT FALSE;"
            )
            cur.execute(
                "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS skyth_personality TEXT DEFAULT 'default';"
            )
            cur.execute(
                "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS custom_personality TEXT;"
            )
            cur.execute(
                "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS occupation TEXT;"
            )
            cur.execute(
                "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS about_user TEXT;"
            )
            cur.execute(
                "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;"
            )
            cur.execute(
                "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;"
            )
            cur.execute("SELECT id FROM users WHERE id = %s", (1,))
            user = cur.fetchone()
            if not user:
                cur.execute(
                    "INSERT INTO users (id, username, is_onboarded) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
                    (1, "default_user", False),
                )
            cur.execute("SELECT user_id FROM user_profiles WHERE user_id = %s", (1,))
            profile = cur.fetchone()
            if not profile:
                cur.execute(
                    "INSERT INTO user_profiles (user_id) VALUES (%s) ON CONFLICT (user_id) DO NOTHING",
                    (1,),
                )
            cur.execute("SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));")
            cur.execute(versioning_schema)
            cur.execute(search_indexes)
            conn.commit()
            cur.execute(migration_logic)
            conn.commit()
        print("✅ Database schema verified and migrated.")
    except psycopg2.Error as e:
        print(f"🔴 Database initialization error: {e}")
        if "conn" in locals() and conn:
            conn.rollback()
    finally:
        if "conn" in locals() and conn:
            conn.close()
