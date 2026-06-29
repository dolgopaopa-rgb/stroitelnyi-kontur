from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.data_integrity import apply_data_integrity_fixes, run_data_integrity_checks
from app.database import DB_PATH, connect, init_db


BACKUP_DIR = ROOT / "backups" / "data-integrity"


def backup_database() -> str:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = BACKUP_DIR / f"construction-before-data-cleanup-{stamp}.db"
    shutil.copy2(DB_PATH, target)
    return str(target.relative_to(ROOT))


def main() -> int:
    parser = argparse.ArgumentParser(description="Safe Data Integrity cleanup for Stroitelnyi Kontur.")
    parser.add_argument("--apply", action="store_true", help="Apply safe cleanup actions. Without this flag runs dry-run.")
    args = parser.parse_args()

    init_db()
    backup_path = ""
    if args.apply:
        backup_path = backup_database()

    with connect() as db:
        before = run_data_integrity_checks(db)
        cleanup = apply_data_integrity_fixes(db, dry_run=not args.apply)
        if args.apply:
            db.commit()
        after = run_data_integrity_checks(db)

    result = {
        "mode": "apply" if args.apply else "dry_run",
        "backup": backup_path,
        "before": before["summary"],
        "before_warning_counts_by_type": before.get("warning_counts_by_type", {}),
        "cleanup": cleanup,
        "after": after["summary"],
        "after_warning_counts_by_type": after.get("warning_counts_by_type", {}),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not after["summary"].get("critical") else 1


if __name__ == "__main__":
    raise SystemExit(main())
