# backend/utils.py
import json
import re
import asyncio
from typing import AsyncGenerator, Generator, Any


def yield_data(event_type, data_payload):
    """Formats data for Server-Sent Events (SSE)."""
    return f"data: {json.dumps({'type': event_type, 'data': data_payload})}\n\n"


def is_high_quality_image(url: str) -> bool:
    """
    Filter for high quality images based on URL patterns and size indicators.
    """
    if not url:
        return False

    low_quality_patterns = [
        r"thumb",
        r"thumbnail",
        r"icon",
        r"avatar",
        r"logo",
        r"badge",
        r"button",
        r"pixel",
        r"1x1",
        r"spacer",
        r"blank",
        r"transparent",
        r"loading",
        r"spinner",
        r"placeholder",
        r"_s\.",
        r"_xs\.",
        r"_sm\.",
        r"_tiny\.",
        r"_mini\.",
        r"_micro\.",
        r"50x50",
        r"100x100",
        r"16x16",
        r"32x32",
        r"64x64",
        r"favicon",
        r"sprite",
        r"emoji",
        r"emoticon",
    ]

    url_lower = url.lower()
    for pattern in low_quality_patterns:
        if re.search(pattern, url_lower):
            return False

    high_quality_patterns = [
        r"_l\.",
        r"_xl\.",
        r"_xxl\.",
        r"_large\.",
        r"_big\.",
        r"_full\.",
        r"_original\.",
        r"_hd\.",
        r"_hq\.",
        r"800x",
        r"1024x",
        r"1200x",
        r"1920x",
        r"2048x",
    ]

    for pattern in high_quality_patterns:
        if re.search(pattern, url_lower):
            return True

    image_extensions = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg"]
    if any(url_lower.endswith(ext) for ext in image_extensions):
        return True

    return True


def bridge_async_generator(
    async_gen: AsyncGenerator[Any, None],
) -> Generator[Any, None, None]:
    """
    Converts an async generator into a synchronous generator.
    Crucial for streaming async LLM responses via synchronous Flask (WSGI).
    It creates a new event loop for the duration of the stream.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    iter_ = async_gen.__aiter__()

    try:
        while True:
            try:
                # Run the next step of the async generator in the loop
                chunk = loop.run_until_complete(iter_.__anext__())
                yield chunk
            except StopAsyncIteration:
                break
            except Exception as e:
                print(f"🔴 Error in async bridge: {e}")
                # Optionally yield an error chunk here if needed
                break
    finally:
        try:
            # Clean up pending tasks
            pending = asyncio.all_tasks(loop)
            for task in pending:
                task.cancel()
            if pending:
                loop.run_until_complete(
                    asyncio.gather(*pending, return_exceptions=True)
                )
        except Exception:
            pass
        loop.close()
