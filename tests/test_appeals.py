import os
import sqlite3
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

os.environ["APPEALS_ENABLED"] = "1"
os.environ["APPEALS_TEST_MODE"] = "1"

from appeals import (  # noqa: E402
    AppealError,
    apply_migrations,
    create_appeal,
    list_appeals,
    rollback_last_migration,
    seed_synthetic_appeals,
    transition_appeal,
    api_get,
    appeals_config,
    appeals_enabled,
)


class AppealsTestCase(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript(
            """
            PRAGMA foreign_keys = ON;
            CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, email TEXT);
            CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, customer_id INTEGER, customer_name TEXT, status TEXT NOT NULL DEFAULT 'draft');
            CREATE TABLE estimate_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL);
            """
        )
        self.owner = int(self.db.execute("INSERT INTO users(name, role) VALUES ('Владелец теста', 'owner')").lastrowid)
        self.manager = int(self.db.execute("INSERT INTO users(name, role) VALUES ('Менеджер теста', 'sales_manager')").lastrowid)
        self.other_manager = int(self.db.execute("INSERT INTO users(name, role) VALUES ('Второй менеджер теста', 'sales_manager')").lastrowid)
        self.customer = int(self.db.execute("INSERT INTO customers(name, phone) VALUES ('Синтетический клиент', '+79990000000')").lastrowid)
        self.project = int(self.db.execute("INSERT INTO projects(title, customer_id, customer_name) VALUES ('Синтетический объект', ?, 'Синтетический клиент')", (self.customer,)).lastrowid)
        apply_migrations(self.db)

    def tearDown(self):
        self.db.close()

    def payload(self, **overrides):
        value = {
            "contact_name": "Синтетический клиент",
            "contact_channel": "+79990000000",
            "contact_channel_type": "phone",
            "request_type": "construction_house",
            "description": "Синтетическое обращение для unit-теста.",
            "manager_id": self.manager,
            "next_step_type": "call",
            "next_step_comment": "Связаться с клиентом.",
            "next_step_date": "2026-07-24",
            "budget_state": "unknown",
            "customer_id": self.customer,
            "project_id": self.project,
            "idempotency_key": "unit-appeal-1",
        }
        value.update(overrides)
        return value

    def test_migrations_apply_twice_and_dry_run_is_empty(self):
        self.assertEqual(apply_migrations(self.db)["pending"], [])
        self.assertEqual(apply_migrations(self.db)["applied"], [])
        self.assertEqual(apply_migrations(self.db, dry_run=True)["pending"], [])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM appeals").fetchone()[0], 0)

    def test_initial_dry_run_does_not_create_or_change_tables(self):
        fresh = sqlite3.connect(":memory:")
        try:
            result = apply_migrations(fresh, dry_run=True)
            self.assertEqual(result["pending"], [1, 2])
            self.assertFalse(fresh.execute("SELECT 1 FROM sqlite_master WHERE name = 'appeals'").fetchone())
        finally:
            fresh.close()

    def test_rollback_does_not_touch_existing_customer_or_project(self):
        rollback_last_migration(self.db)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM customers").fetchone()[0], 1)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM projects").fetchone()[0], 1)
        self.assertFalse(self.db.execute("SELECT 1 FROM sqlite_master WHERE name = 'appeals'").fetchone())

    def test_creation_requires_confirmed_channel_and_name_or_unknown(self):
        with self.assertRaises(AppealError):
            create_appeal(self.db, self.payload(contact_channel=""), {"role": "owner", "user_id": self.owner})
        with self.assertRaises(AppealError):
            create_appeal(self.db, self.payload(contact_name="", contact_unknown=False, idempotency_key="unit-appeal-2"), {"role": "owner", "user_id": self.owner})
        item = create_appeal(self.db, self.payload(contact_name="", contact_unknown=True, idempotency_key="unit-appeal-3"), {"role": "owner", "user_id": self.owner})
        self.assertEqual(item["appeal_number"], "2026-000001")

    def test_number_idempotency_and_role_visibility(self):
        first = create_appeal(self.db, self.payload(), {"role": "owner", "user_id": self.owner})
        repeated = create_appeal(self.db, self.payload(), {"role": "owner", "user_id": self.owner})
        self.assertEqual(first["id"], repeated["id"])
        second = create_appeal(self.db, self.payload(manager_id=self.other_manager, idempotency_key="unit-appeal-4"), {"role": "owner", "user_id": self.owner})
        own = list_appeals(self.db, {"role": "sales_manager", "user_id": self.manager})
        self.assertEqual([item["id"] for item in own], [first["id"]])
        self.assertNotEqual(first["id"], second["id"])

    def test_status_transition_requires_next_step_and_owner_for_success(self):
        item = create_appeal(self.db, self.payload(), {"role": "owner", "user_id": self.owner})
        changed = transition_appeal(self.db, item["id"], {"status": "in_progress", "version": item["version"], "next_step_type": "message", "next_step_comment": "Написать клиенту", "next_step_date": "2026-07-25"}, {"role": "sales_manager", "user_id": self.manager})
        self.assertEqual(changed["status"], "in_progress")
        with self.assertRaises(AppealError):
            transition_appeal(self.db, item["id"], {"status": "won", "version": changed["version"], "next_step_type": "call", "next_step_comment": "Закрыть", "next_step_date": "2026-07-25", "close_result": "Договор"}, {"role": "sales_manager", "user_id": self.manager})

    def test_synthetic_fixture_factory(self):
        result = seed_synthetic_appeals(self.db)
        self.assertGreaterEqual(result["appeals"], 2)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM customers WHERE name = 'Синтетический клиент'").fetchone()[0], 1)

    def test_feature_flag_is_off_without_both_explicit_flags_and_other_role_is_rejected(self):
        with patch.dict(os.environ, {"APPEALS_ENABLED": "", "APPEALS_TEST_MODE": ""}):
            self.assertFalse(appeals_enabled())
            self.assertFalse(appeals_config()["enabled"])
        handled, payload, status = api_get(self.db, "/api/appeals", {}, {"role": "construction_manager", "user_id": self.owner})
        self.assertTrue(handled)
        self.assertEqual(status, 403)
        self.assertIn("недоступен", payload["error"])


if __name__ == "__main__":
    unittest.main()
