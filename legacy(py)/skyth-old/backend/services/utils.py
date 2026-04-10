# backend/services/utils.py
import re
from typing import Optional

# Constants
CONTEXT_CACHE_TTL = 86400
TOOL_RESULT_SUMMARY_LENGTH = 500
MAX_CUSTOM_PERSONALITY_CHARS = 24000
EMAIL_REGEX = re.compile(
    r"([A-Za-z0-9]+[.-_])*[A-Za-z0-9]+@[A-Za-z0-9-]+(\.[A-Z|a-z]{2,})+"
)


def sanitize_html(text: Optional[str]) -> Optional[str]:
    """A simple HTML tag stripper."""
    if text is None:
        return None
    return re.sub(r"<[^>]*>", "", text)
