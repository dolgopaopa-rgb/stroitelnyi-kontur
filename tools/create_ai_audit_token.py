"""create_ai_audit_token.py - generate a temporary hashed AI audit link."""

from __future__ import annotations

import argparse
import hashlib
import os
import secrets
import sys
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))

from database import connect, init_db  # noqa: E402


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def ensure_audit_user() -> int:
    with connect() as db:
        row = db.execute("SELECT id FROM users WHERE role = 'ai_auditor' AND is_active = 1 ORDER BY id LIMIT 1").fetchone()
        if row:
            return int(row["id"])
        cursor = db.execute(
            "INSERT INTO users (name, role, email, is_active) VALUES (?, 'ai_auditor', ?, 1)",
            ("ИИ-аудитор", "ai-auditor@example.local"),
        )
        db.commit()
        return int(cursor.lastrowid)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a temporary AI audit token.")
    parser.add_argument("--days", type=int, default=3, help="How many days the token stays valid.")
    parser.add_argument("--max-uses", type=int, default=20, help="Maximum number of successful audit logins.")
    parser.add_argument("--unlimited-until-expiry", action="store_true", help="Ignore max uses until expires_at.")
    parser.add_argument("--public-url", default=os.environ.get("APP_PUBLIC_URL", "https://kontur.derevgroup.ru").rstrip("/"))
    args = parser.parse_args()

    init_db()
    user_id = ensure_audit_user()
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.utcnow() + timedelta(days=max(args.days, 1))).strftime("%Y-%m-%d %H:%M:%S")
    max_uses = None if args.unlimited_until_expiry else max(args.max_uses, 1)
    with connect() as db:
        db.execute(
            """
            INSERT INTO audit_tokens (
                token_hash, user_id, role, expires_at, max_uses, unlimited_until_expiry
            )
            VALUES (?, ?, 'ai_auditor', ?, ?, ?)
            """,
            (token_hash(token), user_id, expires_at, max_uses, 1 if args.unlimited_until_expiry else 0),
        )
        db.commit()
    print(f"login_url={args.public_url}/ai-audit-login/{token}")
    print(f"snapshot_url={args.public_url}/ai-audit-snapshot/{token}")
    print(f"expires_at={expires_at} UTC")
    print(f"max_uses={'unlimited_until_expiry' if args.unlimited_until_expiry else max_uses}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
