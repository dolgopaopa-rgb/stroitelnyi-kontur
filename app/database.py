from __future__ import annotations

import sqlite3
import os
from pathlib import Path


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("APP_DATA_DIR", APP_DIR))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "construction.db"


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def row_to_dict(row: sqlite3.Row) -> dict:
    return {key: row[key] for key in row.keys()}


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict]:
    return [row_to_dict(row) for row in rows]


def init_db() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                email TEXT,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                customer_name TEXT,
                status TEXT NOT NULL DEFAULT 'transferred_to_construction',
                address TEXT,
                navigator_url TEXT,
                bitrix_ref TEXT,
                smetter_ref TEXT,
                estimate_file_name TEXT,
                work_task_file_name TEXT,
                estimate_version TEXT,
                estimate_uploaded_by INTEGER,
                sales_manager_id INTEGER,
                construction_manager_id INTEGER,
                foreman_id INTEGER,
                estimator_id INTEGER,
                procurement_manager_id INTEGER,
                tech_supervisor_id INTEGER,
                workflow_comment TEXT,
                submitted_at TEXT,
                accepted_at TEXT,
                returned_at TEXT,
                archived_at TEXT,
                archived_by INTEGER,
                archive_reason TEXT,
                planned_end_date TEXT,
                main_estimate_amount REAL NOT NULL DEFAULT 0,
                approved_variations_amount REAL NOT NULL DEFAULT 0,
                unresolved_overbudget_amount REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (estimate_uploaded_by) REFERENCES users(id),
                FOREIGN KEY (sales_manager_id) REFERENCES users(id),
                FOREIGN KEY (archived_by) REFERENCES users(id),
                FOREIGN KEY (construction_manager_id) REFERENCES users(id),
                FOREIGN KEY (foreman_id) REFERENCES users(id),
                FOREIGN KEY (estimator_id) REFERENCES users(id),
                FOREIGN KEY (procurement_manager_id) REFERENCES users(id),
                FOREIGN KEY (tech_supervisor_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                assignee_id INTEGER,
                creator_id INTEGER,
                reviewer_id INTEGER,
                due_date TEXT,
                status TEXT NOT NULL DEFAULT 'new',
                priority TEXT NOT NULL DEFAULT 'normal',
                related_type TEXT,
                description TEXT,
                completed_at TEXT,
                accepted_at TEXT,
                rejection_comment TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (assignee_id) REFERENCES users(id),
                FOREIGN KEY (creator_id) REFERENCES users(id),
                FOREIGN KEY (reviewer_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS material_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_id INTEGER,
                project_id INTEGER NOT NULL,
                creator_id INTEGER,
                estimate_material_id INTEGER,
                title TEXT NOT NULL,
                basis_type TEXT NOT NULL,
                estimate_section TEXT,
                needed_at TEXT,
                procurement_status TEXT NOT NULL DEFAULT 'new',
                smetter_status TEXT NOT NULL DEFAULT 'waiting_to_enter',
                supplier TEXT,
                total_amount REAL NOT NULL DEFAULT 0,
                comment TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (batch_id) REFERENCES material_request_batches(id),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (creator_id) REFERENCES users(id),
                FOREIGN KEY (estimate_material_id) REFERENCES estimate_materials(id)
            );

            CREATE TABLE IF NOT EXISTS material_request_batches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                creator_id INTEGER,
                needed_at TEXT,
                delivery_urgency TEXT NOT NULL DEFAULT 'standard',
                status TEXT NOT NULL DEFAULT 'new',
                comment TEXT,
                revision_comment TEXT,
                foreman_response TEXT,
                scheduled_delivery_date TEXT,
                procurement_comment TEXT,
                received_at TEXT,
                receipt_status TEXT,
                receipt_comment TEXT,
                receipt_document_id INTEGER,
                archived_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (creator_id) REFERENCES users(id),
                FOREIGN KEY (receipt_document_id) REFERENCES documents(id)
            );

            CREATE TABLE IF NOT EXISTS estimate_materials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                section TEXT,
                name TEXT NOT NULL,
                unit TEXT,
                estimated_quantity REAL NOT NULL DEFAULT 0,
                unit_price REAL NOT NULL DEFAULT 0,
                total_price REAL NOT NULL DEFAULT 0,
                source TEXT NOT NULL DEFAULT 'manual_xls',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS work_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                section TEXT,
                title TEXT NOT NULL,
                unit TEXT,
                estimated_quantity REAL NOT NULL DEFAULT 0,
                unit_price REAL NOT NULL DEFAULT 0,
                total_price REAL NOT NULL DEFAULT 0,
                source TEXT NOT NULL DEFAULT 'smetter_work_task',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS work_extra_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                creator_id INTEGER,
                title TEXT NOT NULL,
                unit TEXT,
                quantity REAL NOT NULL DEFAULT 0,
                reason TEXT NOT NULL DEFAULT 'additional_work',
                comment TEXT,
                status TEXT NOT NULL DEFAULT 'new',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (creator_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS supplier_locations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                address TEXT,
                maps_url TEXT,
                comment TEXT,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS variations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'decision_required',
                financial_decision TEXT NOT NULL DEFAULT 'not_decided',
                amount REAL NOT NULL DEFAULT 0,
                due_date TEXT,
                description TEXT,
                source_type TEXT,
                source_id INTEGER,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS contracts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                type TEXT NOT NULL,
                counterparty TEXT,
                ends_at TEXT,
                responsible_id INTEGER,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (responsible_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                type TEXT NOT NULL,
                version TEXT,
                status TEXT NOT NULL DEFAULT 'draft',
                owner_id INTEGER,
                due_date TEXT,
                related_type TEXT,
                file_name TEXT,
                file_path TEXT,
                mime_type TEXT,
                file_size INTEGER,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (owner_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                text TEXT NOT NULL,
                author_id INTEGER,
                visibility TEXT NOT NULL DEFAULT 'internal',
                related_type TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                user_id INTEGER,
                role TEXT,
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0,
                related_type TEXT,
                related_id INTEGER,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
            CREATE INDEX IF NOT EXISTS idx_materials_project ON material_requests(project_id);
            CREATE INDEX IF NOT EXISTS idx_estimate_materials_project ON estimate_materials(project_id);
            CREATE INDEX IF NOT EXISTS idx_work_items_project ON work_items(project_id);
            CREATE INDEX IF NOT EXISTS idx_work_extra_items_project ON work_extra_items(project_id);
            CREATE INDEX IF NOT EXISTS idx_supplier_locations_active ON supplier_locations(is_active);
            CREATE INDEX IF NOT EXISTS idx_variations_project ON variations(project_id);
            CREATE INDEX IF NOT EXISTS idx_contracts_ends ON contracts(ends_at);
            CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
            CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id);
            CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
            CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(role, is_read);
            """
        )
        ensure_column(db, "material_requests", "batch_id", "INTEGER")
        ensure_column(db, "material_requests", "estimate_material_id", "INTEGER")
        ensure_column(db, "material_requests", "requested_quantity", "REAL NOT NULL DEFAULT 0")
        ensure_column(db, "material_requests", "requested_unit", "TEXT")
        ensure_column(db, "material_requests", "delivery_urgency", "TEXT NOT NULL DEFAULT 'standard'")
        ensure_column(db, "material_requests", "actual_delivery_date", "TEXT")
        ensure_column(db, "material_requests", "procurement_comment", "TEXT")
        ensure_column(db, "material_requests", "processed_at", "TEXT")
        ensure_column(db, "projects", "estimate_file_name", "TEXT")
        ensure_column(db, "projects", "work_task_file_name", "TEXT")
        ensure_column(db, "projects", "estimate_version", "TEXT")
        ensure_column(db, "projects", "estimate_uploaded_by", "INTEGER")
        ensure_column(db, "projects", "sales_manager_id", "INTEGER")
        ensure_column(db, "projects", "tech_supervisor_id", "INTEGER")
        ensure_column(db, "projects", "workflow_comment", "TEXT")
        ensure_column(db, "projects", "submitted_at", "TEXT")
        ensure_column(db, "projects", "accepted_at", "TEXT")
        ensure_column(db, "projects", "returned_at", "TEXT")
        ensure_column(db, "projects", "archived_at", "TEXT")
        ensure_column(db, "projects", "archived_by", "INTEGER")
        ensure_column(db, "projects", "archive_reason", "TEXT")
        ensure_column(db, "tasks", "creator_id", "INTEGER")
        ensure_column(db, "tasks", "reviewer_id", "INTEGER")
        ensure_column(db, "tasks", "completed_at", "TEXT")
        ensure_column(db, "tasks", "accepted_at", "TEXT")
        ensure_column(db, "tasks", "rejection_comment", "TEXT")
        ensure_column(db, "documents", "file_name", "TEXT")
        ensure_column(db, "documents", "file_path", "TEXT")
        ensure_column(db, "documents", "mime_type", "TEXT")
        ensure_column(db, "documents", "file_size", "INTEGER")
        ensure_column(db, "notifications", "related_type", "TEXT")
        ensure_column(db, "notifications", "related_id", "INTEGER")
        ensure_column(db, "material_request_batches", "foreman_response", "TEXT")
        ensure_column(db, "material_request_batches", "scheduled_delivery_date", "TEXT")
        ensure_column(db, "material_request_batches", "procurement_comment", "TEXT")
        ensure_column(db, "material_request_batches", "received_at", "TEXT")
        ensure_column(db, "material_request_batches", "receipt_status", "TEXT")
        ensure_column(db, "material_request_batches", "receipt_comment", "TEXT")
        ensure_column(db, "material_request_batches", "receipt_document_id", "INTEGER")
        ensure_column(db, "material_request_batches", "archived_at", "TEXT")
        ensure_column(db, "variations", "source_type", "TEXT")
        ensure_column(db, "variations", "source_id", "INTEGER")
        db.execute("CREATE INDEX IF NOT EXISTS idx_materials_batch ON material_requests(batch_id)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_material_batches_project ON material_request_batches(project_id)")
        seed(db)
        ensure_core_users(db)
        seed_estimate_materials(db)
        seed_related_records(db)
        backfill_material_request_batches(db)


def ensure_column(db: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row["name"] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def backfill_material_request_batches(db: sqlite3.Connection) -> None:
    rows = db.execute(
        """
        SELECT project_id, creator_id, needed_at, delivery_urgency, created_at,
               MIN(comment) AS comment,
               GROUP_CONCAT(procurement_status) AS statuses
        FROM material_requests
        WHERE batch_id IS NULL
        GROUP BY project_id, creator_id, needed_at, delivery_urgency, created_at
        """
    ).fetchall()
    for row in rows:
        statuses = set((row["statuses"] or "").split(","))
        if "delivery_confirmed" in statuses:
            status = "delivery_confirmed"
        elif "returned" in statuses or "revision_requested" in statuses:
            status = "revision_requested"
        elif "ordered" in statuses or "in_work" in statuses:
            status = "in_work"
        else:
            status = "new"
        cursor = db.execute(
            """
            INSERT INTO material_request_batches (
                project_id, creator_id, needed_at, delivery_urgency, status, comment, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                row["project_id"],
                row["creator_id"],
                row["needed_at"],
                row["delivery_urgency"] or "standard",
                status,
                row["comment"] or "",
                row["created_at"],
            ),
        )
        db.execute(
            """
            UPDATE material_requests
            SET batch_id = ?
            WHERE batch_id IS NULL
              AND project_id = ?
              AND COALESCE(creator_id, 0) = COALESCE(?, 0)
              AND COALESCE(needed_at, '') = COALESCE(?, '')
              AND COALESCE(delivery_urgency, '') = COALESCE(?, '')
              AND created_at = ?
            """,
            (
                cursor.lastrowid,
                row["project_id"],
                row["creator_id"],
                row["needed_at"],
                row["delivery_urgency"] or "standard",
                row["created_at"],
            ),
        )


def ensure_core_users(db: sqlite3.Connection) -> None:
    db.execute("UPDATE users SET name = 'Ген.директор' WHERE role = 'owner'")
    required_users = [
        ("Технадзор", "technical_supervisor", "technadzor@example.local"),
    ]
    for name, role, email in required_users:
        exists = db.execute("SELECT id FROM users WHERE role = ? LIMIT 1", (role,)).fetchone()
        if not exists:
            db.execute("INSERT INTO users (name, role, email) VALUES (?, ?, ?)", (name, role, email))


def seed(db: sqlite3.Connection) -> None:
    user_count = db.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
    if user_count:
        return

    users = [
        ("Ген.директор", "owner", "owner@example.local"),
        ("Артем", "construction_manager", "artem@example.local"),
        ("Алексей", "sales_manager", "alexey@example.local"),
        ("Анастасия", "procurement_manager", "anastasia@example.local"),
        ("Ксения", "estimator", "ksenia@example.local"),
        ("Илья", "estimator", "ilya@example.local"),
        ("Андрей", "foreman", "andrey@example.local"),
        ("Сергей", "foreman", "sergey@example.local"),
        ("Технадзор", "technical_supervisor", "technadzor@example.local"),
    ]
    db.executemany("INSERT INTO users (name, role, email) VALUES (?, ?, ?)", users)

    projects = [
        (
            "Коттедж, КП Лесной берег",
            "Иванов Сергей",
            "in_progress",
            "Московская область, КП Лесной берег",
            "https://yandex.ru/maps",
            "BITRIX-2841",
            "SMT-1558",
            2,
            7,
            5,
            4,
            "2026-06-18",
            12450000,
            284000,
            184000,
        ),
        (
            "Таунхаус, Новая Рига",
            "Петрова Анна",
            "preparation",
            "Новая Рига, участок 42",
            "https://yandex.ru/maps",
            "BITRIX-2917",
            "SMT-1610",
            2,
            8,
            6,
            4,
            "2026-07-07",
            8900000,
            0,
            0,
        ),
        (
            "Реконструкция, Снегири",
            "Смирнов Игорь",
            "in_progress",
            "Снегири, ул. Центральная",
            "https://yandex.ru/maps",
            "BITRIX-2762",
            "SMT-1530",
            2,
            8,
            6,
            4,
            "2026-06-30",
            6780000,
            96000,
            72000,
        ),
    ]
    db.executemany(
        """
        INSERT INTO projects (
            title, customer_name, status, address, navigator_url, bitrix_ref, smetter_ref,
            construction_manager_id, foreman_id, estimator_id, procurement_manager_id,
            planned_end_date, main_estimate_amount, approved_variations_amount,
            unresolved_overbudget_amount
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        projects,
    )

    db.executemany(
        """
        INSERT INTO tasks (project_id, title, assignee_id, due_date, status, priority, related_type, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (1, "Проверить узел примыкания кровли", 7, "2026-04-29", "in_progress", "high", "document", "Нужно приложить фото и комментарий."),
            (1, "Подготовить обоснование по дренажу", 5, "2026-04-30", "review", "high", "variation", "Связано с допработой."),
            (3, "Уточнить основание перерасхода пиломатериала", 8, "2026-04-28", "new", "urgent", "material_request", "Нужно решение по деньгам."),
        ],
    )

    db.executemany(
        """
        INSERT INTO material_requests (
            project_id, creator_id, estimate_material_id, title, basis_type, estimate_section, needed_at,
            procurement_status, smetter_status, supplier, total_amount, comment
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (1, 7, None, "Утеплитель кровли, мембрана, крепеж", "main_estimate_overspend", "Кровля", "2026-04-30", "approval", "waiting_to_enter", "Кровля Склад", 184000, "Факт расхода выше сметы."),
            (2, 8, None, "Арматура A500, фиксаторы, проволока", "main_estimate", "Монолит", "2026-04-29", "ordered", "not_required", "БетонПрофи", 126000, "В рамках основной сметы."),
            (3, 8, None, "Пиломатериал для временного усиления", "over_budget_cost", "Конструктив", "2026-04-28", "delivery", "no_basis_decision", "ЛесСнаб", 72000, "Нет решения по основанию."),
        ],
    )

    db.executemany(
        """
        INSERT INTO variations (project_id, title, type, status, financial_decision, amount, due_date, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (1, "Дополнительный дренаж вдоль подпорной стены", "additional_work", "approval", "customer", 184000, "2026-05-02", "Нужно оформить отдельным контуром."),
            (3, "Перерасход пиломатериала из-за дефекта основания", "material_overspend", "decision_required", "not_decided", 72000, "2026-04-29", "Нужно решить: заказчик или компания."),
        ],
    )


def seed_estimate_materials(db: sqlite3.Connection) -> None:
    count = db.execute("SELECT COUNT(*) AS count FROM estimate_materials").fetchone()["count"]
    if count:
        return

    rows = [
        (1, "Кровля", "Утеплитель 200 мм", "м2", 180, 820, 147600, "manual_xls"),
        (1, "Кровля", "Мембрана гидроизоляционная", "м2", 210, 260, 54600, "manual_xls"),
        (1, "Кровля", "Крепеж кровельный", "компл", 1, 32000, 32000, "manual_xls"),
        (1, "Дренаж", "Дренажный лоток DN100", "м.п.", 48, 1450, 69600, "manual_xls"),
        (1, "Дренаж", "Геотекстиль 200 г/м2", "м2", 120, 95, 11400, "manual_xls"),
        (2, "Монолит", "Арматура A500C d12", "т", 1.8, 72000, 129600, "manual_xls"),
        (2, "Монолит", "Фиксаторы арматуры", "шт", 600, 9, 5400, "manual_xls"),
        (2, "Монолит", "Проволока вязальная", "кг", 35, 180, 6300, "manual_xls"),
        (3, "Конструктив", "Пиломатериал 50x150", "м3", 4.2, 18000, 75600, "manual_xls"),
        (3, "Конструктив", "Антисептик для древесины", "л", 40, 280, 11200, "manual_xls"),
    ]
    db.executemany(
        """
        INSERT INTO estimate_materials (
            project_id, section, name, unit, estimated_quantity, unit_price, total_price, source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def seed_related_records(db: sqlite3.Connection) -> None:
    sample_project_ids = {row["id"] for row in db.execute("SELECT id FROM projects WHERE id IN (1, 2, 3)").fetchall()}
    if not {1, 2, 3}.issubset(sample_project_ids):
        return

    contract_count = db.execute("SELECT COUNT(*) AS count FROM contracts").fetchone()["count"]
    if not contract_count:
        db.executemany(
            """
            INSERT INTO contracts (project_id, title, type, counterparty, ends_at, responsible_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (2, "Договор подряда N 14/26", "customer_contract", "Петрова Анна", "2026-05-03", 2, "active"),
                (1, "Поставка ЖБИ N 47", "supplier_contract", "БетонПрофи", "2026-05-09", 4, "active"),
            ],
        )

    document_count = db.execute("SELECT COUNT(*) AS count FROM documents").fetchone()["count"]
    if not document_count:
        db.executemany(
            """
            INSERT INTO documents (project_id, title, type, version, status, owner_id, due_date, related_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (1, "Основная смета", "main_estimate", "v4", "active", 5, "2026-05-01", "project"),
                (1, "Узел примыкания кровли", "detail_node", "v1", "review", 7, "2026-04-29", "task"),
                (2, "Основной договор подряда", "contract", "signed", "signed", 2, "2026-05-03", "contract"),
            ],
        )

    event_count = db.execute("SELECT COUNT(*) AS count FROM events").fetchone()["count"]
    if not event_count:
        db.executemany(
            """
            INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (1, "decision", "Дополнительный дренаж вынести в отдельную допработу и подготовить обоснование.", 1, "internal", "variation"),
                (1, "document", "Ксения обновила смету по кровле, версия 4 считается актуальной.", 5, "internal", "document"),
                (3, "problem", "По пиломатериалу нет решения: предъявляем заказчику или списываем за счет компании.", 2, "internal", "variation"),
            ],
        )
