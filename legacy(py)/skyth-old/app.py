# app.py

import os
import glob
import importlib
import click
import psycopg2
from quart import Blueprint
from quart_cors import cors

# --- Shared Components ---
from shared import app

# --- Database Functions (Imported directly from source) ---
from backend.database import init_db, get_db_connection

print(" INITIALIZING SKYTH ENGINE v0.4.0 (Quart Async)...")

# --- CORS SETUP ---
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
app = cors(
    app,
    allow_origin=FRONTEND_URL,
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=True,
)

# ==============================================================================
# DYNAMIC ROUTE DISCOVERY & REGISTRATION
# ==============================================================================
print("🗺️  Discovering and registering API routes...")
route_files = glob.glob("routes/*_routes.py")
for route_file in route_files:
    module_name = route_file.replace(os.sep, ".")[:-3]
    try:
        module = importlib.import_module(module_name)
        for item_name in dir(module):
            item = getattr(module, item_name)
            if isinstance(item, click.core.Command):  # For CLI commands
                app.cli.add_command(item)
            elif isinstance(item, Blueprint) and item.name.endswith(
                "_bp"
            ):  # For Blueprints
                app.register_blueprint(item)
                print(f"   - Registered Blueprint: {item.name} from {module_name}")
    except Exception as e:
        print(f"🔴 Failed to load or register routes from {module_name}: {e}")


# ==============================================================================
# DATABASE CLI COMMANDS
# ==============================================================================
@app.cli.command("init-db")
def init_db_command():
    """Initializes the database schema."""
    init_db()
    click.echo("✅ Database initialized.")


@app.cli.command("clear-db")
@click.option(
    "--yes",
    is_flag=True,
    callback=lambda c, p, v: v or c.abort(),
    expose_value=False,
    prompt="Are you sure you want to delete all data? This cannot be undone.",
)
def clear_db_command():
    """Clears all data from the database by dropping all tables."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            click.echo("Dropping all tables...")
            tables = [
                "user_connected_apps",
                "episodic_memory",
                "chats",
                "user_profiles",
                "users",
            ]
            for table in tables:
                try:
                    cur.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")
                    click.echo(f"   - Dropped table '{table}'")
                except psycopg2.Error as e:
                    click.echo(f"   - Could not drop table '{table}': {e}")
                    conn.rollback()
            conn.commit()
        click.echo("✅ All tables dropped successfully.")
    except Exception as e:
        click.echo(f"🔴 An error occurred: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    import hypercorn.asyncio
    from hypercorn.config import Config
    import asyncio

    port = int(os.getenv("PORT", 5000))

    config = Config()
    config.bind = [f"0.0.0.0:{port}"]
    config.use_reloader = True

    print(f"🚀 Starting Hypercorn server on http://0.0.0.0:{port}")
    # To enable reloading, we must pass the module path string, not the app object
    asyncio.run(hypercorn.asyncio.serve(app, config))
