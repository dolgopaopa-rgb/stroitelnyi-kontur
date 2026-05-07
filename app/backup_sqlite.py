from __future__ import annotations

import os
import sqlite3
import zipfile
from datetime import datetime
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("APP_DATA_DIR", APP_DIR))
DB_PATH = DATA_DIR / "construction.db"
UPLOAD_DIR = DATA_DIR / "uploads"
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
    if UPLOAD_DIR.exists():
        uploads_backup = BACKUP_DIR / f"uploads-{timestamp}.zip"
        with zipfile.ZipFile(uploads_backup, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for file_path in UPLOAD_DIR.rglob("*"):
                if file_path.is_file():
                    archive.write(file_path, file_path.relative_to(UPLOAD_DIR))
        print(f"Uploads backup created: {uploads_backup}")


if __name__ == "__main__":
    main()
