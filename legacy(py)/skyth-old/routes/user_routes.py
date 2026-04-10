# routes/user_routes.py

import os
import uuid
from quart import Blueprint, request, jsonify, g, send_from_directory
from werkzeug.utils import secure_filename

# --- ADDED IMPORTS ---
from config import app, GEMINI_API_KEY, UTILITY_MODEL
from backend.tools import call_llm

# ---------------------

from shared import (
    token_required,
    memory_manager,
    allowed_file,
    ALLOWED_AVATAR_EXTENSIONS,
)

user_bp = Blueprint("user_bp", __name__)


def _absolutize_avatar_url(user_data):
    """Helper to convert a user's relative avatar URL to an absolute one."""
    if (
        user_data
        and user_data.get("avatar_url")
        and user_data["avatar_url"].startswith("/")
    ):
        user_data["avatar_url"] = (
            f"{request.host_url.rstrip('/')}{user_data['avatar_url']}"
        )
    return user_data


@user_bp.route("/api/user/profile", methods=["GET", "PUT"])
@token_required
async def handle_user_profile():
    user_id = g.user["id"]
    if request.method == "GET":
        return jsonify(g.user)
    if request.method == "PUT":
        updates = await request.get_json()
        try:
            current_username = g.user["username"]
            success = memory_manager.update_user_profile(
                user_id, updates, current_username
            )
            if success:
                user_data = memory_manager.get_user_with_profile(user_id)
                return jsonify(_absolutize_avatar_url(user_data))
            return jsonify({"error": "Failed to update profile."}), 500
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            print(f"🔴 Error in /api/user/profile PUT: {e}")
            return jsonify({"error": "An unexpected error occurred."}), 500


@user_bp.route("/api/user/avatar", methods=["POST"])
@token_required
async def upload_avatar():
    user_id = g.user["id"]
    files = await request.files
    if "avatar" not in files:
        return jsonify({"error": "No avatar file part in the request"}), 400

    file = files["avatar"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    if file and allowed_file(file.filename, ALLOWED_AVATAR_EXTENSIONS):
        if g.user.get("avatar_url"):
            old_avatar_path_part = g.user["avatar_url"].split("/uploads/")[1]
            old_avatar_path = os.path.join(
                app.config["UPLOAD_FOLDER"], old_avatar_path_part
            )
            if os.path.exists(old_avatar_path):
                try:
                    os.remove(old_avatar_path)
                except OSError as e:
                    print(f"🔴 Error deleting old avatar {old_avatar_path}: {e}")

        filename = secure_filename(file.filename)
        file_extension = filename.rsplit(".", 1)[1].lower()
        unique_filename = f"{uuid.uuid4().hex}.{file_extension}"

        user_upload_dir = os.path.join(app.config["UPLOAD_FOLDER"], str(user_id))
        os.makedirs(user_upload_dir, exist_ok=True)

        await file.save(os.path.join(user_upload_dir, unique_filename))

        avatar_url_relative = f"/uploads/{user_id}/{unique_filename}"

        if memory_manager.update_avatar_url(user_id, avatar_url_relative):
            absolute_url = f"{request.host_url.rstrip('/')}{avatar_url_relative}"
            return jsonify({"success": True, "avatar_url": absolute_url})
        else:
            return jsonify({"error": "Failed to update avatar in database"}), 500

    return jsonify({"error": "File type not allowed"}), 400


@user_bp.route("/api/user/avatar", methods=["DELETE"])
@token_required
async def delete_avatar():
    user_id = g.user["id"]
    if g.user.get("avatar_url"):
        avatar_path_part = g.user["avatar_url"].split("/uploads/")[1]
        avatar_path = os.path.join(app.config["UPLOAD_FOLDER"], avatar_path_part)
        if os.path.exists(avatar_path):
            try:
                os.remove(avatar_path)
            except OSError as e:
                print(f"🔴 Error deleting avatar file {avatar_path}: {e}")

    if memory_manager.update_avatar_url(user_id, None):
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Failed to remove avatar from database"}), 500


@user_bp.route("/uploads/<path:filename>")
async def serve_user_upload(filename):
    directory = os.path.join(os.getcwd(), app.config["UPLOAD_FOLDER"])
    return await send_from_directory(directory, filename)


@user_bp.route("/api/user/greeting", methods=["GET"])
@token_required
async def get_personalized_greeting():
    try:
        user_id = g.user["id"]
        # Fetch last 5 chats for context
        chats = memory_manager.get_chats(user_id)
        recent_titles = [c["title"] for c in chats[:5]]

        username = g.user.get("username", "Friend")
        occupation = g.user.get("occupation", "User")
        about = g.user.get("about_user", "")
        personality = g.user.get("skyth_personality", "default")
        custom_prompt = (
            g.user.get("custom_personality", "") if personality == "custom" else ""
        )

        prompt = f"""
        Generate a very short (3-7 words), personalized greeting for the user on their AI chat interface.
        
        **User Context:**
        - Name: {username}
        - Occupation: {occupation}
        - About: {about}
        - Recent Topics: {', '.join(recent_titles)}
        - Personality Mode: {personality}
        - Custom Personality Instructions: {custom_prompt}
        
        **Instructions:**
        1. Be casual, punchy, and welcoming.
        2. If recent topics show a clear theme (e.g., coding, writing, music), reference it subtly (e.g., "Ready to code, {username}?" or "More music today?").
        3. If no clear theme, just be friendly in the requested personality style.
        4. Unhinged personality should be chaotic/funny. Nerd personality should be geeky.
        5. Output ONLY the greeting text. No quotes.
        """

        # Use Sync call for speed, but handle rate limits
        try:
            response = call_llm(prompt, GEMINI_API_KEY, UTILITY_MODEL, stream=False)
            greeting_text = response.json()["candidates"][0]["content"]["parts"][0][
                "text"
            ].strip()
            greeting_text = greeting_text.replace('"', "").replace("'", "")
            return jsonify({"greeting": greeting_text})
        except Exception as llm_error:
            print(f"⚠️ LLM Greeting Failed (Rate Limit or Error): {llm_error}")
            # Fallback to generic greeting on error to prevent UI crash
            return jsonify({"greeting": f"Welcome back, {username}."})

    except Exception as e:
        print(f"⚠️ Error generating greeting: {e}")
        return jsonify({"greeting": f"Hello, {g.user.get('username', 'Friend')}."})
