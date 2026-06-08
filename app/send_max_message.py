from __future__ import annotations

import argparse
import base64
import sys

from database import connect
from server import max_message_text_is_corrupted, send_max_message


def latest_feedback_chat_id() -> str:
    with connect() as db:
        row = db.execute(
            """
            SELECT chat_id, COUNT(*) AS count
            FROM feedback_items
            WHERE COALESCE(chat_id, '') != ''
            GROUP BY chat_id
            ORDER BY count DESC
            LIMIT 1
            """
        ).fetchone()
    return str(row["chat_id"] or "").strip() if row else ""


def decode_message(args: argparse.Namespace) -> str:
    if args.message_base64:
        try:
            return base64.b64decode(args.message_base64.encode("ascii"), validate=True).decode("utf-8")
        except UnicodeDecodeError as exc:
            raise SystemExit(f"Message base64 is not UTF-8: {exc}") from exc
        except Exception as exc:
            raise SystemExit(f"Message base64 is invalid: {exc}") from exc
    if args.message_file:
        with open(args.message_file, "r", encoding="utf-8") as file:
            return file.read()
    if not sys.stdin.isatty():
        return sys.stdin.buffer.read().decode("utf-8")
    raise SystemExit("Pass --message-base64, --message-file, or UTF-8 stdin.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Send an employee-facing update to the MAX feedback chat.")
    parser.add_argument("--chat-id", default="", help="MAX chat_id. If omitted, the most active feedback chat is used.")
    parser.add_argument("--message-base64", default="", help="UTF-8 message encoded as base64. Safest for remote shells.")
    parser.add_argument("--message-file", default="", help="UTF-8 text file with the message.")
    args = parser.parse_args()

    message = decode_message(args).strip()
    if not message:
        raise SystemExit("Message is empty.")
    if max_message_text_is_corrupted(message):
        raise SystemExit("Message looks corrupted. Refusing to send question-mark text to MAX.")

    chat_id = str(args.chat_id or latest_feedback_chat_id()).strip()
    if not chat_id:
        raise SystemExit("MAX chat_id was not found.")
    ok, error = send_max_message(chat_id, message)
    if not ok:
        raise SystemExit(error)
    print("sent")


if __name__ == "__main__":
    main()
