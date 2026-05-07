from __future__ import annotations

import base64
import csv
import io
import json
import mimetypes
import os
import re
import time
import zipfile
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

from database import DATA_DIR, connect, init_db, row_to_dict, rows_to_dicts


APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def json_response(handler: BaseHTTPRequestHandler, payload: object, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def is_authorized(handler: BaseHTTPRequestHandler) -> bool:
    username = os.environ.get("APP_BASIC_AUTH_USER")
    password = os.environ.get("APP_BASIC_AUTH_PASSWORD")
    if not username or not password:
        return True
    header = handler.headers.get("Authorization", "")
    if not header.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(header.removeprefix("Basic ").strip()).decode("utf-8")
    except Exception:
        return False
    return decoded == f"{username}:{password}"


def auth_required_response(handler: BaseHTTPRequestHandler) -> None:
    handler.send_response(401)
    handler.send_header("WWW-Authenticate", 'Basic realm="Stroitelnyi Kontur"')
    handler.send_header("Content-Length", "0")
    handler.end_headers()


def read_json(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    if not length:
        return {}
    raw = handler.rfile.read(length).decode("utf-8")
    return json.loads(raw)


def number_value(value: object) -> float:
    if value in (None, ""):
        return 0
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = str(value)
    cleaned = cleaned.replace("\u00a0", "").replace(" ", "")
    cleaned = cleaned.replace("₽", "").replace("руб.", "").replace("руб", "")
    cleaned = re.sub(r"[^0-9,.\-]", "", cleaned)
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    else:
        cleaned = cleaned.replace(",", ".")
    return float(cleaned or 0)


def cell_text(value: object) -> str:
    if value in (None, ""):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def column_index(cell_ref: str) -> int:
    letters = re.sub(r"[^A-Z]", "", cell_ref.upper())
    result = 0
    for letter in letters:
        result = result * 26 + ord(letter) - ord("A") + 1
    return result


def parse_xlsx_rows(file_bytes: bytes) -> list[list[object]]:
    ns = {
        "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    }
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("main:si", ns):
                parts = [node.text or "" for node in item.findall(".//main:t", ns)]
                shared_strings.append("".join(parts))

        sheet_name = "xl/worksheets/sheet1.xml"
        workbook_rels = "xl/_rels/workbook.xml.rels"
        if "xl/workbook.xml" in archive.namelist() and workbook_rels in archive.namelist():
            workbook = ET.fromstring(archive.read("xl/workbook.xml"))
            first_sheet = workbook.find(".//main:sheet", ns)
            rel_id = first_sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id") if first_sheet is not None else None
            if rel_id:
                rels = ET.fromstring(archive.read(workbook_rels))
                for rel in rels.findall("rel:Relationship", ns):
                    if rel.attrib.get("Id") == rel_id:
                        target = rel.attrib["Target"].lstrip("/")
                        sheet_name = target if target.startswith("xl/") else f"xl/{target}"
                        break

        root = ET.fromstring(archive.read(sheet_name))
        rows: list[list[object]] = []
        for row in root.findall(".//main:row", ns):
            values: dict[int, object] = {}
            for cell in row.findall("main:c", ns):
                cell_type = cell.attrib.get("t")
                ref = cell.attrib.get("r", "")
                col = column_index(ref) if ref else len(values) + 1
                if cell_type == "inlineStr":
                    value = "".join(node.text or "" for node in cell.findall(".//main:t", ns))
                else:
                    raw = cell.findtext("main:v", default="", namespaces=ns)
                    if cell_type == "s" and raw != "":
                        value = shared_strings[int(raw)]
                    elif raw == "":
                        value = ""
                    else:
                        try:
                            value = float(raw)
                        except ValueError:
                            value = raw
                values[col] = value
            if values:
                max_col = max(values)
                rows.append([values.get(col, "") for col in range(1, max_col + 1)])
        return rows


def parse_smetter_purchase_xlsx(file_bytes: bytes) -> list[dict]:
    rows = parse_xlsx_rows(file_bytes)
    materials: list[dict] = []
    stage = ""
    subsection = ""

    for row in rows:
        cells = row + [""] * 13
        col1 = cell_text(cells[0])
        col2 = cell_text(cells[1])
        col3 = cell_text(cells[2])

        if re.match(r"^\d+\.", col1):
            stage = col1
            subsection = ""
            continue

        if not col1 and col2 and col2.lower() not in {"итого по этапу", "итого по бюджету"} and not col3:
            subsection = col2
            continue

        if col1.lower() != "мат":
            continue

        stage_without_number = re.sub(r"^\d+\.\s*", "", stage).strip().lower()
        if subsection and stage_without_number == subsection.lower():
            section_parts = [stage]
        else:
            section_parts = [part for part in (stage, subsection) if part]
        materials.append(
            {
                "section": " / ".join(section_parts),
                "name": col2,
                "unit": col3,
                "estimated_quantity": number_value(cells[3]),
                "unit_price": number_value(cells[4]),
                "total_price": number_value(cells[5]),
            }
        )

    return [row for row in materials if row["name"]]


def parse_csv_materials(file_bytes: bytes) -> list[dict]:
    text = file_bytes.decode("utf-8-sig", errors="replace")
    sample = text[:2048]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    rows = []
    for item in reader:
        normalized = {re.sub(r"\s+", "", key.lower()): value for key, value in item.items() if key}
        rows.append(
            {
                "section": normalized.get("раздел") or normalized.get("section") or normalized.get("группа") or "",
                "name": normalized.get("наименование") or normalized.get("материал") or normalized.get("название") or normalized.get("name") or "",
                "unit": normalized.get("ед") or normalized.get("ед.") or normalized.get("единица") or normalized.get("unit") or "",
                "estimated_quantity": number_value(normalized.get("количество") or normalized.get("кол-во") or normalized.get("колво") or normalized.get("quantity") or 0),
                "unit_price": number_value(normalized.get("цена") or normalized.get("price") or 0),
                "total_price": number_value(normalized.get("сумма") or normalized.get("итого") or normalized.get("total") or 0),
            }
        )
    return [row for row in rows if row["name"]]


def parse_uploaded_materials(data: dict) -> list[dict]:
    file_name = str(data.get("file_name") or "").lower()
    encoded = data.get("file_base64") or ""
    if "," in encoded:
        encoded = encoded.split(",", 1)[1]
    file_bytes = base64.b64decode(encoded)
    if file_name.endswith(".xlsx"):
        return parse_smetter_purchase_xlsx(file_bytes)
    if file_name.endswith(".csv"):
        return parse_csv_materials(file_bytes)
    raise ValueError("Поддерживаются файлы .xlsx из Сметтера и .csv")


def require_fields(data: dict, fields: list[tuple[str, str]]) -> None:
    missing = [label for key, label in fields if not str(data.get(key) or "").strip()]
    if missing:
        raise ValueError("Заполните обязательные поля: " + ", ".join(missing))


def create_notification(db, project_id: int, user_id: int | None, role: str, title: str, text: str) -> None:
    db.execute(
        """
        INSERT INTO notifications (project_id, user_id, role, title, text)
        VALUES (?, ?, ?, ?, ?)
        """,
        (project_id, user_id, role, title, text),
    )


def user_id_by_role(db, role: str) -> int | None:
    row = db.execute("SELECT id FROM users WHERE role = ? AND is_active = 1 ORDER BY id LIMIT 1", (role,)).fetchone()
    return int(row["id"]) if row else None


def role_by_user_id(db, user_id: int | None) -> str:
    if not user_id:
        return ""
    row = db.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
    return str(row["role"]) if row else ""


def safe_file_name(file_name: str) -> str:
    name = Path(file_name or "file").name.strip() or "file"
    return re.sub(r"[^A-Za-zА-Яа-я0-9._() -]+", "_", name)[:140]


def save_document_file(db, project_id: int, file_data: dict, title: str, doc_type: str, related_type: str = "project") -> int | None:
    file_name = safe_file_name(file_data.get("file_name") or title)
    encoded = file_data.get("file_base64") or ""
    if not encoded:
        return None
    if "," in encoded:
        encoded = encoded.split(",", 1)[1]
    raw = base64.b64decode(encoded)
    project_dir = UPLOAD_DIR / f"project_{project_id}"
    project_dir.mkdir(parents=True, exist_ok=True)
    target_name = f"{int(time.time() * 1000)}_{file_name}"
    target_path = project_dir / target_name
    target_path.write_bytes(raw)
    cursor = db.execute(
        """
        INSERT INTO documents (
            project_id, title, type, version, status, owner_id, due_date, related_type,
            file_name, file_path, mime_type, file_size
        )
        VALUES (?, ?, ?, '', 'active', ?, NULL, ?, ?, ?, ?, ?)
        """,
        (
            project_id,
            title,
            doc_type,
            user_id_by_role(db, "sales_manager") or 3,
            related_type,
            file_name,
            str(target_path.relative_to(DATA_DIR)),
            file_data.get("mime_type") or mimetypes.guess_type(file_name)[0] or "application/octet-stream",
            len(raw),
        ),
    )
    return int(cursor.lastrowid)


def save_initial_documents(db, project_id: int, files: list[dict]) -> None:
    for item in files:
        save_document_file(
            db,
            project_id,
            item,
            item.get("title") or item.get("file_name") or "Документ объекта",
            item.get("type") or "other",
            item.get("related_type") or "handover",
        )


def get_project_detail(project_id: int) -> dict | None:
    with connect() as db:
        project = db.execute(
            """
            SELECT p.*, foreman.name AS foreman_name, estimator.name AS estimator_name,
                   procurement.name AS procurement_name, manager.name AS manager_name,
                   tech.name AS tech_supervisor_name, sales.name AS sales_manager_name
            FROM projects p
            LEFT JOIN users foreman ON foreman.id = p.foreman_id
            LEFT JOIN users estimator ON estimator.id = p.estimator_id
            LEFT JOIN users procurement ON procurement.id = p.procurement_manager_id
            LEFT JOIN users manager ON manager.id = p.construction_manager_id
            LEFT JOIN users tech ON tech.id = p.tech_supervisor_id
            LEFT JOIN users sales ON sales.id = p.sales_manager_id
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
        detail["notifications"] = rows_to_dicts(db.execute("SELECT * FROM notifications WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall())
        return detail


class AppHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path != "/health" and not is_authorized(self):
            auth_required_response(self)
            return
        if path == "/":
            self.serve_static("index.html")
            return
        if path == "/health":
            json_response(self, {"status": "ok"})
            return
        if path.startswith("/static/"):
            self.serve_static(path.replace("/static/", "", 1))
            return
        document_download = re.match(r"^/api/documents/(\d+)/download$", path)
        if document_download:
            self.serve_document_download(int(document_download.group(1)))
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
        if not is_authorized(self):
            auth_required_response(self)
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

    def serve_document_download(self, document_id: int) -> None:
        with connect() as db:
            document = db.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
            if not document or not document["file_path"]:
                self.send_error(404)
                return
            file_path = (DATA_DIR / document["file_path"]).resolve()
            if DATA_DIR.resolve() not in file_path.parents and file_path != DATA_DIR.resolve():
                self.send_error(403)
                return
            if not file_path.exists() or not file_path.is_file():
                self.send_error(404)
                return
            body = file_path.read_bytes()
            file_name = document["file_name"] or file_path.name
            content_type = document["mime_type"] or mimetypes.guess_type(file_name)[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Content-Disposition", f"inline; filename*=UTF-8''{quote(file_name)}")
            self.end_headers()
            self.wfile.write(body)

    def handle_api_get(self, path: str, query: dict[str, list[str]]) -> None:
        with connect() as db:
            if path == "/api/users":
                rows = db.execute("SELECT * FROM users WHERE is_active = 1 ORDER BY id").fetchall()
                json_response(self, rows_to_dicts(rows))
                return

            if path == "/api/notifications":
                rows = db.execute(
                    """
                    SELECT n.*, p.title AS project_title, u.name AS user_name
                    FROM notifications n
                    LEFT JOIN projects p ON p.id = n.project_id
                    LEFT JOIN users u ON u.id = n.user_id
                    ORDER BY n.created_at DESC
                    LIMIT 30
                    """
                ).fetchall()
                json_response(self, rows_to_dicts(rows))
                return

            if path == "/api/summary":
                payload = {
                    "projects": db.execute("SELECT COUNT(*) AS count FROM projects WHERE status != 'archived'").fetchone()["count"],
                    "archived_projects": db.execute("SELECT COUNT(*) AS count FROM projects WHERE status = 'archived'").fetchone()["count"],
                    "pending_handover": db.execute("SELECT COUNT(*) AS count FROM projects WHERE status IN ('draft', 'revision_requested')").fetchone()["count"],
                    "construction_review": db.execute("SELECT COUNT(*) AS count FROM projects WHERE status = 'submitted_to_construction'").fetchone()["count"],
                    "task_new": db.execute("SELECT COUNT(*) AS count FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.status != 'archived' AND t.status IN ('new', 'in_progress_task', 'review')").fetchone()["count"],
                    "task_done_waiting": db.execute("SELECT COUNT(*) AS count FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.status != 'archived' AND t.status = 'completed_pending_acceptance'").fetchone()["count"],
                    "task_accepted": db.execute("SELECT COUNT(*) AS count FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.status != 'archived' AND t.status = 'accepted'").fetchone()["count"],
                    "task_returned": db.execute("SELECT COUNT(*) AS count FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.status != 'archived' AND t.status = 'returned'").fetchone()["count"],
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
                           procurement.name AS procurement_name, tech.name AS tech_supervisor_name,
                           sales.name AS sales_manager_name
                    FROM projects p
                    LEFT JOIN users foreman ON foreman.id = p.foreman_id
                    LEFT JOIN users estimator ON estimator.id = p.estimator_id
                    LEFT JOIN users procurement ON procurement.id = p.procurement_manager_id
                    LEFT JOIN users tech ON tech.id = p.tech_supervisor_id
                    LEFT JOIN users sales ON sales.id = p.sales_manager_id
                    WHERE p.status != 'archived'
                    ORDER BY p.updated_at DESC
                    """
                ).fetchall()
                json_response(self, rows_to_dicts(rows))
                return

            if path == "/api/projects/archive":
                rows = db.execute(
                    """
                    SELECT p.*, foreman.name AS foreman_name, estimator.name AS estimator_name,
                           procurement.name AS procurement_name, tech.name AS tech_supervisor_name,
                           sales.name AS sales_manager_name
                    FROM projects p
                    LEFT JOIN users foreman ON foreman.id = p.foreman_id
                    LEFT JOIN users estimator ON estimator.id = p.estimator_id
                    LEFT JOIN users procurement ON procurement.id = p.procurement_manager_id
                    LEFT JOIN users tech ON tech.id = p.tech_supervisor_id
                    LEFT JOIN users sales ON sales.id = p.sales_manager_id
                    WHERE p.status = 'archived'
                    ORDER BY p.archived_at DESC, p.updated_at DESC
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
                "/api/tasks": """
                    SELECT t.*, p.title AS project_title,
                           assignee.name AS assignee_name, assignee.role AS assignee_role,
                           creator.name AS creator_name, creator.role AS creator_role,
                           reviewer.name AS reviewer_name, reviewer.role AS reviewer_role
                    FROM tasks t
                    JOIN projects p ON p.id = t.project_id
                    LEFT JOIN users assignee ON assignee.id = t.assignee_id
                    LEFT JOIN users creator ON creator.id = t.creator_id
                    LEFT JOIN users reviewer ON reviewer.id = t.reviewer_id
                    WHERE p.status != 'archived'
                    ORDER BY
                        CASE t.status
                            WHEN 'completed_pending_acceptance' THEN 1
                            WHEN 'returned' THEN 2
                            WHEN 'new' THEN 3
                            WHEN 'in_progress_task' THEN 4
                            WHEN 'review' THEN 5
                            WHEN 'accepted' THEN 6
                            ELSE 7
                        END,
                        t.due_date
                """,
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
                require_fields(
                    data,
                    [
                        ("title", "Название"),
                        ("customer_name", "Заказчик"),
                        ("address", "Адрес"),
                        ("bitrix_ref", "Bitrix"),
                        ("smetter_ref", "Сметтер"),
                        ("planned_end_date", "Плановый срок окончания работ по договору"),
                        ("main_estimate_amount", "Смета"),
                        ("estimate_file_name", "Файл материалов из Сметтера"),
                    ],
                )
                cursor = db.execute(
                    """
                    INSERT INTO projects (
                        title, customer_name, status, address, navigator_url, bitrix_ref,
                        smetter_ref, estimate_file_name, estimate_version, estimate_uploaded_by,
                        sales_manager_id, construction_manager_id, foreman_id, estimator_id,
                        procurement_manager_id, tech_supervisor_id, planned_end_date, main_estimate_amount
                    )
                    VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)
                    """,
                    (
                        data.get("title"),
                        data.get("customer_name"),
                        data.get("address"),
                        data.get("navigator_url") or "https://yandex.ru/maps",
                        data.get("bitrix_ref"),
                        data.get("smetter_ref"),
                        data.get("estimate_file_name"),
                        data.get("estimate_version") or "",
                        3,
                        3,
                        user_id_by_role(db, "construction_manager") or 2,
                        data.get("planned_end_date"),
                        number_value(data.get("main_estimate_amount")),
                    ),
                )
                project_id = cursor.lastrowid
                save_initial_documents(db, project_id, data.get("initial_documents") or [])
                db.execute(
                    """
                    INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                    VALUES (?, 'document', ?, 3, 'internal', 'handover')
                    """,
                    (project_id, "Менеджер создал карточку объекта. Объект еще не передан в строительство."),
                )
                db.commit()
                json_response(self, get_project_detail(project_id), 201)
                return

            project_action = re.match(r"^/api/projects/(\d+)/(update|submit|accept|return|archive|restore|delete)$", path)
            if project_action:
                project_id = int(project_action.group(1))
                action = project_action.group(2)
                project = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
                if not project:
                    json_response(self, {"error": "Project not found"}, 404)
                    return

                if action == "update":
                    require_fields(
                        data,
                        [
                            ("title", "Название"),
                            ("customer_name", "Заказчик"),
                            ("address", "Адрес"),
                            ("bitrix_ref", "Bitrix"),
                            ("smetter_ref", "Сметтер"),
                            ("planned_end_date", "Плановый срок окончания работ по договору"),
                            ("main_estimate_amount", "Смета"),
                            ("estimate_file_name", "Файл материалов из Сметтера"),
                        ],
                    )
                    db.execute(
                        """
                        UPDATE projects
                        SET title = ?,
                            customer_name = ?,
                            address = ?,
                            bitrix_ref = ?,
                            smetter_ref = ?,
                            planned_end_date = ?,
                            main_estimate_amount = ?,
                            estimate_file_name = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (
                            data.get("title"),
                            data.get("customer_name"),
                            data.get("address"),
                            data.get("bitrix_ref"),
                            data.get("smetter_ref"),
                            data.get("planned_end_date"),
                            number_value(data.get("main_estimate_amount")),
                            data.get("estimate_file_name"),
                            project_id,
                        ),
                    )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'document', ?, 3, 'internal', 'handover')
                        """,
                        (project_id, "Менеджер обновил данные карточки объекта."),
                    )
                    save_initial_documents(db, project_id, data.get("initial_documents") or [])
                    db.commit()
                    json_response(self, get_project_detail(project_id))
                    return

                if action == "submit":
                    required = [
                        ("title", "Название"),
                        ("customer_name", "Заказчик"),
                        ("address", "Адрес"),
                        ("bitrix_ref", "Bitrix"),
                        ("smetter_ref", "Сметтер"),
                        ("planned_end_date", "Плановый срок окончания работ по договору"),
                        ("estimate_file_name", "Файл материалов из Сметтера"),
                    ]
                    missing = [label for key, label in required if not str(project[key] or "").strip()]
                    if not number_value(project["main_estimate_amount"]):
                        missing.append("Смета")
                    if missing:
                        raise ValueError("Перед передачей заполните: " + ", ".join(missing))
                    db.execute(
                        """
                        UPDATE projects
                        SET status = 'submitted_to_construction',
                            submitted_at = CURRENT_TIMESTAMP,
                            workflow_comment = '',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (project_id,),
                    )
                    manager_id = project["construction_manager_id"] or user_id_by_role(db, "construction_manager")
                    create_notification(
                        db,
                        project_id,
                        manager_id,
                        "construction_manager",
                        "Новый объект передан в строительство",
                        f"{project['title']}: проверьте карточку, документацию и примите объект в работу или верните на доработку.",
                    )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'decision', ?, 3, 'internal', 'handover')
                        """,
                        (project_id, "Менеджер передал объект руководителю строительства на проверку."),
                    )
                    db.commit()
                    json_response(self, get_project_detail(project_id))
                    return

                if action == "return":
                    comment = data.get("comment") or "Нужна доработка карточки объекта."
                    db.execute(
                        """
                        UPDATE projects
                        SET status = 'revision_requested',
                            workflow_comment = ?,
                            returned_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (comment, project_id),
                    )
                    create_notification(
                        db,
                        project_id,
                        project["sales_manager_id"] or user_id_by_role(db, "sales_manager"),
                        "sales_manager",
                        "Объект возвращен на доработку",
                        f"{project['title']}: {comment}",
                    )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'problem', ?, 2, 'internal', 'handover')
                        """,
                        (project_id, f"Руководитель строительства вернул объект на доработку: {comment}"),
                    )
                    db.commit()
                    json_response(self, get_project_detail(project_id))
                    return

                if action == "accept":
                    require_fields(
                        data,
                        [
                            ("foreman_id", "Прораб"),
                            ("estimator_id", "Сметчик"),
                            ("procurement_manager_id", "Снабжение"),
                            ("tech_supervisor_id", "Технадзор"),
                        ],
                    )
                    assignees = {
                        "foreman": int(data["foreman_id"]),
                        "estimator": int(data["estimator_id"]),
                        "procurement_manager": int(data["procurement_manager_id"]),
                        "technical_supervisor": int(data["tech_supervisor_id"]),
                    }
                    db.execute(
                        """
                        UPDATE projects
                        SET status = 'in_progress',
                            foreman_id = ?,
                            estimator_id = ?,
                            procurement_manager_id = ?,
                            tech_supervisor_id = ?,
                            accepted_at = CURRENT_TIMESTAMP,
                            workflow_comment = '',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (
                            assignees["foreman"],
                            assignees["estimator"],
                            assignees["procurement_manager"],
                            assignees["technical_supervisor"],
                            project_id,
                        ),
                    )
                    for role, user_id in assignees.items():
                        create_notification(
                            db,
                            project_id,
                            user_id,
                            role,
                            "Объект принят в работу",
                            f"{project['title']}: руководитель строительства принял объект и назначил вас участником.",
                        )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'decision', ?, 2, 'internal', 'handover')
                        """,
                        (project_id, "Руководитель строительства принял объект в работу и назначил ответственных."),
                    )
                    db.commit()
                    json_response(self, get_project_detail(project_id))
                    return

                if action == "archive":
                    reason = data.get("reason") or "Работы завершены, объект отправлен в архив."
                    db.execute(
                        """
                        UPDATE projects
                        SET status = 'archived',
                            archived_at = CURRENT_TIMESTAMP,
                            archived_by = 2,
                            archive_reason = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (reason, project_id),
                    )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'decision', ?, 2, 'internal', 'archive')
                        """,
                        (project_id, f"Объект отправлен в архив: {reason}"),
                    )
                    db.commit()
                    json_response(self, get_project_detail(project_id))
                    return

                if action == "restore":
                    db.execute(
                        """
                        UPDATE projects
                        SET status = 'in_progress',
                            archived_at = NULL,
                            archived_by = NULL,
                            archive_reason = '',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (project_id,),
                    )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'decision', 'Объект возвращен из архива в работу.', 2, 'internal', 'archive')
                        """,
                        (project_id,),
                    )
                    db.commit()
                    json_response(self, get_project_detail(project_id))
                    return

                if action == "delete":
                    if project["status"] != "archived":
                        raise ValueError("Навсегда можно удалить только объект из архива.")
                    for table in (
                        "notifications",
                        "events",
                        "documents",
                        "contracts",
                        "variations",
                        "material_requests",
                        "estimate_materials",
                        "tasks",
                    ):
                        db.execute(f"DELETE FROM {table} WHERE project_id = ?", (project_id,))
                    db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
                    db.commit()
                    json_response(self, {"deleted": project_id})
                    return

            task_action = re.match(r"^/api/tasks/(\d+)/(complete|accept|return|delete)$", path)
            if task_action:
                task_id = int(task_action.group(1))
                action = task_action.group(2)
                task = db.execute(
                    """
                    SELECT t.*, p.title AS project_title
                    FROM tasks t
                    JOIN projects p ON p.id = t.project_id
                    WHERE t.id = ?
                    """,
                    (task_id,),
                ).fetchone()
                if not task:
                    json_response(self, {"error": "Task not found"}, 404)
                    return

                if action == "delete":
                    if data.get("actor_role") not in {"owner", "construction_manager"}:
                        raise ValueError("Удалять задачи может только ген.директор или руководитель строительства.")
                    db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
                    json_response(self, {"deleted": task_id})
                    return

                if action == "complete":
                    db.execute(
                        """
                        UPDATE tasks
                        SET status = 'completed_pending_acceptance',
                            completed_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (task_id,),
                    )
                    reviewer_id = task["reviewer_id"] or task["creator_id"] or user_id_by_role(db, "construction_manager")
                    create_notification(
                        db,
                        task["project_id"],
                        reviewer_id,
                        role_by_user_id(db, reviewer_id),
                        "Задача выполнена, нужна приемка",
                        f"{task['project_title']}: {task['title']}",
                    )
                    for watcher_id in (user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")):
                        if watcher_id and watcher_id != reviewer_id:
                            create_notification(
                                db,
                                task["project_id"],
                                watcher_id,
                                role_by_user_id(db, watcher_id),
                                "Задача выполнена, нужна приемка",
                                f"{task['project_title']}: {task['title']}",
                            )
                    json_response(self, {"id": task_id, "status": "completed_pending_acceptance"})
                    return

                if action == "accept":
                    db.execute(
                        """
                        UPDATE tasks
                        SET status = 'accepted',
                            accepted_at = CURRENT_TIMESTAMP,
                            rejection_comment = '',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (task_id,),
                    )
                    create_notification(
                        db,
                        task["project_id"],
                        task["assignee_id"],
                        role_by_user_id(db, task["assignee_id"]),
                        "Выполнение задачи принято",
                        f"{task['project_title']}: {task['title']}",
                    )
                    json_response(self, {"id": task_id, "status": "accepted"})
                    return

                if action == "return":
                    comment = data.get("comment") or "Нужно доработать задачу."
                    due_date = data.get("due_date") or task["due_date"]
                    db.execute(
                        """
                        UPDATE tasks
                        SET status = 'returned',
                            rejection_comment = ?,
                            due_date = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (comment, due_date, task_id),
                    )
                    create_notification(
                        db,
                        task["project_id"],
                        task["assignee_id"],
                        role_by_user_id(db, task["assignee_id"]),
                        "Задача возвращена на доработку",
                        f"{task['project_title']}: {task['title']}. {comment}",
                    )
                    json_response(self, {"id": task_id, "status": "returned"})
                    return

            if path == "/api/tasks":
                creator_role = data.get("creator_role") or "construction_manager"
                creator_id = user_id_by_role(db, creator_role) or user_id_by_role(db, "construction_manager") or 2
                reviewer_id = int(data.get("reviewer_id") or creator_id)
                assignee_id = int(data.get("assignee_id") or 2)
                cursor = db.execute(
                    """
                    INSERT INTO tasks (
                        project_id, title, assignee_id, creator_id, reviewer_id, due_date,
                        status, priority, related_type, description
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)
                    """,
                    (
                        int(data["project_id"]),
                        data.get("title") or "Новая задача",
                        assignee_id,
                        creator_id,
                        reviewer_id,
                        data.get("due_date") or None,
                        data.get("priority") or "normal",
                        data.get("related_type") or "project",
                        data.get("description") or "",
                    ),
                )
                project = db.execute("SELECT title FROM projects WHERE id = ?", (int(data["project_id"]),)).fetchone()
                create_notification(
                    db,
                    int(data["project_id"]),
                    assignee_id,
                    role_by_user_id(db, assignee_id),
                    "Назначена новая задача",
                    f"{project['title'] if project else 'Объект'}: {data.get('title') or 'Новая задача'}",
                )
                for watcher_id in (user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")):
                    if watcher_id and watcher_id not in {assignee_id, creator_id}:
                        create_notification(
                            db,
                            int(data["project_id"]),
                            watcher_id,
                            role_by_user_id(db, watcher_id),
                            "Назначена новая задача",
                            f"{project['title'] if project else 'Объект'}: {data.get('title') or 'Новая задача'}",
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
                        number_value(total_amount),
                        data.get("comment") or "",
                    ),
                )
                json_response(self, {"id": cursor.lastrowid}, 201)
                return

            if path == "/api/estimate-materials/preview-file":
                rows = parse_uploaded_materials(data)
                json_response(self, {"rows": rows, "count": len(rows)})
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
                    quantity = number_value(row.get("estimated_quantity"))
                    unit_price = number_value(row.get("unit_price"))
                    total_price = number_value(row.get("total_price")) or quantity * unit_price
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
                if data.get("file_base64"):
                    save_document_file(
                        db,
                        project_id,
                        {
                            "file_name": data.get("file_name") or "materials.xlsx",
                            "file_base64": data.get("file_base64"),
                            "mime_type": data.get("mime_type") or "",
                        },
                        "Файл материалов из Сметтера",
                        "smetter_materials",
                        "materials",
                    )
                json_response(self, {"imported": len(rows)}, 201)
                return

            if path == "/api/documents":
                file_data = data.get("document_file") or {}
                if file_data.get("file_base64"):
                    document_id = save_document_file(
                        db,
                        int(data["project_id"]),
                        file_data,
                        data.get("title") or "Документ",
                        data.get("type") or "other",
                        data.get("related_type") or "project",
                    )
                    db.execute(
                        """
                        UPDATE documents
                        SET version = ?, status = ?, owner_id = ?, due_date = ?
                        WHERE id = ?
                        """,
                        (
                            data.get("version") or "",
                            data.get("status") or "draft",
                            int(data.get("owner_id") or 2),
                            data.get("due_date") or None,
                            document_id,
                        ),
                    )
                    json_response(self, {"id": document_id}, 201)
                    return
                cursor = db.execute(
                    """
                    INSERT INTO documents (
                        project_id, title, type, version, status, owner_id, due_date, related_type,
                        file_name, file_path, mime_type, file_size
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)
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
                        number_value(data.get("amount")),
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
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Construction MVP is running at http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
