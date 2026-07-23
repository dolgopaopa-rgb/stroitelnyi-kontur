"""Безопасный каркас рабочего места обращений.

Модуль намеренно изолирован от существующих рабочих доменов. Он включается
только при явном флаге и тестовом режиме, поэтому обычный запуск Контура не
создаёт новые таблицы и не меняет рабочую базу.
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from datetime import date, datetime
from pathlib import Path
from typing import Any


APPEALS_FLAG = "APPEALS_ENABLED"
APPEALS_TEST_MODE_FLAG = "APPEALS_TEST_MODE"
APPEALS_PILOT_MANAGER_IDS_FLAG = "APPEALS_PILOT_MANAGER_IDS"
APPEALS_ROLES = {"owner", "sales_manager"}
APPEALS_VERSION = 2
TEST_DATA_MARKER_NAME = ".d2dom-appeals-test"
TEST_DATA_MARKER_CONTENT = "D2DOM_APPEALS_TEST_DIR_V1\n"

REQUEST_TYPES = {
    "construction_house": "Строительство загородного дома",
    "interior_finish_house": "Внутренняя отделка загородного дома",
    "reconstruction": "Реконструкция или достройка",
    "apartment_finish": "Комплексная отделка квартиры",
    "separate_works": "Отдельные строительные или отделочные работы",
    "consultation": "Консультация или предварительная оценка",
    "other": "Другое",
}

SOURCE_TYPES = {
    "website": "Сайт",
    "phone": "Телефон",
    "telegram": "Telegram",
    "max": "MAX",
    "social": "Социальные сети",
    "youtube": "YouTube",
    "exhibition": "Выставка",
    "recommendation": "Рекомендация",
    "repeat_customer": "Повторный клиент",
    "partner": "Партнёр",
    "unknown": "Неизвестно",
}

BUDGET_STATES = {
    "unknown": "Неизвестно",
    "not_reported": "Клиент не сообщил",
    "approximate": "Приблизительная сумма",
    "range": "Диапазон",
    "not_applicable": "Неприменимо",
}

STATUSES = {
    "new": "Новое",
    "in_progress": "В работе",
    "needs_data": "Требуются данные",
    "qualified": "Квалифицировано",
    "estimate_preparation": "Подготовка расчёта",
    "estimate_in_progress": "Смета готовится",
    "proposal_in_progress": "КП готовится",
    "negotiation": "Переговоры",
    "awaiting_decision": "Ожидается решение клиента",
    "paused": "Пауза",
    "contract": "Договор",
    "lost": "Потеряно",
    "won": "Закрыто успешно",
}

NEXT_STEP_TYPES = {
    "call": "Позвонить",
    "message": "Написать",
    "request_documents": "Запросить документы",
    "consultation": "Провести консультацию",
    "meeting": "Назначить встречу",
    "site_visit": "Провести выезд",
    "prepare_estimate_task": "Подготовить сметное задание",
    "check_estimate": "Проверить статус сметы",
    "prepare_proposal": "Подготовить КП",
    "approve_price": "Согласовать цену",
    "collect_data": "Собрать данные",
    "prepare_estimate": "Подготовить расчёт",
    "send_proposal": "Отправить КП",
    "client_decision": "Получить решение клиента",
    "prepare_contract": "Подготовить договор",
    "handoff_project": "Передать объект в следующий процесс",
    "follow_up": "Связаться повторно",
    "other": "Другое",
}

CHANNEL_TYPES = {"phone", "email", "telegram", "max", "messenger", "other"}
ARCHIVED_STATUSES = {"lost", "won"}

MIGRATIONS = (
    (
        1,
        "Журнал миграций рабочего места обращений",
        """
        CREATE TABLE IF NOT EXISTS appeal_schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            checksum TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            result TEXT NOT NULL DEFAULT 'applied'
        )
        """,
        "DROP TABLE IF EXISTS appeal_schema_migrations",
    ),
    (
        2,
        "Схема рабочего места обращений",
        """
        CREATE TABLE IF NOT EXISTS appeal_number_sequences (
            year INTEGER PRIMARY KEY,
            last_value INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS appeals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            appeal_number TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            updated_by INTEGER,
            source TEXT NOT NULL DEFAULT 'other',
            customer_id INTEGER,
            contact_name TEXT,
            contact_unknown INTEGER NOT NULL DEFAULT 0,
            contact_channel TEXT,
            contact_channel_type TEXT,
            contact_snapshot TEXT,
            request_type TEXT NOT NULL,
            request_comment TEXT,
            region TEXT,
            address TEXT,
            description TEXT NOT NULL,
            manager_id INTEGER,
            status TEXT NOT NULL DEFAULT 'new',
            next_step_type TEXT NOT NULL,
            next_step_comment TEXT NOT NULL,
            next_step_date TEXT,
            last_contact_at TEXT,
            close_result TEXT,
            loss_reason TEXT,
            loss_comment TEXT,
            closed_at TEXT,
            budget_state TEXT NOT NULL,
            budget_min REAL,
            budget_max REAL,
            budget_comment TEXT,
            desired_period TEXT,
            object_type TEXT,
            area TEXT,
            project_readiness TEXT,
            project_id INTEGER,
            estimate_job_id INTEGER,
            manager_comment TEXT,
            recommender TEXT,
            campaign TEXT,
            archived_at TEXT,
            archived_by INTEGER,
            archive_reason TEXT,
            version INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (created_by) REFERENCES users(id),
            FOREIGN KEY (updated_by) REFERENCES users(id),
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
            FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
            FOREIGN KEY (estimate_job_id) REFERENCES estimate_jobs(id) ON DELETE SET NULL,
            FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS appeal_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            appeal_id INTEGER NOT NULL,
            actor_id INTEGER,
            event_type TEXT NOT NULL,
            status_from TEXT,
            status_to TEXT,
            payload_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (appeal_id) REFERENCES appeals(id) ON DELETE CASCADE,
            FOREIGN KEY (actor_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS appeal_idempotency_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            idempotency_key TEXT NOT NULL UNIQUE,
            appeal_id INTEGER NOT NULL,
            request_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (appeal_id) REFERENCES appeals(id) ON DELETE CASCADE
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_appeals_number ON appeals(appeal_number);
        CREATE INDEX IF NOT EXISTS idx_appeals_manager_status ON appeals(manager_id, status);
        CREATE INDEX IF NOT EXISTS idx_appeals_next_step ON appeals(next_step_date, status);
        CREATE INDEX IF NOT EXISTS idx_appeal_events_appeal ON appeal_events(appeal_id, created_at);
        """,
        """
        DROP TABLE IF EXISTS appeal_idempotency_keys;
        DROP TABLE IF EXISTS appeal_events;
        DROP TABLE IF EXISTS appeals;
        DROP TABLE IF EXISTS appeal_number_sequences;
        """,
    ),
)


class AppealError(ValueError):
    """Ошибки бизнес-валидации с HTTP-статусом."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _truthy(value: object) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def appeals_enabled() -> bool:
    return _truthy(os.environ.get(APPEALS_FLAG)) and _truthy(os.environ.get(APPEALS_TEST_MODE_FLAG))


def _test_data_paths() -> set[Path]:
    app_dir = Path(__file__).resolve().parent
    project_dir = app_dir.parent
    paths = {
        app_dir,
        project_dir,
        project_dir / "data",
        project_dir / "production",
        project_dir / "runtime",
        project_dir / "var",
        Path.cwd(),
        Path.cwd() / "app",
        Path.cwd() / "data",
        Path.cwd() / "production",
    }
    configured = os.environ.get("APP_PRODUCTION_DATA_DIR", "").strip()
    if configured:
        paths.add(Path(configured).expanduser())
    return {path.resolve() for path in paths}


def validate_appeals_test_data_dir(*, allow_empty: bool = False, create_marker: bool = False) -> tuple[Path, bool]:
    """Fail closed unless the appeals test database is explicitly isolated."""
    if os.environ.get(APPEALS_TEST_MODE_FLAG, "") != "1":
        raise AppealError("Для synthetic-фикстур нужен явный APPEALS_TEST_MODE=1.", 500)
    raw_path = os.environ.get("APP_DATA_DIR", "").strip()
    if not raw_path:
        raise AppealError("Для synthetic-фикстур нужен отдельный APP_DATA_DIR.", 500)
    data_dir = Path(raw_path).expanduser().resolve()
    standard_db = (Path(__file__).resolve().parent / "construction.db").resolve()
    if data_dir in _test_data_paths() or (data_dir / "construction.db").resolve() == standard_db:
        raise AppealError("APP_DATA_DIR указывает на стандартный или рабочий каталог.", 500)
    if not data_dir.exists() or not data_dir.is_dir():
        raise AppealError("APP_DATA_DIR должен указывать на заранее созданный каталог.", 500)

    marker = data_dir / TEST_DATA_MARKER_NAME
    marker_created = False
    entries = {entry.name for entry in data_dir.iterdir()}
    if marker.exists():
        if not marker.is_file() or marker.read_text(encoding="utf-8") != TEST_DATA_MARKER_CONTENT:
            raise AppealError("Каталог тестовых данных имеет неподтверждённый маркер.", 500)
        if "uploads" in entries and not (data_dir / "uploads").is_dir():
            raise AppealError("Каталог тестовых данных содержит некорректный uploads.", 500)
        unexpected = entries - {TEST_DATA_MARKER_NAME, "construction.db", "uploads"}
        if unexpected:
            raise AppealError("Каталог тестовых данных содержит неожиданные файлы.", 500)
    elif entries:
        raise AppealError("Непустой APP_DATA_DIR требует явного тестового маркера.", 500)
    elif allow_empty and create_marker:
        marker.write_text(TEST_DATA_MARKER_CONTENT, encoding="utf-8", newline="")
        marker_created = True
    else:
        raise AppealError("APP_DATA_DIR не подтверждён как тестовый каталог.", 500)
    return data_dir, marker_created


def pilot_manager_ids() -> set[int]:
    result: set[int] = set()
    for raw_value in os.environ.get(APPEALS_PILOT_MANAGER_IDS_FLAG, "").split(","):
        try:
            value = int(raw_value.strip())
        except (TypeError, ValueError):
            continue
        if value > 0:
            result.add(value)
    return result


def appeals_config(account: dict | None = None) -> dict[str, Any]:
    enabled = appeals_enabled()
    return {
        "enabled": enabled,
        "allowed": can_view_appeals(account),
        "version": APPEALS_VERSION,
        "feature": "Рабочее место обращений",
        "feature_flags": {APPEALS_FLAG: _truthy(os.environ.get(APPEALS_FLAG)), APPEALS_TEST_MODE_FLAG: _truthy(os.environ.get(APPEALS_TEST_MODE_FLAG))},
        "reason": "Функция выключена по умолчанию; для локальной проверки нужны APPEALS_ENABLED=1 и APPEALS_TEST_MODE=1." if not enabled else "Включено только в отдельной тестовой среде.",
        "roles": ["owner", "sales_manager"],
        "sources": SOURCE_TYPES,
        "statuses": STATUSES,
        "request_types": REQUEST_TYPES,
        "next_step_types": NEXT_STEP_TYPES,
        "budget_states": BUDGET_STATES,
    }


def _migration_checksum(sql: str) -> str:
    return hashlib.sha256(" ".join(sql.split()).encode("utf-8")).hexdigest()


def _migration_table_exists(db: sqlite3.Connection) -> bool:
    return bool(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='appeal_schema_migrations'").fetchone())


def applied_migrations(db: sqlite3.Connection) -> list[dict[str, Any]]:
    if not _migration_table_exists(db):
        return []
    return [dict(row) for row in db.execute("SELECT * FROM appeal_schema_migrations ORDER BY version").fetchall()]


def apply_migrations(db: sqlite3.Connection, *, dry_run: bool = False) -> dict[str, Any]:
    """Применяет только новые миграции и проверяет checksum уже применённых."""
    if not _migration_table_exists(db):
        if dry_run:
            return {"pending": [version for version, *_ in MIGRATIONS], "applied": [], "dry_run": True}
        db.executescript(MIGRATIONS[0][2])
    existing = {} if dry_run and not _migration_table_exists(db) else {
        int(row["version"]): row for row in db.execute("SELECT * FROM appeal_schema_migrations").fetchall()
    }
    pending: list[int] = []
    applied: list[int] = []
    for version, name, sql, _rollback in MIGRATIONS:
        checksum = _migration_checksum(sql)
        row = existing.get(version)
        if row:
            if row["checksum"] != checksum:
                raise AppealError(f"Миграция обращений {version} была изменена после применения.", 500)
            continue
        pending.append(version)
        if dry_run:
            continue
        try:
            db.execute("BEGIN")
        except sqlite3.OperationalError:
            pass
        try:
            db.executescript(sql)
            db.execute(
                "INSERT INTO appeal_schema_migrations(version, name, checksum, result) VALUES (?, ?, ?, 'applied')",
                (version, name, checksum),
            )
            db.commit()
            applied.append(version)
        except Exception:
            db.rollback()
            raise
    return {"pending": pending, "applied": applied, "dry_run": dry_run}


def rollback_last_migration(db: sqlite3.Connection) -> dict[str, Any]:
    rows = applied_migrations(db)
    if not rows:
        return {"rolled_back": None, "message": "Применённых миграций нет."}
    version = int(rows[-1]["version"])
    migration = next(item for item in MIGRATIONS if item[0] == version)
    if version == 1 and _migration_table_exists(db):
        if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='appeals'").fetchone():
            raise AppealError("Сначала откатите схему обращений (миграцию 2).", 409)
    db.executescript(migration[3])
    if version != 1 and _migration_table_exists(db):
        db.execute("DELETE FROM appeal_schema_migrations WHERE version = ?", (version,))
        db.commit()
    return {"rolled_back": version}


def ensure_migrations(db: sqlite3.Connection) -> None:
    result = apply_migrations(db)
    if set(result["pending"]) - set(result["applied"]):
        raise AppealError("Не все миграции рабочего места обращений применены.", 500)


def can_view_appeals(account: dict | None) -> bool:
    if not appeals_enabled():
        return False
    role = str((account or {}).get("role") or "")
    if role == "owner":
        return True
    return role == "sales_manager" and _user_id(account) in pilot_manager_ids()


def can_manage_appeals(account: dict | None) -> bool:
    return can_view_appeals(account)


def _user_id(account: dict | None) -> int | None:
    try:
        return int((account or {}).get("user_id") or 0) or None
    except (TypeError, ValueError):
        return None


def _role(account: dict | None) -> str:
    return str((account or {}).get("role") or "")


def _as_int(value: object) -> int | None:
    try:
        return int(value or 0) or None
    except (TypeError, ValueError):
        return None


def _clean(value: object) -> str:
    return str(value or "").strip()


def _date_or_none(value: object) -> str | None:
    value = _clean(value)
    if not value:
        return None
    try:
        date.fromisoformat(value[:10])
    except ValueError as exc:
        raise AppealError("Дата должна быть в формате ГГГГ-ММ-ДД.") from exc
    return value[:10]


def _validate_type(data: dict[str, Any]) -> None:
    request_type = _clean(data.get("request_type"))
    if request_type not in REQUEST_TYPES:
        raise AppealError("Выберите тип обращения из утверждённого списка.")
    if request_type == "other" and not _clean(data.get("request_comment")):
        raise AppealError("Для типа «Другое» укажите комментарий.")


def _validate_source(data: dict[str, Any]) -> str:
    source = _clean(data.get("source")) or "unknown"
    if source not in SOURCE_TYPES:
        raise AppealError("Выберите источник обращения из утверждённого списка.")
    return source


def _validate_contact(data: dict[str, Any]) -> None:
    name = _clean(data.get("contact_name"))
    unknown = bool(data.get("contact_unknown"))
    channel = _clean(data.get("contact_channel"))
    channel_type = _clean(data.get("contact_channel_type"))
    if not name and not unknown:
        raise AppealError("Укажите имя клиента или отметьте «Имя пока неизвестно».")
    if not channel or channel_type not in CHANNEL_TYPES:
        raise AppealError("Добавьте один подтверждённый канал связи и укажите его тип.")


def _validate_budget(data: dict[str, Any]) -> tuple[str, float | None, float | None]:
    state = _clean(data.get("budget_state"))
    if state not in BUDGET_STATES:
        raise AppealError("Укажите состояние бюджета.")
    minimum = data.get("budget_min")
    maximum = data.get("budget_max")
    try:
        minimum = float(minimum) if minimum not in (None, "") else None
        maximum = float(maximum) if maximum not in (None, "") else None
    except (TypeError, ValueError) as exc:
        raise AppealError("Диапазон бюджета должен быть числовым.") from exc
    if state == "range" and (minimum is None or maximum is None or minimum > maximum):
        raise AppealError("Для бюджета «Диапазон» укажите корректные минимальную и максимальную суммы.")
    if state != "range":
        minimum = None
        maximum = None
    return state, minimum, maximum


def _validate_next_step(data: dict[str, Any], *, require_date: bool = True) -> tuple[str, str, str | None]:
    step_type = _clean(data.get("next_step_type"))
    step_comment = _clean(data.get("next_step_comment"))
    step_date = _date_or_none(data.get("next_step_date"))
    if step_type not in NEXT_STEP_TYPES:
        raise AppealError("Укажите следующий шаг.")
    if not step_comment:
        raise AppealError("Опишите следующий шаг коротким комментарием.")
    if require_date and not step_date:
        raise AppealError("Для активного обращения укажите дату следующего шага.")
    return step_type, step_comment, step_date


def _lookup(db: sqlite3.Connection, table: str, item_id: int | None) -> bool:
    if not item_id:
        return True
    return bool(db.execute(f"SELECT 1 FROM {table} WHERE id = ?", (item_id,)).fetchone())


def _validate_links(db: sqlite3.Connection, data: dict[str, Any]) -> tuple[int | None, int | None, int | None, int | None]:
    customer_id = _as_int(data.get("customer_id"))
    project_id = _as_int(data.get("project_id"))
    estimate_job_id = _as_int(data.get("estimate_job_id"))
    manager_id = _as_int(data.get("manager_id"))
    if not _lookup(db, "customers", customer_id):
        raise AppealError("Клиент не найден.", 404)
    if not _lookup(db, "projects", project_id):
        raise AppealError("Объект не найден.", 404)
    if not _lookup(db, "estimate_jobs", estimate_job_id):
        raise AppealError("Сметное задание не найдено.", 404)
    if manager_id:
        manager = db.execute("SELECT role, is_active FROM users WHERE id = ?", (manager_id,)).fetchone()
        if not manager or not manager["is_active"] or manager["role"] != "sales_manager":
            raise AppealError("Ответственным можно назначить только активного менеджера.")
    return customer_id, project_id, estimate_job_id, manager_id


def _next_number(db: sqlite3.Connection, year: int) -> str:
    db.execute("INSERT OR IGNORE INTO appeal_number_sequences(year, last_value) VALUES (?, 0)", (year,))
    db.execute("UPDATE appeal_number_sequences SET last_value = last_value + 1 WHERE year = ?", (year,))
    value = int(db.execute("SELECT last_value FROM appeal_number_sequences WHERE year = ?", (year,)).fetchone()[0])
    return f"{year:04d}-{value:06d}"


def _request_hash(data: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(data, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def _event(db: sqlite3.Connection, appeal_id: int, actor_id: int | None, event_type: str, **payload: Any) -> None:
    cursor = db.execute(
        "INSERT INTO appeal_events(appeal_id, actor_id, event_type, status_from, status_to, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
        (appeal_id, actor_id, event_type, payload.pop("status_from", None), payload.pop("status_to", None), json.dumps(payload, ensure_ascii=False)),
    )


def _row(db: sqlite3.Connection, appeal_id: int) -> sqlite3.Row | None:
    return db.execute(
        """
        SELECT a.*, creator.name AS creator_name, updater.name AS updater_name,
               manager.name AS manager_name, customer.name AS customer_name,
               project.title AS project_title, estimate.title AS estimate_job_title
        FROM appeals a
        LEFT JOIN users creator ON creator.id = a.created_by
        LEFT JOIN users updater ON updater.id = a.updated_by
        LEFT JOIN users manager ON manager.id = a.manager_id
        LEFT JOIN customers customer ON customer.id = a.customer_id
        LEFT JOIN projects project ON project.id = a.project_id
        LEFT JOIN estimate_jobs estimate ON estimate.id = a.estimate_job_id
        WHERE a.id = ?
        """,
        (appeal_id,),
    ).fetchone()


def _visible(row: sqlite3.Row | dict[str, Any], account: dict | None) -> bool:
    if _role(account) == "owner":
        return True
    return _role(account) == "sales_manager" and int(row.get("manager_id") if isinstance(row, dict) else row["manager_id"] or 0) == int(_user_id(account) or 0)


def serialize_appeal(db: sqlite3.Connection, row: sqlite3.Row | dict[str, Any], account: dict | None, *, include_events: bool = False) -> dict[str, Any]:
    item = dict(row)
    if _role(account) != "owner":
        item["contact_snapshot"] = None
    item["status_label"] = STATUSES.get(item.get("status"), "Неизвестный статус")
    item["source_label"] = SOURCE_TYPES.get(item.get("source"), "Неизвестно")
    item["request_type_label"] = REQUEST_TYPES.get(item.get("request_type"), "Не разобрано")
    item["budget_state_label"] = BUDGET_STATES.get(item.get("budget_state"), "Неизвестно")
    item["next_step_type_label"] = NEXT_STEP_TYPES.get(item.get("next_step_type"), "Не указан")
    if include_events:
        events = db.execute(
            "SELECT e.*, u.name AS actor_name FROM appeal_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.appeal_id = ? ORDER BY e.created_at DESC, e.id DESC",
            (item["id"],),
        ).fetchall()
        item["events"] = [dict(event) | {"payload": json.loads(event["payload_json"] or "{}")} for event in events]
    item.pop("contact_snapshot", None) if _role(account) != "owner" else None
    return item


def list_appeals(db: sqlite3.Connection, account: dict | None, *, status: str = "", manager_id: int | None = None, overdue: bool = False, archived: bool = False) -> list[dict[str, Any]]:
    where = ["1=1"]
    params: list[Any] = []
    if _role(account) == "sales_manager":
        where.append("a.manager_id = ?")
        params.append(_user_id(account))
    if status and status in STATUSES:
        where.append("a.status = ?")
        params.append(status)
    if manager_id:
        where.append("a.manager_id = ?")
        params.append(manager_id)
    if overdue:
        where.append("a.next_step_date IS NOT NULL AND date(a.next_step_date) < date('now') AND a.status NOT IN ('lost', 'won')")
    where.append("a.archived_at IS NOT NULL" if archived else "a.archived_at IS NULL")
    rows = db.execute(
        f"""
        SELECT a.*, creator.name AS creator_name, updater.name AS updater_name,
               manager.name AS manager_name, customer.name AS customer_name,
               project.title AS project_title, estimate.title AS estimate_job_title
        FROM appeals a
        LEFT JOIN users creator ON creator.id = a.created_by
        LEFT JOIN users updater ON updater.id = a.updated_by
        LEFT JOIN users manager ON manager.id = a.manager_id
        LEFT JOIN customers customer ON customer.id = a.customer_id
        LEFT JOIN projects project ON project.id = a.project_id
        LEFT JOIN estimate_jobs estimate ON estimate.id = a.estimate_job_id
        WHERE {' AND '.join(where)}
        ORDER BY CASE WHEN a.next_step_date IS NOT NULL AND date(a.next_step_date) < date('now') THEN 0 ELSE 1 END, a.updated_at DESC, a.id DESC
        """,
        params,
    ).fetchall()
    return [serialize_appeal(db, row, account) for row in rows]


def create_appeal(db: sqlite3.Connection, data: dict[str, Any], account: dict | None) -> dict[str, Any]:
    if not can_manage_appeals(account):
        raise AppealError("Раздел обращений недоступен для этой роли.", 403)
    _validate_type(data)
    source = _validate_source(data)
    _validate_contact(data)
    budget_state, budget_min, budget_max = _validate_budget(data)
    next_step_type, next_step_comment, next_step_date = _validate_next_step(data)
    customer_id, project_id, estimate_job_id, manager_id = _validate_links(db, data)
    actor_id = _user_id(account)
    if _role(account) == "sales_manager":
        manager_id = actor_id
    if not manager_id:
        raise AppealError("Назначьте менеджера или создайте обращение под ролью менеджера.")
    status = _clean(data.get("status")) or "new"
    if status not in STATUSES:
        raise AppealError("Недопустимый статус обращения.")
    if status != "new" and not data.get("_synthetic_fixture"):
        raise AppealError("Новое обращение создаётся только со статусом «Новое».")
    if status == "lost" and not _clean(data.get("loss_reason")):
        raise AppealError("Для потерянного обращения укажите причину.")
    if status == "won" and (_role(account) != "owner" or not _clean(data.get("close_result"))):
        raise AppealError("Успешное закрытие подтверждает владелец с результатом.", 403 if _role(account) != "owner" else 400)
    key = _clean(data.get("idempotency_key"))
    request_hash = _request_hash(data)
    if key:
        previous = db.execute("SELECT appeal_id, request_hash FROM appeal_idempotency_keys WHERE idempotency_key = ?", (key,)).fetchone()
        if previous:
            if previous["request_hash"] != request_hash:
                raise AppealError("Этот ключ уже использован для другого обращения.", 409)
            existing = _row(db, int(previous["appeal_id"]))
            return serialize_appeal(db, existing, account) if existing else {"id": previous["appeal_id"]}
    now_year = datetime.now().year
    try:
        db.execute("BEGIN IMMEDIATE")
    except sqlite3.OperationalError:
        pass
    try:
        number = _next_number(db, now_year)
        placeholders = ", ".join("?" for _ in range(35))
        cursor = db.execute(
            f"""
            INSERT INTO appeals(
                appeal_number, created_by, updated_by, source, customer_id, contact_name,
                contact_unknown, contact_channel, contact_channel_type, contact_snapshot,
                request_type, request_comment, region, address, description, manager_id,
                status, next_step_type, next_step_comment, next_step_date, last_contact_at,
                loss_reason, budget_state, budget_min, budget_max, budget_comment,
                desired_period, object_type, area, project_readiness, project_id,
                estimate_job_id, manager_comment, recommender, campaign
            ) VALUES ({placeholders})
            """,
            (
                number, actor_id, actor_id, source, customer_id,
                _clean(data.get("contact_name")) or None, int(bool(data.get("contact_unknown"))),
                _clean(data.get("contact_channel")), _clean(data.get("contact_channel_type")),
                json.dumps({"name": _clean(data.get("contact_name")), "channel": _clean(data.get("contact_channel")), "channel_type": _clean(data.get("contact_channel_type"))}, ensure_ascii=False),
                _clean(data.get("request_type")), _clean(data.get("request_comment")) or None,
                _clean(data.get("region")) or None, _clean(data.get("address")) or None,
                _clean(data.get("description")), manager_id, status, next_step_type,
                next_step_comment, next_step_date, _date_or_none(data.get("last_contact_at")),
                _clean(data.get("loss_reason")) or None, budget_state, budget_min, budget_max,
                _clean(data.get("budget_comment")) or None, _clean(data.get("desired_period")) or None,
                _clean(data.get("object_type")) or None, _clean(data.get("area")) or None,
                _clean(data.get("project_readiness")) or None, project_id, estimate_job_id,
                _clean(data.get("manager_comment")) or None, _clean(data.get("recommender")) or None,
                _clean(data.get("campaign")) or None,
            ),
        )
        appeal_id = int(cursor.lastrowid)
        _event(db, appeal_id, actor_id, "created", status_to=status, appeal_number=number)
        if key:
            db.execute("INSERT INTO appeal_idempotency_keys(idempotency_key, appeal_id, request_hash) VALUES (?, ?, ?)", (key, appeal_id, request_hash))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return serialize_appeal(db, _row(db, appeal_id), account, include_events=True)


def update_appeal(db: sqlite3.Connection, appeal_id: int, data: dict[str, Any], account: dict | None) -> dict[str, Any]:
    row = _row(db, appeal_id)
    if not row:
        raise AppealError("Обращение не найдено.", 404)
    if not _visible(row, account):
        raise AppealError("Обращение недоступно для этой роли.", 403)
    if _role(account) != "owner" and data.get("manager_id") not in (None, "", _user_id(account), str(_user_id(account))):
        raise AppealError("Менеджер может изменять только свои обращения.", 403)
    expected_version = _as_int(data.get("version"))
    if expected_version and int(row["version"]) != expected_version:
        raise AppealError("Обращение уже изменено другим пользователем.", 409)
    mutable = {
        "description", "region", "address", "next_step_type", "next_step_comment", "next_step_date",
        "last_contact_at", "budget_state", "budget_min", "budget_max", "budget_comment", "desired_period",
        "object_type", "area", "project_readiness", "project_id", "estimate_job_id", "manager_comment",
        "recommender", "campaign", "customer_id", "contact_name", "contact_unknown", "contact_channel", "manager_id",
        "contact_channel_type", "request_comment",
    }
    values = dict(row)
    values.update({key: data[key] for key in mutable if key in data})
    _validate_type(values)
    values["source"] = row["source"]
    _validate_contact(values)
    budget_state, budget_min, budget_max = _validate_budget(values)
    step_type, step_comment, step_date = _validate_next_step(values, require_date=str(row["status"]) not in ARCHIVED_STATUSES)
    customer_id, project_id, estimate_job_id, manager_id = _validate_links(db, values)
    if _role(account) != "owner" and manager_id != _user_id(account):
        raise AppealError("Менеджер может изменять только свои обращения.", 403)
    actor_id = _user_id(account)
    cursor = db.execute(
        """
        UPDATE appeals SET description=?, region=?, address=?, customer_id=?, contact_name=?, contact_unknown=?, manager_id=?,
            contact_channel=?, contact_channel_type=?, request_comment=?, next_step_type=?, next_step_comment=?,
            next_step_date=?, last_contact_at=?, budget_state=?, budget_min=?, budget_max=?, budget_comment=?,
            desired_period=?, object_type=?, area=?, project_readiness=?, project_id=?, estimate_job_id=?,
            manager_comment=?, recommender=?, campaign=?, updated_by=?, updated_at=CURRENT_TIMESTAMP, version=version+1
        WHERE id=? AND version=?
        """,
        (
            _clean(values.get("description")), _clean(values.get("region")) or None, _clean(values.get("address")) or None,
            customer_id, _clean(values.get("contact_name")) or None, int(bool(values.get("contact_unknown"))),
            manager_id, _clean(values.get("contact_channel")), _clean(values.get("contact_channel_type")), _clean(values.get("request_comment")) or None,
            step_type, step_comment, step_date, _date_or_none(values.get("last_contact_at")), budget_state, budget_min,
            budget_max, _clean(values.get("budget_comment")) or None, _clean(values.get("desired_period")) or None,
            _clean(values.get("object_type")) or None, _clean(values.get("area")) or None,
            _clean(values.get("project_readiness")) or None, project_id, estimate_job_id, _clean(values.get("manager_comment")) or None,
            _clean(values.get("recommender")) or None, _clean(values.get("campaign")) or None, actor_id, appeal_id, int(row["version"]),
        ),
    )
    if cursor.rowcount == 0:
        raise AppealError("Обращение уже изменено другим пользователем.", 409)
    _event(db, appeal_id, actor_id, "updated", version=int(row["version"]) + 1)
    db.commit()
    return serialize_appeal(db, _row(db, appeal_id), account, include_events=True)


ALLOWED_TRANSITIONS = {
    "new": {"in_progress", "needs_data", "lost"},
    "in_progress": {"needs_data", "qualified", "paused", "lost"},
    "needs_data": {"in_progress", "qualified", "lost", "paused"},
    "qualified": {"estimate_preparation", "proposal_in_progress", "negotiation", "lost", "paused"},
    "estimate_preparation": {"estimate_in_progress", "needs_data", "lost", "paused"},
    "estimate_in_progress": {"proposal_in_progress", "needs_data", "lost", "paused"},
    "proposal_in_progress": {"negotiation", "needs_data", "lost", "paused"},
    "negotiation": {"awaiting_decision", "contract", "lost", "paused"},
    "awaiting_decision": {"contract", "lost", "paused", "in_progress"},
    "paused": {"in_progress", "needs_data", "lost"},
    "contract": {"won", "lost"},
    "lost": {"in_progress"},
    "won": set(),
}


def transition_appeal(db: sqlite3.Connection, appeal_id: int, data: dict[str, Any], account: dict | None) -> dict[str, Any]:
    row = _row(db, appeal_id)
    if not row:
        raise AppealError("Обращение не найдено.", 404)
    if not _visible(row, account):
        raise AppealError("Обращение недоступно для этой роли.", 403)
    next_status = _clean(data.get("status"))
    current = str(row["status"])
    actor_id = _user_id(account)
    if next_status not in STATUSES:
        raise AppealError("Недопустимый статус обращения.")
    if next_status not in ALLOWED_TRANSITIONS.get(current, set()):
        raise AppealError(f"Переход «{STATUSES.get(current, current)}» → «{STATUSES.get(next_status, next_status)}» запрещён.", 409)
    expected_version = _as_int(data.get("version"))
    if expected_version and int(row["version"]) != expected_version:
        raise AppealError("Обращение уже изменено другим пользователем.", 409)
    if next_status == "lost" and not _clean(data.get("loss_reason")):
        raise AppealError("Для статуса «Потеряно» обязательна причина.")
    if next_status == "won" and _role(account) != "owner":
        raise AppealError("Закрыть обращение успешно может только владелец.", 403)
    if next_status == "won" and not _clean(data.get("close_result")):
        raise AppealError("Для успешного закрытия укажите подтверждение и основание.")
    if current == "lost" and next_status == "in_progress" and not _clean(data.get("reopen_reason")):
        raise AppealError("Для повторного открытия укажите причину.")
    next_step_type, next_step_comment, next_step_date = _validate_next_step({**dict(row), **data}, require_date=next_status not in ARCHIVED_STATUSES)
    cursor = db.execute(
        """
        UPDATE appeals SET status=?, next_step_type=?, next_step_comment=?, next_step_date=?,
            loss_reason=?, loss_comment=?, close_result=?, closed_at=?, updated_by=?, updated_at=CURRENT_TIMESTAMP,
            version=version+1 WHERE id=? AND version=?
        """,
        (
            next_status, next_step_type, next_step_comment, next_step_date, _clean(data.get("loss_reason")) or row["loss_reason"],
            _clean(data.get("loss_comment")) or row["loss_comment"], _clean(data.get("close_result")) or row["close_result"],
            datetime.now().isoformat(timespec="seconds") if next_status in {"lost", "won"} else None,
            actor_id, appeal_id, int(row["version"]),
        ),
    )
    if cursor.rowcount == 0:
        raise AppealError("Обращение уже изменено другим пользователем.", 409)
    _event(db, appeal_id, actor_id, "status_changed", status_from=current, status_to=next_status, reason=_clean(data.get("reopen_reason")) or _clean(data.get("loss_reason")) or _clean(data.get("close_result")))
    db.commit()
    return serialize_appeal(db, _row(db, appeal_id), account, include_events=True)


def archive_appeal(db: sqlite3.Connection, appeal_id: int, data: dict[str, Any], account: dict | None) -> dict[str, Any]:
    row = _row(db, appeal_id)
    if not row:
        raise AppealError("Обращение не найдено.", 404)
    if _role(account) == "sales_manager" and int(row["manager_id"] or 0) != int(_user_id(account) or 0):
        raise AppealError("Менеджер может архивировать только свои обращения.", 403)
    if _role(account) not in {"owner", "sales_manager"}:
        raise AppealError("Архивировать обращения может только владелец или ответственный менеджер.", 403)
    if _role(account) == "sales_manager" and row["status"] not in ARCHIVED_STATUSES:
        raise AppealError("Менеджер может архивировать только закрытое обращение.", 403)
    reason = _clean(data.get("reason"))
    if not reason:
        raise AppealError("Укажите причину архивирования.")
    db.execute("UPDATE appeals SET archived_at=CURRENT_TIMESTAMP, archived_by=?, archive_reason=?, updated_by=?, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?", (_user_id(account), reason, _user_id(account), appeal_id))
    _event(db, appeal_id, _user_id(account), "archived", reason=reason)
    db.commit()
    return serialize_appeal(db, _row(db, appeal_id), account, include_events=True)


def restore_appeal(db: sqlite3.Connection, appeal_id: int, data: dict[str, Any], account: dict | None) -> dict[str, Any]:
    row = _row(db, appeal_id)
    if not row:
        raise AppealError("Обращение не найдено.", 404)
    if _role(account) != "owner":
        raise AppealError("Восстановить обращение может только владелец.", 403)
    reason = _clean(data.get("reason"))
    if not reason:
        raise AppealError("Укажите причину восстановления.")
    db.execute("UPDATE appeals SET archived_at=NULL, archived_by=NULL, archive_reason=NULL, updated_by=?, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?", (_user_id(account), appeal_id))
    _event(db, appeal_id, _user_id(account), "restored", reason=reason)
    db.commit()
    return serialize_appeal(db, _row(db, appeal_id), account, include_events=True)


def summary(db: sqlite3.Connection, account: dict | None) -> dict[str, Any]:
    items = list_appeals(db, account)
    counts = {key: 0 for key in STATUSES}
    for item in items:
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    today = date.today().isoformat()
    return {
        "total": len(items),
        "by_status": counts,
        "overdue_next_steps": sum(1 for item in items if item.get("next_step_date") and item["next_step_date"] < today and item["status"] not in ARCHIVED_STATUSES),
        "without_next_step": sum(1 for item in items if not item.get("next_step_type") or not item.get("next_step_comment")),
        "requires_action": sum(1 for item in items if item["status"] not in ARCHIVED_STATUSES and (not item.get("next_step_date") or item["next_step_date"] <= today)),
    }


def api_get(db: sqlite3.Connection, path: str, query: dict[str, list[str]], account: dict | None) -> tuple[bool, object, int]:
    if path == "/api/appeals/config":
        return True, appeals_config(account), 200
    if not appeals_enabled():
        return True, {"error": "Раздел обращений выключен."}, 404
    ensure_migrations(db)
    if not can_view_appeals(account):
        return True, {"error": "Раздел обращений недоступен для этой роли."}, 403
    if path == "/api/appeals":
        return True, list_appeals(db, account, status=_clean((query.get("status") or [""])[0]), manager_id=_as_int((query.get("manager_id") or [""])[0]), overdue=_clean((query.get("filter") or [""])[0]) == "overdue", archived=_clean((query.get("archived") or [""])[0]) == "1"), 200
    if path == "/api/appeals/summary":
        return True, summary(db, account), 200
    if path == "/api/appeals/dictionaries":
        return True, {"sources": SOURCE_TYPES, "request_types": REQUEST_TYPES, "statuses": STATUSES, "next_step_types": NEXT_STEP_TYPES, "budget_states": BUDGET_STATES}, 200
    if path.startswith("/api/appeals/"):
        suffix = path[len("/api/appeals/"):]
        if suffix.endswith("/events"):
            appeal_id = _as_int(suffix[:-7])
            row = _row(db, appeal_id)
            if not row or not _visible(row, account):
                return True, {"error": "Обращение не найдено."}, 404
            return True, serialize_appeal(db, row, account, include_events=True).get("events", []), 200
        appeal_id = _as_int(suffix)
        if appeal_id:
            row = _row(db, appeal_id)
            if not row or not _visible(row, account):
                return True, {"error": "Обращение не найдено."}, 404
            return True, serialize_appeal(db, row, account, include_events=True), 200
    return False, None, 404


def api_post(db: sqlite3.Connection, path: str, data: dict[str, Any], account: dict | None) -> tuple[bool, object, int]:
    if path == "/api/appeals/config":
        return True, appeals_config(account), 200
    if not path.startswith("/api/appeals"):
        return False, None, 404
    if not appeals_enabled():
        return True, {"error": "Раздел обращений выключен."}, 404
    ensure_migrations(db)
    if not can_manage_appeals(account):
        return True, {"error": "Раздел обращений недоступен для этой роли."}, 403
    try:
        if path == "/api/appeals":
            return True, create_appeal(db, data, account), 201
        suffix = path[len("/api/appeals/"):]
        parts = suffix.split("/")
        appeal_id = _as_int(parts[0]) if parts else None
        if not appeal_id:
            return True, {"error": "Обращение не найдено."}, 404
        if len(parts) == 2 and parts[1] == "update":
            return True, update_appeal(db, appeal_id, data, account), 200
        if len(parts) == 2 and parts[1] == "transition":
            return True, transition_appeal(db, appeal_id, data, account), 200
        if len(parts) == 2 and parts[1] == "archive":
            return True, archive_appeal(db, appeal_id, data, account), 200
        if len(parts) == 2 and parts[1] in {"restore", "unarchive"}:
            return True, restore_appeal(db, appeal_id, data, account), 200
        return True, {"error": "Операция обращения не найдена."}, 404
    except AppealError as exc:
        return True, {"error": str(exc)}, exc.status


def seed_synthetic_appeals(db: sqlite3.Connection) -> dict[str, Any]:
    """Создаёт только синтетические фикстуры в отдельно переданной базе."""
    ensure_migrations(db)
    users = {
        "owner": ("Синтетический владелец", "owner"),
        "manager": ("Синтетический менеджер", "sales_manager"),
        "manager2": ("Второй синтетический менеджер", "sales_manager"),
        "estimator": ("Синтетический сметчик", "estimator"),
        "construction_manager": ("Синтетический руководитель строительства", "construction_manager"),
    }
    ids: dict[str, int] = {}
    for key, (name, role) in users.items():
        row = db.execute("SELECT id FROM users WHERE name = ? AND role = ?", (name, role)).fetchone()
        if row:
            ids[key] = int(row[0])
        else:
            cur = db.execute("INSERT INTO users(name, role, is_active) VALUES (?, ?, 1)", (name, role))
            ids[key] = int(cur.lastrowid)
    customer = db.execute("SELECT id FROM customers WHERE name = ?", ("Синтетический клиент",)).fetchone()
    customer_id = int(customer[0]) if customer else int(db.execute("INSERT INTO customers(name, phone, email) VALUES (?, ?, ?)", ("Синтетический клиент", "+79990000000", "synthetic@example.invalid")).lastrowid)
    project = db.execute("SELECT id FROM projects WHERE title = ?", ("Синтетический объект обращений",)).fetchone()
    project_id = int(project[0]) if project else None
    if not project_id:
        db.execute("INSERT INTO projects(title, customer_id, customer_name, status) VALUES (?, ?, ?, 'draft')", ("Синтетический объект обращений", customer_id, "Синтетический клиент"))
        project_id = int(db.execute("SELECT last_insert_rowid()").fetchone()[0])
    existing = db.execute("SELECT COUNT(*) FROM appeals WHERE manager_id IN (?, ?)", (ids["manager"], ids["manager2"])).fetchone()[0]
    if not existing:
        base = {
            "contact_name": "Синтетический клиент", "contact_channel": "+79990000000", "contact_channel_type": "phone",
            "request_type": "construction_house", "description": "Синтетическое обращение для проверки каркаса.",
            "manager_id": ids["manager"], "next_step_type": "call", "next_step_comment": "Связаться и уточнить задачу.",
            "next_step_date": date.today().isoformat(), "budget_state": "unknown", "customer_id": customer_id,
            "project_id": project_id, "source": "unknown", "_synthetic_fixture": True,
        }
        for index, status in enumerate(STATUSES):
            item = dict(base)
            item["idempotency_key"] = f"synthetic-appeal-{index + 1}"
            item["manager_id"] = ids["manager"] if index % 2 == 0 else ids["manager2"]
            item["status"] = status
            if status == "lost":
                item["loss_reason"] = "Клиент выбрал другой вариант."
            if status == "won":
                item["close_result"] = "Синтетический договор подтверждён владельцем."
            created = create_appeal(db, item, {"role": "owner", "user_id": ids["owner"]})
            if status == "won":
                archive_appeal(db, created["id"], {"reason": "Синтетическая архивная запись для проверки."}, {"role": "owner", "user_id": ids["owner"]})
    db.commit()
    return {"users": ids, "customer_id": customer_id, "project_id": project_id, "appeals": int(db.execute("SELECT COUNT(*) FROM appeals").fetchone()[0])}
