# backend/services/app_service.py
import psycopg2
from typing import List
from backend.database import get_db_connection


class AppService:
    def connect_app(self, user_id: int, app_name: str) -> bool:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO user_connected_apps (user_id, app_name) VALUES (%s, %s) ON CONFLICT (user_id, app_name) DO NOTHING",
                    (user_id, app_name),
                )
            conn.commit()
            return True
        except (Exception, psycopg2.Error) as e:
            print(
                f"🔴 [AppService] Error connecting app '{app_name}' for user {user_id}: {e}"
            )
            conn.rollback()
            return False
        finally:
            conn.close()

    def disconnect_app(self, user_id: int, app_name: str) -> bool:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM user_connected_apps WHERE user_id = %s AND app_name = %s",
                    (user_id, app_name),
                )
            conn.commit()
            return True
        except (Exception, psycopg2.Error) as e:
            print(
                f"🔴 [AppService] Error disconnecting app '{app_name}' for user {user_id}: {e}"
            )
            conn.rollback()
            return False
        finally:
            conn.close()

    def get_connected_apps(self, user_id: int) -> List[str]:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT app_name FROM user_connected_apps WHERE user_id = %s",
                    (user_id,),
                )
                return [row[0] for row in cur.fetchall()]
        except (Exception, psycopg2.Error) as e:
            print(
                f"🔴 [AppService] Error getting connected apps for user {user_id}: {e}"
            )
            return []
        finally:
            conn.close()

    def is_app_connected(self, user_id: int, app_name: str) -> bool:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM user_connected_apps WHERE user_id = %s AND app_name = %s",
                    (user_id, app_name),
                )
                return cur.fetchone() is not None
        except (Exception, psycopg2.Error) as e:
            print(
                f"🔴 [AppService] Error checking app connection for user {user_id}: {e}"
            )
            return False
        finally:
            conn.close()
