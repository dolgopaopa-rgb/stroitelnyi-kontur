from __future__ import annotations

import os
import sqlite3
import time
import zipfile
from datetime import datetime
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("APP_DATA_DIR", APP_DIR))
DB_PATH = DATA_DIR / "construction.db"
UPLOAD_DIR = DATA_DIR / "uploads"
BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", DATA_DIR / "backups"))
DB_BACKUP_KEEP_DAYS = int(os.environ.get("DB_BACKUP_KEEP_DAYS", "30"))
UPLOAD_BACKUP_KEEP_DAYS = int(os.environ.get("UPLOAD_BACKUP_KEEP_DAYS", "10"))
BACKUP_KEEP_MIN = int(os.environ.get("BACKUP_KEEP_MIN", "3"))


def prune_backups(pattern: str, keep_days: int, keep_min: int = BACKUP_KEEP_MIN) -> None:
    if keep_days <= 0:
        return
    backups = sorted(
        BACKUP_DIR.glob(pattern),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if len(backups) <= keep_min:
        return
    cutoff = time.time() - keep_days * 24 * 60 * 60
    for backup in backups[keep_min:]:
        if backup.stat().st_mtime >= cutoff:
            continue
        backup.unlink()
        print(f"Old backup removed: {backup}")


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
    prune_backups("construction-*.db", DB_BACKUP_KEEP_DAYS)
    prune_backups("uploads-*.zip", UPLOAD_BACKUP_KEEP_DAYS)


if __name__ == "__main__":
    main()
