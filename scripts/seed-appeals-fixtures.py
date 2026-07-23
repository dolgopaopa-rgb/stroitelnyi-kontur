"""Создаёт синтетические фикстуры обращений в отдельной APP_DATA_DIR."""

from __future__ import annotations

import sys

sys.path.insert(0, "app")

from appeals import seed_synthetic_appeals  # noqa: E402
from database import connect, init_db  # noqa: E402


def main() -> None:
    init_db()
    with connect() as db:
        print(seed_synthetic_appeals(db))


if __name__ == "__main__":
    main()
