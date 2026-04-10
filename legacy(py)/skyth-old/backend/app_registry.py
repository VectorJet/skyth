# backend/app_registry.py
import json
from pathlib import Path
from typing import List, Dict, Any, Optional


class AppModule:
    """A data class representing a discovered application module."""

    def __init__(self, path: Path, manifest: Dict[str, Any]):
        self.path = path
        self.manifest = manifest
        self.name: str = manifest.get("name", "Unknown App")
        self.description: str = manifest.get("description", "")
        self.icon_url: str = manifest.get("icon_url", "")
        self.mcp_config_path: Optional[str] = manifest.get("mcp_config_path")

    def to_dict(self):
        mcp_server_id = None
        if self.mcp_config_path:
            try:
                with open(self.path / self.mcp_config_path, "r") as f:
                    config = json.load(f)
                    mcp_server_id = next(iter(config.get("mcpServers", {})), None)
            except Exception:
                pass
        return {
            "name": self.name,
            "description": self.description,
            "icon_url": self.icon_url,
            "mcp_server_id": mcp_server_id,
        }


class AppRegistry:
    """
    A registry for discovering and managing self-contained app modules.
    """

    def __init__(self, apps_dir: str = "backend/apps"):
        self.apps_dir = Path(apps_dir).resolve()  # Resolve to an absolute path
        self.apps: Dict[str, AppModule] = {}
        self._discover_apps()

    def _discover_apps(self):
        """Discovers apps by scanning for app_manifest.json in subdirectories."""
        if not self.apps_dir.exists() or not self.apps_dir.is_dir():
            print(
                f"🟡 [AppRegistry] Warning: Apps directory not found at '{self.apps_dir}'. No apps will be loaded."
            )
            return

        for app_path in self.apps_dir.iterdir():
            # --- SECURITY FIX: Path Traversal Prevention ---
            # Ensure the app path is a direct child of the apps directory and not a symlink pointing elsewhere.
            resolved_app_path = app_path.resolve()
            if (
                not str(resolved_app_path).startswith(str(self.apps_dir))
                or resolved_app_path == self.apps_dir
            ):
                print(
                    f"🔴 [AppRegistry] SECURITY WARNING: Skipped potentially malicious app path: {app_path}. It resolves outside the apps directory."
                )
                continue
            # --- END SECURITY FIX ---

            if app_path.is_dir():
                manifest_path = app_path / "app_manifest.json"
                if manifest_path.exists():
                    try:
                        with open(manifest_path, "r") as f:
                            manifest = json.load(f)
                        app_name = manifest.get("name")
                        if app_name:
                            app_instance = AppModule(app_path, manifest)
                            self.apps[app_name.lower()] = app_instance
                            print(f"   - Discovered App: {app_name} at {app_path}")
                        else:
                            print(
                                f"🟡 [AppRegistry] Warning: Manifest at {manifest_path} is missing a 'name'."
                            )
                    except json.JSONDecodeError as e:
                        print(
                            f"🔴 [AppRegistry] Failed to parse manifest at {manifest_path}: {e}"
                        )

        print(f"✅ [AppRegistry] Loaded {len(self.apps)} Apps.")

    def get_app(self, name: str) -> Optional[AppModule]:
        """Retrieves an app instance by its name (case-insensitive)."""
        return self.apps.get(name.lower())

    def get_all_apps(self) -> List[AppModule]:
        """Returns a list of all available app instances."""
        return list(self.apps.values())

    def get_all_mcp_server_configs(self) -> Dict[str, Dict[str, Any]]:
        """Collects all MCP server configurations from discovered apps."""
        configs = {}
        for app in self.apps.values():
            if app.mcp_config_path:
                try:
                    config_full_path = app.path / app.mcp_config_path
                    with open(config_full_path, "r") as f:
                        app_mcp_config = json.load(f).get("mcpServers", {})
                        configs.update(app_mcp_config)
                except Exception as e:
                    print(
                        f"🔴 [AppRegistry] Error loading MCP config for app '{app.name}': {e}"
                    )
        return configs
