# backend/services/data_service.py
import psycopg2
import psycopg2.extras
from datetime import datetime
from typing import List, Dict, Any, Optional
from backend.database import get_db_connection
from backend.services.chat_service import ChatService


class DataService:
    def __init__(self, chat_service: ChatService):
        self.chat_service = chat_service

    def export_all_user_data(
        self, user_id: int, chat_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                if chat_id:
                    cur.execute(
                        "SELECT id, title, timestamp FROM chats WHERE user_id = %s AND id = %s",
                        (user_id, chat_id),
                    )
                else:
                    cur.execute(
                        "SELECT id, title, timestamp FROM chats WHERE user_id = %s ORDER BY timestamp DESC",
                        (user_id,),
                    )

                chats = cur.fetchall()
                export_data = []
                for chat in chats:
                    # Reuse chat service logic to ensure we get the full branch or linear history
                    # Using a temporary internal method access or reproducing the fetch
                    messages_raw = self.chat_service._get_branch_history(
                        conn, chat["id"]
                    )
                    messages_serialized = []
                    for msg in messages_raw:
                        msg_dict = dict(msg)
                        if isinstance(msg_dict.get("timestamp"), datetime):
                            msg_dict["timestamp"] = msg_dict["timestamp"].isoformat()
                        messages_serialized.append(msg_dict)
                    export_data.append(
                        {
                            "chat_id": chat["id"],
                            "title": chat["title"],
                            "timestamp": chat["timestamp"].isoformat(),
                            "history": messages_serialized,
                        }
                    )
                return export_data
        finally:
            conn.close()

    def clear_all_chats(self, user_id: int) -> bool:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM chats WHERE user_id = %s", (user_id,))
            conn.commit()
            return True
        except (Exception, psycopg2.Error) as e:
            print(f"🔴 [DataService] Error clearing chats for user {user_id}: {e}")
            conn.rollback()
            return False
        finally:
            conn.close()

    def delete_user_account(self, user_id: int) -> bool:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            conn.commit()
            return True
        except (Exception, psycopg2.Error) as e:
            print(f"🔴 [DataService] Error deleting account for user {user_id}: {e}")
            conn.rollback()
            return False
        finally:
            conn.close()
