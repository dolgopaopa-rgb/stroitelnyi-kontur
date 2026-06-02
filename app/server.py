from __future__ import annotations

import base64
import csv
import hashlib
import hmac
import io
import json
import mimetypes
import os
import re
import threading
import time
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlencode, urlparse
from urllib.request import Request, urlopen

from database import DATA_DIR, connect, init_db, row_to_dict, rows_to_dicts


APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
YANDEX_DISK_FILE_PREFIX = "yadisk:"
MAX_API_URL = os.environ.get("MAX_API_URL", "https://platform-api.max.ru").rstrip("/")
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
SESSION_COOKIE_NAME = "kontur_session"
SESSION_TTL_SECONDS = int(os.environ.get("APP_SESSION_TTL_SECONDS", str(90 * 24 * 60 * 60)) or 0)


def json_response(handler: BaseHTTPRequestHandler, payload: object, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    maybe_send_session_cookie(handler)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def is_authorized(handler: BaseHTTPRequestHandler) -> bool:
    return current_access_account(handler) is not None


def auth_required_response(handler: BaseHTTPRequestHandler) -> None:
    handler.send_response(401)
    handler.send_header("WWW-Authenticate", 'Basic realm="Stroitelnyi Kontur"')
    if request_cookie(handler, SESSION_COOKIE_NAME):
        handler.send_header("Set-Cookie", expired_session_cookie(handler))
    handler.send_header("Content-Length", "0")
    handler.end_headers()


def logout_response(handler: BaseHTTPRequestHandler) -> None:
    handler.send_response(401)
    handler.send_header("WWW-Authenticate", 'Basic realm="Stroitelnyi Kontur Logout"')
    handler.send_header("Content-Type", "text/plain; charset=utf-8")
    handler.send_header("Set-Cookie", expired_session_cookie(handler))
    body = "Вы вышли из Контура. Закройте вкладку или войдите заново.".encode("utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def basic_auth_pair(handler: BaseHTTPRequestHandler) -> tuple[str, str] | None:
    header = handler.headers.get("Authorization", "")
    if not header.startswith("Basic "):
        return None
    try:
        decoded = base64.b64decode(header.removeprefix("Basic ").strip()).decode("utf-8")
    except Exception:
        return None
    if ":" not in decoded:
        return None
    return tuple(decoded.split(":", 1))


def request_cookie(handler: BaseHTTPRequestHandler, name: str) -> str:
    cookie_header = handler.headers.get("Cookie", "")
    for chunk in cookie_header.split(";"):
        if "=" not in chunk:
            continue
        key, value = chunk.strip().split("=", 1)
        if key == name:
            return value.strip()
    return ""


def b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def b64url_decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode((raw + padding).encode("ascii"))


def session_secret() -> bytes:
    configured = os.environ.get("APP_SESSION_SECRET", "").strip()
    if configured:
        return configured.encode("utf-8")
    fallback = "|".join(
        [
            os.environ.get("APP_BASIC_AUTH_USER", ""),
            os.environ.get("APP_BASIC_AUTH_PASSWORD", ""),
            os.environ.get("APP_ACCESS_ACCOUNTS", ""),
            "stroitelnyi-kontur-session-v1",
        ]
    )
    return fallback.encode("utf-8")


def session_signature(payload_b64: str) -> str:
    digest = hmac.new(session_secret(), payload_b64.encode("ascii"), hashlib.sha256).digest()
    return b64url_encode(digest)


def session_cookie_secure(handler: BaseHTTPRequestHandler) -> bool:
    if APP_PUBLIC_URL.startswith("https://"):
        return True
    forwarded_proto = handler.headers.get("X-Forwarded-Proto", "")
    return forwarded_proto.lower() == "https"


def session_cookie_header(handler: BaseHTTPRequestHandler, account: dict) -> str:
    max_age = max(SESSION_TTL_SECONDS, 3600)
    payload = {
        "login": str(account.get("login") or ""),
        "user_id": int(account.get("user_id") or 0),
        "role": str(account.get("role") or ""),
        "can_switch_role": bool(account.get("can_switch_role")),
        "exp": int(time.time()) + max_age,
    }
    payload_b64 = b64url_encode(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    cookie = f"{SESSION_COOKIE_NAME}={payload_b64}.{session_signature(payload_b64)}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax"
    if session_cookie_secure(handler):
        cookie += "; Secure"
    return cookie


def expired_session_cookie(handler: BaseHTTPRequestHandler) -> str:
    cookie = f"{SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
    if session_cookie_secure(handler):
        cookie += "; Secure"
    return cookie


def maybe_send_session_cookie(handler: BaseHTTPRequestHandler) -> None:
    account = getattr(handler, "_access_account", None)
    if getattr(handler, "_issue_session_cookie", False) and account:
        handler.send_header("Set-Cookie", session_cookie_header(handler, account))


def session_account(handler: BaseHTTPRequestHandler) -> dict | None:
    token = request_cookie(handler, SESSION_COOKIE_NAME)
    if not token or "." not in token:
        return None
    payload_b64, signature = token.rsplit(".", 1)
    if not hmac.compare_digest(session_signature(payload_b64), signature):
        return None
    try:
        payload = json.loads(b64url_decode(payload_b64).decode("utf-8"))
    except Exception:
        return None
    if int(payload.get("exp") or 0) < int(time.time()):
        return None
    login = str(payload.get("login") or "")
    user_id = int(payload.get("user_id") or 0)
    role = str(payload.get("role") or "owner")
    for account in configured_access_accounts():
        if account["login"] == login and int(account["user_id"] or 0) == user_id and account["role"] == role:
            return {
                "login": account["login"],
                "user_id": int(account["user_id"] or 0),
                "role": account["role"],
                "can_switch_role": bool(account.get("can_switch_role")),
            }
    return {
        "login": login,
        "user_id": user_id,
        "role": role,
        "can_switch_role": bool(payload.get("can_switch_role")),
    }


def configured_access_accounts() -> list[dict]:
    accounts = []
    raw = os.environ.get("APP_ACCESS_ACCOUNTS", "").strip()
    for chunk in [item.strip() for item in raw.split(";") if item.strip()]:
        parts = chunk.split("|")
        if len(parts) < 4:
            continue
        login, password, user_id, role = parts[:4]
        can_switch = len(parts) >= 5 and parts[4].strip() in {"1", "true", "yes"}
        accounts.append(
            {
                "login": login.strip(),
                "password": password.strip(),
                "user_id": int(user_id or 0),
                "role": role.strip(),
                "can_switch_role": can_switch,
            }
        )
    return accounts


def current_access_account(handler: BaseHTTPRequestHandler) -> dict | None:
    if hasattr(handler, "_access_account_checked"):
        return getattr(handler, "_access_account", None)
    handler._access_account_checked = True
    handler._access_account = None
    handler._issue_session_cookie = False

    username = os.environ.get("APP_BASIC_AUTH_USER")
    password = os.environ.get("APP_BASIC_AUTH_PASSWORD")
    pair = basic_auth_pair(handler)

    if pair:
        login, supplied_password = pair
        for account in configured_access_accounts():
            if login == account["login"] and supplied_password == account["password"]:
                handler._access_account = account
                handler._issue_session_cookie = True
                return account
        if username and password and login == username and supplied_password == password:
            account = {"login": login, "user_id": 1, "role": "owner", "can_switch_role": True}
            handler._access_account = account
            handler._issue_session_cookie = True
            return account

    cookie_account = session_account(handler)
    if cookie_account:
        handler._access_account = cookie_account
        return cookie_account

    if not username and not password and not configured_access_accounts():
        account = {"login": "local", "user_id": 1, "role": "owner", "can_switch_role": True}
        handler._access_account = account
        return account
    return None


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
    try:
        return float(cleaned or 0)
    except ValueError:
        return 0


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


def xlsx_column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def make_xlsx(rows: list[list[object]]) -> bytes:
    def cell_xml(row_index: int, column_index: int, value: object) -> str:
        cell_ref = f"{xlsx_column_name(column_index)}{row_index}"
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return f'<c r="{cell_ref}"><v>{value}</v></c>'
        text = "" if value is None else str(value)
        return f'<c r="{cell_ref}" t="inlineStr"><is><t>{escape_xml(text)}</t></is></c>'

    sheet_rows = []
    for row_index, row in enumerate(rows, start=1):
        cells = "".join(cell_xml(row_index, column_index, value) for column_index, value in enumerate(row, start=1))
        sheet_rows.append(f'<row r="{row_index}">{cells}</row>')
    worksheet = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>{"".join(sheet_rows)}</sheetData>
</worksheet>'''
    workbook = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Материалы" sheetId="1" r:id="rId1"/></sheets>
</workbook>'''
    content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>'''
    root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''
    workbook_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>'''
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/worksheets/sheet1.xml", worksheet)
    return output.getvalue()


def escape_xml(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


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


def parse_smetter_work_task_xlsx(file_bytes: bytes) -> list[dict]:
    rows = parse_xlsx_rows(file_bytes)
    works: list[dict] = []
    stage = ""
    group = ""
    skip_words = {"итого", "всего", "наименование", "работы", "выполняемые работы", "ед.", "кол-во", "количество"}

    for row in rows:
        cells = row + [""] * 10
        col1 = cell_text(cells[0])
        col2 = cell_text(cells[1])
        lower1 = col1.lower()
        lower2 = col2.lower()

        smetter_unit = cell_text(cells[4])
        unit = smetter_unit or cell_text(cells[2])
        quantity = number_value(cells[5]) if smetter_unit else number_value(cells[3])
        unit_price = number_value(cells[6]) if smetter_unit else number_value(cells[4])
        total_price = number_value(cells[7]) if smetter_unit else number_value(cells[5])

        if (
            "используемые материалы" in lower1
            or "используемые материалы" in lower2
            or "материалы и механизмы" in lower1
            or "материалы и механизмы" in lower2
        ):
            break

        if not col1 and col2 and not unit and quantity == 0 and not any(word in lower2 for word in {"итого", "всего"}):
            stage = col2
            group = ""
            continue

        looks_like_group_number = bool(re.match(r"^\s*\d+(\.0)?\s*$", col1))
        if col1 and col2 and not unit and quantity == 0 and looks_like_group_number:
            group = col2
            continue

        marker_is_work = lower1 in {"раб", "работа", "работы", "усл", "смр"}
        looks_like_work = bool(col2 and unit and quantity > 0 and not any(word == lower2 for word in skip_words))
        if not marker_is_work and not looks_like_work:
            continue
        if lower1 == "мат":
            continue

        section_parts = [part for part in (stage, group) if part]
        works.append(
            {
                "section": " / ".join(section_parts) or "Без раздела",
                "title": col2 or col1,
                "unit": unit,
                "estimated_quantity": quantity,
                "unit_price": unit_price,
                "total_price": total_price,
            }
        )

    return [row for row in works if row["title"] and row["estimated_quantity"] > 0]


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


def parse_csv_works(file_bytes: bytes) -> list[dict]:
    text = file_bytes.decode("utf-8-sig", errors="replace")
    sample = text[:2048]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    rows = []
    for item in reader:
        normalized = {re.sub(r"\s+", "", key.lower()): value for key, value in item.items() if key}
        rows.append(
            {
                "section": normalized.get("раздел") or normalized.get("section") or normalized.get("этап") or "",
                "title": normalized.get("наименование") or normalized.get("работа") or normalized.get("название") or normalized.get("name") or "",
                "unit": normalized.get("ед") or normalized.get("ед.") or normalized.get("единица") or normalized.get("unit") or "",
                "estimated_quantity": number_value(normalized.get("количество") or normalized.get("кол-во") or normalized.get("колво") or normalized.get("quantity") or 0),
                "unit_price": number_value(normalized.get("цена") or normalized.get("расценка") or normalized.get("price") or 0),
                "total_price": number_value(normalized.get("сумма") or normalized.get("итого") or normalized.get("total") or 0),
            }
        )
    return [row for row in rows if row["title"]]


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


def parse_uploaded_works(data: dict) -> list[dict]:
    file_name = str(data.get("file_name") or "").lower()
    encoded = data.get("file_base64") or ""
    if "," in encoded:
        encoded = encoded.split(",", 1)[1]
    file_bytes = base64.b64decode(encoded)
    if file_name.endswith(".xlsx"):
        return parse_smetter_work_task_xlsx(file_bytes)
    if file_name.endswith(".csv"):
        return parse_csv_works(file_bytes)
    raise ValueError("Поддерживаются файлы .xlsx из Сметтера и .csv")


def import_estimate_material_rows(db, project_id: int, rows: list[dict], source: str = "smetter_xlsx", replace: bool = True) -> int:
    if replace:
        db.execute("DELETE FROM estimate_materials WHERE project_id = ?", (project_id,))
    imported = 0
    for row in rows:
        quantity = number_value(row.get("estimated_quantity"))
        unit_price = number_value(row.get("unit_price"))
        total_price = number_value(row.get("total_price")) or quantity * unit_price
        db.execute(
            """
            INSERT INTO estimate_materials (
                project_id, section, name, unit, estimated_quantity, unit_price, total_price, source
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                row.get("section") or "",
                row.get("name") or "Без названия",
                row.get("unit") or "",
                quantity,
                unit_price,
                total_price,
                source,
            ),
        )
        imported += 1
    return imported


def archive_completed_material_batches(db) -> None:
    db.execute(
        """
        UPDATE material_request_batches
        SET archived_at = CURRENT_TIMESTAMP
        WHERE archived_at IS NULL
          AND status = 'received'
          AND received_at IS NOT NULL
          AND datetime(received_at) <= datetime('now', '-2 days')
        """
    )


def import_smetter_materials_from_documents(db, project_id: int, files: list[dict]) -> int:
    imported = 0
    for item in files:
        if item.get("type") != "smetter_materials" or not item.get("file_base64"):
            continue
        rows = parse_uploaded_materials(item)
        if rows:
            imported += import_estimate_material_rows(db, project_id, rows, "smetter_xlsx", replace=True)
    return imported


def import_smetter_works_from_documents(db, project_id: int, files: list[dict]) -> int:
    imported = 0
    for item in files:
        if item.get("type") != "smetter_work_task" or not item.get("file_base64"):
            continue
        rows = parse_uploaded_works(item)
        if rows:
            db.execute("DELETE FROM work_items WHERE project_id = ?", (project_id,))
            for row in rows:
                db.execute(
                    """
                    INSERT INTO work_items (
                        project_id, section, title, unit, estimated_quantity, unit_price, total_price, source
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'smetter_work_task')
                    """,
                    (
                        project_id,
                        row.get("section") or "",
                        row.get("title") or "Работа без названия",
                        row.get("unit") or "",
                        number_value(row.get("estimated_quantity")),
                        number_value(row.get("unit_price")),
                        number_value(row.get("total_price")),
                    ),
                )
                imported += 1
    return imported


def create_addendum_material_requests(db, *, project_id: int, actor_id: int | None, contract_title: str, rows: list[dict]) -> tuple[int | None, list[int]]:
    clean_rows = [row for row in rows if (row.get("name") or "").strip() and number_value(row.get("estimated_quantity")) > 0]
    if not clean_rows:
        return None, []
    batch_id = create_material_batch(
        db,
        project_id=project_id,
        creator_id=actor_id,
        needed_at=None,
        comment=f"Материалы по договору/допнику: {contract_title}",
    )
    request_ids: list[int] = []
    for row in clean_rows:
        quantity = number_value(row.get("estimated_quantity"))
        unit_price = number_value(row.get("unit_price"))
        total_amount = number_value(row.get("total_price")) or quantity * unit_price
        request_ids.append(
            create_material_request(
                db,
                batch_id=batch_id,
                project_id=project_id,
                creator_id=actor_id,
                estimate_material_id=None,
                title=row.get("name") or "Материал по допнику",
                basis_type="additional_agreement",
                estimate_section=row.get("section") or "Материалы по допнику",
                needed_at=None,
                requested_quantity=quantity,
                requested_unit=row.get("unit") or "",
                total_amount=total_amount,
                comment=f"По допнику: {contract_title}".strip(),
            )
        )
    return batch_id, request_ids


def create_addendum_work_extras(db, *, project_id: int, actor_id: int | None, contract_title: str, rows: list[dict]) -> tuple[list[int], list[int]]:
    work_extra_ids: list[int] = []
    variation_ids: list[int] = []
    for row in rows:
        title = str(row.get("title") or "").strip()
        quantity = number_value(row.get("estimated_quantity"))
        if not title or quantity <= 0:
            continue
        unit_price = number_value(row.get("unit_price"))
        total_amount = number_value(row.get("total_price")) or quantity * unit_price
        section = row.get("section") or "Работы по допнику"
        comment = f"По допнику: {contract_title}".strip()
        work_cursor = db.execute(
            """
            INSERT INTO work_extra_items (
                project_id, creator_id, title, unit, quantity, reason, estimate_section, comment, status
            )
            VALUES (?, ?, ?, ?, ?, 'additional_work', ?, ?, 'new')
            """,
            (
                project_id,
                actor_id,
                title,
                row.get("unit") or "",
                quantity,
                section,
                comment,
            ),
        )
        work_extra_id = int(work_cursor.lastrowid)
        work_extra_ids.append(work_extra_id)
        variation_cursor = db.execute(
            """
            INSERT INTO variations (
                project_id, title, type, status, financial_decision, amount, due_date,
                description, estimate_section, requester_id, source_type, source_id
            )
            VALUES (?, ?, 'additional_work', 'decision_required', 'not_decided', ?, NULL, ?, ?, ?, 'work_extra_item', ?)
            """,
            (
                project_id,
                title,
                total_amount,
                comment,
                section,
                actor_id,
                work_extra_id,
            ),
        )
        variation_ids.append(int(variation_cursor.lastrowid))
    return work_extra_ids, variation_ids


def backfill_estimate_materials_from_saved_documents() -> None:
    with connect() as db:
        docs = db.execute(
            """
            SELECT d.*
            FROM documents d
            WHERE d.type = 'smetter_materials'
              AND d.file_path IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM estimate_materials em WHERE em.project_id = d.project_id
              )
            ORDER BY d.created_at DESC
            """
        ).fetchall()
        for doc in docs:
            if str(doc["file_path"]).startswith(YANDEX_DISK_FILE_PREFIX):
                continue
            file_path = (DATA_DIR / doc["file_path"]).resolve()
            if DATA_DIR.resolve() not in file_path.parents or not file_path.exists():
                continue
            try:
                rows = parse_uploaded_materials(
                    {
                        "file_name": doc["file_name"] or file_path.name,
                        "file_base64": base64.b64encode(file_path.read_bytes()).decode("ascii"),
                    }
                )
                if rows:
                    import_estimate_material_rows(db, int(doc["project_id"]), rows, "smetter_xlsx", replace=True)
            except Exception as exc:
                print(f"Could not import estimate materials from {file_path}: {exc}")
        db.commit()


def create_material_request(
    db,
    *,
    batch_id: int | None = None,
    project_id: int,
    creator_id: int | None,
    estimate_material_id: int | None,
    title: str,
    basis_type: str,
    estimate_section: str,
    needed_at: str | None,
    requested_quantity: float,
    requested_unit: str,
    total_amount: float,
    comment: str,
) -> int:
    urgency = delivery_urgency(needed_at)
    smetter_status = "not_required" if basis_type == "main_estimate" else "waiting_to_enter"
    cursor = db.execute(
        """
        INSERT INTO material_requests (
            batch_id, project_id, creator_id, estimate_material_id, title, basis_type, estimate_section, needed_at,
            procurement_status, smetter_status, supplier, total_amount, comment,
            requested_quantity, requested_unit, delivery_urgency
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            batch_id,
            project_id,
            creator_id,
            estimate_material_id,
            title,
            basis_type,
            estimate_section,
            needed_at or None,
            smetter_status,
            "",
            total_amount,
            comment,
            requested_quantity,
            requested_unit,
            urgency,
        ),
    )
    return int(cursor.lastrowid)


def create_material_batch(
    db,
    *,
    project_id: int,
    creator_id: int | None,
    needed_at: str | None,
    comment: str,
) -> int:
    urgency = delivery_urgency(needed_at)
    cursor = db.execute(
        """
        INSERT INTO material_request_batches (
            project_id, creator_id, needed_at, delivery_urgency, status, comment
        )
        VALUES (?, ?, ?, ?, 'new', ?)
        """,
        (project_id, creator_id, needed_at or None, urgency, comment),
    )
    return int(cursor.lastrowid)


def material_batch_watchers(db, batch) -> set[int]:
    return {
        int(value)
        for value in (
            batch["creator_id"],
            batch["foreman_id"],
            batch["construction_manager_id"],
            user_id_by_role(db, "owner"),
        )
        if value
    }


def notify_users(db, user_ids: set[int], project_id: int, title: str, text: str, related_type: str | None = None, related_id: int | None = None) -> None:
    for user_id in user_ids:
        create_notification(
            db,
            project_id,
            user_id,
            role_by_user_id(db, user_id),
            title,
            text,
            related_type,
            related_id,
        )


def can_change_material_batch(actor_role: str, actor_id: int | None, batch) -> bool:
    if batch["status"] not in {"new", "revision_requested"}:
        return False
    if actor_role in {"owner", "construction_manager"}:
        return True
    return actor_role == "foreman" and actor_id and int(actor_id) in {int(batch["foreman_id"] or 0), int(batch["creator_id"] or 0)}


def material_variation_type(basis_types: set[str]) -> str:
    if "additional_work" in basis_types:
        return "additional_work"
    if "material_replacement" in basis_types:
        return "material_replacement"
    if "over_budget_cost" in basis_types:
        return "company_cost"
    return "material_overspend"


def material_basis_text(value: str) -> str:
    return {
        "main_estimate_overspend": "Превышение по смете",
        "additional_work": "Дополнительная работа",
        "material_replacement": "Замена материала",
        "over_budget_cost": "Сверх бюджета",
    }.get(value, value or "Основание не указано")


def require_fields(data: dict, fields: list[tuple[str, str]]) -> None:
    missing = [label for key, label in fields if not str(data.get(key) or "").strip()]
    if missing:
        raise ValueError("Заполните обязательные поля: " + ", ".join(missing))


def notification_view_for_related_type(related_type: str | None) -> str:
    return {
        "task": "tasks",
        "tasks": "tasks",
        "material_request": "materials",
        "material_request_batch": "materials",
        "materials": "materials",
        "variation": "variations",
        "variations": "variations",
        "document": "documents",
        "documents": "documents",
        "handover": "projects",
        "project": "projects",
        "projects": "projects",
        "work": "works",
        "works": "works",
        "estimate_job": "estimates",
        "estimate_jobs": "estimates",
    }.get(str(related_type or "").strip(), "dashboard")


def notification_url(project_id: int | None, related_type: str | None, related_id: int | None) -> str:
    if not APP_PUBLIC_URL:
        return ""
    query = {"view": notification_view_for_related_type(related_type)}
    if project_id:
        query["project"] = str(project_id)
    if related_id:
        query["item"] = str(related_id)
    return f"{APP_PUBLIC_URL}/?{urlencode(query)}"


def update_notification_max_status(notification_id: int, status: str, error: str = "") -> None:
    try:
        with connect() as status_db:
            status_db.execute(
                """
                UPDATE notifications
                SET max_status = ?,
                    max_sent_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE max_sent_at END,
                    max_error = ?
                WHERE id = ?
                """,
                (status, status, error[:500], notification_id),
            )
            status_db.commit()
    except Exception:
        return


def send_max_message(chat_id: str, text: str) -> tuple[bool, str]:
    token = os.environ.get("MAX_TOKEN", "").strip()
    if not token:
        return False, "MAX_TOKEN is not configured"
    if not chat_id:
        return False, "MAX chat is not bound"
    payload = json.dumps({"text": text, "format": "markdown", "notify": True}, ensure_ascii=False).encode("utf-8")
    url = f"{MAX_API_URL}/messages?{urlencode({'chat_id': chat_id})}"
    request = Request(
        url,
        data=payload,
        headers={"Authorization": token, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=8) as response:
            response.read()
        return True, ""
    except HTTPError as error:
        try:
            body = error.read().decode("utf-8", "replace")
        except Exception:
            body = ""
        return False, f"MAX HTTP {error.code}: {body[:250]}"
    except (URLError, TimeoutError, OSError) as error:
        return False, str(error)


def enqueue_max_notification(
    *,
    notification_id: int,
    chat_id: str,
    project_id: int | None,
    title: str,
    text: str,
    related_type: str | None,
    related_id: int | None,
) -> None:
    clean_chat_id = str(chat_id or "").strip()
    if not clean_chat_id:
        return

    url = notification_url(project_id, related_type, related_id)
    message_lines = [f"Контур: {title}", "", text]
    if url:
        message_lines.extend(["", f"Открыть: {url}"])
    message = "\n".join(line for line in message_lines if line is not None).strip()

    def worker() -> None:
        time.sleep(0.4)
        ok, error = send_max_message(clean_chat_id, message)
        update_notification_max_status(notification_id, "sent" if ok else "error", error)

    threading.Thread(target=worker, daemon=True).start()


def create_notification(
    db,
    project_id: int,
    user_id: int | None,
    role: str,
    title: str,
    text: str,
    related_type: str | None = None,
    related_id: int | None = None,
) -> None:
    max_status = "disabled" if not os.environ.get("MAX_TOKEN", "").strip() else "not_bound"
    max_chat_id = ""
    if user_id and max_status != "disabled":
        user = db.execute(
            "SELECT max_chat_id, max_notifications_enabled FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if user and int(user["max_notifications_enabled"] or 0) and str(user["max_chat_id"] or "").strip():
            max_status = "queued"
            max_chat_id = str(user["max_chat_id"]).strip()
    cursor = db.execute(
        """
        INSERT INTO notifications (project_id, user_id, role, title, text, related_type, related_id, max_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (project_id, user_id, role, title, text, related_type, related_id, max_status),
    )
    enqueue_max_notification(
        notification_id=int(cursor.lastrowid),
        chat_id=max_chat_id,
        project_id=project_id,
        title=title,
        text=text,
        related_type=related_type,
        related_id=related_id,
    )


def normalize_phone(value: str | None) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    if not digits:
        return ""
    if digits[0] in {"7", "8"} and len(digits) > 10:
        rest = digits[1:11]
    else:
        rest = digits[:10]
    if len(rest) != 10:
        return str(value or "").strip()
    return f"+7-{rest[:3]}-{rest[3:6]}-{rest[6:8]}-{rest[8:10]}"


def ensure_customer(db, name: str | None, phone: str | None = None, email: str | None = None) -> int | None:
    clean_name = str(name or "").strip()
    if not clean_name:
        return None
    clean_phone = normalize_phone(phone)
    clean_email = str(email or "").strip()
    row = db.execute("SELECT id FROM customers WHERE lower(name) = lower(?) LIMIT 1", (clean_name,)).fetchone()
    if row:
        customer_id = int(row["id"])
        if clean_phone or clean_email:
            db.execute(
                """
                UPDATE customers
                SET phone = COALESCE(NULLIF(?, ''), phone),
                    email = COALESCE(NULLIF(?, ''), email),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (clean_phone, clean_email, customer_id),
            )
        return customer_id
    cursor = db.execute("INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)", (clean_name, clean_phone, clean_email))
    return int(cursor.lastrowid)


def create_task_event(
    db,
    *,
    task_id: int,
    project_id: int,
    actor_id: int | None,
    action: str,
    status_from: str | None = None,
    status_to: str | None = None,
    comment: str = "",
    due_date: str | None = None,
) -> None:
    db.execute(
        """
        INSERT INTO task_events (
            task_id, project_id, actor_id, action, status_from, status_to, comment, due_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (task_id, project_id, actor_id, action, status_from, status_to, comment, due_date),
    )


def project_archive_blockers(db, project_id: int) -> list[str]:
    blockers: list[str] = []
    open_tasks = db.execute(
        "SELECT COUNT(*) AS count FROM tasks WHERE project_id = ? AND status != 'accepted'",
        (project_id,),
    ).fetchone()["count"]
    if open_tasks:
        blockers.append(f"открытые задачи: {open_tasks}")
    open_batches = db.execute(
        """
        SELECT COUNT(*) AS count
        FROM material_request_batches
        WHERE project_id = ?
          AND archived_at IS NULL
          AND status NOT IN ('received', 'cancelled')
        """,
        (project_id,),
    ).fetchone()["count"]
    if open_batches:
        blockers.append(f"незакрытые заявки на материалы: {open_batches}")
    open_variations = db.execute(
        """
        SELECT COUNT(*) AS count
        FROM variations
        WHERE project_id = ?
          AND (status IN ('decision_required', 'in_review') OR financial_decision = 'not_decided')
        """,
        (project_id,),
    ).fetchone()["count"]
    if open_variations:
        blockers.append(f"допработы/отклонения без решения: {open_variations}")
    return blockers


def attach_task_events(db, tasks: list[dict]) -> list[dict]:
    if not tasks:
        return tasks
    task_ids = [int(task["id"]) for task in tasks]
    placeholders = ",".join("?" for _ in task_ids)
    rows = db.execute(
        f"""
        SELECT te.*, u.name AS actor_name, u.role AS actor_role
        FROM task_events te
        LEFT JOIN users u ON u.id = te.actor_id
        WHERE te.task_id IN ({placeholders})
        ORDER BY te.created_at, te.id
        """,
        task_ids,
    ).fetchall()
    grouped: dict[int, list[dict]] = {}
    for row in rows:
        item = row_to_dict(row)
        grouped.setdefault(int(item["task_id"]), []).append(item)
    for task in tasks:
        task["events"] = grouped.get(int(task["id"]), [])
    return tasks


def user_id_by_role(db, role: str) -> int | None:
    row = db.execute("SELECT id FROM users WHERE role = ? AND is_active = 1 ORDER BY id LIMIT 1", (role,)).fetchone()
    return int(row["id"]) if row else None


def role_by_user_id(db, user_id: int | None) -> str:
    if not user_id:
        return ""
    row = db.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
    return str(row["role"]) if row else ""


def account_role(account: dict | None) -> str:
    return str((account or {}).get("role") or "owner")


def account_user_id(account: dict | None) -> int:
    try:
        return int((account or {}).get("user_id") or 0)
    except (TypeError, ValueError):
        return 0


def can_manage_feedback(account: dict | None) -> bool:
    return account_role(account) in {"owner", "construction_manager", "finance_director"}


def can_delete_feedback(account: dict | None) -> bool:
    return account_role(account) in {"owner", "construction_manager"}


def can_view_estimate_jobs(account: dict | None) -> bool:
    return account_role(account) in {"owner", "construction_manager", "sales_manager", "estimator"}


def can_manage_estimate_jobs(account: dict | None) -> bool:
    return can_view_estimate_jobs(account)


def can_delete_estimate_jobs(account: dict | None) -> bool:
    return account_role(account) in {"owner", "construction_manager"}


def can_view_variations(account: dict | None) -> bool:
    return account_role(account) in {"owner", "construction_manager", "finance_director", "accountant", "sales_manager", "estimator", "foreman"}


def can_view_knowledge_base(account: dict | None) -> bool:
    return account_role(account) in {"owner", "construction_manager", "finance_director", "accountant", "sales_manager", "foreman", "procurement_manager", "estimator", "technical_supervisor"}


def variation_visible_for_account(variation: dict, account: dict | None) -> bool:
    role = account_role(account)
    if role == "foreman":
        return int(variation.get("project_foreman_id") or 0) == account_user_id(account)
    return role in {"owner", "construction_manager", "finance_director", "accountant", "sales_manager", "estimator"}


def sanitize_variation_for_account(variation: dict, account: dict | None) -> dict:
    if can_view_financials(account):
        return variation
    variation["amount"] = 0
    variation["financial_decision"] = ""
    for item in variation.get("materials") or []:
        item["total_amount"] = 0
        item["unit_price"] = 0
    return variation


def project_visible_for_account(project: dict, account: dict | None) -> bool:
    role = account_role(account)
    if role == "foreman":
        return int(project.get("foreman_id") or 0) == account_user_id(account)
    return role in {"owner", "construction_manager", "finance_director", "accountant", "sales_manager", "procurement_manager", "estimator", "technical_supervisor"}


DOCUMENT_TYPES_BY_ROLE = {
    "foreman": {"smetter_materials", "smetter_work_task", "project_documentation", "variation_attachment", "detail_node", "regulation", "standard", "instruction", "other"},
    "procurement_manager": {"smetter_materials", "project_documentation", "variation_attachment", "detail_node", "regulation", "standard", "instruction", "other"},
    "technical_supervisor": {"smetter_materials", "smetter_work_task", "project_documentation", "variation_attachment", "detail_node", "regulation", "standard", "instruction", "other"},
    "estimator": {"main_estimate", "smetter_materials", "smetter_work_task", "project_documentation", "variation_attachment", "variation_estimate", "act", "ks_2", "ks_3", "other"},
    "accountant": {"main_estimate", "smetter_materials", "smetter_work_task", "contract", "variation_attachment", "variation_estimate", "act", "ks_2", "ks_3", "other"},
}


def document_visible_for_account(document: dict, account: dict | None) -> bool:
    related_type = str(document.get("related_type") or "")
    if related_type == "knowledge_base":
        return can_view_knowledge_base(account)
    role = account_role(account)
    if role in {"owner", "construction_manager", "finance_director", "sales_manager"}:
        return True
    allowed = DOCUMENT_TYPES_BY_ROLE.get(role, set())
    return str(document.get("type") or "other") in allowed


def filter_documents_for_account(documents: list[dict], account: dict | None) -> list[dict]:
    return [document for document in documents if document_visible_for_account(document, account)]


def can_view_financials(account: dict | None) -> bool:
    return account_role(account) in {"owner", "construction_manager", "finance_director", "accountant", "sales_manager", "estimator"}


def sanitize_project_for_account(project: dict, account: dict | None) -> dict:
    role = account_role(account)
    if not can_view_financials(account):
        for key in ("main_estimate_amount", "approved_variations_amount", "unresolved_overbudget_amount"):
            if key in project:
                project[key] = 0
        project["contracts"] = []
        project["variations"] = []
    if role not in {"owner", "construction_manager", "finance_director", "accountant", "sales_manager", "estimator"}:
        project["bitrix_ref"] = ""
        project["smetter_ref"] = ""
    return project


def ensure_project_action_allowed(account: dict | None, action: str) -> None:
    role = account_role(account)
    allowed = {
        "update": {"owner", "sales_manager", "construction_manager", "finance_director"},
        "submit": {"owner", "sales_manager", "finance_director"},
        "accept": {"owner", "construction_manager", "finance_director"},
        "assign": {"owner", "construction_manager", "finance_director"},
        "return": {"owner", "construction_manager", "finance_director"},
        "archive": {"owner", "construction_manager", "finance_director"},
        "restore": {"owner", "construction_manager", "finance_director"},
        "delete": {"owner"},
    }.get(action, set())
    if role not in allowed:
        raise PermissionError("Недостаточно прав для этого действия.")


def delivery_urgency(needed_at: str | None) -> str:
    if not needed_at:
        return "standard"
    try:
        delivery_date = datetime.strptime(needed_at, "%Y-%m-%d").date()
    except ValueError:
        return "standard"
    days = (delivery_date - date.today()).days
    return "urgent" if days <= 1 else "standard"


def format_date_ru(value: str | None = None) -> str:
    if value:
        try:
            return datetime.strptime(value[:10], "%Y-%m-%d").strftime("%d.%m.%Y")
        except ValueError:
            pass
    return date.today().strftime("%d.%m.%Y")


def safe_file_name(file_name: str) -> str:
    name = Path(file_name or "file").name.strip() or "file"
    return re.sub(r"[^A-Za-zА-Яа-я0-9._() -]+", "_", name)[:140]


def yandex_disk_configured() -> bool:
    return (
        os.environ.get("STORAGE_PROVIDER", "").strip().lower() == "yandex_disk"
        and bool(os.environ.get("YANDEX_DISK_TOKEN", "").strip())
    )


def yandex_disk_root() -> str:
    root = os.environ.get("YANDEX_DISK_ROOT", "/Stroitelnyi kontur").strip() or "/Stroitelnyi kontur"
    return "/" + root.strip("/")


def yandex_path_part(value: object, fallback: str = "folder") -> str:
    text = str(value or fallback).strip() or fallback
    text = re.sub(r'[\\/:*?"<>|\r\n\t]+', " ", text)
    text = re.sub(r"\s+", " ", text).strip(" .")
    return text[:90] or fallback


def yandex_api_request(method: str, resource: str, params: dict[str, str] | None = None) -> dict:
    token = os.environ.get("YANDEX_DISK_TOKEN", "").strip()
    query = f"?{urlencode(params or {})}" if params else ""
    request = Request(
        f"https://cloud-api.yandex.net/v1/disk{resource}{query}",
        method=method,
        headers={"Authorization": f"OAuth {token}"},
    )
    with urlopen(request, timeout=45) as response:
        body = response.read()
    if not body:
        return {}
    return json.loads(body.decode("utf-8"))


def ensure_yandex_folder(folder_path: str) -> None:
    current = ""
    for part in [segment for segment in folder_path.strip("/").split("/") if segment]:
        current = f"{current}/{part}"
        try:
            yandex_api_request("PUT", "/resources", {"path": current})
        except HTTPError as exc:
            if exc.code != 409:
                raise


def project_upload_folder(db, project_id: int, related_type: str, doc_type: str) -> str:
    root = yandex_disk_root()
    if related_type == "knowledge_base":
        return f"{root}/База знаний/{yandex_path_part(doc_type, 'documents')}"
    if related_type == "estimate_job":
        row = db.execute("SELECT title FROM estimate_jobs WHERE id = ?", (project_id,)).fetchone()
        title = row["title"] if row else f"estimate_job_{project_id}"
        return f"{root}/Сметы/{yandex_path_part(title, f'estimate_job_{project_id}')}/{yandex_path_part(doc_type, 'files')}"
    row = db.execute("SELECT title FROM projects WHERE id = ?", (project_id,)).fetchone()
    project_title = row["title"] if row else f"project_{project_id}"
    return f"{root}/Объекты/{yandex_path_part(project_title, f'project_{project_id}')}/{yandex_path_part(doc_type, 'documents')}"


def upload_to_yandex_disk(db, project_id: int, related_type: str, doc_type: str, target_name: str, raw: bytes) -> str:
    folder = project_upload_folder(db, project_id, related_type, doc_type)
    ensure_yandex_folder(folder)
    remote_path = f"{folder}/{target_name}"
    payload = yandex_api_request("GET", "/resources/upload", {"path": remote_path, "overwrite": "true"})
    href = payload.get("href")
    if not href:
        raise RuntimeError("Yandex Disk did not return upload URL")
    upload_request = Request(href, data=raw, method="PUT")
    with urlopen(upload_request, timeout=120) as response:
        response.read()
    return f"{YANDEX_DISK_FILE_PREFIX}{remote_path}"


def save_to_local_uploads(project_id: int, target_name: str, raw: bytes) -> str:
    project_dir = UPLOAD_DIR / f"project_{project_id}"
    project_dir.mkdir(parents=True, exist_ok=True)
    target_path = project_dir / target_name
    target_path.write_bytes(raw)
    return str(target_path.relative_to(DATA_DIR))


def save_uploaded_file(db, project_id: int, related_type: str, doc_type: str, target_name: str, raw: bytes) -> str:
    if yandex_disk_configured():
        try:
            return upload_to_yandex_disk(db, project_id, related_type, doc_type, target_name, raw)
        except (HTTPError, URLError, TimeoutError, RuntimeError, OSError) as exc:
            print(f"Yandex Disk upload failed, saved locally instead: {exc}")
    return save_to_local_uploads(project_id, target_name, raw)


def download_from_yandex_disk(file_path: str) -> bytes:
    remote_path = file_path.removeprefix(YANDEX_DISK_FILE_PREFIX)
    payload = yandex_api_request("GET", "/resources/download", {"path": remote_path})
    href = payload.get("href")
    if not href:
        raise RuntimeError("Yandex Disk did not return download URL")
    with urlopen(href, timeout=120) as response:
        return response.read()


def delete_stored_file(file_path: str | None) -> None:
    if not file_path:
        return
    if str(file_path).startswith(YANDEX_DISK_FILE_PREFIX):
        remote_path = str(file_path).removeprefix(YANDEX_DISK_FILE_PREFIX)
        try:
            yandex_api_request("DELETE", "/resources", {"path": remote_path, "permanently": "true"})
        except HTTPError as exc:
            if exc.code != 404:
                raise
        return
    local_path = (DATA_DIR / str(file_path)).resolve()
    if DATA_DIR.resolve() in local_path.parents and local_path.is_file():
        local_path.unlink()


def knowledge_base_project_id(db) -> int:
    row = db.execute("SELECT id FROM projects WHERE bitrix_ref = '__knowledge_base__' LIMIT 1").fetchone()
    if row:
        return int(row["id"])
    cursor = db.execute(
        """
        INSERT INTO projects (
            title, customer_name, status, bitrix_ref, archive_reason, archived_at
        )
        VALUES ('База знаний', 'Служебный раздел', 'archived', '__knowledge_base__', 'Служебный объект для базы знаний', CURRENT_TIMESTAMP)
        """
    )
    return int(cursor.lastrowid)


def save_document_file(db, project_id: int, file_data: dict, title: str, doc_type: str, related_type: str = "project") -> int | None:
    file_name = safe_file_name(file_data.get("file_name") or title)
    encoded = file_data.get("file_base64") or ""
    if not encoded:
        return None
    if "," in encoded:
        encoded = encoded.split(",", 1)[1]
    raw = base64.b64decode(encoded)
    target_name = f"{int(time.time() * 1000)}_{file_name}"
    stored_path = save_uploaded_file(db, project_id, related_type, doc_type, target_name, raw)
    cursor = db.execute(
        """
        INSERT INTO documents (
            project_id, title, type, version, status, owner_id, due_date, related_type,
            related_section, contract_id, process_type, file_name, file_path, mime_type, file_size
        )
        VALUES (?, ?, ?, '', 'active', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            project_id,
            title,
            doc_type,
            user_id_by_role(db, "sales_manager") or 3,
            related_type,
            file_data.get("related_section") or "",
            int(file_data.get("contract_id") or 0) or None,
            file_data.get("process_type") or "",
            file_name,
            stored_path,
            file_data.get("mime_type") or mimetypes.guess_type(file_name)[0] or "application/octet-stream",
            len(raw),
        ),
    )
    return int(cursor.lastrowid)


def save_estimate_job_file(db, estimate_job_id: int, file_data: dict, uploaded_by: int | None = None) -> int | None:
    file_name = safe_file_name(file_data.get("file_name") or file_data.get("title") or "file")
    encoded = file_data.get("file_base64") or ""
    if not encoded:
        return None
    if "," in encoded:
        encoded = encoded.split(",", 1)[1]
    raw = base64.b64decode(encoded)
    target_name = f"{int(time.time() * 1000)}_{file_name}"
    stored_path = save_uploaded_file(db, estimate_job_id, "estimate_job", "attachments", target_name, raw)
    cursor = db.execute(
        """
        INSERT INTO estimate_job_files (
            estimate_job_id, title, file_name, file_path, mime_type, file_size, uploaded_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            estimate_job_id,
            str(file_data.get("title") or file_name).strip() or file_name,
            file_name,
            stored_path,
            file_data.get("mime_type") or mimetypes.guess_type(file_name)[0] or "application/octet-stream",
            len(raw),
            uploaded_by,
        ),
    )
    return int(cursor.lastrowid)


def archive_replaced_project_documents(db, project_id: int, doc_type: str) -> None:
    if doc_type not in {"smetter_materials", "smetter_work_task", "main_estimate"}:
        return
    db.execute(
        """
        UPDATE documents
        SET status = 'archived', updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ?
          AND type = ?
          AND COALESCE(status, 'active') != 'archived'
        """,
        (project_id, doc_type),
    )


def save_initial_documents(db, project_id: int, files: list[dict]) -> None:
    for item in files:
        archive_replaced_project_documents(db, project_id, item.get("type") or "other")
        save_document_file(
            db,
            project_id,
            item,
            item.get("title") or item.get("file_name") or "Документ объекта",
            item.get("type") or "other",
            item.get("related_type") or "handover",
        )


def get_project_detail(project_id: int, account: dict | None = None) -> dict | None:
    with connect() as db:
        project = db.execute(
            """
            SELECT p.*, foreman.name AS foreman_name, estimator.name AS estimator_name,
                   procurement.name AS procurement_name, manager.name AS manager_name,
                   tech.name AS tech_supervisor_name, sales.name AS sales_manager_name,
                   customer.phone AS customer_phone, customer.email AS customer_email
            FROM projects p
            LEFT JOIN customers customer ON customer.id = p.customer_id
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
        if detail.get("customer_id"):
            detail["customer_projects_count"] = db.execute(
                "SELECT COUNT(*) AS count FROM projects WHERE customer_id = ?",
                (detail["customer_id"],),
            ).fetchone()["count"]
        else:
            detail["customer_projects_count"] = 1
        detail["tasks"] = attach_task_events(
            db,
            rows_to_dicts(
                db.execute(
                    """
                    SELECT t.*, assignee.name AS assignee_name, creator.name AS creator_name, reviewer.name AS reviewer_name
                    FROM tasks t
                    LEFT JOIN users assignee ON assignee.id = t.assignee_id
                    LEFT JOIN users creator ON creator.id = t.creator_id
                    LEFT JOIN users reviewer ON reviewer.id = t.reviewer_id
                    WHERE t.project_id = ?
                    ORDER BY t.due_date
                    """,
                    (project_id,),
                ).fetchall()
            ),
        )
        detail["materials"] = rows_to_dicts(
            db.execute(
                """
                SELECT m.*, em.name AS estimate_material_name, em.unit AS estimate_material_unit,
                       em.estimated_quantity, em.unit_price,
                       b.status AS batch_status, b.comment AS batch_comment,
                       b.revision_comment AS batch_revision_comment,
                       b.foreman_response AS batch_foreman_response,
                       b.scheduled_delivery_date AS batch_scheduled_delivery_date,
                       b.procurement_comment AS batch_procurement_comment,
                       b.received_at AS batch_received_at,
                      b.receipt_status AS batch_receipt_status,
                      b.receipt_comment AS batch_receipt_comment,
                      b.receipt_document_id AS batch_receipt_document_id,
                      receipt_doc.file_name AS batch_receipt_document_file_name,
                      receipt_doc.title AS batch_receipt_document_title,
                      receipt_doc.mime_type AS batch_receipt_document_mime_type,
                      source_variation.id AS batch_variation_id,
                      source_variation.title AS batch_variation_title,
                      source_variation.status AS batch_variation_status,
                      b.created_at AS batch_created_at
                FROM material_requests m
                LEFT JOIN material_request_batches b ON b.id = m.batch_id
                LEFT JOIN estimate_materials em ON em.id = m.estimate_material_id
                LEFT JOIN documents receipt_doc ON receipt_doc.id = b.receipt_document_id
                LEFT JOIN variations source_variation
                  ON source_variation.source_type = 'material_request_batch'
                 AND source_variation.source_id = b.id
                WHERE m.project_id = ?
                ORDER BY COALESCE(b.created_at, m.created_at) DESC, m.id
                """,
                (project_id,),
            ).fetchall()
        )
        detail["variations"] = rows_to_dicts(db.execute("SELECT * FROM variations WHERE project_id = ? ORDER BY due_date", (project_id,)).fetchall())
        detail["works"] = rows_to_dicts(db.execute("SELECT * FROM work_items WHERE project_id = ? ORDER BY section, title", (project_id,)).fetchall())
        detail["extra_works"] = rows_to_dicts(db.execute("SELECT * FROM work_extra_items WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall())
        detail["contracts"] = rows_to_dicts(db.execute("SELECT * FROM contracts WHERE project_id = ? ORDER BY ends_at", (project_id,)).fetchall())
        detail["documents"] = filter_documents_for_account(
            rows_to_dicts(db.execute("SELECT * FROM documents WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall()),
            account,
        )
        detail["events"] = rows_to_dicts(db.execute("SELECT * FROM events WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall())
        detail["notifications"] = rows_to_dicts(db.execute("SELECT * FROM notifications WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall())
        detail = sanitize_project_for_account(detail, account)
        return detail


class AppHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/logout":
            logout_response(self)
            return
        if path != "/health" and not is_authorized(self):
            auth_required_response(self)
            return
        if path == "/":
            self.serve_static("index.html")
            return
        if path == "/sw.js":
            self.serve_static("sw.js")
            return
        if path == "/health":
            json_response(self, {"status": "ok"})
            return
        if path.startswith("/static/"):
            self.serve_static(path.replace("/static/", "", 1))
            return
        if path == "/api/material-requests/export":
            self.serve_material_requests_export(parse_qs(parsed.query))
            return
        if path == "/api/work-items/print":
            self.serve_work_items_print(parse_qs(parsed.query))
            return
        variation_export = re.match(r"^/api/variations/(\d+)/export$", path)
        if variation_export:
            self.serve_variation_export(int(variation_export.group(1)))
            return
        document_download = re.match(r"^/api/documents/(\d+)/download$", path)
        if document_download:
            self.serve_document_download(int(document_download.group(1)))
            return
        estimate_job_file_download = re.match(r"^/api/estimate-job-files/(\d+)/download$", path)
        if estimate_job_file_download:
            self.serve_estimate_job_file_download(int(estimate_job_file_download.group(1)))
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
        except PermissionError as exc:
            json_response(self, {"error": str(exc)}, 403)
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
            ".webmanifest": "application/manifest+json; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".ico": "image/x-icon",
        }
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_types.get(file_path.suffix, "application/octet-stream"))
        maybe_send_session_cookie(self)
        if file_path.name == "sw.js":
            self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_document_download(self, document_id: int) -> None:
        with connect() as db:
            document = db.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
            if not document or not document["file_path"]:
                self.send_error(404)
                return
            if not document_visible_for_account(row_to_dict(document), current_access_account(self)):
                self.send_error(403)
                return
            stored_path = str(document["file_path"])
            if stored_path.startswith(YANDEX_DISK_FILE_PREFIX):
                try:
                    body = download_from_yandex_disk(stored_path)
                except (HTTPError, URLError, TimeoutError, RuntimeError, OSError):
                    self.send_error(502)
                    return
                file_name = document["file_name"] or Path(stored_path.removeprefix(YANDEX_DISK_FILE_PREFIX)).name
            else:
                file_path = (DATA_DIR / stored_path).resolve()
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

    def serve_estimate_job_file_download(self, file_id: int) -> None:
        with connect() as db:
            if not can_view_estimate_jobs(current_access_account(self)):
                self.send_error(403)
                return
            item = db.execute("SELECT * FROM estimate_job_files WHERE id = ?", (file_id,)).fetchone()
            if not item or not item["file_path"]:
                self.send_error(404)
                return
            stored_path = str(item["file_path"])
            if stored_path.startswith(YANDEX_DISK_FILE_PREFIX):
                try:
                    body = download_from_yandex_disk(stored_path)
                except (HTTPError, URLError, TimeoutError, RuntimeError, OSError):
                    self.send_error(502)
                    return
                file_name = item["file_name"] or Path(stored_path.removeprefix(YANDEX_DISK_FILE_PREFIX)).name
            else:
                file_path = (DATA_DIR / stored_path).resolve()
                if DATA_DIR.resolve() not in file_path.parents and file_path != DATA_DIR.resolve():
                    self.send_error(403)
                    return
                if not file_path.exists() or not file_path.is_file():
                    self.send_error(404)
                    return
                body = file_path.read_bytes()
                file_name = item["file_name"] or file_path.name
            content_type = item["mime_type"] or mimetypes.guess_type(file_name)[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Content-Disposition", f"inline; filename*=UTF-8''{quote(file_name)}")
            self.end_headers()
            self.wfile.write(body)

    def serve_material_requests_export(self, query: dict[str, list[str]]) -> None:
        project_id = int(query.get("project_id", ["0"])[0] or 0)
        with connect() as db:
            archive_completed_material_batches(db)
            params: list[object] = []
            where = ["b.status = 'received'"]
            if project_id:
                where.append("b.project_id = ?")
                params.append(project_id)
            rows = db.execute(
                f"""
                SELECT m.*, p.title AS project_title, b.created_at AS batch_created_at,
                       b.scheduled_delivery_date, b.received_at,
                       em.unit AS estimate_material_unit, em.unit_price
                FROM material_requests m
                JOIN material_request_batches b ON b.id = m.batch_id
                JOIN projects p ON p.id = m.project_id
                LEFT JOIN estimate_materials em ON em.id = m.estimate_material_id
                WHERE {" AND ".join(where)}
                ORDER BY p.title, m.estimate_section, m.title
                """,
                params,
            ).fetchall()
        output = io.StringIO()
        writer = csv.writer(output, delimiter=";")
        current_project = ""
        current_section = ""
        for row in rows:
            if row["project_title"] != current_project:
                current_project = row["project_title"]
                writer.writerow([current_project, "", "", "", "", ""])
                current_section = ""
            section = row["estimate_section"] or "Без раздела"
            if section != current_section:
                current_section = section
                writer.writerow([section, "", "", "", "", ""])
            writer.writerow(
                [
                    "Мат",
                    row["title"],
                    row["requested_unit"] or row["estimate_material_unit"] or "",
                    row["requested_quantity"] or 0,
                    row["unit_price"] or 0,
                    row["total_amount"] or 0,
                ]
            )
        body = ("\ufeff" + output.getvalue()).encode("utf-8")
        file_name = f"completed-material-requests-{date.today().isoformat()}.csv"
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(file_name)}")
        self.end_headers()
        self.wfile.write(body)

    def variation_detail_payload(self, db, variation_id: int) -> dict | None:
        variation = db.execute(
            """
            SELECT v.*, p.title AS project_title, p.foreman_id AS project_foreman_id,
                   requester.name AS requester_name, approver.name AS approver_name
            FROM variations v
            JOIN projects p ON p.id = v.project_id
            LEFT JOIN users requester ON requester.id = v.requester_id
            LEFT JOIN users approver ON approver.id = v.approver_id
            WHERE v.id = ?
            """,
            (variation_id,),
        ).fetchone()
        if not variation:
            return None
        payload = row_to_dict(variation)
        materials = []
        if variation["source_type"] == "material_request_batch" and variation["source_id"]:
            materials = db.execute(
                """
                SELECT m.*, em.unit AS estimate_material_unit, em.unit_price,
                       b.created_at AS batch_created_at, b.needed_at AS batch_needed_at,
                       b.scheduled_delivery_date AS batch_scheduled_delivery_date
                FROM material_requests m
                JOIN material_request_batches b ON b.id = m.batch_id
                LEFT JOIN estimate_materials em ON em.id = m.estimate_material_id
                WHERE m.batch_id = ?
                  AND m.basis_type != 'main_estimate'
                ORDER BY m.estimate_section, m.title
                """,
                (variation["source_id"],),
            ).fetchall()
        payload["materials"] = rows_to_dicts(materials)
        attachments = db.execute(
            """
            SELECT *
            FROM documents
            WHERE project_id = ?
              AND related_type = 'variation'
              AND process_type = ?
              AND COALESCE(status, 'active') != 'archived'
            ORDER BY created_at DESC
            """,
            (variation["project_id"], f"variation:{variation_id}"),
        ).fetchall()
        payload["attachments"] = rows_to_dicts(attachments)
        return payload

    def serve_variation_export(self, variation_id: int) -> None:
        with connect() as db:
            account = current_access_account(self) or {}
            payload = self.variation_detail_payload(db, variation_id)
            if not payload or not variation_visible_for_account(payload, account):
                self.send_error(404)
                return
            if not can_view_financials(account):
                self.send_error(403)
                return
        rows: list[list[object]] = [
            ["Допработа / отклонение", payload["title"]],
            ["Объект", payload["project_title"]],
            ["Тип", material_basis_text(payload["type"]) if str(payload["type"]).startswith("material") else payload["type"]],
            ["Решение по деньгам", payload["financial_decision"]],
            ["Сумма", payload["amount"]],
            [],
            ["Раздел", "Материал", "Основание", "Количество", "Ед.", "Цена", "Сумма", "Комментарий"],
        ]
        for item in payload["materials"]:
            rows.append(
                [
                    item.get("estimate_section") or "Без раздела",
                    item.get("title") or "",
                    material_basis_text(item.get("basis_type") or ""),
                    item.get("requested_quantity") or 0,
                    item.get("requested_unit") or item.get("estimate_material_unit") or "",
                    item.get("unit_price") or 0,
                    item.get("total_amount") or 0,
                    item.get("comment") or "",
                ]
            )
        body = make_xlsx(rows)
        file_name = f"variation-{variation_id}-materials.xlsx"
        self.send_response(200)
        self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(file_name)}")
        self.end_headers()
        self.wfile.write(body)

    def serve_work_items_print(self, query: dict[str, list[str]]) -> None:
        project_id = int(query.get("project_id", ["0"])[0] or 0)
        with connect() as db:
            project = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
            rows = db.execute("SELECT * FROM work_items WHERE project_id = ? ORDER BY section, title", (project_id,)).fetchall()
        if not project:
            self.send_error(404)
            return
        grouped: dict[str, list[dict]] = {}
        for row in rows_to_dicts(rows):
            grouped.setdefault(row.get("section") or "Без раздела", []).append(row)
        sections = []
        for section, items in grouped.items():
            item_rows = "".join(
                f"<tr><td>{escape_xml(item['title'])}</td><td>{escape_xml(item.get('unit') or '')}</td><td>{item.get('estimated_quantity') or 0:g}</td></tr>"
                for item in items
            )
            sections.append(f"<h2>{escape_xml(section)}</h2><table><thead><tr><th>Работа</th><th>Ед.</th><th>Кол-во</th></tr></thead><tbody>{item_rows}</tbody></table>")
        html = f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8" />
<title>Работы - {escape_xml(project['title'])}</title>
<style>
body{{font-family:Arial,sans-serif;margin:24px;color:#111}}h1{{font-size:24px}}h2{{font-size:16px;margin-top:24px}}table{{width:100%;border-collapse:collapse;margin-top:8px}}th,td{{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}}th{{background:#f0f3f4}}@media print{{button{{display:none}}}}
</style></head><body>
<button onclick="window.print()">Сохранить в PDF / печать</button>
<h1>{escape_xml(project['title'])}: задание на работы</h1>
{''.join(sections) if sections else '<p>Работы по объекту не загружены.</p>'}
</body></html>"""
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_api_get(self, path: str, query: dict[str, list[str]]) -> None:
        with connect() as db:
            account = current_access_account(self) or {}
            archive_completed_material_batches(db)
            if path == "/api/session":
                user = None
                if account.get("user_id"):
                    user = db.execute("SELECT id, name, role, email FROM users WHERE id = ?", (account["user_id"],)).fetchone()
                json_response(
                    self,
                    {
                        "login": account.get("login") or "",
                        "role": account.get("role") or (user["role"] if user else "owner"),
                        "user_id": account.get("user_id") or (user["id"] if user else 1),
                        "can_switch_role": bool(account.get("can_switch_role")),
                        "user": row_to_dict(user) if user else None,
                    },
                )
                return

            if path == "/api/users":
                rows = db.execute("SELECT * FROM users WHERE is_active = 1 ORDER BY id").fetchall()
                json_response(self, rows_to_dicts(rows))
                return

            if path == "/api/notifications":
                notification_filter = ""
                params: list[object] = []
                if account_role(account) not in {"owner", "construction_manager", "finance_director"}:
                    notification_filter = "WHERE n.role = ? OR n.user_id = ?"
                    params = [account_role(account), account_user_id(account)]
                rows = db.execute(
                    f"""
                    SELECT n.*, p.title AS project_title, u.name AS user_name
                    FROM notifications n
                    LEFT JOIN projects p ON p.id = n.project_id
                    LEFT JOIN users u ON u.id = n.user_id
                    {notification_filter}
                    ORDER BY n.created_at DESC
                    LIMIT 30
                    """,
                    params,
                ).fetchall()
                json_response(self, rows_to_dicts(rows))
                return

            if path == "/api/feedback":
                if not can_manage_feedback(account):
                    json_response(self, [], 200)
                    return
                status = (query.get("status") or ["all"])[0]
                where = ""
                params: list[object] = []
                if status and status != "all":
                    where = "WHERE status = ?"
                    params.append(status)
                rows = db.execute(
                    f"""
                    SELECT *
                    FROM feedback_items
                    {where}
                    ORDER BY created_at DESC, id DESC
                    LIMIT 200
                    """,
                    params,
                ).fetchall()
                items = rows_to_dicts(rows)
                for item in items:
                    try:
                        item["attachments"] = json.loads(item.get("attachments_json") or "[]")
                    except json.JSONDecodeError:
                        item["attachments"] = []
                    item.pop("attachments_json", None)
                json_response(self, items)
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
                    "estimate_jobs_open": db.execute("SELECT COUNT(*) AS count FROM estimate_jobs WHERE status IN ('estimate_new', 'estimate_in_work')").fetchone()["count"],
                    "estimate_jobs_done": db.execute("SELECT COUNT(*) AS count FROM estimate_jobs WHERE status = 'estimate_done'").fetchone()["count"],
                    "estimate_jobs_overdue": db.execute("SELECT COUNT(*) AS count FROM estimate_jobs WHERE status != 'estimate_done' AND due_date IS NOT NULL AND due_date < date('now')").fetchone()["count"],
                }
                json_response(self, payload)
                return

            if path == "/api/estimate-jobs":
                if not can_view_estimate_jobs(account):
                    json_response(self, [])
                    return
                rows = db.execute(
                    """
                    SELECT j.*, p.title AS project_title,
                           manager.name AS manager_name,
                           estimator.name AS estimator_name
                    FROM estimate_jobs j
                    LEFT JOIN projects p ON p.id = j.project_id
                    LEFT JOIN users manager ON manager.id = j.manager_id
                    LEFT JOIN users estimator ON estimator.id = j.estimator_id
                    ORDER BY
                        CASE j.status
                            WHEN 'estimate_new' THEN 1
                            WHEN 'estimate_in_work' THEN 2
                            WHEN 'estimate_done' THEN 4
                            ELSE 3
                        END,
                        j.due_date,
                        j.received_at DESC,
                        j.id DESC
                    """
                ).fetchall()
                jobs = rows_to_dicts(rows)
                if jobs:
                    ids = [int(job["id"]) for job in jobs]
                    placeholders = ",".join("?" for _ in ids)
                    file_rows = db.execute(
                        f"""
                        SELECT f.*, u.name AS uploaded_by_name
                        FROM estimate_job_files f
                        LEFT JOIN users u ON u.id = f.uploaded_by
                        WHERE f.estimate_job_id IN ({placeholders})
                        ORDER BY f.created_at DESC, f.id DESC
                        """,
                        ids,
                    ).fetchall()
                    files_by_job: dict[int, list[dict]] = {}
                    for file_row in file_rows:
                        file_item = row_to_dict(file_row)
                        files_by_job.setdefault(int(file_item["estimate_job_id"]), []).append(file_item)
                    for job in jobs:
                        job["files"] = files_by_job.get(int(job["id"]), [])
                json_response(self, jobs)
                return

            if path == "/api/projects":
                rows = db.execute(
                    """
                    SELECT p.*, foreman.name AS foreman_name, estimator.name AS estimator_name,
                           procurement.name AS procurement_name, tech.name AS tech_supervisor_name,
                           sales.name AS sales_manager_name,
                           customer.phone AS customer_phone, customer.email AS customer_email
                    FROM projects p
                    LEFT JOIN customers customer ON customer.id = p.customer_id
                    LEFT JOIN users foreman ON foreman.id = p.foreman_id
                    LEFT JOIN users estimator ON estimator.id = p.estimator_id
                    LEFT JOIN users procurement ON procurement.id = p.procurement_manager_id
                    LEFT JOIN users tech ON tech.id = p.tech_supervisor_id
                    LEFT JOIN users sales ON sales.id = p.sales_manager_id
                    WHERE p.status != 'archived'
                    ORDER BY p.updated_at DESC
                    """
                ).fetchall()
                projects = rows_to_dicts(rows)
                projects = [project for project in projects if project_visible_for_account(project, account)]
                projects = [sanitize_project_for_account(project, account) for project in projects]
                json_response(self, projects)
                return

            if path == "/api/projects/archive":
                rows = db.execute(
                    """
                    SELECT p.*, foreman.name AS foreman_name, estimator.name AS estimator_name,
                           procurement.name AS procurement_name, tech.name AS tech_supervisor_name,
                           sales.name AS sales_manager_name,
                           customer.phone AS customer_phone, customer.email AS customer_email
                    FROM projects p
                    LEFT JOIN customers customer ON customer.id = p.customer_id
                    LEFT JOIN users foreman ON foreman.id = p.foreman_id
                    LEFT JOIN users estimator ON estimator.id = p.estimator_id
                    LEFT JOIN users procurement ON procurement.id = p.procurement_manager_id
                    LEFT JOIN users tech ON tech.id = p.tech_supervisor_id
                    LEFT JOIN users sales ON sales.id = p.sales_manager_id
                    WHERE p.status = 'archived'
                      AND COALESCE(p.bitrix_ref, '') != '__knowledge_base__'
                    ORDER BY p.archived_at DESC, p.updated_at DESC
                    """
                ).fetchall()
                projects = rows_to_dicts(rows)
                projects = [project for project in projects if project_visible_for_account(project, account)]
                projects = [sanitize_project_for_account(project, account) for project in projects]
                json_response(self, projects)
                return

            if path == "/api/estimate-materials":
                project_id = query.get("project_id", [""])[0]
                if not project_id:
                    json_response(self, [])
                    return
                project = db.execute("SELECT id, foreman_id FROM projects WHERE id = ?", (int(project_id),)).fetchone()
                if project and not project_visible_for_account(row_to_dict(project), account):
                    json_response(self, {"error": "Forbidden"}, 403)
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

            if path == "/api/work-items":
                project_id = query.get("project_id", [""])[0]
                if not project_id:
                    json_response(self, [])
                    return
                project = db.execute("SELECT id, foreman_id FROM projects WHERE id = ?", (int(project_id),)).fetchone()
                if project and not project_visible_for_account(row_to_dict(project), account):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                rows = db.execute(
                    "SELECT * FROM work_items WHERE project_id = ? ORDER BY section, title",
                    (int(project_id),),
                ).fetchall()
                json_response(self, rows_to_dicts(rows))
                return

            if path == "/api/work-extra-items":
                project_id = query.get("project_id", [""])[0]
                params: list[object] = []
                where = ""
                if project_id:
                    where = "WHERE w.project_id = ?"
                    params.append(int(project_id))
                rows = db.execute(
                    f"""
                    SELECT w.*, p.title AS project_title, u.name AS creator_name
                    FROM work_extra_items w
                    JOIN projects p ON p.id = w.project_id
                    LEFT JOIN users u ON u.id = w.creator_id
                    {where}
                    ORDER BY w.created_at DESC
                    """,
                    params,
                ).fetchall()
                json_response(self, rows_to_dicts(rows))
                return

            if path == "/api/locations":
                projects = db.execute(
                    """
                    SELECT id, title, customer_name, address, navigator_url, foreman_id, status
                    FROM projects
                    WHERE status != 'archived'
                    ORDER BY title
                    """
                ).fetchall()
                suppliers = db.execute(
                    """
                    SELECT *
                    FROM supplier_locations
                    WHERE is_active = 1
                    ORDER BY title
                    """
                ).fetchall()
                project_rows = rows_to_dicts(projects)
                project_rows = [project for project in project_rows if project_visible_for_account(project, account)]
                json_response(self, {"projects": project_rows, "suppliers": rows_to_dicts(suppliers)})
                return

            variation_detail = re.match(r"^/api/variations/(\d+)$", path)
            if variation_detail:
                payload = self.variation_detail_payload(db, int(variation_detail.group(1)))
                if not payload or not variation_visible_for_account(payload, account):
                    json_response(self, {"error": "Variation not found"}, 404)
                    return
                payload = sanitize_variation_for_account(payload, account)
                json_response(self, payload)
                return

            if path == "/api/material-requests":
                archive_mode = query.get("archive", ["0"])[0] in {"1", "true", "yes"}
                archive_filter = "b.archived_at IS NOT NULL" if archive_mode else "(b.archived_at IS NULL OR b.id IS NULL) AND p.status != 'archived'"
                rows = db.execute(
                    f"""
                    SELECT m.*, p.title AS project_title, em.name AS estimate_material_name,
                           em.unit AS estimate_material_unit, em.estimated_quantity, em.unit_price,
                           p.foreman_id AS project_foreman_id, creator.name AS creator_name,
                           creator.role AS creator_role,
                           b.status AS batch_status, b.comment AS batch_comment,
                           b.revision_comment AS batch_revision_comment, b.created_at AS batch_created_at,
                           b.delivery_urgency AS batch_delivery_urgency,
                           b.foreman_response AS batch_foreman_response,
                           b.scheduled_delivery_date AS batch_scheduled_delivery_date,
                           b.procurement_comment AS batch_procurement_comment,
                           b.received_at AS batch_received_at,
                           b.receipt_status AS batch_receipt_status,
                           b.receipt_comment AS batch_receipt_comment,
                           b.receipt_document_id AS batch_receipt_document_id,
                           receipt_doc.file_name AS batch_receipt_document_file_name,
                           receipt_doc.title AS batch_receipt_document_title,
                           receipt_doc.mime_type AS batch_receipt_document_mime_type,
                           source_variation.id AS batch_variation_id,
                           source_variation.title AS batch_variation_title,
                           source_variation.status AS batch_variation_status,
                           b.archived_at AS batch_archived_at
                    FROM material_requests m
                    JOIN projects p ON p.id = m.project_id
                    LEFT JOIN material_request_batches b ON b.id = m.batch_id
                    LEFT JOIN estimate_materials em ON em.id = m.estimate_material_id
                    LEFT JOIN users creator ON creator.id = m.creator_id
                    LEFT JOIN documents receipt_doc ON receipt_doc.id = b.receipt_document_id
                    LEFT JOIN variations source_variation
                      ON source_variation.source_type = 'material_request_batch'
                     AND source_variation.source_id = b.id
                    WHERE {archive_filter}
                    ORDER BY COALESCE(b.created_at, m.created_at) DESC, m.id
                    """
                ).fetchall()
                material_rows = rows_to_dicts(rows)
                if account_role(account) == "foreman":
                    material_rows = [
                        item
                        for item in material_rows
                        if int(item.get("project_foreman_id") or 0) == account_user_id(account)
                        or int(item.get("creator_id") or 0) == account_user_id(account)
                    ]
                json_response(self, material_rows)
                return

            if path.startswith("/api/projects/"):
                project_id = int(path.rsplit("/", 1)[-1])
                detail = get_project_detail(project_id, account)
                if not detail:
                    json_response(self, {"error": "Project not found"}, 404)
                    return
                if not project_visible_for_account(detail, account):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                json_response(self, detail)
                return

            endpoints = {
                "/api/tasks": """
                    SELECT t.*, p.title AS project_title, p.foreman_id AS project_foreman_id,
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
                "/api/variations": """
                    SELECT v.*, p.title AS project_title, p.foreman_id AS project_foreman_id,
                           requester.name AS requester_name, approver.name AS approver_name
                    FROM variations v
                    JOIN projects p ON p.id = v.project_id
                    LEFT JOIN users requester ON requester.id = v.requester_id
                    LEFT JOIN users approver ON approver.id = v.approver_id
                    ORDER BY
                        CASE v.status
                            WHEN 'decision_required' THEN 1
                            WHEN 'in_review' THEN 2
                            WHEN 'approved' THEN 3
                            WHEN 'rejected' THEN 4
                            ELSE 5
                        END,
                        v.due_date
                """,
                "/api/contracts": "SELECT c.*, p.title AS project_title, u.name AS responsible_name FROM contracts c JOIN projects p ON p.id = c.project_id LEFT JOIN users u ON u.id = c.responsible_id ORDER BY c.ends_at",
                "/api/events": "SELECT e.*, p.title AS project_title, u.name AS author_name FROM events e JOIN projects p ON p.id = e.project_id LEFT JOIN users u ON u.id = e.author_id ORDER BY e.created_at DESC",
            }
            if path in endpoints:
                if path == "/api/contracts" and account_role(account) not in {"owner", "construction_manager", "finance_director", "accountant"}:
                    json_response(self, [])
                    return
                if path == "/api/events" and account_role(account) not in {"owner", "construction_manager", "finance_director", "accountant"}:
                    json_response(self, [])
                    return
                if path == "/api/variations" and not can_view_variations(account):
                    json_response(self, [])
                    return
                rows = rows_to_dicts(db.execute(endpoints[path]).fetchall())
                if path == "/api/variations":
                    rows = [sanitize_variation_for_account(row, account) for row in rows if variation_visible_for_account(row, account)]
                if path == "/api/tasks":
                    role = account_role(account)
                    user_id = account_user_id(account)
                    if role == "foreman":
                        rows = [
                            row
                            for row in rows
                            if int(row.get("project_foreman_id") or 0) == user_id
                            or int(row.get("assignee_id") or 0) == user_id
                            or int(row.get("reviewer_id") or 0) == user_id
                            or int(row.get("creator_id") or 0) == user_id
                        ]
                    elif role in {"estimator", "procurement_manager", "sales_manager"}:
                        rows = [
                            row
                            for row in rows
                            if int(row.get("assignee_id") or 0) == user_id
                            or int(row.get("reviewer_id") or 0) == user_id
                            or int(row.get("creator_id") or 0) == user_id
                        ]
                    elif role not in {"owner", "construction_manager", "finance_director", "technical_supervisor"}:
                        rows = []
                    rows = attach_task_events(db, rows)
                json_response(self, rows)
                return

            if path == "/api/documents":
                related_type = (query.get("related_type") or ["project"])[0]
                if related_type == "knowledge_base":
                    if not can_view_knowledge_base(account):
                        json_response(self, [])
                        return
                    rows = db.execute(
                        """
                        SELECT d.*, p.title AS project_title, u.name AS owner_name
                        FROM documents d
                        LEFT JOIN projects p ON p.id = d.project_id
                        LEFT JOIN users u ON u.id = d.owner_id
                        WHERE d.related_type = 'knowledge_base'
                        ORDER BY d.created_at DESC
                        """
                    ).fetchall()
                else:
                    rows = db.execute(
                        """
                        SELECT d.*, p.title AS project_title, u.name AS owner_name
                        FROM documents d
                        JOIN projects p ON p.id = d.project_id
                        LEFT JOIN users u ON u.id = d.owner_id
                        WHERE COALESCE(d.related_type, 'project') != 'knowledge_base'
                        ORDER BY d.created_at DESC
                        """
                    ).fetchall()
                documents = rows_to_dicts(rows)
                if related_type != "knowledge_base":
                    documents = filter_documents_for_account(documents, account)
                json_response(self, documents)
                return

        self.send_error(404)

    def handle_api_post(self, path: str, data: dict) -> None:
        with connect() as db:
            account = current_access_account(self) or {}
            if path == "/api/feedback":
                if not can_manage_feedback(account):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                source = str(data.get("source") or "max").strip() or "max"
                external_id = str(data.get("external_id") or "").strip() or None
                if external_id:
                    existing = db.execute(
                        "SELECT id FROM feedback_items WHERE source = ? AND external_id = ?",
                        (source, external_id),
                    ).fetchone()
                    if existing:
                        json_response(self, {"id": existing["id"], "duplicate": True}, 200)
                        return
                cursor = db.execute(
                    """
                    INSERT INTO feedback_items (
                        source, external_id, chat_id, chat_title, sender_id, sender_name,
                        text, attachments_json, status, decision_comment
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', '')
                    """,
                    (
                        source,
                        external_id,
                        str(data.get("chat_id") or ""),
                        str(data.get("chat_title") or ""),
                        str(data.get("sender_id") or ""),
                        str(data.get("sender_name") or ""),
                        str(data.get("text") or ""),
                        json.dumps(data.get("attachments") or [], ensure_ascii=False),
                    ),
                )
                json_response(self, {"id": cursor.lastrowid}, 201)
                return

            user_max_chat = re.match(r"^/api/users/(\d+)/max-chat$", path)
            if user_max_chat:
                if account_role(account) not in {"owner", "construction_manager", "finance_director"}:
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                user_id = int(user_max_chat.group(1))
                max_chat_id = str(data.get("max_chat_id") or "").strip()
                max_user_id = str(data.get("max_user_id") or "").strip()
                enabled = 1 if max_chat_id and data.get("enabled", True) is not False else 0
                db.execute(
                    """
                    UPDATE users
                    SET max_chat_id = ?,
                        max_user_id = ?,
                        max_notifications_enabled = ?
                    WHERE id = ?
                    """,
                    (max_chat_id, max_user_id, enabled, user_id),
                )
                user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
                if not user:
                    json_response(self, {"error": "User not found"}, 404)
                    return
                json_response(self, row_to_dict(user))
                return

            if path == "/api/feedback/delete-bulk":
                if not can_delete_feedback(account):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                ids = []
                for value in data.get("ids") or []:
                    try:
                        ids.append(int(value))
                    except (TypeError, ValueError):
                        continue
                if not ids:
                    json_response(self, {"deleted": 0})
                    return
                placeholders = ",".join("?" for _ in ids)
                cursor = db.execute(f"DELETE FROM feedback_items WHERE id IN ({placeholders})", ids)
                json_response(self, {"deleted": cursor.rowcount})
                return

            feedback_delete = re.match(r"^/api/feedback/(\d+)/delete$", path)
            if feedback_delete:
                if not can_delete_feedback(account):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                db.execute("DELETE FROM feedback_items WHERE id = ?", (int(feedback_delete.group(1)),))
                json_response(self, {"ok": True})
                return

            feedback_action = re.match(r"^/api/feedback/(\d+)/status$", path)
            if feedback_action:
                if not can_manage_feedback(account):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                status = str(data.get("status") or "new")
                if status not in {"new", "in_work", "done"}:
                    json_response(self, {"error": "Unknown status"}, 400)
                    return
                db.execute(
                    """
                    UPDATE feedback_items
                    SET status = ?, decision_comment = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (status, str(data.get("comment") or ""), int(feedback_action.group(1))),
                )
                json_response(self, {"ok": True})
                return

            if path == "/api/estimate-jobs":
                if not can_manage_estimate_jobs(account):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                require_fields(
                    data,
                    [
                        ("title", "Название задания"),
                        ("customer_name", "Заказчик"),
                        ("manager_id", "Менеджер"),
                        ("estimator_id", "Сметчик"),
                        ("received_at", "Дата получения задания"),
                        ("due_date", "Плановый срок готовности"),
                    ],
                )
                status = data.get("status") or "estimate_new"
                if status not in {"estimate_new", "estimate_in_work", "estimate_done", "estimate_hold"}:
                    status = "estimate_new"
                project_id = int(data.get("project_id") or 0) or None
                cursor = db.execute(
                    """
                    INSERT INTO estimate_jobs (
                        project_id, title, customer_name, manager_id, estimator_id,
                        received_at, due_date, delivered_at, status, priority, source,
                        estimate_type, comment, result_comment
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        project_id,
                        data.get("title"),
                        data.get("customer_name"),
                        int(data.get("manager_id") or 0) or None,
                        int(data.get("estimator_id") or 0) or None,
                        data.get("received_at") or None,
                        data.get("due_date") or None,
                        data.get("delivered_at") or None,
                        status,
                        data.get("priority") or "normal",
                        data.get("source") or "",
                        data.get("estimate_type") or "",
                        data.get("comment") or "",
                        data.get("result_comment") or "",
                    ),
                )
                estimate_job_id = int(cursor.lastrowid)
                attachments = [item for item in data.get("attachments") or [] if isinstance(item, dict) and item.get("file_base64")]
                for attachment in attachments:
                    save_estimate_job_file(db, estimate_job_id, attachment, account_user_id(account))
                notify_users(
                    db,
                    {int(data.get("estimator_id") or 0), int(data.get("manager_id") or 0), user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")} - {0, None},
                    project_id,
                    "Новое задание на смету",
                    f"{data.get('title')} · срок: {data.get('due_date')} · файлов: {len(attachments)}",
                    "estimate_job",
                    estimate_job_id,
                )
                json_response(self, {"id": estimate_job_id}, 201)
                return

            estimate_job_action = re.match(r"^/api/estimate-jobs/(\d+)/(update|status|delete)$", path)
            if estimate_job_action:
                estimate_job_id = int(estimate_job_action.group(1))
                action = estimate_job_action.group(2)
                row = db.execute("SELECT * FROM estimate_jobs WHERE id = ?", (estimate_job_id,)).fetchone()
                if not row:
                    json_response(self, {"error": "Estimate job not found"}, 404)
                    return
                if action == "delete":
                    if not can_delete_estimate_jobs(account):
                        json_response(self, {"error": "Forbidden"}, 403)
                        return
                    db.execute("DELETE FROM estimate_jobs WHERE id = ?", (estimate_job_id,))
                    json_response(self, {"deleted": estimate_job_id})
                    return
                if not can_manage_estimate_jobs(account):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                if action == "update":
                    require_fields(
                        data,
                        [
                            ("title", "Название задания"),
                            ("customer_name", "Заказчик"),
                            ("manager_id", "Менеджер"),
                            ("estimator_id", "Сметчик"),
                            ("received_at", "Дата получения задания"),
                            ("due_date", "Плановый срок готовности"),
                        ],
                    )
                    db.execute(
                        """
                        UPDATE estimate_jobs
                        SET project_id = ?,
                            title = ?,
                            customer_name = ?,
                            manager_id = ?,
                            estimator_id = ?,
                            received_at = ?,
                            due_date = ?,
                            priority = ?,
                            source = ?,
                            estimate_type = ?,
                            comment = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (
                            int(data.get("project_id") or 0) or None,
                            data.get("title"),
                            data.get("customer_name"),
                            int(data.get("manager_id") or 0) or None,
                            int(data.get("estimator_id") or 0) or None,
                            data.get("received_at") or None,
                            data.get("due_date") or None,
                            data.get("priority") or "normal",
                            data.get("source") or "",
                            data.get("estimate_type") or "",
                            data.get("comment") or "",
                            estimate_job_id,
                        ),
                    )
                    attachments = [item for item in data.get("attachments") or [] if isinstance(item, dict) and item.get("file_base64")]
                    for attachment in attachments:
                        save_estimate_job_file(db, estimate_job_id, attachment, account_user_id(account))
                    json_response(self, {"id": estimate_job_id})
                    return
                status = data.get("status") or row["status"]
                if status not in {"estimate_new", "estimate_in_work", "estimate_done", "estimate_hold"}:
                    json_response(self, {"error": "Unknown status"}, 400)
                    return
                delivered_at = data.get("delivered_at") or (date.today().isoformat() if status == "estimate_done" else None)
                result_comment = data.get("result_comment") or row["result_comment"] or ""
                db.execute(
                    """
                    UPDATE estimate_jobs
                    SET status = ?,
                        delivered_at = ?,
                        result_comment = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (status, delivered_at if status == "estimate_done" else None, result_comment, estimate_job_id),
                )
                notify_users(
                    db,
                    {row["manager_id"], row["estimator_id"], user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")} - {None},
                    row["project_id"],
                    "Статус сметы изменен",
                    f"{row['title']}: {status}",
                    "estimate_job",
                    estimate_job_id,
                )
                json_response(self, {"id": estimate_job_id, "status": status})
                return

            if path == "/api/projects":
                ensure_project_action_allowed(account, "update")
                if data.get("save_mode") == "draft":
                    data["title"] = str(data.get("title") or "").strip() or "Новый объект"
                    data["customer_name"] = str(data.get("customer_name") or "").strip() or "Не указан"
                    customer_id = ensure_customer(db, data.get("customer_name"), data.get("customer_phone"), data.get("customer_email"))
                    cursor = db.execute(
                        """
                        INSERT INTO projects (
                            customer_id, title, customer_name, status, address, navigator_url, bitrix_ref,
                            smetter_ref, estimate_file_name, work_task_file_name, estimate_version, estimate_uploaded_by,
                            sales_manager_id, construction_manager_id, foreman_id, estimator_id,
                            procurement_manager_id, tech_supervisor_id, manager_note, planned_end_date, main_estimate_amount
                        )
                        VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)
                        """,
                        (
                            customer_id,
                            data.get("title"),
                            data.get("customer_name"),
                            data.get("address") or "",
                            data.get("navigator_url") or "https://yandex.ru/maps",
                            "",
                            data.get("smetter_ref") or "",
                            data.get("estimate_file_name") or "",
                            data.get("work_task_file_name") or "",
                            data.get("estimate_version") or "",
                            account_user_id(account) or 3,
                            account_user_id(account) or 3,
                            user_id_by_role(db, "construction_manager") or 2,
                            str(data.get("manager_note") or "").strip(),
                            data.get("planned_end_date") or "",
                            number_value(data.get("main_estimate_amount")),
                        ),
                    )
                    project_id = cursor.lastrowid
                    initial_documents = data.get("initial_documents") or []
                    save_initial_documents(db, project_id, initial_documents)
                    imported_materials = import_smetter_materials_from_documents(db, project_id, initial_documents)
                    imported_works = import_smetter_works_from_documents(db, project_id, initial_documents)
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'document', ?, ?, 'internal', 'handover')
                        """,
                        (project_id, "Карточка объекта сохранена как черновик.", account_user_id(account) or 3),
                    )
                    db.commit()
                    detail = get_project_detail(project_id, account)
                    detail["imported_materials_count"] = imported_materials
                    detail["imported_works_count"] = imported_works
                    json_response(self, detail, 201)
                    return
                require_fields(
                    data,
                    [
                        ("title", "Название"),
                        ("customer_name", "Заказчик"),
                        ("customer_phone", "Телефон заказчика"),
                        ("customer_email", "E-mail заказчика"),
                        ("address", "Адрес"),
                        ("navigator_url", "Ссылка на локацию объекта из Яндекса"),
                        ("smetter_ref", "Сметтер"),
                        ("planned_end_date", "Плановый срок окончания работ по договору"),
                        ("main_estimate_amount", "Смета"),
                        ("estimate_file_name", "Файл материалов из Сметтера"),
                        ("work_task_file_name", "Задание на работы из Сметтера"),
                    ],
                )
                customer_id = ensure_customer(db, data.get("customer_name"), data.get("customer_phone"), data.get("customer_email"))
                cursor = db.execute(
                    """
                    INSERT INTO projects (
                        customer_id, title, customer_name, status, address, navigator_url, bitrix_ref,
                        smetter_ref, estimate_file_name, work_task_file_name, estimate_version, estimate_uploaded_by,
                        sales_manager_id, construction_manager_id, foreman_id, estimator_id,
                        procurement_manager_id, tech_supervisor_id, manager_note, planned_end_date, main_estimate_amount
                    )
                    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)
                    """,
                    (
                        customer_id,
                        data.get("title"),
                        data.get("customer_name"),
                        data.get("address"),
                        data.get("navigator_url") or "https://yandex.ru/maps",
                        "",
                        data.get("smetter_ref"),
                        data.get("estimate_file_name"),
                        data.get("work_task_file_name"),
                        data.get("estimate_version") or "",
                        3,
                        3,
                        user_id_by_role(db, "construction_manager") or 2,
                        str(data.get("manager_note") or "").strip(),
                        data.get("planned_end_date"),
                        number_value(data.get("main_estimate_amount")),
                    ),
                )
                project_id = cursor.lastrowid
                initial_documents = data.get("initial_documents") or []
                save_initial_documents(db, project_id, initial_documents)
                imported_materials = import_smetter_materials_from_documents(db, project_id, initial_documents)
                imported_works = import_smetter_works_from_documents(db, project_id, initial_documents)
                db.execute(
                    """
                    INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                    VALUES (?, 'document', ?, 3, 'internal', 'handover')
                    """,
                    (
                        project_id,
                        "Менеджер создал карточку объекта. "
                        + (f"Материалы из Сметтера загружены: {imported_materials} строк. " if imported_materials else "")
                        + (f"Задание на работы загружено: {imported_works} строк. " if imported_works else "")
                        + "Объект еще не передан в строительство.",
                    ),
                )
                db.commit()
                detail = get_project_detail(project_id, account)
                detail["imported_materials_count"] = imported_materials
                detail["imported_works_count"] = imported_works
                json_response(self, detail, 201)
                return

            project_action = re.match(r"^/api/projects/(\d+)/(update|submit|accept|assign|return|archive|restore|delete)$", path)
            if project_action:
                project_id = int(project_action.group(1))
                action = project_action.group(2)
                ensure_project_action_allowed(account, action)
                project = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
                if not project:
                    json_response(self, {"error": "Project not found"}, 404)
                    return

                if action == "submit" and project["status"] not in {"draft", "revision_requested"}:
                    raise ValueError("Передать можно только черновик или объект, возвращенный на доработку.")
                if action in {"accept", "return"} and project["status"] != "submitted_to_construction":
                    raise ValueError("Принять или вернуть можно только объект, переданный руководителю строительства.")

                if action == "update" and data.get("save_mode") == "draft":
                    customer_id = ensure_customer(
                        db,
                        data.get("customer_name") or project["customer_name"],
                        data.get("customer_phone"),
                        data.get("customer_email"),
                    )
                    db.execute(
                        """
                        UPDATE projects
                        SET customer_id = ?,
                            title = ?,
                            customer_name = ?,
                            address = ?,
                            navigator_url = ?,
                            bitrix_ref = ?,
                            smetter_ref = ?,
                            manager_note = ?,
                            planned_end_date = ?,
                            main_estimate_amount = ?,
                            estimate_file_name = ?,
                            work_task_file_name = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (
                            customer_id,
                            str(data.get("title") or "").strip() or project["title"] or "Новый объект",
                            str(data.get("customer_name") or "").strip() or project["customer_name"] or "Не указан",
                            data.get("address") or "",
                            data.get("navigator_url") or project["navigator_url"] or "",
                            "",
                            data.get("smetter_ref") or "",
                            str(data.get("manager_note") or "").strip(),
                            data.get("planned_end_date") or "",
                            number_value(data.get("main_estimate_amount")),
                            data.get("estimate_file_name") or project["estimate_file_name"] or "",
                            data.get("work_task_file_name") or project["work_task_file_name"] or "",
                            project_id,
                        ),
                    )
                    initial_documents = data.get("initial_documents") or []
                    save_initial_documents(db, project_id, initial_documents)
                    imported_materials = import_smetter_materials_from_documents(db, project_id, initial_documents)
                    imported_works = import_smetter_works_from_documents(db, project_id, initial_documents)
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'document', ?, ?, 'internal', 'handover')
                        """,
                        (project_id, "Черновик карточки объекта сохранен.", account_user_id(account) or 3),
                    )
                    db.commit()
                    detail = get_project_detail(project_id, account)
                    detail["imported_materials_count"] = imported_materials
                    detail["imported_works_count"] = imported_works
                    json_response(self, detail)
                    return

                if action == "update":
                    require_fields(
                        data,
                        [
                            ("title", "Название"),
                            ("customer_name", "Заказчик"),
                            ("customer_phone", "Телефон заказчика"),
                            ("customer_email", "E-mail заказчика"),
                            ("address", "Адрес"),
                            ("navigator_url", "Ссылка на локацию объекта из Яндекса"),
                            ("smetter_ref", "Сметтер"),
                            ("planned_end_date", "Плановый срок окончания работ по договору"),
                            ("main_estimate_amount", "Смета"),
                            ("estimate_file_name", "Файл материалов из Сметтера"),
                        ("work_task_file_name", "Задание на работы из Сметтера"),
                        ],
                    )
                    customer_id = ensure_customer(db, data.get("customer_name"), data.get("customer_phone"), data.get("customer_email"))
                    db.execute(
                        """
                        UPDATE projects
                        SET customer_id = ?,
                            title = ?,
                            customer_name = ?,
                            address = ?,
                            navigator_url = ?,
                            bitrix_ref = ?,
                            smetter_ref = ?,
                            manager_note = ?,
                            planned_end_date = ?,
                            main_estimate_amount = ?,
                            estimate_file_name = ?,
                            work_task_file_name = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (
                            customer_id,
                            data.get("title"),
                            data.get("customer_name"),
                            data.get("address"),
                            data.get("navigator_url") or "",
                            "",
                            data.get("smetter_ref"),
                            str(data.get("manager_note") or "").strip(),
                            data.get("planned_end_date"),
                            number_value(data.get("main_estimate_amount")),
                            data.get("estimate_file_name"),
                            data.get("work_task_file_name"),
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
                    initial_documents = data.get("initial_documents") or []
                    save_initial_documents(db, project_id, initial_documents)
                    imported_materials = import_smetter_materials_from_documents(db, project_id, initial_documents)
                    imported_works = import_smetter_works_from_documents(db, project_id, initial_documents)
                    if imported_materials:
                        db.execute(
                            """
                            INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                            VALUES (?, 'document', ?, 3, 'internal', 'handover')
                            """,
                            (project_id, f"Материалы из Сметтера обновлены: {imported_materials} строк."),
                        )
                    if imported_works:
                        db.execute(
                            """
                            INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                            VALUES (?, 'document', ?, 3, 'internal', 'handover')
                            """,
                            (project_id, f"Задание на работы из Сметтера обновлено: {imported_works} строк."),
                        )
                    db.commit()
                    detail = get_project_detail(project_id, account)
                    detail["imported_materials_count"] = imported_materials
                    detail["imported_works_count"] = imported_works
                    json_response(self, detail)
                    return

                if action == "submit":
                    correction_comment = str(data.get("comment") or "").strip()
                    required = [
                        ("title", "Название"),
                        ("customer_name", "Заказчик"),
                        ("address", "Адрес"),
                        ("smetter_ref", "Сметтер"),
                        ("planned_end_date", "Плановый срок окончания работ по договору"),
                        ("estimate_file_name", "Файл материалов из Сметтера"),
                        ("work_task_file_name", "Задание на работы из Сметтера"),
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
                        f"{project['title']}: проверьте карточку, документацию и примите объект в работу или верните на доработку."
                        + (f" Комментарий менеджера: {correction_comment}" if correction_comment else ""),
                    )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'decision', ?, 3, 'internal', 'handover')
                        """,
                        (
                            project_id,
                            "Менеджер передал объект руководителю строительства на проверку."
                            + (f" Комментарий после доработки: {correction_comment}" if correction_comment else ""),
                        ),
                    )
                    db.commit()
                    json_response(self, get_project_detail(project_id, account))
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
                    json_response(self, get_project_detail(project_id, account))
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
                    json_response(self, get_project_detail(project_id, account))
                    return

                if action == "assign":
                    if project["status"] == "archived":
                        raise ValueError("У архивного объекта нельзя менять ответственных.")
                    assignees = {
                        "foreman": int(data.get("foreman_id") or 0) or None,
                        "estimator": int(data.get("estimator_id") or 0) or None,
                        "procurement_manager": int(data.get("procurement_manager_id") or 0) or None,
                        "technical_supervisor": int(data.get("tech_supervisor_id") or 0) or None,
                    }
                    db.execute(
                        """
                        UPDATE projects
                        SET foreman_id = ?,
                            estimator_id = ?,
                            procurement_manager_id = ?,
                            tech_supervisor_id = ?,
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
                        if not user_id:
                            continue
                        create_notification(
                            db,
                            project_id,
                            user_id,
                            role,
                            "Назначение по объекту обновлено",
                            f"{project['title']}: руководитель строительства обновил состав ответственных.",
                        )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'decision', ?, ?, 'internal', 'handover')
                        """,
                        (
                            project_id,
                            "Руководитель строительства обновил ответственных по объекту.",
                            account_user_id(account) or user_id_by_role(db, "construction_manager") or 2,
                        ),
                    )
                    db.commit()
                    json_response(self, get_project_detail(project_id, account))
                    return

                if action == "archive":
                    reason = data.get("reason") or "Работы завершены, объект отправлен в архив."
                    blockers = project_archive_blockers(db, project_id)
                    if blockers:
                        raise ValueError("Объект пока нельзя отправить в архив. Сначала закройте: " + "; ".join(blockers))
                    db.execute(
                        """
                        UPDATE projects
                        SET status = 'archived',
                            archived_at = CURRENT_TIMESTAMP,
                            archived_by = ?,
                            archive_reason = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (account_user_id(account) or project["construction_manager_id"] or user_id_by_role(db, "construction_manager"), reason, project_id),
                    )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'decision', ?, 2, 'internal', 'archive')
                        """,
                        (project_id, f"Объект отправлен в архив: {reason}"),
                    )
                    db.commit()
                    json_response(self, get_project_detail(project_id, account))
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
                    json_response(self, get_project_detail(project_id, account))
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

            document_action = re.match(r"^/api/documents/(\d+)/delete$", path)
            if document_action:
                document_id = int(document_action.group(1))
                actor_role = data.get("actor_role") or ""
                if actor_role not in {"owner", "construction_manager"}:
                    raise ValueError("Удалять материалы базы знаний может только ген.директор или руководитель строительства.")
                document = db.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
                if not document:
                    json_response(self, {"error": "Document not found"}, 404)
                    return
                if (document["related_type"] or "") != "knowledge_base":
                    raise ValueError("Через эту кнопку удаляются только материалы базы знаний.")
                try:
                    delete_stored_file(document["file_path"])
                except (HTTPError, URLError, TimeoutError, RuntimeError, OSError) as exc:
                    print(f"Could not delete stored knowledge base file: {exc}")
                db.execute("DELETE FROM documents WHERE id = ?", (document_id,))
                db.commit()
                json_response(self, {"deleted": document_id})
                return

            variation_action = re.match(r"^/api/variations/(\d+)/(approve|reject|review)$", path)
            if variation_action:
                variation_id = int(variation_action.group(1))
                action = variation_action.group(2)
                actor_role = str(data.get("actor_role") or account_role(account))
                actor_id = int(data.get("actor_id") or 0) or account_user_id(account) or None
                if action in {"approve", "reject"} and actor_role not in {"owner", "construction_manager", "finance_director"}:
                    raise ValueError("Согласовать или отклонить допработу может только ген.директор или руководитель строительства.")
                variation = db.execute(
                    """
                    SELECT v.*, p.title AS project_title
                    FROM variations v
                    JOIN projects p ON p.id = v.project_id
                    WHERE v.id = ?
                    """,
                    (variation_id,),
                ).fetchone()
                if not variation:
                    json_response(self, {"error": "Variation not found"}, 404)
                    return
                if action == "review":
                    db.execute(
                        """
                        UPDATE variations
                        SET status = 'in_review',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (variation_id,),
                    )
                    notify_users(
                        db,
                        {user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")} - {None},
                        variation["project_id"],
                        "Допработа отправлена на согласование",
                        f"{variation['project_title']}: {variation['title']}",
                        "variation",
                        variation_id,
                    )
                else:
                    status = "approved" if action == "approve" else "rejected"
                    financial_decision = data.get("financial_decision") or ("customer" if action == "approve" else "company")
                    comment = data.get("comment") or ("Допработа согласована." if action == "approve" else "Допработа отклонена.")
                    db.execute(
                        """
                        UPDATE variations
                        SET status = ?,
                            financial_decision = ?,
                            approver_id = ?,
                            decided_at = CURRENT_TIMESTAMP,
                            description = TRIM(COALESCE(description, '') || CHAR(10) || ?),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (status, financial_decision, actor_id, f"Решение: {comment}", variation_id),
                    )
                    notify_users(
                        db,
                        {variation["requester_id"], user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")} - {None},
                        variation["project_id"],
                        "Решение по допработе принято",
                        f"{variation['project_title']}: {variation['title']}. {comment}",
                        "variation",
                        variation_id,
                    )
                db.execute(
                    """
                    INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                    VALUES (?, 'decision', ?, ?, 'internal', 'variation')
                    """,
                    (variation["project_id"], f"{variation['title']}: {action}", actor_id or user_id_by_role(db, "owner")),
                )
                db.commit()
                json_response(self, {"id": variation_id, "status": action})
                return

            task_action = re.match(r"^/api/tasks/(\d+)/(complete|accept|return|delete)$", path)
            if task_action:
                task_id = int(task_action.group(1))
                action = task_action.group(2)
                actor_id = int(data.get("actor_id") or 0) or account_user_id(account) or None
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
                    create_task_event(
                        db,
                        task_id=task_id,
                        project_id=task["project_id"],
                        actor_id=actor_id,
                        action="delete",
                        status_from=task["status"],
                        status_to="deleted",
                        comment=data.get("comment") or "Задача удалена руководителем.",
                    )
                    db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
                    db.commit()
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
                    create_task_event(
                        db,
                        task_id=task_id,
                        project_id=task["project_id"],
                        actor_id=actor_id or task["assignee_id"],
                        action="complete",
                        status_from=task["status"],
                        status_to="completed_pending_acceptance",
                        comment=data.get("comment") or "Исполнитель отметил задачу выполненной.",
                        due_date=task["due_date"],
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
                    db.commit()
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
                    create_task_event(
                        db,
                        task_id=task_id,
                        project_id=task["project_id"],
                        actor_id=actor_id or task["reviewer_id"] or task["creator_id"],
                        action="accept",
                        status_from=task["status"],
                        status_to="accepted",
                        comment=data.get("comment") or "Проверяющий принял выполнение.",
                        due_date=task["due_date"],
                    )
                    create_notification(
                        db,
                        task["project_id"],
                        task["assignee_id"],
                        role_by_user_id(db, task["assignee_id"]),
                        "Выполнение задачи принято",
                        f"{task['project_title']}: {task['title']}",
                    )
                    db.commit()
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
                    create_task_event(
                        db,
                        task_id=task_id,
                        project_id=task["project_id"],
                        actor_id=actor_id or task["reviewer_id"] or task["creator_id"],
                        action="return",
                        status_from=task["status"],
                        status_to="returned",
                        comment=comment,
                        due_date=due_date,
                    )
                    create_notification(
                        db,
                        task["project_id"],
                        task["assignee_id"],
                        role_by_user_id(db, task["assignee_id"]),
                        "Задача возвращена на доработку",
                        f"{task['project_title']}: {task['title']}. {comment}",
                    )
                    db.commit()
                    json_response(self, {"id": task_id, "status": "returned"})
                    return

            material_batch_action = re.match(r"^/api/material-request-batches/(\d+)/(accept|return|resubmit|schedule|resolve_issue|receive|update|delete|create_variation)$", path)
            if material_batch_action:
                batch_id = int(material_batch_action.group(1))
                action = material_batch_action.group(2)
                batch = db.execute(
                    """
                    SELECT b.*, p.title AS project_title, p.foreman_id, p.construction_manager_id
                    FROM material_request_batches b
                    JOIN projects p ON p.id = b.project_id
                    WHERE b.id = ?
                    """,
                    (batch_id,),
                ).fetchone()
                if not batch:
                    json_response(self, {"error": "Material request batch not found"}, 404)
                    return
                watcher_ids = material_batch_watchers(db, batch)
                if action == "create_variation":
                    actor_role = str(data.get("actor_role") or "").strip()
                    actor_id = int(data.get("actor_id") or 0) or None
                    can_create_variation = actor_role in {"owner", "construction_manager", "finance_director"} or (
                        actor_role == "foreman"
                        and actor_id
                        and int(actor_id) in {int(batch["foreman_id"] or 0), int(batch["creator_id"] or 0)}
                    )
                    if not can_create_variation:
                        raise ValueError("Создать допработу из заявки могут ген.директор, руководитель строительства или прораб объекта.")
                    existing_variation = db.execute(
                        "SELECT id FROM variations WHERE source_type = 'material_request_batch' AND source_id = ? ORDER BY id LIMIT 1",
                        (batch_id,),
                    ).fetchone()
                    if existing_variation:
                        json_response(self, {"id": existing_variation["id"], "exists": True})
                        return
                    items = db.execute(
                        """
                        SELECT m.*, em.unit AS estimate_material_unit
                        FROM material_requests m
                        LEFT JOIN estimate_materials em ON em.id = m.estimate_material_id
                        WHERE m.batch_id = ?
                          AND m.basis_type != 'main_estimate'
                        ORDER BY m.estimate_section, m.title
                        """,
                        (batch_id,),
                    ).fetchall()
                    if not items:
                        raise ValueError("В этой заявке нет позиций сверх основной сметы.")
                    basis_types = {str(item["basis_type"] or "") for item in items}
                    variation_type = material_variation_type(basis_types)
                    amount = sum(number_value(item["total_amount"]) for item in items)
                    title_text = f"Материалы сверх сметы по заявке от {format_date_ru(batch['created_at'])}"
                    description_lines = [
                        f"Создано из заявки материалов по объекту: {batch['project_title']}.",
                        f"Заявка от {format_date_ru(batch['created_at'])}.",
                        "",
                        "Позиции:",
                    ]
                    for item in items:
                        unit = item["requested_unit"] or item["estimate_material_unit"] or ""
                        qty = number_value(item["requested_quantity"])
                        line = f"- {item['title']} — {qty:g} {unit}".strip()
                        line += f" — {material_basis_text(item['basis_type'])}"
                        if number_value(item["total_amount"]):
                            line += f" — {number_value(item['total_amount']):g} ₽"
                        if item["comment"]:
                            line += f". Комментарий: {item['comment']}"
                        description_lines.append(line)
                    cursor = db.execute(
                        """
                        INSERT INTO variations (
                            project_id, title, type, status, financial_decision, amount, due_date, description,
                            source_type, source_id
                        )
                        VALUES (?, ?, ?, 'decision_required', 'not_decided', ?, ?, ?, 'material_request_batch', ?)
                        """,
                        (
                            batch["project_id"],
                            title_text,
                            variation_type,
                            amount,
                            batch["needed_at"] or batch["scheduled_delivery_date"],
                            "\n".join(description_lines),
                            batch_id,
                        ),
                    )
                    variation_id = int(cursor.lastrowid)
                    message = f"{batch['project_title']}: по заявке материалов от {format_date_ru(batch['created_at'])} создано отклонение/допработа «{title_text}»."
                    notify_users(
                        db,
                        {user_id for user_id in (watcher_ids | {user_id_by_role(db, "procurement_manager")}) if user_id},
                        batch["project_id"],
                        "Создана допработа из заявки материалов",
                        message,
                        "variation",
                        variation_id,
                    )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'decision', ?, ?, 'internal', 'variation')
                        """,
                        (batch["project_id"], message, actor_id or user_id_by_role(db, "owner")),
                    )
                    json_response(self, {"id": variation_id}, 201)
                    return
                actor_role = str(data.get("actor_role") or "").strip()
                actor_id = int(data.get("actor_id") or 0) or None
                if action in {"update", "delete"} and not can_change_material_batch(actor_role, actor_id, batch):
                    raise ValueError("Заявку уже нельзя изменить или удалить: снабжение взяло ее в работу.")
                if action == "delete":
                    db.execute("DELETE FROM material_requests WHERE batch_id = ?", (batch_id,))
                    db.execute("DELETE FROM material_request_batches WHERE id = ?", (batch_id,))
                    message = f"{batch['project_title']}: заявка на материалы от {format_date_ru(batch['created_at'])} удалена до принятия снабжением в работу."
                    notify_users(
                        db,
                        {user_id for user_id in (watcher_ids | {user_id_by_role(db, "procurement_manager")}) if user_id},
                        batch["project_id"],
                        "Заявка на материалы удалена",
                        message,
                        "material_request_batch",
                        batch_id,
                    )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'decision', ?, ?, 'internal', 'material_request')
                        """,
                        (batch["project_id"], message, actor_id or batch["creator_id"]),
                    )
                    json_response(self, {"id": batch_id, "deleted": True})
                    return
                if action == "update":
                    update_comment = str(data.get("comment") or "").strip()
                    new_needed_at = str(data.get("needed_at") or batch["needed_at"] or "").strip() or None
                    new_urgency = delivery_urgency(new_needed_at)
                    item_updates = data.get("items") or []
                    extra_items = data.get("extra_items") or []
                    for item in item_updates:
                        request_id = int(item.get("id") or 0)
                        if not request_id:
                            continue
                        existing = db.execute(
                            """
                            SELECT m.*, em.unit_price, em.unit AS estimate_material_unit
                            FROM material_requests m
                            LEFT JOIN estimate_materials em ON em.id = m.estimate_material_id
                            WHERE m.id = ? AND m.batch_id = ?
                            """,
                            (request_id, batch_id),
                        ).fetchone()
                        if not existing:
                            continue
                        if item.get("remove"):
                            db.execute("DELETE FROM material_requests WHERE id = ? AND batch_id = ?", (request_id, batch_id))
                            continue
                        quantity = number_value(item.get("quantity"))
                        if quantity <= 0:
                            raise ValueError("Количество в строке заявки должно быть больше нуля.")
                        comment = str(item.get("comment") or "").strip()
                        title = str(item.get("title") or existing["title"] or "").strip()
                        basis_type = str(item.get("basis_type") or existing["basis_type"] or "main_estimate").strip()
                        unit_price = number_value(existing["unit_price"])
                        total_amount = quantity * unit_price if unit_price else number_value(existing["total_amount"])
                        db.execute(
                            """
                            UPDATE material_requests
                            SET title = ?,
                                basis_type = ?,
                                needed_at = ?,
                                delivery_urgency = ?,
                                requested_quantity = ?,
                                total_amount = ?,
                                comment = ?,
                                procurement_status = 'new',
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ? AND batch_id = ?
                            """,
                            (title, basis_type, new_needed_at, new_urgency, quantity, total_amount, comment, request_id, batch_id),
                        )
                    extra_reason_labels = {
                        "additional_work": "Доп",
                        "material_replacement": "Замена",
                        "main_estimate_overspend": "Превышение",
                        "over_budget_cost": "Сверхбюджет",
                    }
                    allowed_extra_reasons = set(extra_reason_labels)
                    for item in extra_items:
                        material_name = str(item.get("material") or "").strip()
                        item_name = str(item.get("name") or "").strip()
                        quantity = number_value(item.get("quantity"))
                        reason = str(item.get("reason") or "").strip()
                        if not material_name and not item_name and quantity <= 0:
                            continue
                        if not material_name or not item_name or quantity <= 0 or reason not in allowed_extra_reasons:
                            raise ValueError("Заполните материал, наименование, количество и причину для дополнительных материалов.")
                        create_material_request(
                            db,
                            batch_id=batch_id,
                            project_id=batch["project_id"],
                            creator_id=actor_id or batch["creator_id"],
                            estimate_material_id=None,
                            title=f"{material_name}: {item_name}",
                            basis_type=reason,
                            estimate_section="Дополнительные материалы",
                            needed_at=new_needed_at,
                            requested_quantity=quantity,
                            requested_unit="",
                            total_amount=0,
                            comment=f"{extra_reason_labels[reason]}. {update_comment}".strip(),
                        )
                    remaining = db.execute("SELECT COUNT(*) AS count FROM material_requests WHERE batch_id = ?", (batch_id,)).fetchone()["count"]
                    if not remaining:
                        raise ValueError("Нельзя сохранить пустую заявку. Если позиции больше не нужны, удалите заявку целиком.")
                    db.execute(
                        """
                        UPDATE material_request_batches
                        SET status = 'new',
                            needed_at = ?,
                            delivery_urgency = ?,
                            foreman_response = ?,
                            revision_comment = NULL,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (new_needed_at, new_urgency, update_comment, batch_id),
                    )
                    message = f"{batch['project_title']}: заявка на материалы от {format_date_ru(batch['created_at'])} исправлена и повторно отправлена снабжению."
                    if update_comment:
                        message += f" Комментарий: {update_comment}"
                    notify_users(
                        db,
                        {user_id for user_id in (watcher_ids | {user_id_by_role(db, "procurement_manager")}) if user_id},
                        batch["project_id"],
                        "Заявка на материалы исправлена",
                        message,
                        "material_request_batch",
                        batch_id,
                    )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'decision', ?, ?, 'internal', 'material_request')
                        """,
                        (batch["project_id"], message, actor_id or batch["creator_id"]),
                    )
                    json_response(self, {"id": batch_id, "status": "new"})
                    return
                if action == "accept":
                    db.execute(
                        """
                        UPDATE material_request_batches
                        SET status = 'in_work', revision_comment = NULL, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (batch_id,),
                    )
                    db.execute(
                        """
                        UPDATE material_requests
                        SET procurement_status = 'ordered', updated_at = CURRENT_TIMESTAMP
                        WHERE batch_id = ?
                        """,
                        (batch_id,),
                    )
                    message = f"{batch['project_title']}: заявка на материалы от {format_date_ru(batch['created_at'])} принята снабжением в работу."
                    for watcher_id in watcher_ids:
                        create_notification(
                            db,
                            batch["project_id"],
                            watcher_id,
                            role_by_user_id(db, watcher_id),
                            "Заявка на материалы принята в работу",
                            message,
                            "material_request_batch",
                            batch_id,
                        )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'decision', ?, ?, 'internal', 'material_request')
                        """,
                        (batch["project_id"], message, user_id_by_role(db, "procurement_manager") or 4),
                    )
                    json_response(self, {"id": batch_id, "status": "in_work"})
                    return
                if action == "resubmit":
                    comment = str(data.get("comment") or "").strip()
                    db.execute(
                        """
                        UPDATE material_request_batches
                        SET status = 'new',
                            foreman_response = ?,
                            revision_comment = NULL,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (comment, batch_id),
                    )
                    db.execute(
                        """
                        UPDATE material_requests
                        SET procurement_status = 'new', updated_at = CURRENT_TIMESTAMP
                        WHERE batch_id = ?
                        """,
                        (batch_id,),
                    )
                    message = f"{batch['project_title']}: заявка на материалы от {format_date_ru(batch['created_at'])} повторно отправлена снабжению."
                    if comment:
                        message += f" Комментарий прораба: {comment}"
                    create_notification(
                        db,
                        batch["project_id"],
                        user_id_by_role(db, "procurement_manager"),
                        "procurement_manager",
                        "Заявка на материалы повторно отправлена",
                        message,
                        "material_request_batch",
                        batch_id,
                    )
                    for watcher_id in watcher_ids - {user_id_by_role(db, "procurement_manager") or 0}:
                        create_notification(
                            db,
                            batch["project_id"],
                            watcher_id,
                            role_by_user_id(db, watcher_id),
                            "Заявка на материалы повторно отправлена",
                            message,
                            "material_request_batch",
                            batch_id,
                        )
                    json_response(self, {"id": batch_id, "status": "new"})
                    return
                if action == "schedule":
                    delivery_date = data.get("scheduled_delivery_date") or ""
                    if not delivery_date:
                        raise ValueError("Укажите дату доставки.")
                    comment = str(data.get("comment") or "").strip()
                    db.execute(
                        """
                        UPDATE material_request_batches
                        SET status = 'delivery_scheduled',
                            scheduled_delivery_date = ?,
                            procurement_comment = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (delivery_date, comment, batch_id),
                    )
                    db.execute(
                        """
                        UPDATE material_requests
                        SET procurement_status = 'delivery', actual_delivery_date = ?, procurement_comment = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE batch_id = ?
                        """,
                        (delivery_date, comment, batch_id),
                    )
                    message = f"{batch['project_title']}: заявка на материалы от {format_date_ru(batch['created_at'])} обработана. Доставка состоится {format_date_ru(delivery_date)}."
                    if comment:
                        message += f" Комментарий снабжения: {comment}"
                    notify_users(
                        db,
                        watcher_ids,
                        batch["project_id"],
                        "Доставка по заявке назначена",
                        message,
                        "material_request_batch",
                        batch_id,
                    )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'decision', ?, ?, 'internal', 'material_request')
                        """,
                        (batch["project_id"], message, user_id_by_role(db, "procurement_manager") or 4),
                    )
                    json_response(self, {"id": batch_id, "status": "delivery_scheduled"})
                    return
                if action == "resolve_issue":
                    if str(batch["status"] or "") != "receipt_issue":
                        raise ValueError("Исправить можно только заявку со статусом проблемы при приемке.")
                    if str(data.get("actor_role") or "") != "procurement_manager":
                        raise ValueError("Исправление проблемы по материалам может отправить только снабжение.")
                    delivery_date = data.get("scheduled_delivery_date") or ""
                    if not delivery_date:
                        raise ValueError("Укажите дату повторной доставки или замены.")
                    comment = str(data.get("comment") or "").strip()
                    procurement_comment = f"Исправление проблемы: {comment}".strip()
                    db.execute(
                        """
                        UPDATE material_request_batches
                        SET status = 'delivery_scheduled',
                            scheduled_delivery_date = ?,
                            procurement_comment = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (delivery_date, procurement_comment, batch_id),
                    )
                    db.execute(
                        """
                        UPDATE material_requests
                        SET procurement_status = 'delivery',
                            actual_delivery_date = ?,
                            procurement_comment = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE batch_id = ?
                        """,
                        (delivery_date, procurement_comment, batch_id),
                    )
                    message = f"{batch['project_title']}: снабжение обработало проблему по заявке на материалы от {format_date_ru(batch['created_at'])}. Повторная доставка/замена назначена на {format_date_ru(delivery_date)}."
                    if comment:
                        message += f" Комментарий снабжения: {comment}"
                    notify_users(
                        db,
                        watcher_ids,
                        batch["project_id"],
                        "Проблема по заявке на материалы исправляется",
                        message,
                        "material_request_batch",
                        batch_id,
                    )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'decision', ?, ?, 'internal', 'material_request')
                        """,
                        (batch["project_id"], message, user_id_by_role(db, "procurement_manager") or 4),
                    )
                    json_response(self, {"id": batch_id, "status": "delivery_scheduled"})
                    return
                if action == "receive":
                    receipt_status = data.get("receipt_status") or "received"
                    if receipt_status not in {"received", "issue"}:
                        raise ValueError("Некорректный статус приемки.")
                    comment = str(data.get("comment") or "").strip()
                    document_id = None
                    file_data = data.get("receipt_file") or {}
                    if receipt_status == "issue" and not comment and not file_data.get("file_base64"):
                        raise ValueError("Опишите проблему или прикрепите фото/видео.")
                    if file_data.get("file_base64"):
                        document_id = save_document_file(
                            db,
                            batch["project_id"],
                            file_data,
                            f"Приемка материалов по заявке от {format_date_ru(batch['created_at'])}",
                            "other",
                            "material_receipt",
                        )
                    new_status = "received" if receipt_status == "received" else "receipt_issue"
                    db.execute(
                        """
                        UPDATE material_request_batches
                        SET status = ?,
                            received_at = CURRENT_TIMESTAMP,
                            receipt_status = ?,
                            receipt_comment = ?,
                            receipt_document_id = COALESCE(?, receipt_document_id),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (new_status, receipt_status, comment, document_id, batch_id),
                    )
                    db.execute(
                        """
                        UPDATE material_requests
                        SET procurement_status = 'delivery_confirmed',
                            processed_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE batch_id = ?
                        """,
                        (batch_id,),
                    )
                    if receipt_status == "received":
                        title = "Материалы по заявке получены"
                        message = f"{batch['project_title']}: материалы по заявке от {format_date_ru(batch['created_at'])} получены прорабом по списку."
                    else:
                        title = "Проблема при приемке материалов"
                        attachment_note = " Приложен файл." if document_id else ""
                        message = f"{batch['project_title']}: при приемке материалов по заявке от {format_date_ru(batch['created_at'])} есть проблема. {comment}{attachment_note}"
                    recipients = {user_id_by_role(db, "procurement_manager")} | watcher_ids
                    notify_users(
                        db,
                        {item for item in recipients if item},
                        batch["project_id"],
                        title,
                        message,
                        "material_request_batch",
                        batch_id,
                    )
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'decision', ?, ?, 'internal', 'material_request')
                        """,
                        (batch["project_id"], message, batch["creator_id"] or batch["foreman_id"]),
                    )
                    json_response(self, {"id": batch_id, "status": new_status, "document_id": document_id})
                    return
                comment = str(data.get("comment") or "").strip()
                if not comment:
                    raise ValueError("Укажите комментарий, почему заявка возвращается на доработку.")
                db.execute(
                    """
                    UPDATE material_request_batches
                    SET status = 'revision_requested', revision_comment = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (comment, batch_id),
                )
                db.execute(
                    """
                    UPDATE material_requests
                    SET procurement_status = 'returned', updated_at = CURRENT_TIMESTAMP
                    WHERE batch_id = ?
                    """,
                    (batch_id,),
                )
                message = f"{batch['project_title']}: заявка на материалы от {format_date_ru(batch['created_at'])} возвращена на доработку. {comment}"
                for watcher_id in watcher_ids:
                    create_notification(
                        db,
                        batch["project_id"],
                        watcher_id,
                        role_by_user_id(db, watcher_id),
                        "Заявка на материалы возвращена на доработку",
                        message,
                        "material_request_batch",
                        batch_id,
                    )
                db.execute(
                    """
                    INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                    VALUES (?, 'decision', ?, ?, 'internal', 'material_request')
                    """,
                    (batch["project_id"], message, user_id_by_role(db, "procurement_manager") or 4),
                )
                json_response(self, {"id": batch_id, "status": "revision_requested"})
                return

            material_action = re.match(r"^/api/material-requests/(\d+)/deliver$", path)
            if material_action:
                request_id = int(material_action.group(1))
                material = db.execute(
                    """
                    SELECT m.*, p.title AS project_title, p.foreman_id
                    FROM material_requests m
                    JOIN projects p ON p.id = m.project_id
                    WHERE m.id = ?
                    """,
                    (request_id,),
                ).fetchone()
                if not material:
                    json_response(self, {"error": "Material request not found"}, 404)
                    return
                actual_date = data.get("actual_delivery_date") or material["needed_at"]
                comment = data.get("procurement_comment") or ""
                db.execute(
                    """
                    UPDATE material_requests
                    SET actual_delivery_date = ?,
                        procurement_comment = ?,
                        procurement_status = 'delivery_confirmed',
                        processed_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (actual_date or None, comment, request_id),
                )
                message = f"{material['project_title']}: {material['title']}. Доставка: {actual_date or 'дата не указана'}"
                if comment:
                    message += f". Комментарий снабжения: {comment}"
                for watcher_id in (material["foreman_id"], user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")):
                    if watcher_id:
                        create_notification(
                            db,
                            material["project_id"],
                            watcher_id,
                            role_by_user_id(db, watcher_id),
                            "Доставка материалов обработана",
                            message,
                        )
                db.execute(
                    """
                    INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                    VALUES (?, 'decision', ?, ?, 'internal', 'material_request')
                    """,
                    (material["project_id"], message, user_id_by_role(db, "procurement_manager") or 4),
                )
                json_response(self, {"id": request_id, "status": "delivery_confirmed"})
                return

            if path == "/api/tasks":
                creator_role = data.get("creator_role") or "construction_manager"
                creator_id = int(data.get("creator_id") or 0) or user_id_by_role(db, creator_role) or user_id_by_role(db, "construction_manager") or 2
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
                create_task_event(
                    db,
                    task_id=int(cursor.lastrowid),
                    project_id=int(data["project_id"]),
                    actor_id=creator_id,
                    action="create",
                    status_from="",
                    status_to="new",
                    comment=data.get("description") or "Задача поставлена.",
                    due_date=data.get("due_date") or None,
                )
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

            if path == "/api/material-requests/bulk":
                project_id = int(data["project_id"])
                needed_at = data.get("needed_at") or None
                creator_role = data.get("creator_role") or ""
                creator_id = int(data.get("creator_id") or user_id_by_role(db, "foreman") or 7)
                base_comment = data.get("comment") or ""
                items = data.get("items") or []
                extra_items = data.get("extra_items") or []
                if not items and not extra_items:
                    raise ValueError("Выберите хотя бы один материал.")
                created: list[int] = []
                project = db.execute("SELECT title, foreman_id FROM projects WHERE id = ?", (project_id,)).fetchone()
                creator = db.execute("SELECT name, role FROM users WHERE id = ?", (creator_id,)).fetchone()
                if creator_role == "foreman" and project and int(project["foreman_id"] or 0) != creator_id:
                    raise ValueError("Этот объект не закреплен за выбранным прорабом.")
                batch_id = create_material_batch(
                    db,
                    project_id=project_id,
                    creator_id=creator_id,
                    needed_at=needed_at,
                    comment=base_comment,
                )
                for item in items:
                    estimate_material_id = int(item.get("estimate_material_id") or 0)
                    quantity = number_value(item.get("quantity"))
                    if not estimate_material_id or quantity <= 0:
                        continue
                    material = db.execute("SELECT * FROM estimate_materials WHERE id = ? AND project_id = ?", (estimate_material_id, project_id)).fetchone()
                    if not material:
                        continue
                    estimated_quantity = number_value(material["estimated_quantity"])
                    unit_price = number_value(material["unit_price"])
                    unit = material["unit"] or ""
                    section = material["section"] or ""
                    reason = str(item.get("reason") or "").strip()
                    main_quantity = min(quantity, estimated_quantity) if estimated_quantity > 0 else quantity
                    if main_quantity > 0:
                        created.append(
                            create_material_request(
                                db,
                                batch_id=batch_id,
                                project_id=project_id,
                                creator_id=creator_id,
                                estimate_material_id=estimate_material_id,
                                title=material["name"],
                                basis_type="main_estimate",
                                estimate_section=section,
                                needed_at=needed_at,
                                requested_quantity=main_quantity,
                                requested_unit=unit,
                                total_amount=main_quantity * unit_price,
                                comment=f"По смете. Заказано: {main_quantity:g} {unit}. {base_comment}".strip(),
                            )
                        )
                    if estimated_quantity > 0 and quantity > estimated_quantity:
                        extra_quantity = quantity - estimated_quantity
                        if not reason:
                            raise ValueError(f"Укажите причину превышения по материалу: {material['name']}")
                        created.append(
                            create_material_request(
                                db,
                                batch_id=batch_id,
                                project_id=project_id,
                                creator_id=creator_id,
                                estimate_material_id=estimate_material_id,
                                title=f"{material['name']} - сверх сметы",
                                basis_type="main_estimate_overspend",
                                estimate_section=section,
                                needed_at=needed_at,
                                requested_quantity=extra_quantity,
                                requested_unit=unit,
                                total_amount=extra_quantity * unit_price,
                                comment=f"Причина превышения: {reason}. {base_comment}".strip(),
                            )
                        )
                extra_reason_labels = {
                    "additional_work": "Доп",
                    "material_replacement": "Замена",
                    "main_estimate_overspend": "Превышение",
                    "over_budget_cost": "Сверхбюджет",
                }
                allowed_extra_reasons = set(extra_reason_labels)
                for item in extra_items:
                    material_name = str(item.get("material") or "").strip()
                    item_name = str(item.get("name") or "").strip()
                    quantity = number_value(item.get("quantity"))
                    reason = str(item.get("reason") or "").strip()
                    if not material_name and not item_name and quantity <= 0:
                        continue
                    if not material_name or not item_name or quantity <= 0 or reason not in allowed_extra_reasons:
                        raise ValueError("Заполните материал, наименование, количество и причину для дополнительных материалов.")
                    title_text = f"{material_name}: {item_name}"
                    created.append(
                        create_material_request(
                            db,
                            batch_id=batch_id,
                            project_id=project_id,
                            creator_id=creator_id,
                            estimate_material_id=None,
                            title=title_text,
                            basis_type=reason,
                            estimate_section="Дополнительные материалы",
                            needed_at=needed_at,
                            requested_quantity=quantity,
                            requested_unit="",
                            total_amount=0,
                            comment=f"{extra_reason_labels[reason]}. {base_comment}".strip(),
                        )
                    )
                if not created:
                    raise ValueError("Не удалось создать заявку: проверьте количество и выбранные материалы.")
                urgency = delivery_urgency(needed_at)
                title = (
                    f"Получена срочная заявка на материалы от {format_date_ru()}"
                    if urgency == "urgent"
                    else f"Получена заявка на материалы от {format_date_ru()}"
                )
                creator_label = f" от {creator['name']}" if creator else ""
                text = f"{project['title'] if project else 'Объект'}: {len(created)} позиций{creator_label}, желаемая дата доставки: {needed_at or 'не указана'}"
                create_notification(
                    db,
                    project_id,
                    user_id_by_role(db, "procurement_manager"),
                    "procurement_manager",
                    title,
                    text,
                    "material_request_batch",
                    batch_id,
                )
                db.execute(
                    """
                    INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                    VALUES (?, 'document', ?, ?, 'internal', 'material_request')
                    """,
                    (project_id, text, creator_id),
                )
                json_response(self, {"batch_id": batch_id, "created": created, "urgency": urgency}, 201)
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
                batch_id = create_material_batch(
                    db,
                    project_id=int(data["project_id"]),
                    creator_id=int(data.get("creator_id") or 7),
                    needed_at=data.get("needed_at") or None,
                    comment=data.get("comment") or "",
                )
                request_id = create_material_request(
                    db,
                    batch_id=batch_id,
                    project_id=int(data["project_id"]),
                    creator_id=int(data.get("creator_id") or 7),
                    estimate_material_id=int(estimate_material_id) if estimate_material_id else None,
                    title=title,
                    basis_type=data.get("basis_type") or "main_estimate",
                    estimate_section=estimate_section,
                    needed_at=data.get("needed_at") or None,
                    requested_quantity=number_value(data.get("requested_quantity") or (estimate_material["estimated_quantity"] if estimate_material else 0)),
                    requested_unit=(estimate_material["unit"] if estimate_material else ""),
                    total_amount=number_value(total_amount),
                    comment=data.get("comment") or "",
                )
                json_response(self, {"id": request_id}, 201)
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
                imported = import_estimate_material_rows(db, project_id, rows, "manual_import", replace=bool(data.get("replace", True)))
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
                    archive_replaced_project_documents(db, project_id, "smetter_materials")
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
                json_response(self, {"imported": imported}, 201)
                return

            if path == "/api/documents":
                file_data = data.get("document_file") or {}
                related_type = data.get("related_type") or "project"
                if related_type == "knowledge_base" and account_role(account) not in {"owner", "construction_manager", "finance_director"}:
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                project_id = int(data["project_id"]) if data.get("project_id") else (0 if related_type == "knowledge_base" else None)
                if project_id is None:
                    json_response(self, {"error": "Для документа объекта нужно выбрать объект"}, 400)
                    return
                if related_type == "knowledge_base":
                    project_id = knowledge_base_project_id(db)
                if file_data.get("file_base64"):
                    file_data["related_section"] = data.get("related_section") or ""
                    file_data["contract_id"] = data.get("contract_id") or None
                    file_data["process_type"] = data.get("process_type") or ""
                    document_id = save_document_file(
                        db,
                        project_id,
                        file_data,
                        data.get("title") or "Документ",
                        data.get("type") or "other",
                        related_type,
                    )
                    db.execute(
                        """
                        UPDATE documents
                        SET version = ?, status = ?, owner_id = ?, due_date = ?,
                            related_section = ?, contract_id = ?, process_type = ?
                        WHERE id = ?
                        """,
                        (
                            data.get("version") or "",
                            data.get("status") or "draft",
                            int(data.get("owner_id") or 2),
                            data.get("due_date") or None,
                            data.get("related_section") or "",
                            int(data.get("contract_id") or 0) or None,
                            data.get("process_type") or "",
                            document_id,
                        ),
                    )
                    json_response(self, {"id": document_id}, 201)
                    return
                cursor = db.execute(
                    """
                    INSERT INTO documents (
                        project_id, title, type, version, status, owner_id, due_date, related_type,
                        related_section, contract_id, process_type, file_name, file_path, mime_type, file_size
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)
                    """,
                    (
                        project_id,
                        data.get("title") or "Новый документ",
                        data.get("type") or "other",
                        data.get("version") or "",
                        data.get("status") or "draft",
                        int(data.get("owner_id") or 2),
                        data.get("due_date") or None,
                        related_type,
                        data.get("related_section") or "",
                        int(data.get("contract_id") or 0) or None,
                        data.get("process_type") or "",
                    ),
                )
                json_response(self, {"id": cursor.lastrowid}, 201)
                return

            if path == "/api/variations":
                actor_id = int(data.get("requester_id") or data.get("actor_id") or 0) or account_user_id(account) or user_id_by_role(db, "construction_manager")
                cursor = db.execute(
                    """
                    INSERT INTO variations (
                        project_id, title, type, status, financial_decision, amount, due_date,
                        description, estimate_section, requester_id
                    )
                    VALUES (?, ?, ?, 'decision_required', ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        int(data["project_id"]),
                        data.get("title") or "Новая допработа",
                        data.get("type") or "additional_work",
                        data.get("financial_decision") or "not_decided",
                        number_value(data.get("amount")),
                        data.get("due_date") or None,
                        data.get("description") or "",
                        data.get("estimate_section") or "",
                        actor_id,
                    ),
                )
                variation_id = int(cursor.lastrowid)
                for attachment in data.get("attachments") or []:
                    if not isinstance(attachment, dict) or not attachment.get("file_base64"):
                        continue
                    attachment["related_section"] = data.get("estimate_section") or ""
                    attachment["process_type"] = f"variation:{variation_id}"
                    save_document_file(
                        db,
                        int(data["project_id"]),
                        attachment,
                        attachment.get("title") or attachment.get("file_name") or "Вложение к допработе",
                        attachment.get("type") or "variation_attachment",
                        "variation",
                    )
                notify_users(
                    db,
                    {user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")} - {None},
                    int(data["project_id"]),
                    "Новая допработа требует решения",
                    data.get("title") or "Новая допработка",
                    "variation",
                    variation_id,
                )
                db.execute(
                    """
                    INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                    VALUES (?, 'decision', ?, ?, 'internal', 'variation')
                    """,
                    (int(data["project_id"]), f"Создана допработа/отклонение: {data.get('title') or 'Новая допработка'}", actor_id),
                )
                json_response(self, {"id": variation_id}, 201)
                return

            if path == "/api/work-extra-items":
                require_fields(
                    data,
                    [
                        ("project_id", "Объект"),
                        ("title", "Наименование работы"),
                        ("unit", "Ед. измерения"),
                        ("quantity", "Количество"),
                        ("reason", "Причина"),
                    ],
                )
                cursor = db.execute(
                    """
                    INSERT INTO work_extra_items (
                        project_id, creator_id, title, unit, quantity, reason, estimate_section, comment, status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')
                    """,
                    (
                        int(data["project_id"]),
                        int(data.get("creator_id") or 0) or None,
                        data.get("title"),
                        data.get("unit"),
                        number_value(data.get("quantity")),
                        data.get("reason") or "additional_work",
                        data.get("estimate_section") or "",
                        data.get("comment") or "",
                    ),
                )
                work_extra_id = int(cursor.lastrowid)
                variation_type = "additional_work" if data.get("reason") == "additional_work" else "disputed_position"
                variation_cursor = db.execute(
                    """
                    INSERT INTO variations (
                        project_id, title, type, status, financial_decision, amount, due_date,
                        description, estimate_section, requester_id, source_type, source_id
                    )
                    VALUES (?, ?, ?, 'decision_required', 'not_decided', 0, NULL, ?, ?, ?, 'work_extra_item', ?)
                    """,
                    (
                        int(data["project_id"]),
                        data.get("title"),
                        variation_type,
                        data.get("comment") or "",
                        data.get("estimate_section") or "",
                        int(data.get("creator_id") or 0) or None,
                        work_extra_id,
                    ),
                )
                notify_users(
                    db,
                    {user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")} - {None},
                    int(data["project_id"]),
                    "Новая появившаяся работа требует решения",
                    data.get("title") or "Появившаяся работа",
                    "variation",
                    int(variation_cursor.lastrowid),
                )
                json_response(self, {"id": work_extra_id, "variation_id": variation_cursor.lastrowid}, 201)
                return

            if path == "/api/supplier-locations":
                require_fields(data, [("title", "Поставщик")])
                cursor = db.execute(
                    """
                    INSERT INTO supplier_locations (title, address, maps_url, comment)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        data.get("title") or "",
                        data.get("address") or "",
                        data.get("maps_url") or "",
                        data.get("comment") or "",
                    ),
                )
                json_response(self, {"id": cursor.lastrowid}, 201)
                return

            if path == "/api/contracts":
                project_id = int(data["project_id"])
                actor_id = account_user_id(account) or user_id_by_role(db, "sales_manager") or 3
                contract_title = data.get("title") or "Новый договор"
                cursor = db.execute(
                    """
                    INSERT INTO contracts (
                        project_id, title, type, counterparty, ends_at, responsible_id, status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 'active')
                    """,
                    (
                        project_id,
                        contract_title,
                        data.get("type") or "customer_contract",
                        data.get("counterparty") or "",
                        data.get("ends_at") or None,
                        int(data.get("responsible_id") or 2),
                    ),
                )
                contract_id = int(cursor.lastrowid)
                file_data = data.get("document_file") or {}
                if file_data.get("file_base64"):
                    file_data["contract_id"] = contract_id
                    file_data["process_type"] = data.get("type") or "customer_contract"
                    save_document_file(
                        db,
                        project_id,
                        file_data,
                        contract_title,
                        "contract",
                        "contract",
                    )
                material_request_ids: list[int] = []
                material_batch_id = None
                materials_file = data.get("materials_file") if isinstance(data.get("materials_file"), dict) else {}
                if materials_file.get("file_base64"):
                    material_rows = parse_uploaded_materials(materials_file)
                    if not material_rows:
                        raise ValueError("В файле материалов по допнику не найдены позиции. Загрузите выгрузку материалов из Сметтера.")
                    materials_file["contract_id"] = contract_id
                    materials_file["process_type"] = "additional_agreement_materials"
                    save_document_file(
                        db,
                        project_id,
                        materials_file,
                        "Материалы по допнику из Сметтера",
                        "smetter_materials",
                        "contract",
                    )
                    material_batch_id, material_request_ids = create_addendum_material_requests(
                        db,
                        project_id=project_id,
                        actor_id=actor_id,
                        contract_title=contract_title,
                        rows=material_rows,
                    )
                    if material_request_ids:
                        create_notification(
                            db,
                            project_id,
                            user_id_by_role(db, "procurement_manager"),
                            "procurement_manager",
                            "Материалы по допнику",
                            f"{contract_title}: {len(material_request_ids)} позиций",
                            "material_request_batch",
                            material_batch_id,
                        )

                extra_work_ids: list[int] = []
                variation_ids: list[int] = []
                works_file = data.get("works_file") if isinstance(data.get("works_file"), dict) else {}
                if works_file.get("file_base64"):
                    work_rows = parse_uploaded_works(works_file)
                    if not work_rows:
                        raise ValueError("В файле работ по допнику не найдены работы. Загрузите задание на работы из Сметтера.")
                    works_file["contract_id"] = contract_id
                    works_file["process_type"] = "additional_agreement_works"
                    save_document_file(
                        db,
                        project_id,
                        works_file,
                        "Задание на работы по допнику из Сметтера",
                        "smetter_work_task",
                        "contract",
                    )
                    extra_work_ids, variation_ids = create_addendum_work_extras(
                        db,
                        project_id=project_id,
                        actor_id=actor_id,
                        contract_title=contract_title,
                        rows=work_rows,
                    )
                if extra_work_ids:
                    notify_users(
                        db,
                        {user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")} - {None},
                        project_id,
                        "Работы по допнику требуют решения",
                        f"{contract_title}: {len(extra_work_ids)} позиций",
                        "variation",
                        variation_ids[0] if variation_ids else None,
                    )
                db.execute(
                    """
                    INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                    VALUES (?, 'document', ?, ?, 'internal', 'contract')
                    """,
                    (
                        project_id,
                        f"Добавлен договор/допсоглашение: {contract_title}",
                        actor_id,
                    ),
                )
                json_response(
                    self,
                    {
                        "id": contract_id,
                        "material_batch_id": material_batch_id,
                        "material_request_ids": material_request_ids,
                        "work_extra_ids": extra_work_ids,
                    },
                    201,
                )
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
    backfill_estimate_materials_from_saved_documents()
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Construction MVP is running at http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
