# routes/auth_routes.py

import jwt
from quart import Blueprint, request, jsonify
from quart_rate_limiter import rate_limit
from werkzeug.security import generate_password_hash
from datetime import datetime, timedelta, timezone

from config import app
from shared import memory_manager

auth_bp = Blueprint("auth_bp", __name__)


def _absolutize_avatar_url(user_data):
    if (
        user_data
        and user_data.get("avatar_url")
        and user_data["avatar_url"].startswith("/")
    ):
        user_data["avatar_url"] = (
            f"{request.host_url.rstrip('/')}{user_data['avatar_url']}"
        )
    return user_data


@auth_bp.route("/api/auth/register", methods=["POST"])
@rate_limit(5, timedelta(minutes=1))
async def register_user():
    data = await request.get_json()
    username = data.get("username")
    password = data.get("password")

    if not username or not password or len(username) < 3 or len(password) < 8:
        return (
            jsonify(
                {
                    "error": "Username must be at least 3 characters and password at least 8 characters."
                }
            ),
            400,
        )

    if memory_manager.is_username_taken(username):
        return jsonify({"error": "Username is already taken."}), 409

    hashed_password = generate_password_hash(password)
    user_id = memory_manager.register_user(username, hashed_password)

    if user_id:
        token = jwt.encode(
            {
                "sub": str(user_id),
                "iat": datetime.now(timezone.utc),
                "exp": datetime.now(timezone.utc) + timedelta(days=30),
            },
            app.config["JWT_SECRET_KEY"],
            algorithm="HS256",
        )
        user_data = memory_manager.get_user_with_profile(user_id)
        return (
            jsonify({"access_token": token, "user": _absolutize_avatar_url(user_data)}),
            201,
        )

    return jsonify({"error": "Failed to register user."}), 500


@auth_bp.route("/api/auth/login", methods=["POST"])
@rate_limit(10, timedelta(minutes=1))
async def login_user():
    data = await request.get_json()
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    user = memory_manager.authenticate_user(username, password)
    if user:
        token = jwt.encode(
            {
                "sub": str(user["id"]),
                "iat": datetime.now(timezone.utc),
                "exp": datetime.now(timezone.utc) + timedelta(days=30),
            },
            app.config["JWT_SECRET_KEY"],
            algorithm="HS256",
        )
        user_data = memory_manager.get_user_with_profile(user["id"])
        return jsonify(
            {"access_token": token, "user": _absolutize_avatar_url(user_data)}
        )

    return jsonify({"error": "Invalid username or password."}), 401


@auth_bp.route("/api/auth/logout", methods=["POST"])
async def logout_user():
    return jsonify({"success": True})


@auth_bp.route("/api/auth/check_username", methods=["POST"])
@rate_limit(30, timedelta(minutes=1))
async def check_username():
    data = await request.get_json()
    username = data.get("username")
    if not username:
        return jsonify({"error": "Username is required."}), 400
    is_taken = memory_manager.is_username_taken(username)
    return jsonify({"is_taken": is_taken})
