from typing import List, Dict, Any, Optional
from backend.database import get_db_connection

class DataService:
    def export_all_user_data(self, session_id: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            if session_id:
                cursor = conn.execute("SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC", (session_id,))
            else:
                cursor = conn.execute("SELECT * FROM messages ORDER BY session_id, timestamp ASC")
            
            rows = cursor.fetchall()
            # Group by session_id
            data = {}
            for r in rows:
                sid = r["session_id"]
                if sid not in data:
                    data[sid] = []
                data[sid].append(dict(r))
            
            return [{"session_id": sid, "history": msgs} for sid, msgs in data.items()]
        finally:
            conn.close()

    def clear_all_data(self, session_id: Optional[str] = None) -> bool:
        conn = get_db_connection()
        try:
            if session_id:
                conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
            else:
                conn.execute("DELETE FROM messages")
            conn.commit()
            return True
        except Exception as e:
            print(f"Error clearing data: {e}")
            return False
        finally:
            conn.close()

data_service = DataService()
