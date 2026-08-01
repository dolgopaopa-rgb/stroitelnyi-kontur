"""Явное управление тестовыми миграциями рабочего места обращений.

Пример:
  APPEALS_ENABLED=1 APPEALS_TEST_MODE=1 python scripts/appeals-migrations.py --dry-run
"""

from __future__ import annotations

import argparse
import sys

sys.path.insert(0, "app")

from appeals import apply_migrations, rollback_last_migration  # noqa: E402
from database import connect  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--rollback", action="store_true")
    args = parser.parse_args()
    with connect() as db:
        if args.rollback:
            print(rollback_last_migration(db))
        else:
            print(apply_migrations(db, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
