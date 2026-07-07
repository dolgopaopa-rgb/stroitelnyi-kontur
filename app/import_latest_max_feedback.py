from __future__ import annotations

import argparse
import json
import os
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from database import connect
from server import MAX_API_URL, insert_feedback_item


def latest_feedback_chat_id() -> str:
    with connect() as db:
        row = db.execute(
            """
            SELECT chat_id, COUNT(*) AS count
            FROM feedback_items
            WHERE COALESCE(chat_id, '') != ''
            GROUP BY chat_id
            ORDER BY count DESC, MAX(created_at) DESC
            LIMIT 1
            """
        ).fetchone()
    return str(row["chat_id"] or "").strip() if row else ""


def decode_max_response(raw: bytes) -> list[dict]:
    payload = json.loads(raw.decode("utf-8", "replace"))
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    for key in ("messages", "items", "data", "result"):
        value = payload.get(key) if isinstance(payload, dict) else None
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    if isinstance(payload, dict):
        return [payload]
    return []


def nested_dict(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def message_text(message: dict) -> str:
    body = nested_dict(message.get("body"))
    return str(
        message.get("text")
        or message.get("caption")
        or body.get("text")
        or ""
    ).strip()


def sender_name(message: dict) -> str:
    sender = nested_dict(message.get("sender")) or nested_dict(message.get("from")) or nested_dict(message.get("user"))
    body = nested_dict(message.get("body"))
    body_sender = nested_dict(body.get("sender")) or nested_dict(body.get("from")) or nested_dict(body.get("user"))
    sender = sender or body_sender
    parts = [str(sender.get("first_name") or "").strip(), str(sender.get("last_name") or "").strip()]
    return str(
        sender.get("name")
        or sender.get("full_name")
        or " ".join(part for part in parts if part)
        or sender.get("username")
        or message.get("sender_name")
        or ""
    ).strip()


def sender_id(message: dict) -> str:
    sender = nested_dict(message.get("sender")) or nested_dict(message.get("from")) or nested_dict(message.get("user"))
    body = nested_dict(message.get("body"))
    body_sender = nested_dict(body.get("sender")) or nested_dict(body.get("from")) or nested_dict(body.get("user"))
    sender = sender or body_sender
    return str(sender.get("id") or sender.get("user_id") or message.get("sender_id") or "").strip()


def message_id(message: dict) -> str:
    body = nested_dict(message.get("body"))
    return str(message.get("id") or message.get("message_id") or message.get("mid") or body.get("mid") or body.get("id") or "").strip()


def message_created_at(message: dict) -> str:
    body = nested_dict(message.get("body"))
    return str(message.get("created_at") or message.get("timestamp") or message.get("date") or body.get("created_at") or body.get("timestamp") or body.get("date") or "").strip()


def message_attachments(message: dict) -> list:
    body = nested_dict(message.get("body"))
    value = message.get("attachments") or message.get("files") or body.get("attachments") or body.get("files") or []
    return value if isinstance(value, list) else []


def message_matches_sender(message: dict, needle: str) -> bool:
    haystack = " ".join([sender_name(message), sender_id(message)]).casefold()
    return needle.casefold() in haystack


def fetch_messages(chat_id: str, limit: int) -> list[dict]:
    token = os.environ.get("MAX_TOKEN", "").strip()
    if not token:
        raise RuntimeError("MAX_TOKEN is not configured")
    url = f"{MAX_API_URL}/messages?{urlencode({'chat_id': chat_id, 'count': str(max(1, min(limit, 200)))})}"
    request = Request(url, headers={"Authorization": token}, method="GET")
    try:
        with urlopen(request, timeout=12) as response:
            return decode_max_response(response.read())
    except HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        raise RuntimeError(f"MAX HTTP {error.code}: {body[:250]}") from error
    except (URLError, TimeoutError, OSError) as error:
        raise RuntimeError(str(error)) from error


def import_latest_message(chat_id: str, sender: str, *, limit: int, mark_in_work: bool) -> dict:
    messages = fetch_messages(chat_id, limit)
    latest = next((message for message in messages if message_matches_sender(message, sender)), None)
    if not latest:
        raise RuntimeError(f"Message from sender '{sender}' was not found in the latest {len(messages)} messages.")
    payload = {
        "source": "max",
        "external_id": message_id(latest) or None,
        "chat_id": chat_id,
        "chat_title": str(nested_dict(latest.get("chat")).get("title") or nested_dict(latest.get("chat")).get("name") or "Рабочий чат MAX"),
        "sender_id": sender_id(latest),
        "sender_name": sender_name(latest) or sender,
        "text": message_text(latest) or "Без текста",
        "created_at": message_created_at(latest),
        "attachments": message_attachments(latest),
    }
    with connect() as db:
        result = insert_feedback_item(db, payload)
        if mark_in_work:
            db.execute(
                """
                UPDATE feedback_items
                SET status = 'in_work',
                    decision_comment = 'Взято в работу из последнего сообщения MAX.',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (int(result["id"]),),
            )
        db.commit()
    return {
        "id": result["id"],
        "duplicate": bool(result.get("duplicate")),
        "sender_name": payload["sender_name"],
        "text_preview": re.sub(r"\s+", " ", payload["text"])[:120],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Import only the latest feedback message from one MAX sender.")
    parser.add_argument("--chat-id", default=os.environ.get("MAX_FEEDBACK_CHAT_ID", ""), help="MAX chat_id. If omitted, the most active feedback chat in DB is used.")
    parser.add_argument("--sender", default="Ксения", help="Sender name or id fragment to search.")
    parser.add_argument("--limit", type=int, default=80, help="How many latest MAX messages to inspect.")
    parser.add_argument("--mark-in-work", action="store_true", help="Immediately mark imported feedback as in work.")
    args = parser.parse_args()
    chat_id = str(args.chat_id or latest_feedback_chat_id()).strip()
    if not chat_id:
        raise SystemExit("MAX chat_id was not found. Pass --chat-id or set MAX_FEEDBACK_CHAT_ID.")
    result = import_latest_message(chat_id, args.sender, limit=args.limit, mark_in_work=args.mark_in_work)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
