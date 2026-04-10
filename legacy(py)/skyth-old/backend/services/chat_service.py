# backend/services/chat_service.py
import json
import psycopg2
import psycopg2.extras
import os
import base64
import uuid
from typing import List, Dict, Any, Optional
from google.genai import types as google_types

from backend.database import get_db_connection
from backend.services.utils import TOOL_RESULT_SUMMARY_LENGTH


class ChatService:
    def __init__(self, redis_client=None):
        self.redis_client = redis_client

    def _summarize_tool_result(self, result: Any) -> str:
        """Truncates long tool results for storage in history."""
        result_str = str(result)
        if len(result_str) > TOOL_RESULT_SUMMARY_LENGTH:
            return result_str[:TOOL_RESULT_SUMMARY_LENGTH] + "..."
        return result_str

    def _prepare_message_for_rest_api(
        self, role: str, message_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Prepares a message for the router's LLM call (REST API format)."""
        parts = []
        if artifacts := message_data.get("artifacts"):
            for artifact in artifacts:
                try:
                    if os.path.exists(artifact.get("path")) and artifact.get(
                        "mime_type"
                    ):
                        with open(artifact["path"], "rb") as f:
                            encoded_data = base64.b64encode(f.read()).decode("utf-8")
                        parts.append(
                            {
                                "inline_data": {
                                    "mime_type": artifact["mime_type"],
                                    "data": encoded_data,
                                }
                            }
                        )
                except Exception as e:
                    print(f"🔴 [ChatService] Error reading artifact for REST API: {e}")

        text_content = ""
        if role == "user":
            text_content = message_data.get("content", "")
        elif role == "assistant":
            # For the router, we want a concise summary of the assistant's turn.
            summary_parts = []
            if agent_call := message_data.get("agentCall"):
                if agent_call.get("agent") == "apps_agent" and agent_call.get(
                    "app_name"
                ):
                    summary_parts.append(
                        f"[Action: Interacting with @{agent_call['app_name']}]"
                    )
            if initial_content := message_data.get("initialContent"):
                summary_parts.append(initial_content.strip())
            if content := message_data.get("content"):
                summary_parts.append(content.strip())
            text_content = " ".join(filter(None, summary_parts)) or message_data.get(
                "content", ""
            )

        if text_content.strip():
            parts.append({"text": text_content.strip()})

        if not parts:
            return None
        return {"role": "model" if role == "assistant" else "user", "parts": parts}

    def _prepare_message_for_sdk(
        self, role: str, message_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Prepares a message for an agent's LLM call (SDK format)."""
        parts = []
        if artifacts := message_data.get("artifacts"):
            for artifact in artifacts:
                try:
                    if os.path.exists(artifact.get("path")) and artifact.get(
                        "mime_type"
                    ):
                        with open(artifact["path"], "rb") as f:
                            parts.append(
                                google_types.Part.from_bytes(
                                    data=f.read(), mime_type=artifact["mime_type"]
                                )
                            )
                except Exception as e:
                    print(f"🔴 [ChatService] Error reading artifact for SDK: {e}")

        if content := message_data.get("content"):
            if content.strip():
                parts.append(google_types.Part(text=content))

        if role == "assistant":
            if agent_steps := message_data.get("agentSteps", []):
                for step in agent_steps:
                    if step.get("type") == "tool_call":
                        parts.append(
                            google_types.Part(
                                function_call={
                                    "name": step.get("tool"),
                                    "args": step.get("args"),
                                }
                            )
                        )
                    elif step.get("type") == "tool_result":
                        summarized_result = self._summarize_tool_result(
                            step.get("result")
                        )
                        response_part = {
                            "function_response": {
                                "name": step.get("tool"),
                                "response": {"content": summarized_result},
                            }
                        }
                        parts.append(
                            google_types.Part(
                                function_response=response_part["function_response"]
                            )
                        )

        if not parts:
            return None
        return {"role": "model" if role == "assistant" else "user", "parts": parts}

    def _get_branch_history(
        self, conn, chat_id: int, branch_head_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieves the full history of a specific message branch.
        """
        cols = "id, user_id, chat_id, role, content, final_data_json, timestamp, parent_message_id, message_group_uuid, version, is_active"
        m_cols = f"m.{', m.'.join(cols.split(', '))}"

        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            start_node_id = branch_head_id

            if start_node_id:
                leaf_finder_query = f"""
                WITH RECURSIVE branch_descendants AS (
                    SELECT {cols} FROM episodic_memory WHERE id = %s AND chat_id = %s
                    UNION ALL
                    SELECT {m_cols}
                    FROM episodic_memory m
                    JOIN branch_descendants bd ON m.parent_message_id = bd.id
                )
                SELECT id FROM branch_descendants
                WHERE id NOT IN (SELECT parent_message_id FROM episodic_memory WHERE parent_message_id IS NOT NULL AND chat_id = %s)
                ORDER BY timestamp DESC, id DESC
                LIMIT 1;
                """
                cur.execute(leaf_finder_query, (start_node_id, chat_id, chat_id))
                leaf_node = cur.fetchone()
                start_node_id = leaf_node["id"] if leaf_node else start_node_id
            else:
                cur.execute(
                    "SELECT id FROM episodic_memory WHERE chat_id = %s AND is_active = TRUE ORDER BY timestamp DESC, id DESC LIMIT 1",
                    (chat_id,),
                )
                result = cur.fetchone()
                if not result:
                    return []
                start_node_id = result[0]

            history_query = f"""
            WITH RECURSIVE full_branch AS (
                SELECT {cols} FROM episodic_memory WHERE id = %s AND chat_id = %s
                UNION ALL
                SELECT {m_cols}
                FROM episodic_memory m
                JOIN full_branch fb ON m.id = fb.parent_message_id
            )
            SELECT * FROM full_branch ORDER BY timestamp ASC;
            """
            cur.execute(history_query, (start_node_id, chat_id))
            return cur.fetchall()

    def get_chat_history_for_agent(
        self, chat_id: int, branch_head_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            history_records = self._get_branch_history(conn, chat_id, branch_head_id)
        finally:
            conn.close()

        context_history = []
        for record in history_records:
            msg_data = record["final_data_json"] or {"content": record["content"]}
            prepared_msg = self._prepare_message_for_sdk(record["role"], msg_data)
            if prepared_msg:
                context_history.append(prepared_msg)
        return context_history

    def get_chat_history_for_router(
        self, chat_id: int, branch_head_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            history_records = self._get_branch_history(conn, chat_id, branch_head_id)
        finally:
            conn.close()

        router_history = []
        for record in history_records:
            msg_data = record["final_data_json"] or {"content": record["content"]}
            prepared_msg = self._prepare_message_for_rest_api(record["role"], msg_data)
            if prepared_msg:
                router_history.append(prepared_msg)
        return router_history

    def _deactivate_branch_from(self, cursor, start_message_id: int):
        if not start_message_id:
            return
        deactivate_query = """
            WITH RECURSIVE branch_to_deactivate AS (
                SELECT id FROM episodic_memory WHERE id = %s
                UNION ALL
                SELECT m.id FROM episodic_memory m JOIN branch_to_deactivate b ON m.parent_message_id = b.id
            )
            UPDATE episodic_memory SET is_active = FALSE WHERE id IN (SELECT id FROM branch_to_deactivate);
        """
        cursor.execute(deactivate_query, (start_message_id,))

    def save_message(
        self,
        user_id: int,
        chat_id: int,
        role: str,
        message_data: Dict[str, Any],
        parent_message_id: Optional[int],
        message_group_uuid_to_edit: Optional[str] = None,
        old_message_id_in_group: Optional[int] = None,
    ) -> int:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                is_new_version = message_group_uuid_to_edit is not None

                if is_new_version and old_message_id_in_group:
                    cur.execute(
                        "SELECT parent_message_id FROM episodic_memory WHERE id = %s AND chat_id = %s",
                        (old_message_id_in_group, chat_id),
                    )
                    result = cur.fetchone()
                    authoritative_parent_id = result[0] if result else None
                    self._deactivate_branch_from(cur, old_message_id_in_group)
                else:
                    cur.execute(
                        "SELECT id FROM episodic_memory WHERE chat_id = %s AND is_active = TRUE ORDER BY timestamp DESC, id DESC LIMIT 1",
                        (chat_id,),
                    )
                    result = cur.fetchone()
                    authoritative_parent_id = result[0] if result else None

                content = message_data.get("content", "")
                final_data_json = (
                    json.dumps(message_data)
                    if role == "assistant" or "artifacts" in message_data
                    else None
                )
                new_version = 1
                message_group_uuid = None

                if is_new_version:
                    message_group_uuid = uuid.UUID(message_group_uuid_to_edit)
                    cur.execute(
                        "SELECT MAX(version) FROM episodic_memory WHERE message_group_uuid = %s",
                        (message_group_uuid,),
                    )
                    last_version = cur.fetchone()[0]
                    new_version = (last_version or 0) + 1
                else:
                    message_group_uuid = uuid.uuid4()

                cur.execute(
                    """
                    INSERT INTO episodic_memory 
                    (user_id, chat_id, role, content, final_data_json, parent_message_id, message_group_uuid, version, is_active) 
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
                    """,
                    (
                        user_id,
                        chat_id,
                        role,
                        content,
                        final_data_json,
                        authoritative_parent_id,
                        message_group_uuid,
                        new_version,
                        True,
                    ),
                )
                new_message_id = cur.fetchone()[0]

            conn.commit()

            if self.redis_client:
                self.redis_client.delete(f"chat:{chat_id}:context")
            return new_message_id
        except (Exception, psycopg2.Error) as e:
            print(f"🔴 [ChatService] Error saving message for chat {chat_id}: {e}")
            conn.rollback()
            raise
        finally:
            if conn:
                conn.close()

    def create_chat(self, user_id: int, title: str) -> int:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO chats (user_id, title) VALUES (%s, %s) RETURNING id",
                    (user_id, title),
                )
                new_chat_id = cur.fetchone()[0]
            conn.commit()
            return new_chat_id
        except (Exception, psycopg2.Error) as e:
            print(f"🔴 [ChatService] Error creating chat: {e}")
            conn.rollback()
            return None
        finally:
            conn.close()

    def get_chats(self, user_id: int) -> List[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                cur.execute(
                    "SELECT * FROM chats WHERE user_id = %s ORDER BY timestamp DESC",
                    (user_id,),
                )
                chats = cur.fetchall()
            return [dict(chat) for chat in chats]
        except (Exception, psycopg2.Error) as e:
            print(f"🔴 [ChatService] Error getting chats for user {user_id}: {e}")
            return []
        finally:
            conn.close()

    def delete_chat(self, chat_id: int, user_id: int):
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM chats WHERE id = %s AND user_id = %s",
                    (chat_id, user_id),
                )
            conn.commit()
            if self.redis_client:
                self.redis_client.delete(f"chat:{chat_id}:context")
        except (Exception, psycopg2.Error) as e:
            print(f"🔴 [ChatService] Error deleting chat {chat_id}: {e}")
            conn.rollback()
        finally:
            conn.close()

    def get_full_chat_history_for_display(
        self, chat_id: int, user_id: int, branch_head_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM chats WHERE id = %s AND user_id = %s",
                    (chat_id, user_id),
                )
                if not cur.fetchone():
                    return []

            branch_records = self._get_branch_history(conn, chat_id, branch_head_id)
            if not branch_records:
                return []

            group_uuids = list(set([r["message_group_uuid"] for r in branch_records]))
            versions_by_group = {}
            if group_uuids:
                with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                    cur.execute(
                        "SELECT id, message_group_uuid, version FROM episodic_memory WHERE message_group_uuid = ANY(%s) ORDER BY message_group_uuid, version",
                        (group_uuids,),
                    )
                    for row in cur.fetchall():
                        group_uuid_str = str(row["message_group_uuid"])
                        if group_uuid_str not in versions_by_group:
                            versions_by_group[group_uuid_str] = []
                        versions_by_group[group_uuid_str].append(
                            {"id": row["id"], "version": row["version"]}
                        )
        except (Exception, psycopg2.Error) as e:
            print(
                f"🔴 [ChatService] Error getting full history for chat {chat_id}: {e}"
            )
            return []
        finally:
            if conn:
                conn.close()

        formatted_history = []
        for record in branch_records:
            message = {"role": record["role"], "id": record["id"]}
            group_uuid_str = str(record["message_group_uuid"])
            all_versions_in_group = versions_by_group.get(group_uuid_str, [])
            current_version_num = record["version"]

            current_index = next(
                (
                    i
                    for i, v in enumerate(all_versions_in_group)
                    if v["version"] == current_version_num
                ),
                -1,
            )

            prev_id = (
                all_versions_in_group[current_index - 1]["id"]
                if current_index > 0
                else None
            )
            next_id = (
                all_versions_in_group[current_index + 1]["id"]
                if current_index != -1
                and current_index < len(all_versions_in_group) - 1
                else None
            )

            message["message_group_uuid"] = group_uuid_str
            message["version_info"] = {
                "current": current_version_num,
                "total": len(all_versions_in_group),
                "prev_id": prev_id,
                "next_id": next_id,
            }

            if record["role"] == "user":
                message["content"] = record["content"]
                if (
                    record["final_data_json"]
                    and "artifacts" in record["final_data_json"]
                ):
                    processed_artifacts = []
                    for artifact in record["final_data_json"]["artifacts"]:
                        if (
                            artifact.get("type") == "image"
                            and "path" in artifact
                            and os.path.exists(artifact["path"])
                        ):
                            try:
                                with open(artifact["path"], "rb") as f:
                                    artifact["base64_data"] = base64.b64encode(
                                        f.read()
                                    ).decode("utf-8")
                                del artifact[
                                    "path"
                                ]  # Don't leak file paths to frontend
                            except Exception as e:
                                print(
                                    f"🔴 [ChatService] Error reading artifact image {artifact.get('path')}: {e}"
                                )
                        processed_artifacts.append(artifact)
                    message["artifacts"] = processed_artifacts
            elif record["role"] == "assistant":
                answer_json = record["final_data_json"]
                if isinstance(answer_json, dict):
                    message.update(
                        {
                            "content": answer_json.get("content", ""),
                            "agentSteps": answer_json.get("agentSteps", []),
                            "artifacts": answer_json.get("artifacts", []),
                            "agentCall": answer_json.get("agentCall"),
                            "initialContent": answer_json.get("initialContent"),
                        }
                    )
                else:
                    message["content"] = record["content"]

            formatted_history.append(message)
        return formatted_history

    def update_chat_title(self, title: str, chat_id: int, user_id: int):
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE chats SET title = %s WHERE id = %s AND user_id = %s",
                    (title, chat_id, user_id),
                )
            conn.commit()
        except (Exception, psycopg2.Error) as e:
            print(f"🔴 [ChatService] Error updating chat title for chat {chat_id}: {e}")
            conn.rollback()
        finally:
            conn.close()

    def get_artifacts_for_message(
        self, message_id: int
    ) -> Optional[List[Dict[str, Any]]]:
        if not message_id:
            return None
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT final_data_json FROM episodic_memory WHERE id = %s",
                    (message_id,),
                )
                result = cur.fetchone()
                if result and result[0] and "artifacts" in result[0]:
                    return result[0]["artifacts"]
                return None
        except (Exception, psycopg2.Error) as e:
            print(
                f"🔴 [ChatService] Error getting artifacts for message {message_id}: {e}"
            )
            return None
        finally:
            conn.close()
