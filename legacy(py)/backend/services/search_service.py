from typing import List, Dict, Any
from backend.database import get_db_connection

class SearchService:
    def search_chats_and_messages(self, user_id: str, search_term: str) -> List[Dict[str, Any]]:
        """
        Simple search for SQLite using LIKE.
        """
        conn = get_db_connection()
        try:
            # Note: We don't have a 'chats' table yet in SQLite (messages just has session_id).
            # Let's assume we search within messages for now.
            query = """
                SELECT session_id, role, content, timestamp
                FROM messages
                WHERE content LIKE ?
                ORDER BY timestamp DESC
                LIMIT 25
            """
            like_pattern = f"%{search_term}%"
            cursor = conn.execute(query, (like_pattern,))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        except Exception as e:
            print(f"Error searching: {e}")
            return []
        finally:
            conn.close()
            
search_service = SearchService()
