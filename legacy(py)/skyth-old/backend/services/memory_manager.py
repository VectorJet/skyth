# backend.services/memory_manager.py
import redis
from typing import List, Dict, Any, Optional

from config import REDIS_HOST, REDIS_PORT, REDIS_DB_CACHE
from backend.database import get_db_connection
from backend.services.search_manager import SearchManager

# Import our new services
from backend.services.auth_service import AuthService
from backend.services.app_service import AppService
from backend.services.chat_service import ChatService
from backend.services.data_service import DataService


class MemoryManager:
    """
    Manages all interactions with the database and cache (Redis) for user data,
    chat history, and application state. This class is the single source of truth
    for data persistence and retrieval.

    REFACTOR NOTE: This class now acts as a Facade, delegating actual work to
    specialized service classes.
    """

    def __init__(self):
        try:
            self.redis_client = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                db=REDIS_DB_CACHE,
                decode_responses=True,
            )
            self.redis_client.ping()
            print("✅ [MemoryManager] Connected to Redis successfully.")
        except redis.exceptions.ConnectionError as e:
            print(
                f"🔴 [MemoryManager] CRITICAL: Could not connect to Redis: {e}. Caching will be disabled."
            )
            self.redis_client = None

        # Initialize Sub-Services
        self.auth_service = AuthService()
        self.app_service = AppService()
        self.chat_service = ChatService(redis_client=self.redis_client)
        self.data_service = DataService(chat_service=self.chat_service)
        self.search_manager = SearchManager()

    def _get_db_connection(self):
        """Legacy helper kept for compatibility if anyone uses it externally."""
        return get_db_connection()

    # ==============================================================================
    # DELEGATED METHODS: AUTH & USER
    # ==============================================================================
    def is_username_taken(
        self, username: str, user_id_to_exclude: Optional[int] = None
    ) -> bool:
        return self.auth_service.is_username_taken(username, user_id_to_exclude)

    def register_user(self, username: str, password_hash: str) -> Optional[int]:
        return self.auth_service.register_user(username, password_hash)

    def authenticate_user(
        self, username: str, password: str
    ) -> Optional[Dict[str, Any]]:
        return self.auth_service.authenticate_user(username, password)

    def get_user_with_profile(self, user_id: int) -> Optional[Dict[str, Any]]:
        return self.auth_service.get_user_with_profile(user_id)

    def update_user_profile(
        self, user_id: int, updates: Dict[str, Any], current_username: str
    ) -> bool:
        return self.auth_service.update_user_profile(user_id, updates, current_username)

    def update_avatar_url(self, user_id: int, avatar_url: Optional[str]) -> bool:
        return self.auth_service.update_avatar_url(user_id, avatar_url)

    # ==============================================================================
    # DELEGATED METHODS: APP CONNECTIONS
    # ==============================================================================
    def connect_app(self, user_id: int, app_name: str) -> bool:
        return self.app_service.connect_app(user_id, app_name)

    def disconnect_app(self, user_id: int, app_name: str) -> bool:
        return self.app_service.disconnect_app(user_id, app_name)

    def get_connected_apps(self, user_id: int) -> List[str]:
        return self.app_service.get_connected_apps(user_id)

    def is_app_connected(self, user_id: int, app_name: str) -> bool:
        return self.app_service.is_app_connected(user_id, app_name)

    # ==============================================================================
    # DELEGATED METHODS: CHAT & MEMORY
    # ==============================================================================
    def get_chat_history_for_agent(
        self, chat_id: int, branch_head_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        return self.chat_service.get_chat_history_for_agent(chat_id, branch_head_id)

    def get_chat_history_for_router(
        self, chat_id: int, branch_head_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        return self.chat_service.get_chat_history_for_router(chat_id, branch_head_id)

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
        return self.chat_service.save_message(
            user_id,
            chat_id,
            role,
            message_data,
            parent_message_id,
            message_group_uuid_to_edit,
            old_message_id_in_group,
        )

    def create_chat(self, user_id: int, title: str) -> int:
        return self.chat_service.create_chat(user_id, title)

    def get_chats(self, user_id: int) -> List[Dict[str, Any]]:
        return self.chat_service.get_chats(user_id)

    def delete_chat(self, chat_id: int, user_id: int):
        return self.chat_service.delete_chat(chat_id, user_id)

    def get_full_chat_history_for_display(
        self, chat_id: int, user_id: int, branch_head_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        return self.chat_service.get_full_chat_history_for_display(
            chat_id, user_id, branch_head_id
        )

    def update_chat_title(self, title: str, chat_id: int, user_id: int):
        return self.chat_service.update_chat_title(title, chat_id, user_id)

    def get_artifacts_for_message(
        self, message_id: int
    ) -> Optional[List[Dict[str, Any]]]:
        return self.chat_service.get_artifacts_for_message(message_id)

    # ==============================================================================
    # DELEGATED METHODS: SEARCH & DATA
    # ==============================================================================
    def fuzzy_search_chats_and_messages(
        self, user_id: int, search_term: str
    ) -> List[Dict[str, Any]]:
        return self.search_manager.fuzzy_search_chats_and_messages(user_id, search_term)

    def export_all_user_data(
        self, user_id: int, chat_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        return self.data_service.export_all_user_data(user_id, chat_id)

    def clear_all_chats(self, user_id: int) -> bool:
        return self.data_service.clear_all_chats(user_id)

    def delete_user_account(self, user_id: int) -> bool:
        return self.data_service.delete_user_account(user_id)
