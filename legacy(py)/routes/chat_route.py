import sqlite3
import uuid
import time
import sys
import os
import json
from typing import List, Optional, Dict, Any, Union
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, Form, File, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Add backend to path so we can import converters
sys.path.append(str(Path(__file__).resolve().parent.parent))

from backend.converters.provider import Provider, generate_response
from backend.router import Router
from backend.registries.agent_registry import AgentRegistry
from backend.database import get_db_connection, init_db

router = APIRouter(prefix="/api", tags=["chat"])

# Initialize DB
init_db()

# --- Pydantic Models ---

class VersionInfo(BaseModel):
    current: int = 1
    total: int = 1
    prev_id: Optional[int] = None
    next_id: Optional[int] = None

class Message(BaseModel):
    id: Union[str, int]
    role: str
    content: str
    initialContent: Optional[str] = ""
    reasoning: Optional[str] = None
    model: Optional[str] = None
    timestamp: float = 0.0
    message_group_uuid: Optional[str] = None
    version_info: Optional[VersionInfo] = VersionInfo()

class ChatInfo(BaseModel):
    id: Union[int, str]
    title: str
    timestamp: float

# --- Endpoints ---

@router.get("/chats", response_model=List[ChatInfo])
async def list_chats():
    """Returns a list of all chats."""
    conn = get_db_connection()
    try:
        # Note: In the migrated system, we might want a real 'chats' table.
        # For now, we group messages by session_id.
        cursor = conn.execute("SELECT MIN(id) as id, session_id as title, MAX(timestamp) as timestamp FROM messages GROUP BY session_id ORDER BY timestamp DESC")
        rows = cursor.fetchall()
        return [ChatInfo(id=r["title"], title=r["title"], timestamp=r["timestamp"]) for r in rows]
    finally:
        conn.close()

@router.post("/chats")
async def create_chat():
    """Mock creating a new chat session."""
    # The frontend just expects a Chat object with an ID.
    new_id = str(uuid.uuid4())
    return {
        "id": new_id,
        "title": "New Chat",
        "timestamp": time.time()
    }

@router.delete("/chats/{session_id}")
async def delete_chat(session_id: str):
    """Delete all messages for a session."""
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        conn.commit()
        return {"success": True}
    finally:
        conn.close()

@router.get("/chats/{session_id}/history", response_model=List[Message])
async def get_history(session_id: str):
    """Retrieve chat history for a specific session."""
    conn = get_db_connection()
    try:
        cursor = conn.execute(
            "SELECT id, role, content, reasoning, model, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp ASC",
            (session_id,)
        )
        rows = cursor.fetchall()
        return [Message(
            id=r["id"],
            role=r["role"],
            content=r["content"],
            reasoning=r["reasoning"],
            model=r["model"],
            timestamp=r["timestamp"],
            message_group_uuid=str(session_id),
            version_info=VersionInfo(current=1, total=1)
        ) for r in rows]
    finally:
        conn.close()
    """Retrieve chat history for a specific session."""
    conn = get_db_connection()
    try:
        cursor = conn.execute(
            "SELECT id, role, content, reasoning, model, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp ASC",
            (session_id,)
        )
        rows = cursor.fetchall()
        return [Message(
            id=r["id"],
            role=r["role"],
            content=r["content"],
            reasoning=r["reasoning"],
            model=r["model"],
            timestamp=r["timestamp"]
        ) for r in rows]
    finally:
        conn.close()

@router.post("/search")
async def legacy_search(
    json_data: str = Form(...),
    files: List[UploadFile] = File(None)
):
    """Bridge for the old frontend /search endpoint."""
    try:
        data = json.loads(json_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in json_data")

    query = data.get("query")
    session_id = data.get("chat_id") # frontend uses chat_id
    model = data.get("model", "default")
    
    if not session_id:
        session_id = str(uuid.uuid4())

    timestamp = time.time()
    conn = get_db_connection()
    
    # 1. Save User Message
    conn.execute(
        "INSERT INTO messages (session_id, role, content, model, timestamp) VALUES (?, ?, ?, ?, ?)",
        (str(session_id), "user", query, model, timestamp)
    )
    conn.commit()
    
    # 2. Retrieve History
    cursor = conn.execute(
        "SELECT role, content FROM messages WHERE session_id = ? ORDER BY timestamp ASC",
        (str(session_id),)
    )
    rows = cursor.fetchall()
    messages_context = [{"role": r["role"], "content": r["content"]} for r in rows]
    conn.close()

    # 3. Stream Response
    async def event_generator():
        full_content = ""
        full_reasoning = ""
        
        try:
            # Routing
            agent = await Router.route(query, history=messages_context)
            if not agent:
                response_generator = await generate_response(model_id=model, messages=messages_context, stream=True)
            else:
                # Notify frontend about agent selection
                yield f"data: {json.dumps({'type': 'thought', 'data': {'content': f'Selecting {agent.name}...'}})}\n\n"
                response_generator = await agent.run_task(task=query, history=messages_context, stream=True)

            if hasattr(response_generator, '__aiter__'):
                async for chunk in response_generator:
                    content_chunk = ""
                    reasoning_chunk = ""
                    
                    if hasattr(chunk, 'choices') and chunk.choices:
                        delta = chunk.choices[0].delta
                        if hasattr(delta, 'content') and delta.content:
                            content_chunk = delta.content
                        if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                            reasoning_chunk = delta.reasoning_content
                    elif isinstance(chunk, dict):
                        # Handle custom events from Agent/Pipeline
                        if chunk.get("type") == "artifacts":
                            yield f"data: {json.dumps({'type': 'artifacts', 'data': chunk.get('data')})}\n\n"
                        elif chunk.get("type") == "thought":
                            yield f"data: {json.dumps({'type': 'thought', 'data': chunk.get('data')})}\n\n"
                        elif chunk.get("type") == "answer_chunk":
                             yield f"data: {json.dumps({'type': 'answer_chunk', 'data': chunk.get('data')})}\n\n"
                    elif isinstance(chunk, str):
                        content_chunk = chunk
                    
                    if content_chunk:
                        full_content += content_chunk
                        yield f"data: {json.dumps({'type': 'answer_chunk', 'data': content_chunk})}\\n\n"
                    
                    if reasoning_chunk:
                        full_reasoning += reasoning_chunk
                        yield f"data: {json.dumps({'type': 'thought', 'data': {'content': reasoning_chunk}})}\\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\\n\n"
        
        # Save to DB
        try:
            save_conn = get_db_connection()
            save_conn.execute(
                "INSERT INTO messages (session_id, role, content, reasoning, model, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                (str(session_id), "assistant", full_content, full_reasoning if full_reasoning else None, model, time.time())
            )
            save_conn.commit()
            save_conn.close()
        except Exception as e:
            print(f"Error saving message: {e}")
            
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
