# backend/services/search_manager.py
import psycopg2
import psycopg2.extras
from typing import List, Dict, Any
from config import DATABASE_URL


class SearchManager:
    def _get_db_connection(self):
        """Establishes a connection to the PostgreSQL database."""
        return psycopg2.connect(DATABASE_URL)

    def fuzzy_search_chats_and_messages(
        self, user_id: int, search_term: str
    ) -> List[Dict[str, Any]]:
        """
        Performs an enhanced fuzzy search across chat titles and message content.
        This query now prioritizes word similarity and also includes substring matches,
        making it effective for finding keywords within longer AI responses.
        """
        conn = self._get_db_connection()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                # UPDATED QUERY: This version is more robust.
                # 1. It uses `word_similarity` for better ranking of partial word matches.
                # 2. It includes a `ILIKE` clause to catch direct substring matches (like "microsoft" in a long text).
                # 3. The `relevance` score is calculated to prioritize title matches and word similarity.
                query = """
                WITH all_matches AS (
                    SELECT
                        id AS chat_id,
                        NULL::int AS message_id,
                        title AS chat_title,
                        'title' AS match_type,
                        title AS match_content,
                        -- Prioritize title matches with a higher weight
                        (1.5 * word_similarity(%s, title)) AS relevance
                    FROM chats
                    WHERE user_id = %s AND (title %% %s OR title ILIKE %s)

                    UNION ALL

                    SELECT
                        m.chat_id,
                        m.id AS message_id,
                        c.title AS chat_title,
                        'message' AS match_type,
                        m.content AS match_content,
                        word_similarity(%s, m.content) AS relevance
                    FROM episodic_memory m
                    JOIN chats c ON m.chat_id = c.id
                    WHERE m.user_id = %s AND (m.content %% %s OR m.content ILIKE %s)
                )
                -- Use a subquery to aggregate results and pick the best match per chat/message
                SELECT DISTINCT ON (chat_id, message_id) *
                FROM all_matches
                ORDER BY chat_id, message_id, relevance DESC
                LIMIT 25;
                """
                # The ILIKE pattern needs wildcards
                like_pattern = f"%{search_term}%"
                params = (
                    search_term,
                    user_id,
                    search_term,
                    like_pattern,
                    search_term,
                    user_id,
                    search_term,
                    like_pattern,
                )
                cur.execute(query, params)
                results = cur.fetchall()

                # Final sort in Python to ensure the overall best relevance is at the top
                sorted_results = sorted(
                    [dict(row) for row in results],
                    key=lambda x: x["relevance"],
                    reverse=True,
                )
                return sorted_results[:20]

        except (Exception, psycopg2.Error) as e:
            print(
                f"🔴 [SearchManager] Error during fuzzy search for user {user_id}: {e}"
            )
            return []
        finally:
            conn.close()
