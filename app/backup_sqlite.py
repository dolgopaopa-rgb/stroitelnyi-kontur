from __future__ import annotations

import os
import sqlite3
from datetime import datetime
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("APP_DATA_DIR", APP_DIR))
DB_PATH = DATA_DIR / "construction.db"
BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", DATA_DIR / "backups"))


def main() -> None:
    if not DB_PATH.exists():
        raise SystemExit(f"Database not found: {DB_PATH}")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = BACKUP_DIR / f"construction-{timestamp}.db"
    with sqlite3.connect(DB_PATH) as source:
        with sqlite3.connect(backup_path) as target:
            source.backup(target)
    print(f"Backup created: {backup_path}")


if __name__ == "__main__":
    main()
