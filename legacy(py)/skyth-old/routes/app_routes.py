# routes/app_routes.py

from quart import Blueprint, request, jsonify, g
from quart_rate_limiter import rate_limit
from datetime import timedelta
from shared import token_required, memory_manager, app_registry

app_bp = Blueprint("app_bp", __name__)


@app_bp.route("/api/apps", methods=["GET"])
@token_required
@rate_limit(10, timedelta(minutes=1))
async def get_available_apps():
    print("[APP_ROUTES] GET /api/apps - Fetching available apps")
    user_id = g.user["id"]
    all_apps = [app_module.to_dict() for app_module in app_registry.get_all_apps()]
    connected_apps_names = memory_manager.get_connected_apps(user_id)
    print(
        f"[APP_ROUTES] Found {len(all_apps)} apps, user has {len(connected_apps_names)} connected"
    )

    for app_data in all_apps:
        app_data["is_connected"] = app_data["name"] in connected_apps_names

    print(f"[APP_ROUTES] Returning apps: {[app['name'] for app in all_apps]}")
    return jsonify(all_apps)


@app_bp.route("/api/user/apps/connect", methods=["POST"])
@token_required
async def connect_user_app():
    user_id = g.user["id"]
    data = await request.get_json()
    app_name = data.get("app_name")
    print(
        f"[APP_ROUTES] POST /api/user/apps/connect - User {user_id} connecting app: {app_name}"
    )

    if not app_name:
        print("[APP_ROUTES] Error: app_name is required")
        return jsonify({"error": "app_name is required"}), 400

    if not app_registry.get_app(app_name):
        print(f"[APP_ROUTES] Error: App '{app_name}' not found")
        return jsonify({"error": f"App '{app_name}' not found"}), 404

    success = memory_manager.connect_app(user_id, app_name)
    if success:
        print(
            f"[APP_ROUTES] Successfully connected app '{app_name}' for user {user_id}"
        )
        return jsonify({"success": True})
    print(f"[APP_ROUTES] Failed to connect app '{app_name}' for user {user_id}")
    return jsonify({"error": "Failed to connect app"}), 500


@app_bp.route("/api/user/apps/disconnect", methods=["POST"])
@token_required
async def disconnect_user_app():
    user_id = g.user["id"]
    data = await request.get_json()
    app_name = data.get("app_name")
    print(
        f"[APP_ROUTES] POST /api/user/apps/disconnect - User {user_id} disconnecting app: {app_name}"
    )

    if not app_name:
        print("[APP_ROUTES] Error: app_name is required")
        return jsonify({"error": "app_name is required"}), 400

    success = memory_manager.disconnect_app(user_id, app_name)
    if success:
        print(
            f"[APP_ROUTES] Successfully disconnected app '{app_name}' for user {user_id}"
        )
        return jsonify({"success": True})
    print(f"[APP_ROUTES] Failed to disconnect app '{app_name}' for user {user_id}")
    return jsonify({"error": "Failed to disconnect app"}), 500
