# routes/data_routes.py

import json
import html
from flask import Blueprint, request, jsonify, g, Response
from datetime import datetime
from weasyprint import HTML

from shared import token_required, memory_manager

data_bp = Blueprint("data_bp", __name__)


@data_bp.route("/api/user/export", methods=["GET"])
@token_required
def export_data():
    user_id = g.user["id"]
    export_format = request.args.get("format", "json")
    chat_id_str = request.args.get("chat_id")
    chat_id = int(chat_id_str) if chat_id_str else None
    data = memory_manager.export_all_user_data(user_id, chat_id)
    now = datetime.now().strftime("%Y-%m-%d")
    filename_suffix = f"chat_{chat_id}" if chat_id else "all_chats"
    filename = f"skyth_export_{filename_suffix}_{now}.{export_format}"
    if export_format == "json":
        return Response(
            json.dumps(data, indent=2),
            mimetype="application/json",
            headers={"Content-Disposition": f"attachment;filename={filename}"},
        )
    elif export_format == "md":
        md_content = []
        for chat in data:
            md_content.append(f"# Chat: {html.escape(chat['title'])}\n")
            for msg in chat["history"]:
                role = "Skyth" if msg["role"] == "assistant" else "User"
                content = msg.get("content") or "No text content"
                md_content.append(
                    f"**{role} ({msg['timestamp']}):**\n\n{html.escape(content)}\n\n---\n"
                )
        return Response(
            "".join(md_content),
            mimetype="text/markdown",
            headers={"Content-Disposition": f"attachment;filename={filename}"},
        )
    elif export_format == "pdf":
        html_content = [
            "<html><head><title>Skyth Export</title><style>body{font-family: sans-serif;} h1{color: #333;} .msg{border-bottom: 1px solid #eee; padding: 10px;} .role{font-weight: bold;}</style></head><body>"
        ]
        for chat in data:
            html_content.append(f"<h1>Chat: {html.escape(chat['title'])}</h1>")
            for msg in chat["history"]:
                role = "Skyth" if msg["role"] == "assistant" else "User"
                content = html.escape(msg.get("content") or "No text content").replace(
                    "\n", "<br>"
                )
                html_content.append(
                    f"<div class='msg'><p><span class='role'>{role} ({msg['timestamp']}):</span></p><p>{content}</p></div>"
                )
        html_content.append("</body></html>")
        pdf_html = "".join(html_content)
        pdf = HTML(string=pdf_html).write_pdf()
        return Response(
            pdf,
            mimetype="application/pdf",
            headers={"Content-Disposition": f"attachment;filename={filename}"},
        )
    return jsonify({"error": "Invalid format specified"}), 400


@data_bp.route("/api/user/chats/clear", methods=["DELETE"])
@token_required
def clear_all_user_chats():
    user_id = g.user["id"]
    success = memory_manager.clear_all_chats(user_id)
    if success:
        return jsonify({"success": True})
    return jsonify({"error": "Failed to clear chat history."}), 500


@data_bp.route("/api/user/delete", methods=["DELETE"])
@token_required
def delete_user_account():
    user_id = g.user["id"]
    success = memory_manager.delete_user_account(user_id)
    if success:
        return jsonify({"success": True})
    return jsonify({"error": "Failed to delete account."}), 500
