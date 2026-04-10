import argparse
import importlib
import os
import subprocess
import sys
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# --- 1. Define Project Root and Update sys.path ---
# This ensures we always work with absolute paths
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

print(f"✅ Skyth Root Set to: {PROJECT_ROOT}")

FRONTEND_DIR = PROJECT_ROOT / "frontend"

app = FastAPI(title="Skyth Chatbot API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development convenience
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def register_routes(app: FastAPI, directory: str = "routes"):
    """
    Auto-detects and registers routes from the specified directory.
    Files must end with '_route.py' and contain an 'router' object.
    """
    # Resolve directory relative to PROJECT_ROOT to ensure absolute path
    routes_dir = PROJECT_ROOT / directory

    if not routes_dir.exists():
        print(f"Directory {routes_dir} not found. Creating it.")
        routes_dir.mkdir(parents=True, exist_ok=True)
        return

    # Walk through the directory
    for file_path in routes_dir.glob("*_route.py"):
        # Calculate module name relative to PROJECT_ROOT
        # e.g. /home/user/skyth/routes/chat_route.py -> routes.chat_route
        relative_path = file_path.relative_to(PROJECT_ROOT)
        module_name = ".".join(relative_path.with_suffix("").parts)

        try:
            # Import the module
            module = importlib.import_module(module_name)

            # Check for 'router' attribute
            if hasattr(module, "router"):
                app.include_router(module.router)
                print(f"Successfully registered route: {module_name}")
            else:
                print(
                    f"Warning: Module {module_name} does not have a 'router' attribute."
                )

        except Exception as e:
            print(f"Error loading module {module_name}: {e}")


@app.get("/")
async def root():
    return {"message": "Skyth Backend is running"}


# Register routes on startup
register_routes(app)


def start_frontend(port: int):
    """Start the Next.js frontend using bun in a subprocess."""
    if not FRONTEND_DIR.exists():
        print(f"Error: Frontend directory not found at {FRONTEND_DIR}")
        return

    try:
        subprocess.Popen(
            ["bun", "run", "dev", "--port", str(port)],
            cwd=str(FRONTEND_DIR),
            env={**os.environ, "PORT": str(port)},
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        print(f"Frontend started on http://localhost:{port}")
    except KeyboardInterrupt:
        print("\nFrontend stopped.")
    except FileNotFoundError:
        print("Error: bun not found. Please install bun.")
        print("Visit: https://bun.sh")
    except Exception as e:
        print(f"Error starting frontend: {e}")


if __name__ == "__main__":
    import threading
    import uvicorn

    parser = argparse.ArgumentParser(description="Start Skyth backend and frontend")
    parser.add_argument(
        "--port", type=int, default=8000, help="Port for backend server"
    )
    parser.add_argument(
        "--frontend-only",
        action="store_true",
        help="Start only the frontend",
    )
    parser.add_argument(
        "--backend-only",
        action="store_true",
        help="Start only the backend",
    )
    args = parser.parse_args()

    frontend_port = args.port if args.frontend_only else args.port + 1

    if args.frontend_only:
        start_frontend(frontend_port)
    elif args.backend_only:
        uvicorn.run("main:app", host="0.0.0.0", port=args.port, reload=True)
    else:

        def run_backend():
            uvicorn.run(
                "main:app",
                host="0.0.0.0",
                port=args.port,
                reload=False,
            )

        backend_thread = threading.Thread(target=run_backend, daemon=True)
        backend_thread.start()

        print(f"Starting frontend on port {frontend_port}...")
        start_frontend(frontend_port)

        backend_thread.join()
