"""Создаёт синтетические фикстуры только в подтверждённой тестовой APP_DATA_DIR.

Никогда не запускать скрипт без отдельного тестового APP_DATA_DIR.
Каталог должен существовать и быть пустым либо содержать маркер
.d2dom-appeals-test, созданный этим скриптом после проверки пустого каталога.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, "app")

from appeals import AppealError, TEST_DATA_MARKER_NAME, validate_appeals_test_data_dir  # noqa: E402


def main() -> int:
    try:
        data_dir, marker_created = validate_appeals_test_data_dir(allow_empty=True, create_marker=True)
        os.environ["APP_DATA_DIR"] = str(data_dir)
        from appeals import seed_synthetic_appeals
        from database import DB_PATH, connect, init_db

        database_existed = DB_PATH.exists()
        db = None
        error = None
        try:
            init_db()
            db = connect()
            result = seed_synthetic_appeals(db)
        except Exception as exc:
            error = exc
        finally:
            if db is not None:
                db.close()
        if error is not None:
            if not database_existed and DB_PATH.exists():
                DB_PATH.unlink()
            if marker_created and not DB_PATH.exists():
                (data_dir / TEST_DATA_MARKER_NAME).unlink(missing_ok=True)
            raise error
        print(f"APP_DATA_DIR={data_dir}")
        print(f"DB_PATH={DB_PATH}")
        print(f"synthetic_appeals={result.get('appeals', 0)}")
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except (AppealError, OSError, RuntimeError) as exc:
        print(f"Ошибка: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
