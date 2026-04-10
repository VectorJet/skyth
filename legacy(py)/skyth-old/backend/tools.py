# backend/tools.py
import os
import json
import re
import requests
import uuid
from urllib.parse import urlparse
from typing import Optional
from selenium import webdriver
from google.genai import types
from google import genai


def setup_selenium_driver():
    print("🔵 [Selenium] Setting up new driver instance...")
    options = webdriver.ChromeOptions()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    options.add_argument(
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
    )
    try:
        driver = webdriver.Chrome(options=options)
        driver.execute_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        print("   - [Selenium] Driver setup successful.")
        return driver
    except Exception as e:
        print(f"🔴 [Selenium] CRITICAL: Failed to setup driver: {e}")
        return None


def _estimate_tokens(text: str) -> int:
    """Rough estimation: 1 token ~= 3.5 chars (Conservative)"""
    if not text:
        return 0
    return int(len(text) / 3.5)


def _truncate_contents(
    contents: list, model_name: str, max_tokens: int = 12000
) -> list:
    """
    Aggressively truncates context to fit within limits.
    For Gemma 3, we use a 12k limit to stay safely under the 15k hard limit.
    """
    if "gemma" not in model_name.lower():
        return contents

    total_tokens = 0

    # 1. Calculate total size
    for msg in contents:
        if isinstance(msg, dict):
            parts = msg.get("parts", [])
        else:
            parts = msg.parts if hasattr(msg, "parts") else []

        for part in parts:
            if hasattr(part, "text") and part.text:
                total_tokens += _estimate_tokens(part.text)
            if hasattr(part, "inline_data") or hasattr(part, "file_data"):
                total_tokens += 258

    if total_tokens < max_tokens:
        return contents

    print(
        f"✂️ [Context Truncation] Input size ~{total_tokens} tokens. Truncating to {max_tokens}..."
    )

    truncated_contents = []
    current_tokens = 0

    # 1. Keep System Prompt (Index 0)
    if contents:
        sys_msg = contents[0]
        sys_tokens = 0
        parts = sys_msg.get("parts", []) if isinstance(sys_msg, dict) else sys_msg.parts
        for part in parts:
            if hasattr(part, "text") and part.text:
                sys_tokens += _estimate_tokens(part.text)

        truncated_contents.append(sys_msg)
        current_tokens += sys_tokens

    # 2. Keep Last Message (User Query) - FORCE TRUNCATE IF NEEDED
    if len(contents) > 1:
        last_msg = contents[-1]
        last_msg_tokens = 0
        parts = (
            last_msg.get("parts", []) if isinstance(last_msg, dict) else last_msg.parts
        )

        for part in parts:
            if hasattr(part, "text") and part.text:
                est_tok = _estimate_tokens(part.text)

                # Check if adding this text would blow the budget
                if current_tokens + est_tok > max_tokens:
                    remaining_budget_tokens = (
                        max_tokens - current_tokens - 100
                    )  # Buffer
                    if remaining_budget_tokens < 0:
                        remaining_budget_tokens = 0

                    allowed_chars = int(remaining_budget_tokens * 3.5)
                    print(
                        f"   - Truncating last message from {len(part.text)} chars to {allowed_chars} chars"
                    )

                    part.text = (
                        part.text[:allowed_chars]
                        + "\n... [CONTENT TRUNCATED DUE TO LENGTH LIMIT] ..."
                    )
                    last_msg_tokens += _estimate_tokens(part.text)
                else:
                    last_msg_tokens += est_tok

        current_tokens += last_msg_tokens

    # 3. Fill Middle (Reverse order)
    middle_msgs = []
    for i in range(len(contents) - 2, 0, -1):
        msg = contents[i]
        msg_tokens = 0
        parts = msg.get("parts", []) if isinstance(msg, dict) else msg.parts

        for part in parts:
            if hasattr(part, "text") and part.text:
                msg_tokens += _estimate_tokens(part.text)
            if hasattr(part, "inline_data") or hasattr(part, "file_data"):
                msg_tokens += 258

        if current_tokens + msg_tokens < max_tokens:
            middle_msgs.append(msg)
            current_tokens += msg_tokens
        else:
            break

    final_contents = [truncated_contents[0]] + middle_msgs[::-1]
    if len(contents) > 1:
        final_contents.append(contents[-1])

    return final_contents


