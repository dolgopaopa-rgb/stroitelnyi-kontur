from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from database import connect, init_db, row_to_dict, rows_to_dicts


APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"


def json_response(handler: BaseHTTPRequestHandler, payload: object, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    if not length:
        return {}
    raw = handler.rfile.read(length).decode("utf-8")
    return json.loads(raw)


def get_project_detail(project_id: int) -> dict | None:
    with connect() as db:
        project = db.execute(
            """
            SELECT p.*, foreman.name AS foreman_name, estimator.name AS estimator_name,
                   procurement.name AS procurement_name, manager.name AS manager_name
            FROM projects p
            LEFT JOIN users foreman ON foreman.id = p.foreman_id
            LEFT JOIN users estimator ON estimator.id = p.estimator_id
            LEFT JOIN users procurement ON procurement.id = p.procurement_manager_id
            LEFT JOIN users manager ON manager.id = p.construction_manager_id
            WHERE p.id = ?
            """,
            (project_id,),
        ).fetchone()
        if not project:
            return None
        detail = row_to_dict(project)
        detail["tasks"] = rows_to_dicts(db.execute("SELECT * FROM tasks WHERE project_id = ? ORDER BY due_date", (project_id,)).fetchall())
        detail["materials"] = rows_to_dicts(db.execute("SELECT * FROM material_requests WHERE project_id = ? ORDER BY needed_at", (project_id,)).fetchall())
        detail["variations"] = rows_to_dicts(db.execute("SELECT * FROM variations WHERE project_id = ? ORDER BY due_date", (project_id,)).fetchall())
        detail["contracts"] = rows_to_dicts(db.execute("SELECT * FROM contracts WHERE project_id = ? ORDER BY ends_at", (project_id,)).fetchall())
        detail["documents"] = rows_to_dicts(db.execute("SELECT * FROM documents WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall())
        detail["events"] = rows_to_dicts(db.execute("SELECT * FROM events WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall())
        return detail


class AppHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/":
            self.serve_static("index.html")
            return
        if path.startswith("/static/"):
            self.serve_static(path.replace("/static/", "", 1))
            return
        if path.startswith("/api/"):
            self.handle_api_get(path, parse_qs(parsed.query))
            return
        self.send_error(404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            self.send_error(404)
            return
        try:
            self.handle_api_post(parsed.path, read_json(self))
        except Exception as exc:
            json_response(self, {"error": str(exc)}, 400)

    def log_message(self, format: str, *args: object) -> None:
        return

    def serve_static(self, relative_path: str) -> None:
        file_path = (STATIC_DIR / relative_path).resolve()
        if STATIC_DIR not in file_path.parents and file_path != STATIC_DIR:
            self.send_error(403)
            return
        if not file_path.exists() or not file_path.is_file():
            self.send_error(404)
            return

        content_types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".svg": "image/svg+xml",
        }
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_types.get(file_path.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_api_get(self, path: str, query: dict[str, list[str]]) -> None:
        with connect() as db:
            if path == "/api/users":
                rows = db.execute("SELECT * FROM users WHERE is_active = 1 ORDER BY id").fetchall()
                json_response(self, rows_to_dicts(rows))
                return

            if path == "/api/summary":
                payload = {
                    "projects": db.execute("SELECT COUNT(*) AS count FROM projects").fetchone()["count"],
                    "open_tasks": db.execute("SELECT COUNT(*) AS count FROM tasks WHERE status != 'completed'").fetchone()["count"],
                    "material_requests": db.execute("SELECT COUNT(*) AS count FROM material_requests WHERE procurement_status != 'closed'").fetchone()["count"],
                    "unresolved_overbudget": db.execute("SELECT COALESCE(SUM(amount), 0) AS total FROM variations WHERE financial_decision = 'not_decided'").fetchone()["total"],
                    "contracts_soon": db.execute("SELECT COUNT(*) AS count FROM contracts WHERE ends_at <= '2026-05-27' AND status = 'active'").fetchone()["count"],
                }
                json_response(self, payload)
                return

            if path == "/api/projects":
                rows = db.execute(
                    """
                    SELECT p.*, foreman.name AS foreman_name, estimator.name AS estimator_name,
                           procurement.name AS procurement_name
                    FROM projects p
                    LEFT JOIN users foreman ON foreman.id = p.foreman_id
                    LEFT JOIN users estimator ON estimator.id = p.estimator_id
                    LEFT JOIN users procurement ON procurement.id = p.procurement_manager_id
                    ORDER BY p.updated_at DESC
                    """
                ).fetchall()
                json_response(self, rows_to_dicts(rows))
                return

            if path == "/api/estimate-materials":
                project_id = query.get("project_id", [""])[0]
                if not project_id:
                    json_response(self, [])
                    return
                rows = db.execute(
                    """
                    SELECT *
                    FROM estimate_materials
                    WHERE project_id = ?
                    ORDER BY section, name
                    """,
                    (int(project_id),),
                ).fetchall()
                json_response(self, rows_to_dicts(rows))
                return

            if path.startswith("/api/projects/"):
                project_id = int(path.rsplit("/", 1)[-1])
                detail = get_project_detail(project_id)
                if not detail:
                    json_response(self, {"error": "Project not found"}, 404)
                    return
                json_response(self, detail)
                return

            endpoints = {
                "/api/tasks": "SELECT t.*, p.title AS project_title, u.name AS assignee_name FROM tasks t JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.assignee_id ORDER BY t.due_date",
                "/api/material-requests": """
                    SELECT m.*, p.title AS project_title, em.name AS estimate_material_name,
                           em.unit AS estimate_material_unit, em.estimated_quantity
                    FROM material_requests m
                    JOIN projects p ON p.id = m.project_id
                    LEFT JOIN estimate_materials em ON em.id = m.estimate_material_id
                    ORDER BY m.needed_at
                """,
                "/api/variations": "SELECT v.*, p.title AS project_title FROM variations v JOIN projects p ON p.id = v.project_id ORDER BY v.due_date",
                "/api/contracts": "SELECT c.*, p.title AS project_title, u.name AS responsible_name FROM contracts c JOIN projects p ON p.id = c.project_id LEFT JOIN users u ON u.id = c.responsible_id ORDER BY c.ends_at",
                "/api/documents": "SELECT d.*, p.title AS project_title, u.name AS owner_name FROM documents d JOIN projects p ON p.id = d.project_id LEFT JOIN users u ON u.id = d.owner_id ORDER BY d.created_at DESC",
                "/api/events": "SELECT e.*, p.title AS project_title, u.name AS author_name FROM events e JOIN projects p ON p.id = e.project_id LEFT JOIN users u ON u.id = e.author_id ORDER BY e.created_at DESC",
            }
            if path in endpoints:
                json_response(self, rows_to_dicts(db.execute(endpoints[path]).fetchall()))
                return

        self.send_error(404)

    def handle_api_post(self, path: str, data: dict) -> None:
        with connect() as db:
            if path == "/api/projects":
                cursor = db.execute(
                    """
                    INSERT INTO projects (
                        title, customer_name, status, address, navigator_url, bitrix_ref,
                        smetter_ref, estimate_file_name, estimate_version, estimate_uploaded_by,
                        construction_manager_id, foreman_id, estimator_id,
                        procurement_manager_id, planned_end_date, main_estimate_amount
                    )
                    VALUES (?, ?, 'transferred_to_construction', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        data.get("title") or "Новый объект",
                        data.get("customer_name") or "",
                        data.get("address") or "",
                        data.get("navigator_url") or "https://yandex.ru/maps",
                        data.get("bitrix_ref") or "",
                        data.get("smetter_ref") or "",
                        data.get("estimate_file_name") or "",
                        data.get("estimate_version") or "",
                        3,
                        int(data.get("construction_manager_id") or 2),
                        int(data.get("foreman_id") or 7),
                        int(data.get("estimator_id") or 5),
                        int(data.get("procurement_manager_id") or 4),
                        data.get("planned_end_date") or None,
                        float(data.get("main_estimate_amount") or 0),
                    ),
                )
                json_response(self, get_project_detail(cursor.lastrowid), 201)
                return

            if path == "/api/tasks":
                cursor = db.execute(
                    """
                    INSERT INTO tasks (project_id, title, assignee_id, due_date, status, priority, related_type, description)
                    VALUES (?, ?, ?, ?, 'new', ?, ?, ?)
                    """,
                    (
                        int(data["project_id"]),
                        data.get("title") or "Новая задача",
                        int(data.get("assignee_id") or 2),
                        data.get("due_date") or None,
                        data.get("priority") or "normal",
                        data.get("related_type") or "project",
                        data.get("description") or "",
                    ),
                )
                json_response(self, {"id": cursor.lastrowid}, 201)
                return

            if path == "/api/material-requests":
                estimate_material_id = data.get("estimate_material_id") or None
                estimate_material = None
                if estimate_material_id:
                    estimate_material = db.execute(
                        "SELECT * FROM estimate_materials WHERE id = ?",
                        (int(estimate_material_id),),
                    ).fetchone()
                title = data.get("title") or (estimate_material["name"] if estimate_material else "Новая заявка")
                estimate_section = data.get("estimate_section") or (estimate_material["section"] if estimate_material else "")
                total_amount = data.get("total_amount")
                if (total_amount is None or total_amount == "") and estimate_material:
                    total_amount = estimate_material["total_price"]
                cursor = db.execute(
                    """
                    INSERT INTO material_requests (
                        project_id, creator_id, estimate_material_id, title, basis_type, estimate_section, needed_at,
                        procurement_status, smetter_status, supplier, total_amount, comment
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)
                    """,
                    (
                        int(data["project_id"]),
                        int(data.get("creator_id") or 7),
                        int(estimate_material_id) if estimate_material_id else None,
                        title,
                        data.get("basis_type") or "main_estimate",
                        estimate_section,
                        data.get("needed_at") or None,
                        "not_required" if data.get("basis_type") == "main_estimate" else "waiting_to_enter",
                        data.get("supplier") or "",
                        float(total_amount or 0),
                        data.get("comment") or "",
                    ),
                )
                json_response(self, {"id": cursor.lastrowid}, 201)
                return

            if path == "/api/estimate-materials/import":
                project_id = int(data["project_id"])
                rows = data.get("rows") or []
                if not rows:
                    json_response(self, {"error": "Нет строк для импорта"}, 400)
                    return
                if data.get("replace", True):
                    db.execute("DELETE FROM estimate_materials WHERE project_id = ?", (project_id,))
                for row in rows:
                    quantity = float(row.get("estimated_quantity") or 0)
                    unit_price = float(row.get("unit_price") or 0)
                    total_price = float(row.get("total_price") or quantity * unit_price or 0)
                    db.execute(
                        """
                        INSERT INTO estimate_materials (
                            project_id, section, name, unit, estimated_quantity, unit_price, total_price, source
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'manual_csv')
                        """,
                        (
                            project_id,
                            row.get("section") or "",
                            row.get("name") or "Без названия",
                            row.get("unit") or "",
                            quantity,
                            unit_price,
                            total_price,
                        ),
                    )
                db.execute(
                    """
                    UPDATE projects
                    SET estimate_file_name = ?, estimate_version = ?, estimate_uploaded_by = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (
                        data.get("file_name") or "",
                        data.get("estimate_version") or "",
                        3,
                        project_id,
                    ),
                )
                json_response(self, {"imported": len(rows)}, 201)
                return

            if path == "/api/documents":
                cursor = db.execute(
                    """
                    INSERT INTO documents (project_id, title, type, version, status, owner_id, due_date, related_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        int(data["project_id"]),
                        data.get("title") or "Новый документ",
                        data.get("type") or "other",
                        data.get("version") or "",
                        data.get("status") or "draft",
                        int(data.get("owner_id") or 2),
                        data.get("due_date") or None,
                        data.get("related_type") or "project",
                    ),
                )
                json_response(self, {"id": cursor.lastrowid}, 201)
                return

            if path == "/api/variations":
                cursor = db.execute(
                    """
                    INSERT INTO variations (
                        project_id, title, type, status, financial_decision, amount, due_date, description
                    )
                    VALUES (?, ?, ?, 'decision_required', ?, ?, ?, ?)
                    """,
                    (
                        int(data["project_id"]),
                        data.get("title") or "Новая допработа",
                        data.get("type") or "additional_work",
                        data.get("financial_decision") or "not_decided",
                        float(data.get("amount") or 0),
                        data.get("due_date") or None,
                        data.get("description") or "",
                    ),
                )
                json_response(self, {"id": cursor.lastrowid}, 201)
                return

            if path == "/api/contracts":
                cursor = db.execute(
                    """
                    INSERT INTO contracts (
                        project_id, title, type, counterparty, ends_at, responsible_id, status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 'active')
                    """,
                    (
                        int(data["project_id"]),
                        data.get("title") or "Новый договор",
                        data.get("type") or "customer_contract",
                        data.get("counterparty") or "",
                        data.get("ends_at") or None,
                        int(data.get("responsible_id") or 2),
                    ),
                )
                json_response(self, {"id": cursor.lastrowid}, 201)
                return

            if path == "/api/events":
                cursor = db.execute(
                    """
                    INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        int(data["project_id"]),
                        data.get("type") or "comment",
                        data.get("text") or "Событие без описания",
                        int(data.get("author_id") or 1),
                        data.get("visibility") or "internal",
                        data.get("related_type") or "project",
                    ),
                )
                json_response(self, {"id": cursor.lastrowid}, 201)
                return

        self.send_error(404)


def main() -> None:
    init_db()
    server = ThreadingHTTPServer(("127.0.0.1", 8765), AppHandler)
    print("Construction MVP is running at http://127.0.0.1:8765")
    server.serve_forever()


if __name__ == "__main__":
    main()
