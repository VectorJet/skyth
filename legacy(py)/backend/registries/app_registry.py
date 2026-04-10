import sys
from typing import Dict, Any, Optional
from pathlib import Path

# Calculate Absolute Project Root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from backend.base_classes.baseapp import BaseApp

# Concrete implementation for discovery purposes
class GenericApp(BaseApp):
    pass

class AppRegistry:
    _apps: Dict[str, BaseApp] = {}

    @classmethod
    def register(cls, manifest_path: str):
        """Register an app from its manifest path."""
        try:
            # We store the absolute path
            app = GenericApp(manifest_path=manifest_path)
            cls._apps[app.name] = app
            print(f"[AppRegistry] Registered: {app.name}")
        except Exception as e:
            print(f"[AppRegistry] Failed to register app at {manifest_path}: {e}")

    @classmethod
    def discover(cls, root_dir: str = "backend"):
        """
        Recursively searches for 'app_manifest.json'.
        """
        scan_path = (PROJECT_ROOT / root_dir).resolve()
        print(f"[AppRegistry] Scanning {scan_path} for apps...")
        
        if not scan_path.exists():
            return

        for file_path in scan_path.rglob("app_manifest.json"):
            # Pass absolute string path to register
            cls.register(str(file_path.resolve()))

    @classmethod
    def get_app(cls, name: str) -> Optional[BaseApp]:
        return cls._apps.get(name)

    @classmethod
    def list_apps(cls) -> Dict[str, Any]:
        return {name: {"icon": app.icon_url, "mcp": app.use_mcp} for name, app in cls._apps.items()}