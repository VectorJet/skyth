from mem0 import Memory
import os
from pathlib import Path
from typing import List, Dict, Any, Optional

class SkythMemory:
    _instance = None
    
    def __init__(self):
        # Initialize mem0 with local config by default
        # mem0 defaults to OpenAI for embeddings.
        # We check if we have an API key. If not, we might need a local embedder (e.g., huggingface).
        
        self.config = {
            "vector_store": {
                "provider": "qdrant",
                "config": {
                    "path": str(Path.home() / ".skyth" / "memory_store"),
                }
            },
        }
        
        # If no OpenAI Key, use local embeddings (requires installing sentence-transformers via mem0 dependencies usually)
        # Or we can check if GEMINI_API_KEY is present and use Gemini embeddings if mem0 supports it.
        # mem0 supports 'gemini' embedder.
        
        if "GEMINI_API_KEY" in os.environ and "OPENAI_API_KEY" not in os.environ:
             self.config["embedder"] = {
                 "provider": "gemini",
                 "config": {
                     "api_key": os.environ["GEMINI_API_KEY"],
                     "model": "models/embedding-001"
                 }
             }
             
        # If no keys at all, this will fail unless we use a local provider like 'huggingface' which requires more deps.
        # For now, we assume user has one of them, or we mock/catch the error upstream.
        
        self.memory = Memory.from_config(self.config)

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = SkythMemory()
        return cls._instance

    def add(self, messages: List[Dict[str, Any]], user_id: str = "default_user", agent_id: Optional[str] = None):
        """
        Adds messages to memory. mem0 expects 'messages' format.
        """
        # mem0.add(messages, user_id=..., metadata=...)
        metadata = {}
        if agent_id:
            metadata["agent"] = agent_id
            
        self.memory.add(messages, user_id=user_id, metadata=metadata)

    def search(self, query: str, user_id: str = "default_user", limit: int = 5) -> List[Dict[str, Any]]:
        """
        Retrieves relevant memories.
        """
        return self.memory.search(query, user_id=user_id, limit=limit)

    def get_all(self, user_id: str = "default_user", limit: int = 100) -> List[Dict[str, Any]]:
        """
        Gets recent memories.
        """
        return self.memory.get_all(user_id=user_id, limit=limit)