# --- ASYNC FUNCTION ---
async def async_call_llm(
    client: genai.Client,
    prompt_content: str,
    model_name: str,
    chat_history: list = None,
    system_prompt: str = None,
    generation_config: Optional[types.GenerateContentConfig] = None,
):
    """
    Asynchronous version of call_llm using the google-genai SDK.
    Returns an async generator.
    """

    # Prepare contents
    contents = chat_history if chat_history else []
    if prompt_content:
        if contents and contents[-1].get("role") == "user":
            contents[-1]["parts"].append(types.Part(text=prompt_content))
        else:
            contents.append(
                {"role": "user", "parts": [types.Part(text=prompt_content)]}
            )

    # --- FIX FOR GEMMA: Inject System Prompt into History ---
    if "gemma" in model_name.lower() and system_prompt:
        is_prompt_already_present = False
        for msg in contents:
            if msg.get("role") == "user":
                for part in msg.get("parts", []):
                    if (
                        hasattr(part, "text")
                        and part.text
                        and part.text.startswith(system_prompt[:20])
                    ):
                        is_prompt_already_present = True
                        break
            if is_prompt_already_present:
                break

        if not is_prompt_already_present:
            first_user_index = -1
            for i, msg in enumerate(contents):
                if msg.get("role") == "user":
                    first_user_index = i
                    break

            if first_user_index != -1:
                existing_parts = contents[first_user_index]["parts"]
                if existing_parts and hasattr(existing_parts[0], "text"):
                    existing_parts[0].text = (
                        f"{system_prompt}\n\n---\n\n{existing_parts[0].text}"
                    )
                else:
                    contents[first_user_index]["parts"].insert(
                        0, types.Part(text=f"{system_prompt}\n\n---")
                    )
            else:
                contents.insert(
                    0,
                    {
                        "role": "user",
                        "parts": [types.Part(text=f"{system_prompt}\n\n---")],
                    },
                )

    # --- APPLY TRUNCATION ---
    # Truncate BEFORE sending to API
    contents = _truncate_contents(contents, model_name, max_tokens=12000)

    # Configure
    config_args = {}

    if system_prompt and "gemma" not in model_name.lower():
        config_args["system_instruction"] = system_prompt

    if generation_config:
        config_args["temperature"] = getattr(generation_config, "temperature", None)
        config_args["top_p"] = getattr(generation_config, "top_p", None)
        config_args["top_k"] = getattr(generation_config, "top_k", None)
        config_args["max_output_tokens"] = getattr(
            generation_config, "max_output_tokens", None
        )
        config_args["seed"] = getattr(generation_config, "seed", None)

    config = types.GenerateContentConfig(**config_args)

    # --- FIX: Do NOT await the generator itself ---
    return client.aio.models.generate_content_stream(
        model=model_name, contents=contents, config=config
    )


def call_llm(
    prompt_content: str,
    api_key: str,
    model_name: str,
    stream: bool = False,
    chat_history: list = None,
    system_prompt: str = None,
    generation_config: Optional[types.GenerateContentConfig] = None,
) -> requests.Response:
    """
    Unified LLM calling function (Synchronous Fallback).
    """
    base_url = f"https://generativelanguage.googleapis.com/v1beta/{model_name}"
    url = (
        f"{base_url}:streamGenerateContent?alt=sse&key={api_key}"
        if stream
        else f"{base_url}:generateContent?key={api_key}"
    )

    payload = {}

    contents_payload = chat_history if chat_history else []

    if prompt_content:
        if contents_payload and contents_payload[-1].get("role") == "user":
            contents_payload[-1]["parts"].append({"text": prompt_content})
        else:
            contents_payload.append(
                {"role": "user", "parts": [{"text": prompt_content}]}
            )

    if "gemma" in model_name.lower() and system_prompt:
        is_prompt_already_present = any(
            part.get("text", "").startswith(system_prompt[:20])
            for message in contents_payload
            if message.get("role") == "user"
            for part in message.get("parts", [])
        )

        if not is_prompt_already_present:
            first_user_turn_index = next(
                (
                    i
                    for i, msg in enumerate(contents_payload)
                    if msg.get("role") == "user"
                ),
                -1,
            )

            if first_user_turn_index != -1:
                first_user_message_parts = contents_payload[first_user_turn_index][
                    "parts"
                ]
                text_part_index = next(
                    (
                        i
                        for i, part in enumerate(first_user_message_parts)
                        if "text" in part
                    ),
                    -1,
                )

                if text_part_index != -1:
                    existing_text = first_user_message_parts[text_part_index].get(
                        "text", ""
                    )
                    contents_payload[first_user_turn_index]["parts"][text_part_index][
                        "text"
                    ] = f"{system_prompt}\n\n---\n\n{existing_text}"
                else:
                    contents_payload[first_user_turn_index]["parts"].insert(
                        0, {"text": f"{system_prompt}\n\n---"}
                    )

    # Apply truncation for Sync path too
    contents_payload = _truncate_contents(
        contents_payload, model_name, max_tokens=12000
    )
    payload["contents"] = contents_payload

    if "gemini" in model_name.lower() and system_prompt:
        payload["system_instruction"] = {"parts": [{"text": system_prompt}]}

    if generation_config:
        config_dict = {
            "temperature": getattr(generation_config, "temperature", None),
            "topP": getattr(generation_config, "top_p", None),
            "topK": getattr(generation_config, "top_k", None),
            "maxOutputTokens": getattr(generation_config, "max_output_tokens", None),
            "stopSequences": getattr(generation_config, "stop_sequences", None),
            "seed": getattr(generation_config, "seed", None),
        }
        payload["generationConfig"] = {
            k: v for k, v in config_dict.items() if v is not None
        }

    headers = {"Content-Type": "application/json"}

    response = requests.post(
        url, headers=headers, json=payload, stream=stream, timeout=180
    )

    if not response.ok and response.status_code == 400:
        print(
            f"🔴 [call_llm] Received 400 Bad Request. Payload sent: {json.dumps(payload, indent=2)}"
        )

    response.raise_for_status()
    return response


def get_filename_from_url(url: str) -> str:
    try:
        parsed = urlparse(url)
        filename = os.path.basename(parsed.path)
        if not filename or "." not in filename:
            filename = f"download_{uuid.uuid4().hex[:8]}.html"
        return re.sub(r'[<>:"/\\|?*\s]', "_", filename)
    except Exception:
        return f"download_{uuid.uuid4().hex[:8]}.bin"
