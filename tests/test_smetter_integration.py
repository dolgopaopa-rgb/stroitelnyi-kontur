from __future__ import annotations

import os
import sys
import tempfile
import unittest
from copy import deepcopy
from contextlib import closing
from pathlib import Path
from unittest.mock import patch


TEST_DATA_DIR = tempfile.TemporaryDirectory(prefix="kontur-smetter-test-")
os.environ["APP_DATA_DIR"] = TEST_DATA_DIR.name
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))

from database import connect, init_db, rows_to_dicts  # noqa: E402
from server import (  # noqa: E402
    apply_smetter_snapshot,
    filter_documents_for_account,
    make_xlsx,
    parse_smetter_purchase_xlsx,
    parse_smetter_work_task_xlsx,
    smetter_xlsx_rows,
    sync_project_from_smetter,
)
from smetter import SmetterApiError, SmetterClient, SmetterLinkError, build_estimate_snapshot, parse_smetter_reference  # noqa: E402


def estimate_payload(quantity: float = 2) -> dict:
    return {
        "id": 1183154,
        "guid": "estimate-guid",
        "name": "Синтетическая смета",
        "status": {"value": "draft"},
        "created_at": "2026-08-31T10:00:00+03:00",
        "steps": [
            {
                "name": "Подготовительный этап",
                "positions": [
                    {
                        "id": 1,
                        "name": "Каркас перегородки",
                        "children": [
                            {
                                "id": 2,
                                "guid": "labor-guid",
                                "directory_position_guid": "labor-directory-guid",
                                "name": "Собрать каркас",
                                "type": "labor",
                                "unit": "м2",
                                "amount": quantity,
                                "children": [],
                            },
                            {
                                "id": 3,
                                "guid": "material-guid",
                                "directory_position_guid": "material-directory-guid",
                                "name": "Профиль",
                                "type": "material",
                                "unit": "м.п.",
                                "amount": quantity * 3,
                                "children": [],
                            },
                            {
                                "id": 4,
                                "name": "Доставка",
                                "type": "shipping",
                                "unit": "шт.",
                                "amount": 1,
                                "children": [],
                            },
                        ],
                    }
                ],
            }
        ],
    }


def snapshot(quantity: float = 2) -> dict:
    return build_estimate_snapshot(
        estimate_payload(quantity),
        source_url="https://app.smetter.ru/projects/480768/estimates/1183154",
        company_id=96057,
        project_id=480768,
    )


class SmetterReferenceTests(unittest.TestCase):
    def test_parses_project_and_estimate_from_https_link(self) -> None:
        reference = parse_smetter_reference(
            "https://app.smetter.ru/projects/480768/estimates/1183154"
        )
        self.assertEqual(reference.project_id, 480768)
        self.assertEqual(reference.estimate_id, 1183154)

    def test_rejects_external_or_insecure_link(self) -> None:
        for value in (
            "http://app.smetter.ru/projects/1/estimates/2",
            "https://example.com/projects/1/estimates/2",
        ):
            with self.subTest(value=value), self.assertRaises(SmetterLinkError):
                parse_smetter_reference(value)

    def test_client_finds_project_inside_smetter_folder(self) -> None:
        calls: list[str] = []

        def fetcher(path: str) -> object:
            calls.append(path)
            if path.endswith("/projects"):
                return {"data": [{"id": 10, "title": "2026", "projects": [{"id": 480768, "name": "Объект"}]}]}
            if path.endswith("/projects/480768/estimates"):
                return {"data": [{"id": 1183154, "name": "Смета"}]}
            if path.endswith("/estimates/1183154"):
                return {"data": estimate_payload()}
            raise AssertionError(path)

        result = SmetterClient(company_id=96057, fetcher=fetcher).load_estimate("1183154")
        self.assertEqual(result["project_id"], 480768)
        self.assertEqual(len(result["works"]), 1)
        self.assertEqual(len(result["materials"]), 1)
        self.assertTrue(all("price" not in row for row in result["works"] + result["materials"]))
        self.assertEqual(len(calls), 3)


class SmetterPersistenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        init_db()

    def setUp(self) -> None:
        with closing(connect()) as db:
            cursor = db.execute(
                "INSERT INTO projects (title, customer_name, status, smetter_ref) VALUES (?, ?, 'draft', ?)",
                ("Тестовый объект", "Тестовый заказчик", "https://app.smetter.ru/projects/480768/estimates/1183154"),
            )
            self.project_id = int(cursor.lastrowid)
            db.commit()

    def test_creates_two_documents_and_deduplicates_same_version(self) -> None:
        with closing(connect()) as db:
            first = apply_smetter_snapshot(db, self.project_id, snapshot(), 1)
            second = apply_smetter_snapshot(db, self.project_id, snapshot(), 1)
            db.commit()
            documents = rows_to_dicts(
                db.execute(
                    "SELECT * FROM documents WHERE project_id = ? AND status = 'active' ORDER BY type",
                    (self.project_id,),
                ).fetchall()
            )
            material_count = db.execute(
                "SELECT COUNT(*) AS count FROM estimate_materials WHERE project_id = ?",
                (self.project_id,),
            ).fetchone()["count"]
            work_count = db.execute(
                "SELECT COUNT(*) AS count FROM work_items WHERE project_id = ?",
                (self.project_id,),
            ).fetchone()["count"]

        self.assertTrue(first["changed"])
        self.assertFalse(second["changed"])
        self.assertEqual([row["type"] for row in documents], ["smetter_materials", "smetter_work_task"])
        self.assertEqual(material_count, 1)
        self.assertEqual(work_count, 1)
        self.assertTrue(all(row["version"].startswith("api-") for row in documents))

        foreman_documents = filter_documents_for_account(deepcopy(documents), {"role": "foreman", "user_id": 4})
        procurement_documents = filter_documents_for_account(
            deepcopy(documents),
            {"role": "procurement_manager", "user_id": 7},
        )
        self.assertEqual({row["type"] for row in foreman_documents}, {"smetter_materials", "smetter_work_task"})
        self.assertEqual({row["type"] for row in procurement_documents}, {"smetter_materials"})

    def test_generated_files_round_trip_through_existing_importers(self) -> None:
        source = snapshot()
        materials = parse_smetter_purchase_xlsx(
            make_xlsx(smetter_xlsx_rows(source["materials"], "Мат"), "Материалы")
        )
        works = parse_smetter_work_task_xlsx(
            make_xlsx(smetter_xlsx_rows(source["works"], "Раб"), "Работы")
        )
        self.assertEqual(materials[0]["name"], "Профиль")
        self.assertEqual(materials[0]["estimated_quantity"], 6)
        self.assertEqual(works[0]["title"], "Собрать каркас")
        self.assertEqual(works[0]["estimated_quantity"], 2)

    def test_changed_estimate_archives_previous_documents(self) -> None:
        with closing(connect()) as db:
            apply_smetter_snapshot(db, self.project_id, snapshot(2), 1)
            apply_smetter_snapshot(db, self.project_id, snapshot(5), 1)
            db.commit()
            statuses = rows_to_dicts(
                db.execute(
                    "SELECT type, status, version FROM documents WHERE project_id = ? ORDER BY id",
                    (self.project_id,),
                ).fetchall()
            )
            work_quantity = db.execute(
                "SELECT estimated_quantity FROM work_items WHERE project_id = ?",
                (self.project_id,),
            ).fetchone()["estimated_quantity"]

        self.assertEqual([row["status"] for row in statuses], ["archived", "archived", "active", "active"])
        self.assertNotEqual(statuses[0]["version"], statuses[-1]["version"])
        self.assertEqual(work_quantity, 5)

    def test_api_error_blocks_handover_without_manual_fallback(self) -> None:
        with closing(connect()) as db, patch(
            "server.load_smetter_snapshot",
            side_effect=SmetterApiError("Сервис недоступен"),
        ):
            result = sync_project_from_smetter(db, self.project_id, "1183154", 1)
            version = db.execute(
                "SELECT estimate_version FROM projects WHERE id = ?",
                (self.project_id,),
            ).fetchone()["estimate_version"]
        self.assertEqual(result["status"], "error")
        self.assertEqual(version, "smetter_sync_error")

    def test_api_error_keeps_explicit_manual_fallback(self) -> None:
        with closing(connect()) as db, patch(
            "server.load_smetter_snapshot",
            side_effect=SmetterApiError("Сервис недоступен"),
        ):
            result = sync_project_from_smetter(
                db,
                self.project_id,
                "1183154",
                1,
                manual_fallback_ready=True,
            )
            version = db.execute(
                "SELECT estimate_version FROM projects WHERE id = ?",
                (self.project_id,),
            ).fetchone()["estimate_version"]
        self.assertEqual(result["status"], "fallback")
        self.assertEqual(version, "manual-fallback")


if __name__ == "__main__":
    unittest.main()
