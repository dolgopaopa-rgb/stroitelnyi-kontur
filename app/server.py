from __future__ import annotations

import base64
import csv
import hashlib
import hmac
import html
import io
import json
import mimetypes
import os
import re
import shutil
import subprocess
import threading
import time
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse
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


def write_response_body(handler: BaseHTTPRequestHandler, body: bytes) -> None:
    try:
        handler.wfile.write(body)
    except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
        pass


def json_response(handler: BaseHTTPRequestHandler, payload: object, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
    handler.send_header("Pragma", "no-cache")
    maybe_send_session_cookie(handler)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    write_response_body(handler, body)


def html_response(handler: BaseHTTPRequestHandler, body: str, status: int = 200, cookie: str | None = None) -> None:
    raw = body.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
    handler.send_header("Pragma", "no-cache")
    if cookie:
        handler.send_header("Set-Cookie", cookie)
    else:
        maybe_send_session_cookie(handler)
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    write_response_body(handler, raw)


def redirect_response(handler: BaseHTTPRequestHandler, location: str, status: int = 303, cookie: str | None = None) -> None:
    handler.send_response(status)
    handler.send_header("Location", location)
    handler.send_header("Cache-Control", "no-store")
    if cookie:
        handler.send_header("Set-Cookie", cookie)
    else:
        maybe_send_session_cookie(handler)
    handler.send_header("Content-Length", "0")
    handler.end_headers()


def api_auth_required_response(handler: BaseHTTPRequestHandler) -> None:
    body = json.dumps({"error": "Требуется вход", "login_url": "/login"}, ensure_ascii=False).encode("utf-8")
    handler.send_response(401)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    if request_cookie(handler, SESSION_COOKIE_NAME):
        handler.send_header("Set-Cookie", expired_session_cookie(handler))
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    write_response_body(handler, body)


def safe_next_path(value: str) -> str:
    parsed = urlparse(value or "/")
    if parsed.scheme or parsed.netloc:
        return "/"
    path = parsed.path or "/"
    if not path.startswith("/") or path.startswith("//") or "\\" in path:
        return "/"
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{path}{query}"


def login_location(next_path: str = "/") -> str:
    next_path = safe_next_path(next_path)
    if next_path == "/":
        return "/login"
    return "/login?" + urlencode({"next": next_path})


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
    if not basic_auth_pair(handler):
        redirect_response(handler, "/login?logged_out=1", cookie=expired_session_cookie(handler))
        return
    handler.send_response(401)
    handler.send_header("WWW-Authenticate", 'Basic realm="Stroitelnyi Kontur Logout"')
    handler.send_header("Content-Type", "text/plain; charset=utf-8")
    handler.send_header("Set-Cookie", expired_session_cookie(handler))
    body = "Вы вышли из Контура. Закройте вкладку или войдите заново.".encode("utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    write_response_body(handler, body)


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


def session_cookie_header(handler: BaseHTTPRequestHandler, account: dict, *, force_secure: bool = False) -> str:
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
    if force_secure or session_cookie_secure(handler):
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


def authenticate_access_account(login: str, supplied_password: str) -> dict | None:
    normalized_login = login.strip().casefold()
    normalized_password = supplied_password.strip()
    for account in configured_access_accounts():
        if normalized_login == account["login"].casefold() and normalized_password == account["password"]:
            return account
    username = os.environ.get("APP_BASIC_AUTH_USER")
    password = os.environ.get("APP_BASIC_AUTH_PASSWORD")
    if username and password and normalized_login == username.casefold() and normalized_password == password:
        return {"login": login, "user_id": 1, "role": "owner", "can_switch_role": True}
    return None


def current_access_account(handler: BaseHTTPRequestHandler) -> dict | None:
    if hasattr(handler, "_access_account_checked"):
        return getattr(handler, "_access_account", None)
    handler._access_account_checked = True
    handler._access_account = None
    handler._issue_session_cookie = False

    pair = basic_auth_pair(handler)

    if pair:
        login, supplied_password = pair
        account = authenticate_access_account(login, supplied_password)
        if account:
            handler._access_account = account
            handler._issue_session_cookie = True
            return account

    cookie_account = session_account(handler)
    if cookie_account:
        handler._access_account = cookie_account
        return cookie_account

    if not os.environ.get("APP_BASIC_AUTH_USER") and not os.environ.get("APP_BASIC_AUTH_PASSWORD") and not configured_access_accounts():
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
        comment=f"Материалы по договору/доп. соглашению: {contract_title}",
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
                title=row.get("name") or "Материал по доп. соглашению",
                basis_type="additional_agreement",
                estimate_section=row.get("section") or "Материалы по доп. соглашению",
                needed_at=None,
                requested_quantity=quantity,
                requested_unit=row.get("unit") or "",
                total_amount=total_amount,
                comment=f"По доп. соглашению: {contract_title}".strip(),
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
        section = row.get("section") or "Работы по доп. соглашению"
        comment = f"По доп. соглашению: {contract_title}".strip()
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
    change_type: str = "",
) -> int:
    urgency = delivery_urgency(needed_at)
    smetter_status = "not_required" if basis_type == "main_estimate" else "waiting_to_enter"
    cursor = db.execute(
        """
        INSERT INTO material_requests (
            batch_id, project_id, creator_id, estimate_material_id, title, basis_type, estimate_section, needed_at,
            procurement_status, smetter_status, supplier, total_amount, comment,
            requested_quantity, requested_unit, delivery_urgency, change_type
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?)
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
            change_type,
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


def truthy_flag(value) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on", "да"}


def force_personal_max(data: dict | None) -> bool:
    return truthy_flag((data or {}).get("notify_personal"))


def notify_users(
    db,
    user_ids: set[int],
    project_id: int,
    title: str,
    text: str,
    related_type: str | None = None,
    related_id: int | None = None,
    force_max: bool = False,
) -> None:
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
            force_max=force_max,
        )


def can_change_material_batch(actor_role: str, actor_id: int | None, batch) -> bool:
    if batch["status"] not in {"new", "revision_requested"}:
        return False
    if actor_role in {"owner", "construction_manager"}:
        return True
    return actor_role == "foreman" and actor_id and int(actor_id) in {int(batch["foreman_id"] or 0), int(batch["creator_id"] or 0)}


def material_variation_type(basis_types: set[str]) -> str:
    if "additional_work" in basis_types or "additional_agreement" in basis_types:
        return "additional_work"
    if "material_replacement" in basis_types:
        return "material_replacement"
    if "over_budget_cost" in basis_types:
        return "company_cost"
    return "material_overspend"


def material_basis_text(value: str) -> str:
    return {
        "main_estimate": "По основной смете",
        "main_estimate_overspend": "Превышение по смете",
        "additional_work": "Дополнительная работа",
        "additional_agreement": "Доп. соглашение",
        "material_replacement": "Замена материала",
        "over_budget_cost": "Сверх бюджета",
    }.get(value, value or "Основание не указано")


def material_deviation_rows(db, batch_id: int):
    return db.execute(
        """
        SELECT m.*, em.unit AS estimate_material_unit
        FROM material_requests m
        LEFT JOIN estimate_materials em ON em.id = m.estimate_material_id
        WHERE m.batch_id = ?
          AND m.basis_type != 'main_estimate'
          AND COALESCE(m.change_type, '') != 'removed'
        ORDER BY m.estimate_section, m.title
        """,
        (batch_id,),
    ).fetchall()


def notify_material_deviation_for_estimators(db, batch_id: int, project, reason: str = "") -> None:
    if not project:
        return
    rows = material_deviation_rows(db, batch_id)
    if not rows:
        return
    project_keys = set(project.keys())
    project_id = int(project["project_id"] if "project_id" in project_keys else project["id"])
    project_title = project["project_title"] if "project_title" in project_keys else project["title"]
    estimator_id = project["estimator_id"] if "estimator_id" in project_keys else None
    construction_manager_id = project["construction_manager_id"] if "construction_manager_id" in project_keys else None
    lines = []
    for item in rows[:6]:
        qty = number_value(item["requested_quantity"])
        unit = item["requested_unit"] or item["estimate_material_unit"] or ""
        amount = number_value(item["total_amount"])
        line = f"{item['title']} — {material_basis_text(item['basis_type'])}"
        if qty:
            line += f", {qty:g} {unit}".rstrip()
        if amount:
            line += f", {amount:g} ₽"
        lines.append(line)
    if len(rows) > 6:
        lines.append(f"Еще позиций: {len(rows) - 6}")
    reason_text = f" {reason}" if reason else ""
    text = (
        f"{project_title}: в заявке материалов есть позиции вне основной сметы.{reason_text} "
        "Сметчику нужно проверить цены/шаблоны и при необходимости обновить расчет.\n"
        + "\n".join(f"- {line}" for line in lines)
    )
    notify_users(
        db,
        {user_id for user_id in {estimator_id, construction_manager_id, user_id_by_role(db, "owner")} if user_id},
        project_id,
        "Материалы вне основной сметы",
        text,
        "material_request_batch",
        batch_id,
    )


def notify_material_actual_cost_overrun(db, batch_id: int, project) -> None:
    if not project:
        return
    rows = db.execute(
        """
        SELECT m.*, em.unit AS estimate_material_unit
        FROM material_requests m
        LEFT JOIN estimate_materials em ON em.id = m.estimate_material_id
        WHERE m.batch_id = ?
          AND m.actual_total_amount > 0
          AND m.total_amount > 0
          AND m.actual_total_amount > m.total_amount
          AND COALESCE(m.change_type, '') != 'removed'
        ORDER BY m.estimate_section, m.title
        """,
        (batch_id,),
    ).fetchall()
    if not rows:
        return
    project_keys = set(project.keys())
    project_id = int(project["project_id"] if "project_id" in project_keys else project["id"])
    project_title = project["project_title"] if "project_title" in project_keys else project["title"]
    estimator_id = project["estimator_id"] if "estimator_id" in project_keys else None
    construction_manager_id = project["construction_manager_id"] if "construction_manager_id" in project_keys else None
    lines = []
    for item in rows[:8]:
        unit = item["requested_unit"] or item["estimate_material_unit"] or ""
        qty = number_value(item["requested_quantity"])
        estimate_amount = number_value(item["total_amount"])
        actual_amount = number_value(item["actual_total_amount"])
        difference = actual_amount - estimate_amount
        line = f"{item['title']}"
        if qty:
            line += f", {qty:g} {unit}".rstrip()
        line += f": смета {estimate_amount:g} ₽, закупка {actual_amount:g} ₽, +{difference:g} ₽"
        lines.append(line)
    if len(rows) > 8:
        lines.append(f"Еще позиций: {len(rows) - 8}")
    text = (
        f"{project_title}: по заявке материалов есть позиции, где закупка дороже сметы. "
        "Сметчику нужно проверить цены и при необходимости обновить шаблоны/расчет.\n"
        + "\n".join(f"- {line}" for line in lines)
    )
    notify_users(
        db,
        {
            user_id
            for user_id in {
                estimator_id,
                construction_manager_id,
                user_id_by_role(db, "owner"),
                user_id_by_role(db, "finance_director"),
            }
            if user_id
        },
        project_id,
        "Закупка дороже сметы",
        text,
        "material_request_batch",
        batch_id,
    )


def save_material_actual_items(db, batch_id: int, actual_items: list[dict]) -> float:
    actual_purchase_amount = 0.0
    for item in actual_items:
        request_id = int(item.get("id") or 0)
        if not request_id:
            continue
        material = db.execute(
            "SELECT requested_quantity FROM material_requests WHERE id = ? AND batch_id = ? AND COALESCE(change_type, '') != 'removed'",
            (request_id, batch_id),
        ).fetchone()
        if not material:
            continue
        actual_unit_price = number_value(item.get("actual_unit_price"))
        actual_total_amount = number_value(item.get("actual_total_amount"))
        requested_quantity = number_value(material["requested_quantity"])
        if actual_total_amount <= 0 and actual_unit_price > 0:
            actual_total_amount = actual_unit_price * requested_quantity
        if actual_unit_price <= 0 and actual_total_amount > 0 and requested_quantity > 0:
            actual_unit_price = actual_total_amount / requested_quantity
        actual_purchase_amount += actual_total_amount
        db.execute(
            """
            UPDATE material_requests
            SET actual_unit_price = ?,
                actual_total_amount = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND batch_id = ?
            """,
            (actual_unit_price, actual_total_amount, request_id, batch_id),
        )
    return actual_purchase_amount


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


def max_message_text_is_corrupted(text: str) -> bool:
    value = str(text or "")
    if not value.strip():
        return False
    has_cyrillic = bool(re.search(r"[А-Яа-яЁё]", value))
    question_count = value.count("?")
    compact = re.sub(r"\s+", "", value)
    return not has_cyrillic and ("?????" in compact or (question_count >= 12 and question_count / max(len(value), 1) > 0.12))


def clean_feedback_decision_comment(value: object) -> str:
    text = str(value or "").strip()
    if not text or max_message_text_is_corrupted(text):
        return ""
    return text


def normalize_max_message_text(text: str) -> str:
    clean = str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    clean = "\n".join(line.rstrip() for line in clean.split("\n"))
    clean = re.sub(r"\n{3,}", "\n\n", clean)
    if "\n\n" not in clean and len(clean) > 180:
        clean = re.sub(r"(?<=[.!?])\s+(?=(?:[А-ЯЁA-Z]|[•▪▫✅☑️🔔📌🛠️]))", "\n\n", clean)
    clean = re.sub(r"^(\*\*[^*\n]{2,90}\*\*)\n(?!\n)", r"\1\n\n", clean)
    clean = re.sub(r"\s+(?=(?:[•▪▫✅☑️🔔📌🛠️]\s))", "\n", clean)
    clean = re.sub(r"\n{3,}", "\n\n", clean)
    return clean.strip()


def max_message_payload(text: str) -> bytes:
    text = normalize_max_message_text(text)
    payload = json.dumps(
        {"text": str(text or ""), "format": "markdown", "notify": True},
        ensure_ascii=True,
        separators=(",", ":"),
    )
    return payload.encode("ascii")


def send_max_message(chat_id: str, text: str) -> tuple[bool, str]:
    token = os.environ.get("MAX_TOKEN", "").strip()
    if not token:
        return False, "MAX_TOKEN is not configured"
    if not chat_id:
        return False, "MAX chat is not bound"
    text = normalize_max_message_text(text)
    if max_message_text_is_corrupted(text):
        return False, "MAX message text looks corrupted; refused to send"
    payload = max_message_payload(text)
    url = f"{MAX_API_URL}/messages?{urlencode({'chat_id': chat_id})}"
    request = Request(
        url,
        data=payload,
        headers={"Authorization": token, "Content-Type": "application/json; charset=utf-8"},
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
    message_lines = [f"🔔 **Контур: {title}**", "", text]
    if url:
        message_lines.extend(["", f"Открыть в Контуре: {url}"])
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
    force_max: bool = False,
) -> None:
    max_status = "disabled" if not os.environ.get("MAX_TOKEN", "").strip() else "not_bound"
    max_chat_id = ""
    if user_id and max_status != "disabled":
        user = db.execute(
            "SELECT max_chat_id, max_notifications_enabled FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if user and (int(user["max_notifications_enabled"] or 0) or force_max) and str(user["max_chat_id"] or "").strip():
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


def first_project_contract_id(db, project_id: int) -> int | None:
    row = db.execute(
        """
        SELECT id
        FROM contracts
        WHERE project_id = ?
        ORDER BY
            CASE type
                WHEN 'customer_contract' THEN 1
                WHEN 'additional_agreement' THEN 2
                ELSE 3
            END,
            id
        LIMIT 1
        """,
        (project_id,),
    ).fetchone()
    return int(row["id"]) if row else None


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
) -> int:
    cursor = db.execute(
        """
        INSERT INTO task_events (
            task_id, project_id, actor_id, action, status_from, status_to, comment, due_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (task_id, project_id, actor_id, action, status_from, status_to, comment, due_date),
    )
    return int(cursor.lastrowid)


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


SNAPSHOT_FORBIDDEN_ENUMS = {
    "in_progress",
    "new",
    "returned",
    "accepted",
    "additional_work",
    "active",
    "owner",
    "construction_manager",
    "procurement_manager",
    "estimator",
    "master",
}

SNAPSHOT_ROLE_KEYS = {
    "owner",
    "construction_manager",
    "finance_director",
    "accountant",
    "sales_manager",
    "foreman",
    "procurement_manager",
    "estimator",
    "technical_supervisor",
    "master",
    "ai_auditor",
}

SNAPSHOT_TYPE_KEYS = {
    "main_estimate",
    "main_estimate_overspend",
    "additional_work",
    "additional_agreement",
    "material_replacement",
    "over_budget_cost",
    "internal_error_or_loss",
    "company_cost",
    "rework",
    "contract",
    "variation_estimate",
    "act",
    "ks_2",
    "ks_3",
    "smetter_materials",
    "smetter_work_task",
    "project_documentation",
    "detail_node",
    "regulation",
    "standard",
    "instruction",
    "other",
    "project",
    "estimate",
    "invoice",
    "media",
    "photo_video",
    "variation_attachment",
    "extra_work_attachment",
    "service_file",
    "service_screenshot",
    "unclassified",
    "photo_report",
    "object_remark",
    "object_remark_photo",
    "task",
    "question",
    "issue",
    "remark",
    "photo",
    "material",
    "decision",
    "check",
    "approval",
    "open",
    "waiting_external",
    "resolved",
    "closed",
    "no_material",
    "waiting_client_decision",
    "waiting_owner_decision",
    "waiting_project_documentation",
    "estimate_not_approved",
    "subcontractor_problem",
    "quality_problem",
    "no_photo_report",
    "material_under_risk",
    "medium",
    "high",
    "critical",
}


def frontend_asset_version() -> str:
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        return os.environ.get("APP_VERSION", "").strip() or "unknown"
    index_html = index_path.read_text(encoding="utf-8", errors="replace")
    match = re.search(r'app(?:\.compat)?\.js\?v=([^"]+)', index_html)
    if match:
        return match.group(1)
    return os.environ.get("APP_VERSION", "").strip() or "unknown"


def current_commit_hash() -> str:
    configured = os.environ.get("APP_COMMIT_SHA", "").strip()
    if configured:
        return configured[:12]
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short=12", "HEAD"],
            cwd=str(APP_DIR.parent),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=2,
            check=False,
        )
    except Exception:
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


def frontend_label_maps() -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    app_js_path = STATIC_DIR / "app.js"
    if not app_js_path.exists():
        return {}, {}, {}
    app_js = app_js_path.read_text(encoding="utf-8", errors="replace")
    match = re.search(r"const\s+statusLabelMap\s*=\s*\{(?P<body>.*?)\n\};", app_js, re.S)
    if not match:
        return {}, {}, {}
    status_map = {
        key: value
        for key, value in re.findall(r'^\s*([A-Za-z0-9_]+):\s*"([^"]*)"', match.group("body"), re.M)
    }
    role_map = {key: status_map[key] for key in SNAPSHOT_ROLE_KEYS if key in status_map}
    type_map = {key: status_map[key] for key in SNAPSHOT_TYPE_KEYS if key in status_map}
    return status_map, role_map, type_map


def snapshot_feature_flags() -> dict[str, bool]:
    app_js = (STATIC_DIR / "app.js").read_text(encoding="utf-8", errors="replace") if (STATIC_DIR / "app.js").exists() else ""
    index_html = (STATIC_DIR / "index.html").read_text(encoding="utf-8", errors="replace") if (STATIC_DIR / "index.html").exists() else ""
    database_text = (APP_DIR / "database.py").read_text(encoding="utf-8", errors="replace") if (APP_DIR / "database.py").exists() else ""
    server_text = Path(__file__).read_text(encoding="utf-8", errors="replace")
    status_map, role_map, type_map = frontend_label_maps()
    return {
        "human_status_labels": bool(status_map and role_map and type_map and "statusLabel(value)" in app_js),
        "today_screen": "id=\"todayView\"" in index_html and "function renderToday" in app_js,
        "object_attention_block": "projectAttentionItems" in app_js and "Что требует внимания" in app_js,
        "photo_reports_entity": "CREATE TABLE IF NOT EXISTS photo_reports" in database_text and "photo_reports_payload" in server_text,
        "object_issues_entity": "CREATE TABLE IF NOT EXISTS object_remarks" in database_text and "object_remarks_payload" in server_text,
    }


def latest_qa_report() -> dict:
    report_path = APP_DIR.parent / "qa-artifacts" / "latest" / "qa-report.json"
    if not report_path.exists():
        return {}
    try:
        with report_path.open("r", encoding="utf-8") as file:
            payload = json.load(file)
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def qa_snapshot_status(report: dict, key: str) -> str:
    qa = report.get("qa") if isinstance(report.get("qa"), dict) else {}
    value = str(qa.get(key) or "").strip()
    if value in {"ok", "failed", "not_run"}:
        return value
    return "not_run"


def snapshot_label(labels: dict[str, str], value: object, fallback: str = "Не задано") -> str:
    key = str(value or "").strip()
    return labels.get(key) or fallback


def snapshot_clean_text(value: object, status_map: dict[str, str]) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if max_message_text_is_corrupted(text):
        return "Текст повреждён старой кодировкой"
    for key in sorted(SNAPSHOT_FORBIDDEN_ENUMS, key=len, reverse=True):
        replacement = status_map.get(key, "служебный статус")
        text = re.sub(rf"(?<![A-Za-z0-9_]){re.escape(key)}(?![A-Za-z0-9_])", replacement, text)
    return text


def snapshot_material_pipeline_status(row: dict) -> str:
    status = str(row.get("batch_status") or row.get("status") or row.get("procurement_status") or "")
    receipt_status = str(row.get("receipt_status") or "")
    if status in {"receipt_issue", "returned", "revision_requested"} or receipt_status == "problem":
        return "problem"
    if status in {"archived", "closed"}:
        return "closed"
    if status == "received" or receipt_status == "ok":
        return "on_site"
    if status in {"delivery_confirmed", "delivery_scheduled"}:
        return "in_transit"
    if status in {"ordered", "delivery"}:
        return "ordered"
    if status in {"in_work", "approved", "agreed"}:
        return "agreed"
    return "need_approval"


def snapshot_task_is_open(row: dict) -> bool:
    return str(row.get("status") or "") not in {"accepted", "closed", "archived"}


def snapshot_task_is_overdue(row: dict) -> bool:
    due_date = str(row.get("due_date") or "")
    if not due_date or str(row.get("status") or "") in {"accepted", "returned", "closed", "archived"}:
        return False
    return due_date < date.today().isoformat()


def normalize_task_type_value(value: object, title: object = "", description: object = "", related_type: object = "") -> str:
    raw = str(value or related_type or "task").strip()
    aliases = {"photo": "photo_report", "remark": "issue"}
    raw = aliases.get(raw, raw) or "task"
    text = f"{title or ''} {description or ''} {related_type or ''}".lower()
    if re.search(r"фото\s*отч[её]т|фотоотч[её]т|photo", text):
        return "photo_report"
    if raw == "approval" or re.search(r"согласовать|нужно\s+решение|требует\s+решения|утвердить|одобрить", text):
        return "approval"
    if raw == "check" or re.search(r"проверить|принять|контроль|проверка", text):
        return "check"
    if "?" in text or re.search(r"что\s+думаете|как\s+лучше|вопрос|уточнить|уточнение", text):
        return "question"
    if raw == "material" or re.search(r"материал|заявк|снабжен|поставк|заказать|купить", text):
        return "material"
    if re.search(r"дефект|замечани|исправ|передел|брак|не\s+принят", text):
        return "issue"
    if raw in {"task", "question", "decision", "photo_report", "issue", "material", "check", "approval"}:
        return raw
    return "task"


def normalize_task_display(row: dict) -> None:
    title = str(row.get("title") or "")
    description = str(row.get("description") or "")
    if title.lower().startswith(("сделать фотоотчёт,", "сделать фотоотчет,")):
        row["title"] = "Сделать фотоотчёт по объекту"
        row["description"] = description.strip() or title
        row["task_type"] = "photo_report"
        return
    if len(title) > 80:
        row["display_title"] = title[:77].rstrip() + "..."
        row["description"] = description.strip() or title


def normalize_task_rows(rows: list[dict]) -> list[dict]:
    for row in rows:
        normalize_task_display(row)
        row["task_type"] = normalize_task_type_value(
            row.get("task_type"),
            row.get("title"),
            row.get("description"),
            row.get("related_type"),
        )
    return rows


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
    event_ids = [int(row["id"]) for row in rows]
    attachments_by_event: dict[int, list[dict]] = {}
    if event_ids:
        event_placeholders = ",".join("?" for _ in event_ids)
        process_keys = [f"task_event:{event_id}" for event_id in event_ids]
        attachment_rows = rows_to_dicts(
            db.execute(
                f"""
                SELECT id, title, type, file_name, file_path, mime_type, file_size, process_type, created_at
                FROM documents
                WHERE related_type = 'task'
                  AND process_type IN ({event_placeholders})
                ORDER BY created_at, id
                """,
                process_keys,
            ).fetchall()
        )
        for attachment in attachment_rows:
            process_type = str(attachment.get("process_type") or "")
            if process_type.startswith("task_event:"):
                try:
                    event_id = int(process_type.split(":", 1)[1])
                except ValueError:
                    continue
                attachments_by_event.setdefault(event_id, []).append(attachment)
    for event_rows in grouped.values():
        for event in event_rows:
            event["attachments"] = attachments_by_event.get(int(event["id"]), [])
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


READ_ONLY_ROLES = {"ai_auditor"}
AI_AUDIT_LOGIN = os.environ.get("APP_AI_AUDIT_LOGIN", "ai_auditor_8c8c15").strip() or "ai_auditor_8c8c15"
AUDIT_SAFE_DOCUMENT_TYPES = {"smetter_materials", "smetter_work_task", "project_documentation", "detail_node", "regulation", "standard", "instruction", "other"}
SENSITIVE_DOCUMENT_TYPES = {"contract", "main_estimate", "variation_estimate", "act", "ks_2", "ks_3"}
EMAIL_RE = re.compile(r"[\w.\-+]+@[\w.\-]+\.[A-Za-zА-Яа-я]{2,}")
PHONE_RE = re.compile(r"(?:(?:\+?7|8)[\s\-()]*)?\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}")
LONG_NUMBER_RE = re.compile(r"\b\d{12,24}\b")


def is_read_only_account(account: dict | None) -> bool:
    return account_role(account) in READ_ONLY_ROLES


def is_ai_auditor_account(account: dict | None) -> bool:
    return account_role(account) == "ai_auditor"


def audit_token_hash(token: str) -> str:
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


def audit_project_title(value: object) -> str:
    try:
        return f"Объект #{int(value or 0)}"
    except (TypeError, ValueError):
        return "Объект"


def audit_customer_name(value: object) -> str:
    try:
        return f"Клиент #{int(value or 0)}"
    except (TypeError, ValueError):
        return "Клиент"


def redact_sensitive_text(value: object) -> str:
    text = str(value or "")
    if not text:
        return ""
    if max_message_text_is_corrupted(text):
        return "[текст повреждён старой кодировкой]"
    text = EMAIL_RE.sub("[email скрыт]", text)
    text = PHONE_RE.sub("[телефон скрыт]", text)
    text = LONG_NUMBER_RE.sub("[номер скрыт]", text)
    return text


def sanitize_user_for_audit(user: dict) -> dict:
    safe = dict(user)
    safe["email"] = ""
    safe["max_user_id"] = ""
    safe["max_chat_id"] = ""
    safe["max_notifications_enabled"] = 0
    return safe


def sanitize_users_for_account(users: list[dict], account: dict | None) -> list[dict]:
    if not is_ai_auditor_account(account):
        return users
    return [sanitize_user_for_audit(user) for user in users]


def sanitize_task_row_for_audit(task: dict) -> dict:
    safe = dict(task)
    safe["project_title"] = audit_project_title(safe.get("project_id"))
    safe["description"] = redact_sensitive_text(safe.get("description"))
    safe["rejection_comment"] = redact_sensitive_text(safe.get("rejection_comment"))
    safe["contract_title"] = ""
    safe["contract_type"] = ""
    for event in safe.get("events") or []:
        event["comment"] = redact_sensitive_text(event.get("comment"))
    return safe


def sanitize_tasks_for_account(tasks: list[dict], account: dict | None) -> list[dict]:
    if not is_ai_auditor_account(account):
        return tasks
    return [sanitize_task_row_for_audit(task) for task in tasks]


def sanitize_material_row_for_audit(row: dict) -> dict:
    safe = dict(row)
    safe["project_title"] = audit_project_title(safe.get("project_id"))
    safe["comment"] = redact_sensitive_text(safe.get("comment"))
    safe["batch_comment"] = redact_sensitive_text(safe.get("batch_comment"))
    safe["batch_revision_comment"] = redact_sensitive_text(safe.get("batch_revision_comment"))
    safe["batch_foreman_response"] = redact_sensitive_text(safe.get("batch_foreman_response"))
    safe["batch_procurement_comment"] = redact_sensitive_text(safe.get("batch_procurement_comment"))
    safe["batch_receipt_comment"] = redact_sensitive_text(safe.get("batch_receipt_comment"))
    for key in ("total_amount", "actual_unit_price", "actual_total_amount", "batch_actual_purchase_amount", "unit_price"):
        if key in safe:
            safe[key] = 0
    return safe


def sanitize_material_rows_for_account(rows: list[dict], account: dict | None) -> list[dict]:
    if not is_ai_auditor_account(account):
        return rows
    return [sanitize_material_row_for_audit(row) for row in rows]


def sanitize_feedback_items_for_account(items: list[dict], account: dict | None) -> list[dict]:
    if not is_ai_auditor_account(account):
        return items
    safe_items = []
    for item in items:
        safe = dict(item)
        safe["chat_id"] = ""
        safe["chat_title"] = "Чат обратной связи"
        safe["sender_id"] = ""
        safe["sender_name"] = "Участник"
        safe["text"] = redact_sensitive_text(safe.get("text"))
        safe["decision_comment"] = redact_sensitive_text(safe.get("decision_comment"))
        safe["attachments"] = []
        safe.pop("attachments_json", None)
        safe_items.append(safe)
    return safe_items


def sanitize_notifications_for_account(items: list[dict], account: dict | None) -> list[dict]:
    if not is_ai_auditor_account(account):
        return items
    safe_items = []
    for item in items:
        safe = dict(item)
        safe["project_title"] = audit_project_title(safe.get("project_id"))
        safe["title"] = redact_sensitive_text(safe.get("title"))
        safe["text"] = redact_sensitive_text(safe.get("text"))
        safe["max_error"] = ""
        safe_items.append(safe)
    return safe_items


def sanitize_documents_for_account(documents: list[dict], account: dict | None) -> list[dict]:
    if not is_ai_auditor_account(account):
        return documents
    safe_docs = []
    for document in documents:
        if str(document.get("type") or "other") in SENSITIVE_DOCUMENT_TYPES:
            continue
        safe = dict(document)
        safe["title"] = redact_sensitive_text(safe.get("title"))
        safe["file_name"] = redact_sensitive_text(safe.get("file_name"))
        safe["file_path"] = ""
        safe_docs.append(safe)
    return safe_docs


def sanitize_estimate_jobs_for_account(jobs: list[dict], account: dict | None) -> list[dict]:
    if not is_ai_auditor_account(account):
        return jobs
    safe_jobs = []
    for job in jobs:
        safe = dict(job)
        safe["project_title"] = audit_project_title(safe.get("project_id"))
        safe["customer_name"] = audit_customer_name(safe.get("id"))
        safe["smetter_url"] = ""
        safe["estimator_email"] = ""
        for key in ("comment", "result_comment", "return_comment", "question_comment", "site_costs_comment"):
            safe[key] = redact_sensitive_text(safe.get(key))
        safe["files"] = []
        safe_jobs.append(safe)
    return safe_jobs


def validate_audit_token(db, raw_token: str, *, consume: bool = False) -> dict | None:
    token = str(raw_token or "").strip()
    if len(token) < 24 or len(token) > 256:
        return None
    row = db.execute(
        """
        SELECT t.*, u.id AS user_id, u.name AS user_name, u.role AS user_role
        FROM audit_tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ?
          AND t.role = 'ai_auditor'
          AND u.role = 'ai_auditor'
          AND u.is_active = 1
          AND t.revoked_at IS NULL
          AND (t.expires_at IS NULL OR datetime(t.expires_at) > datetime('now'))
          AND (
                t.unlimited_until_expiry = 1
                OR (t.max_uses IS NOT NULL AND COALESCE(t.used_count, 0) < t.max_uses)
          )
        LIMIT 1
        """,
        (audit_token_hash(token),),
    ).fetchone()
    if not row:
        return None
    payload = row_to_dict(row)
    if consume:
        db.execute(
            """
            UPDATE audit_tokens
            SET used_at = CURRENT_TIMESTAMP,
                used_count = COALESCE(used_count, 0) + 1
            WHERE id = ?
            """,
            (int(payload["id"]),),
        )
        db.commit()
    return payload


def audit_token_diagnostic(db, raw_token: str) -> dict:
    token = str(raw_token or "").strip()
    if len(token) < 24 or len(token) > 256:
        return {
            "valid": False,
            "reason": "Некорректная длина токена",
            "expires_at": "",
            "uses_left": 0,
        }
    row = db.execute(
        """
        SELECT t.*, u.id AS user_id, u.role AS user_role, u.is_active AS user_is_active
        FROM audit_tokens t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ?
        LIMIT 1
        """,
        (audit_token_hash(token),),
    ).fetchone()
    if not row:
        return {"valid": False, "reason": "Токен не найден", "expires_at": "", "uses_left": 0}
    payload = row_to_dict(row)
    max_uses = payload.get("max_uses")
    used_count = int(payload.get("used_count") or 0)
    unlimited = int(payload.get("unlimited_until_expiry") or 0) == 1
    uses_left = "без ограничения" if unlimited else max(0, int(max_uses or 0) - used_count)
    reason = ""
    if payload.get("revoked_at"):
        reason = "Токен отозван"
    elif payload.get("role") != "ai_auditor" or payload.get("user_role") != "ai_auditor":
        reason = "Токен не относится к роли аудитора"
    elif not payload.get("user_is_active"):
        reason = "Пользователь аудитора выключен"
    elif payload.get("expires_at") and str(payload["expires_at"]) <= datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"):
        reason = "Токен истёк"
    elif not unlimited and int(max_uses or 0) <= used_count:
        reason = "Лимит входов исчерпан"
    return {
        "valid": not reason,
        "reason": reason or "OK",
        "expires_at": payload.get("expires_at") or "",
        "uses_left": uses_left,
        "used_count": used_count,
        "session_user_id": payload.get("user_id") or 0,
    }


def audit_account_from_token_row(row: dict) -> dict:
    return {
        "login": AI_AUDIT_LOGIN,
        "user_id": int(row.get("user_id") or 0),
        "role": "ai_auditor",
        "can_switch_role": False,
    }


def can_manage_feedback(account: dict | None) -> bool:
    return account_role(account) in {"owner", "construction_manager", "finance_director", "ai_auditor"}


def can_delete_feedback(account: dict | None) -> bool:
    return account_role(account) in {"owner", "construction_manager"}


def can_view_estimate_jobs(account: dict | None) -> bool:
    return account_role(account) in {"owner", "construction_manager", "sales_manager", "estimator", "ai_auditor"}


def can_manage_estimate_jobs(account: dict | None) -> bool:
    return can_view_estimate_jobs(account)


def can_delete_estimate_job(row, account: dict | None) -> bool:
    role = account_role(account)
    if role in {"owner", "construction_manager"}:
        return True
    if role == "sales_manager" and estimate_job_owned_by_account(row, account, "manager_id"):
        return row["status"] in {"estimate_new", "estimate_returned", "estimate_question", "estimate_hold"}
    return False


def estimate_job_owned_by_account(row, account: dict | None, field: str) -> bool:
    try:
        return int(row[field] or 0) == account_user_id(account)
    except (KeyError, TypeError, ValueError):
        return False


def estimate_job_uses_partner_estimator(db, row) -> bool:
    try:
        estimator_id = int(row["estimator_id"] or 0)
    except (KeyError, TypeError, ValueError):
        return False
    if not estimator_id:
        return False
    user = db.execute("SELECT email FROM users WHERE id = ? LIMIT 1", (estimator_id,)).fetchone()
    return bool(user and str(user["email"] or "") == "estimate-partner@example.local")


def can_update_estimate_job(row, account: dict | None) -> bool:
    role = account_role(account)
    if role in {"owner", "construction_manager"}:
        return True
    if role == "sales_manager":
        return estimate_job_owned_by_account(row, account, "manager_id")
    if role == "estimator":
        return estimate_job_owned_by_account(row, account, "estimator_id") and row["status"] not in {"estimate_done", "estimate_returned"}
    return False


def can_change_estimate_job_status(row, status: str, account: dict | None, db=None) -> bool:
    role = account_role(account)
    if role in {"owner", "construction_manager"}:
        return True
    if (
        db is not None
        and role == "sales_manager"
        and estimate_job_owned_by_account(row, account, "manager_id")
        and estimate_job_uses_partner_estimator(db, row)
    ):
        if status == "estimate_in_work":
            return row["status"] in {"estimate_new", "estimate_hold"}
        if status == "estimate_done":
            return row["status"] in {"estimate_in_work", "estimate_question"}
        return False
    if role != "estimator" or not estimate_job_owned_by_account(row, account, "estimator_id"):
        return False
    if status == "estimate_in_work":
        return row["status"] in {"estimate_new", "estimate_hold"}
    if status == "estimate_done":
        return row["status"] in {"estimate_in_work", "estimate_question"}
    if status == "estimate_returned":
        return row["status"] in {"estimate_new", "estimate_hold", "estimate_in_work"}
    if status == "estimate_question":
        return row["status"] in {"estimate_new", "estimate_hold", "estimate_in_work"}
    return False


def can_manage_estimate_job_files(row, account: dict | None) -> bool:
    role = account_role(account)
    if role in {"owner", "construction_manager"}:
        return True
    if role == "sales_manager":
        return estimate_job_owned_by_account(row, account, "manager_id")
    if role == "estimator":
        return estimate_job_owned_by_account(row, account, "estimator_id")
    return False


def can_view_variations(account: dict | None) -> bool:
    return account_role(account) in {"owner", "construction_manager", "finance_director", "accountant", "sales_manager", "estimator", "foreman", "ai_auditor"}


def can_view_knowledge_base(account: dict | None) -> bool:
    return account_role(account) in {"owner", "construction_manager", "finance_director", "accountant", "sales_manager", "foreman", "master", "procurement_manager", "estimator", "technical_supervisor", "ai_auditor"}


def can_manage_object_workflow(account: dict | None) -> bool:
    return account_role(account) in {"owner", "construction_manager", "foreman", "master", "technical_supervisor"}


def variation_visible_for_account(variation: dict, account: dict | None) -> bool:
    role = account_role(account)
    if role == "foreman":
        return int(variation.get("project_foreman_id") or 0) == account_user_id(account)
    return role in {"owner", "construction_manager", "finance_director", "accountant", "sales_manager", "estimator", "ai_auditor"}


def sanitize_variation_for_account(variation: dict, account: dict | None) -> dict:
    if can_view_financials(account):
        return variation
    variation["amount"] = 0
    variation["financial_decision"] = ""
    for item in variation.get("materials") or []:
        item["total_amount"] = 0
        item["unit_price"] = 0
        item["comment"] = redact_sensitive_text(item.get("comment"))
    if is_ai_auditor_account(account):
        variation["project_title"] = audit_project_title(variation.get("project_id"))
        variation["description"] = redact_sensitive_text(variation.get("description"))
        variation["attachments"] = sanitize_documents_for_account(variation.get("attachments") or [], account)
    return variation


def project_visible_for_account(project: dict, account: dict | None) -> bool:
    role = account_role(account)
    if role == "foreman":
        return int(project.get("foreman_id") or 0) == account_user_id(account)
    return role in {"owner", "construction_manager", "finance_director", "accountant", "sales_manager", "master", "procurement_manager", "estimator", "technical_supervisor", "ai_auditor"}


DOCUMENT_TYPES_BY_ROLE = {
    "foreman": {"project_documentation", "detail_node", "regulation", "standard", "instruction"},
    "master": {"project_documentation", "detail_node", "regulation", "standard", "instruction"},
    "procurement_manager": {"smetter_materials", "project_documentation", "variation_attachment", "detail_node", "regulation", "standard", "instruction", "other"},
    "technical_supervisor": {"smetter_materials", "smetter_work_task", "project_documentation", "variation_attachment", "detail_node", "regulation", "standard", "instruction", "other"},
    "estimator": {"main_estimate", "smetter_materials", "smetter_work_task", "project_documentation", "variation_attachment", "variation_estimate", "act", "ks_2", "ks_3", "other"},
    "accountant": {"main_estimate", "smetter_materials", "smetter_work_task", "contract", "variation_attachment", "variation_estimate", "act", "ks_2", "ks_3", "other"},
    "ai_auditor": AUDIT_SAFE_DOCUMENT_TYPES,
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
    return sanitize_documents_for_account([document for document in documents if document_visible_for_account(document, account)], account)


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
    if role not in {"owner", "construction_manager", "finance_director", "accountant", "sales_manager", "estimator", "ai_auditor"}:
        project["bitrix_ref"] = ""
        project["smetter_ref"] = ""
    if role == "ai_auditor":
        project["title"] = audit_project_title(project.get("id"))
        project["customer_name"] = audit_customer_name(project.get("customer_id") or project.get("id"))
        project["customer_phone"] = ""
        project["customer_email"] = ""
        project["customer_id"] = None
        project["customer_projects_count"] = 0
        project["address"] = "Адрес скрыт в режиме аудита"
        project["navigator_url"] = ""
        project["bitrix_ref"] = ""
        project["smetter_ref"] = ""
        project["manager_note"] = ""
        project["workflow_comment"] = redact_sensitive_text(project.get("workflow_comment"))
        project["archive_reason"] = ""
        project["contracts"] = []
        project["tasks"] = sanitize_tasks_for_account(project.get("tasks") or [], account)
        project["materials"] = sanitize_material_rows_for_account(project.get("materials") or [], account)
        project["documents"] = sanitize_documents_for_account(project.get("documents") or [], account)
        for key in ("events", "notifications"):
            rows = []
            for row in project.get(key) or []:
                safe_row = dict(row)
                safe_row["text"] = redact_sensitive_text(safe_row.get("text"))
                safe_row["project_title"] = audit_project_title(safe_row.get("project_id"))
                rows.append(safe_row)
            project[key] = rows
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


def normalize_folder_title(value: object) -> str:
    text = str(value or "").replace("\\", "/").split("/")[-1].strip()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r'[\\/:*?"<>|\r\n\t]+', " ", text).strip(" .")
    return text[:90]


def normalize_relative_path(value: object) -> list[str]:
    raw = str(value or "").replace("\\", "/")
    parts = [normalize_folder_title(part) for part in raw.split("/") if normalize_folder_title(part)]
    return parts


def knowledge_folder_rows(db) -> list[dict]:
    return rows_to_dicts(
        db.execute(
            """
            SELECT f.*, u.name AS created_by_name
            FROM knowledge_folders f
            LEFT JOIN users u ON u.id = f.created_by
            ORDER BY COALESCE(f.parent_id, 0), LOWER(f.title), f.id
            """
        ).fetchall()
    )


def knowledge_folder_path_from_map(folders_by_id: dict[int, dict], folder_id: int | None) -> str:
    if not folder_id:
        return ""
    parts: list[str] = []
    current_id = int(folder_id)
    seen: set[int] = set()
    while current_id and current_id not in seen:
        seen.add(current_id)
        row = folders_by_id.get(current_id)
        if not row:
            break
        parts.append(str(row.get("title") or ""))
        current_id = int(row.get("parent_id") or 0)
    return "/".join(reversed([part for part in parts if part]))


def knowledge_folders_with_paths(db) -> list[dict]:
    folders = knowledge_folder_rows(db)
    folders_by_id = {int(row["id"]): row for row in folders}
    for row in folders:
        row["path"] = knowledge_folder_path_from_map(folders_by_id, int(row["id"]))
    return sorted(folders, key=lambda row: str(row.get("path") or "").lower())


def knowledge_folder_path(db, folder_id: int | None) -> str:
    if not folder_id:
        return ""
    folders_by_id = {int(row["id"]): row for row in knowledge_folder_rows(db)}
    return knowledge_folder_path_from_map(folders_by_id, int(folder_id))


def validate_knowledge_folder(db, folder_id: int | None) -> int | None:
    if not folder_id:
        return None
    row = db.execute("SELECT id FROM knowledge_folders WHERE id = ?", (int(folder_id),)).fetchone()
    if not row:
        raise ValueError("Папка базы знаний не найдена.")
    return int(row["id"])


def ensure_knowledge_folder(db, title: object, parent_id: int | None = None, created_by: int | None = None) -> int:
    folder_title = normalize_folder_title(title)
    if not folder_title:
        raise ValueError("Укажите название папки.")
    parent_id = validate_knowledge_folder(db, parent_id)
    rows = db.execute(
        """
        SELECT id, title
        FROM knowledge_folders
        WHERE COALESCE(parent_id, 0) = COALESCE(?, 0)
        """,
        (parent_id,),
    ).fetchall()
    for row in rows:
        if str(row["title"]).strip().lower() == folder_title.lower():
            return int(row["id"])
    cursor = db.execute(
        """
        INSERT INTO knowledge_folders (parent_id, title, created_by)
        VALUES (?, ?, ?)
        """,
        (parent_id, folder_title, created_by),
    )
    return int(cursor.lastrowid)


def ensure_knowledge_folder_path(db, parent_id: int | None, segments: list[str], created_by: int | None = None) -> int | None:
    current_parent = validate_knowledge_folder(db, parent_id)
    for segment in segments:
        folder_title = normalize_folder_title(segment)
        if folder_title:
            current_parent = ensure_knowledge_folder(db, folder_title, current_parent, created_by)
    return current_parent


def attach_knowledge_folder_paths(db, documents: list[dict]) -> list[dict]:
    folders_by_id = {int(row["id"]): row for row in knowledge_folder_rows(db)}
    for document in documents:
        folder_id = int(document.get("folder_id") or 0) or None
        document["folder_path"] = knowledge_folder_path_from_map(folders_by_id, folder_id)
    return documents


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


def project_upload_folder(db, project_id: int, related_type: str, doc_type: str, folder_path: str = "") -> str:
    root = yandex_disk_root()
    if related_type == "knowledge_base":
        base = f"{root}/База знаний"
        if folder_path:
            for part in normalize_relative_path(folder_path):
                base = f"{base}/{yandex_path_part(part, 'folder')}"
            return base
        return f"{base}/{yandex_path_part(doc_type, 'documents')}"
    if related_type == "estimate_job":
        row = db.execute("SELECT title FROM estimate_jobs WHERE id = ?", (project_id,)).fetchone()
        title = row["title"] if row else f"estimate_job_{project_id}"
        return f"{root}/Сметы/{yandex_path_part(title, f'estimate_job_{project_id}')}/{yandex_path_part(doc_type, 'files')}"
    row = db.execute("SELECT title FROM projects WHERE id = ?", (project_id,)).fetchone()
    project_title = row["title"] if row else f"project_{project_id}"
    return f"{root}/Объекты/{yandex_path_part(project_title, f'project_{project_id}')}/{yandex_path_part(doc_type, 'documents')}"


def upload_to_yandex_disk(db, project_id: int, related_type: str, doc_type: str, target_name: str, raw: bytes, folder_path: str = "") -> str:
    folder = project_upload_folder(db, project_id, related_type, doc_type, folder_path)
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


def save_to_local_uploads(project_id: int, target_name: str, raw: bytes, folder_path: str = "") -> str:
    project_dir = UPLOAD_DIR / f"project_{project_id}"
    for part in normalize_relative_path(folder_path):
        project_dir = project_dir / yandex_path_part(part, "folder")
    project_dir.mkdir(parents=True, exist_ok=True)
    target_path = project_dir / target_name
    target_path.write_bytes(raw)
    return str(target_path.relative_to(DATA_DIR))


def save_uploaded_file(db, project_id: int, related_type: str, doc_type: str, target_name: str, raw: bytes, folder_path: str = "") -> str:
    if yandex_disk_configured():
        try:
            return upload_to_yandex_disk(db, project_id, related_type, doc_type, target_name, raw, folder_path)
        except (HTTPError, URLError, TimeoutError, RuntimeError, OSError) as exc:
            print(f"Yandex Disk upload failed, saved locally instead: {exc}")
    return save_to_local_uploads(project_id, target_name, raw, folder_path)


def download_from_yandex_disk(file_path: str) -> bytes:
    href = yandex_disk_download_url(file_path)
    with urlopen(href, timeout=120) as response:
        return response.read()


def yandex_disk_download_url(file_path: str) -> str:
    remote_path = str(file_path).removeprefix(YANDEX_DISK_FILE_PREFIX)
    payload = yandex_api_request("GET", "/resources/download", {"path": remote_path})
    href = payload.get("href")
    if not href:
        raise RuntimeError("Yandex Disk did not return download URL")
    return str(href)


def parse_range_header(range_header: str | None, file_size: int) -> tuple[int, int] | None:
    header = str(range_header or "").strip()
    if not header or not header.startswith("bytes=") or file_size <= 0:
        return None
    spec = header.removeprefix("bytes=").split(",", 1)[0].strip()
    if "-" not in spec:
        return None
    start_text, end_text = spec.split("-", 1)
    try:
        if start_text == "":
            suffix_length = int(end_text)
            if suffix_length <= 0:
                return None
            return max(file_size - suffix_length, 0), file_size - 1
        start = int(start_text)
        end = int(end_text) if end_text else file_size - 1
    except ValueError:
        return None
    if start < 0 or start >= file_size or end < start:
        return None
    return start, min(end, file_size - 1)


def stream_local_file(
    handler: BaseHTTPRequestHandler,
    file_path: Path,
    file_name: str,
    content_type: str,
) -> None:
    file_size = file_path.stat().st_size
    range_header = handler.headers.get("Range")
    byte_range = parse_range_header(range_header, file_size)
    if range_header and not byte_range:
        handler.send_response(416)
        handler.send_header("Content-Range", f"bytes */{file_size}")
        handler.send_header("Accept-Ranges", "bytes")
        handler.send_header("Content-Length", "0")
        handler.end_headers()
        return

    start, end = byte_range if byte_range else (0, max(file_size - 1, 0))
    content_length = max(end - start + 1, 0)
    handler.send_response(206 if byte_range else 200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Accept-Ranges", "bytes")
    handler.send_header("Content-Length", str(content_length))
    if byte_range:
        handler.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
    handler.send_header("Content-Disposition", f"inline; filename*=UTF-8''{quote(file_name)}")
    handler.send_header("Cache-Control", "private, max-age=300")
    handler.end_headers()

    if handler.command == "HEAD":
        return

    try:
        with file_path.open("rb") as source:
            source.seek(start)
            remaining = content_length
            while remaining > 0:
                chunk = source.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                handler.wfile.write(chunk)
                remaining -= len(chunk)
    except (BrokenPipeError, ConnectionResetError):
        return


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


def stored_file_name(file_path: str | None, fallback: str = "file") -> str:
    text = str(file_path or "").removeprefix(YANDEX_DISK_FILE_PREFIX)
    name = re.split(r"[\\/]+", text.strip("/\\"))[-1] if text else ""
    return safe_file_name(name or fallback)


def move_stored_file(db, document, folder_id: int | None) -> str | None:
    file_path = str(document["file_path"] or "")
    if not file_path:
        return None
    project_id = int(document["project_id"])
    doc_type = str(document["type"] or "documents")
    related_type = str(document["related_type"] or "project")
    folder_path = knowledge_folder_path(db, folder_id) if related_type == "knowledge_base" else ""
    target_name = stored_file_name(file_path, document["file_name"] or document["title"] or "file")

    if file_path.startswith(YANDEX_DISK_FILE_PREFIX):
        source_path = file_path.removeprefix(YANDEX_DISK_FILE_PREFIX)
        target_folder = project_upload_folder(db, project_id, related_type, doc_type, folder_path)
        target_path = f"{target_folder}/{target_name}"
        if source_path == target_path:
            return file_path
        ensure_yandex_folder(target_folder)
        yandex_api_request("POST", "/resources/move", {"from": source_path, "path": target_path, "overwrite": "true"})
        return f"{YANDEX_DISK_FILE_PREFIX}{target_path}"

    source_path = (DATA_DIR / file_path).resolve()
    if not source_path.is_file() or DATA_DIR.resolve() not in source_path.parents:
        return file_path
    target_dir = UPLOAD_DIR / f"project_{project_id}"
    for part in normalize_relative_path(folder_path):
        target_dir = target_dir / yandex_path_part(part, "folder")
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = (target_dir / target_name).resolve()
    if source_path == target_path:
        return file_path
    if DATA_DIR.resolve() not in target_path.parents:
        raise RuntimeError("Target path is outside data directory")
    if target_path.exists():
        target_path.unlink()
    shutil.move(str(source_path), str(target_path))
    return str(target_path.relative_to(DATA_DIR))


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


def save_document_file(
    db,
    project_id: int,
    file_data: dict,
    title: str,
    doc_type: str,
    related_type: str = "project",
    folder_id: int | None = None,
    folder_path: str = "",
    owner_id: int | None = None,
) -> int | None:
    file_name = safe_file_name(file_data.get("file_name") or title)
    encoded = file_data.get("file_base64") or ""
    if not encoded:
        return None
    if "," in encoded:
        encoded = encoded.split(",", 1)[1]
    raw = base64.b64decode(encoded)
    target_name = f"{int(time.time() * 1000)}_{file_name}"
    stored_path = save_uploaded_file(db, project_id, related_type, doc_type, target_name, raw, folder_path)
    cursor = db.execute(
        """
        INSERT INTO documents (
            project_id, folder_id, title, type, version, status, owner_id, due_date, related_type,
            related_section, contract_id, process_type, file_name, file_path, mime_type, file_size
        )
        VALUES (?, ?, ?, ?, '', 'active', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            project_id,
            folder_id,
            title,
            doc_type,
            owner_id or user_id_by_role(db, "sales_manager") or 3,
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


def save_task_event_attachments(db, *, project_id: int, event_id: int, attachments: list[dict], owner_id: int | None = None) -> list[int]:
    document_ids: list[int] = []
    for attachment in attachments or []:
        if not attachment or not attachment.get("file_base64"):
            continue
        payload = dict(attachment)
        payload["process_type"] = f"task_event:{event_id}"
        document_id = save_document_file(
            db,
            project_id,
            payload,
            payload.get("title") or payload.get("file_name") or "Вложение к задаче",
            "other",
            "task",
            owner_id=owner_id,
        )
        if document_id:
            document_ids.append(document_id)
    return document_ids


def save_process_attachments(
    db,
    *,
    project_id: int,
    attachments: list[dict],
    related_type: str,
    doc_type: str,
    process_type: str,
    owner_id: int | None = None,
) -> list[int]:
    document_ids: list[int] = []
    for attachment in attachments or []:
        if not isinstance(attachment, dict) or not attachment.get("file_base64"):
            continue
        payload = dict(attachment)
        payload["process_type"] = process_type
        document_id = save_document_file(
            db,
            project_id,
            payload,
            payload.get("title") or payload.get("file_name") or "Вложение",
            doc_type,
            related_type,
            owner_id=owner_id,
        )
        if document_id:
            document_ids.append(document_id)
    return document_ids


def photo_reports_payload(db, account: dict | None, project_id: int | None = None) -> list[dict]:
    params: list[object] = []
    where = "WHERE p.status != 'archived'"
    if project_id:
        where += " AND r.project_id = ?"
        params.append(project_id)
    rows = rows_to_dicts(
        db.execute(
            f"""
            SELECT r.*, p.title AS project_title, p.foreman_id, p.foreman_id AS project_foreman_id,
                   author.name AS author_name, author.role AS author_role
            FROM photo_reports r
            JOIN projects p ON p.id = r.project_id
            LEFT JOIN users author ON author.id = r.author_id
            {where}
            ORDER BY r.report_date DESC, r.created_at DESC, r.id DESC
            """,
            params,
        ).fetchall()
    )
    rows = [row for row in rows if project_visible_for_account(row, account)]
    if not rows:
        return []
    ids = [int(row["id"]) for row in rows]
    placeholders = ",".join("?" for _ in ids)
    document_rows = rows_to_dicts(
        db.execute(
            f"""
            SELECT prd.photo_report_id, d.*
            FROM photo_report_documents prd
            JOIN documents d ON d.id = prd.document_id
            WHERE prd.photo_report_id IN ({placeholders})
            ORDER BY d.created_at, d.id
            """,
            ids,
        ).fetchall()
    )
    docs_by_report: dict[int, list[dict]] = {}
    for doc in document_rows:
        docs_by_report.setdefault(int(doc["photo_report_id"]), []).append(doc)
    for row in rows:
        row["attachments"] = filter_documents_for_account(docs_by_report.get(int(row["id"]), []), account)
    return rows


def object_remarks_payload(db, account: dict | None, project_id: int | None = None) -> list[dict]:
    params: list[object] = []
    where = "WHERE p.status != 'archived'"
    if project_id:
        where += " AND r.project_id = ?"
        params.append(project_id)
    rows = rows_to_dicts(
        db.execute(
            f"""
            SELECT r.*, p.title AS project_title, p.foreman_id, p.foreman_id AS project_foreman_id,
                   responsible.name AS responsible_name,
                   checker.name AS checked_by_name,
                   creator.name AS created_by_name,
                   before_doc.title AS photo_before_title,
                   before_doc.file_name AS photo_before_file_name,
                   before_doc.mime_type AS photo_before_mime_type,
                   after_doc.title AS photo_after_title,
                   after_doc.file_name AS photo_after_file_name,
                   after_doc.mime_type AS photo_after_mime_type
            FROM object_remarks r
            JOIN projects p ON p.id = r.project_id
            LEFT JOIN users responsible ON responsible.id = r.responsible_id
            LEFT JOIN users checker ON checker.id = r.checked_by_id
            LEFT JOIN users creator ON creator.id = r.created_by
            LEFT JOIN documents before_doc ON before_doc.id = r.photo_before_document_id
            LEFT JOIN documents after_doc ON after_doc.id = r.photo_after_document_id
            {where}
            ORDER BY
                CASE r.status
                    WHEN 'returned' THEN 1
                    WHEN 'new' THEN 2
                    WHEN 'in_progress_task' THEN 3
                    WHEN 'completed_pending_acceptance' THEN 4
                    WHEN 'accepted' THEN 5
                    ELSE 6
                END,
                r.due_date,
                r.created_at DESC
            """,
            params,
        ).fetchall()
    )
    visible_rows = []
    for row in rows:
        if not project_visible_for_account(row, account):
            continue
        before_id = row.get("photo_before_document_id")
        after_id = row.get("photo_after_document_id")
        row["photo_before"] = (
            {
                "id": before_id,
                "title": row.get("photo_before_title"),
                "file_name": row.get("photo_before_file_name"),
                "mime_type": row.get("photo_before_mime_type"),
            }
            if before_id
            else None
        )
        row["photo_after"] = (
            {
                "id": after_id,
                "title": row.get("photo_after_title"),
                "file_name": row.get("photo_after_file_name"),
                "mime_type": row.get("photo_after_mime_type"),
            }
            if after_id
            else None
        )
        visible_rows.append(row)
    return visible_rows


def blockers_payload(db, account: dict | None, project_id: int | None = None) -> list[dict]:
    params: list[object] = []
    where = "WHERE p.status != 'archived'"
    if project_id:
        where += " AND b.project_id = ?"
        params.append(project_id)
    manual_rows = rows_to_dicts(
        db.execute(
            f"""
            SELECT b.*, p.title AS project_title, p.foreman_id, p.foreman_id AS project_foreman_id,
                   responsible.name AS responsible_name, creator.name AS created_by_name
            FROM blockers b
            JOIN projects p ON p.id = b.project_id
            LEFT JOIN users responsible ON responsible.id = b.responsible_user_id
            LEFT JOIN users creator ON creator.id = b.created_by
            {where}
            ORDER BY
                CASE b.status
                    WHEN 'open' THEN 1
                    WHEN 'in_progress' THEN 2
                    WHEN 'waiting_external' THEN 3
                    ELSE 4
                END,
                b.due_date,
                b.created_at DESC
            """,
            params,
        ).fetchall()
    )
    manual_rows = [row for row in manual_rows if project_visible_for_account(row, account)]
    rows: list[dict] = []
    for row in manual_rows:
        item = dict(row)
        item["source"] = "manual"
        rows.append(item)

    task_params: list[object] = []
    task_where = "WHERE p.status != 'archived' AND t.status NOT IN ('accepted', 'closed', 'archived')"
    if project_id:
        task_where += " AND t.project_id = ?"
        task_params.append(project_id)
    task_rows = rows_to_dicts(
        db.execute(
            f"""
            SELECT t.id AS linked_task_id, t.project_id, p.title AS project_title,
                   p.foreman_id, p.foreman_id AS project_foreman_id,
                   t.title, t.description, t.due_date, t.status, t.priority,
                   t.assignee_id AS responsible_user_id, assignee.name AS responsible_name,
                   t.creator_id AS created_by, creator.name AS created_by_name,
                   t.created_at
            FROM tasks t
            JOIN projects p ON p.id = t.project_id
            LEFT JOIN users assignee ON assignee.id = t.assignee_id
            LEFT JOIN users creator ON creator.id = t.creator_id
            {task_where}
              AND (
                    t.is_blocker = 1
                    OR t.status = 'returned'
                    OR (t.due_date IS NOT NULL AND date(t.due_date) < date('now'))
                    OR COALESCE(t.due_date, '') = ''
              )
            ORDER BY t.due_date, t.created_at DESC
            LIMIT 80
            """,
            task_params,
        ).fetchall()
    )
    for task in task_rows:
        if not project_visible_for_account(task, account):
            continue
        blocker_type = "other"
        severity = "medium"
        title = task.get("title") or "Задача требует внимания"
        if not task.get("due_date"):
            blocker_type = "other"
            severity = "low"
            title = f"Задача без срока: {title}"
        elif str(task.get("status") or "") == "returned":
            blocker_type = "quality_problem"
            severity = "medium"
            title = f"Возвращена задача: {title}"
        elif str(task.get("due_date") or "") < date.today().isoformat():
            blocker_type = "other"
            severity = "high"
            title = f"Просрочена задача: {title}"
        rows.append(
            {
                "id": f"task-{task['linked_task_id']}",
                "source": "task",
                "project_id": task["project_id"],
                "project_title": task["project_title"],
                "title": title,
                "description": task.get("description") or "",
                "blocker_type": blocker_type,
                "responsible_user_id": task.get("responsible_user_id"),
                "responsible_name": task.get("responsible_name"),
                "due_date": task.get("due_date"),
                "severity": severity,
                "status": "open",
                "linked_task_id": task.get("linked_task_id"),
                "linked_material_request_id": None,
                "linked_issue_id": None,
                "created_by": task.get("created_by"),
                "created_by_name": task.get("created_by_name"),
                "created_at": task.get("created_at"),
            }
        )

    material_params: list[object] = []
    material_where = "WHERE p.status != 'archived'"
    if project_id:
        material_where += " AND b.project_id = ?"
        material_params.append(project_id)
    material_rows = rows_to_dicts(
        db.execute(
            f"""
            SELECT b.id AS linked_material_request_id, b.project_id, p.title AS project_title,
                   p.foreman_id, p.foreman_id AS project_foreman_id,
                   b.needed_at AS due_date, b.status, b.delivery_urgency, b.comment,
                   b.revision_comment, b.procurement_comment, b.receipt_status,
                   b.actual_purchase_amount, b.created_at,
                   creator.id AS created_by, creator.name AS created_by_name,
                   procurement.id AS responsible_user_id, procurement.name AS responsible_name,
                   COUNT(m.id) AS items_count,
                   SUM(CASE WHEN COALESCE(m.change_type, '') != 'removed' THEN COALESCE(m.total_amount, 0) ELSE 0 END) AS planned_amount
            FROM material_request_batches b
            JOIN projects p ON p.id = b.project_id
            LEFT JOIN material_requests m ON m.batch_id = b.id
            LEFT JOIN users creator ON creator.id = b.creator_id
            LEFT JOIN users procurement ON procurement.id = p.procurement_manager_id
            {material_where}
            GROUP BY b.id
            HAVING b.is_blocker = 1
                OR b.status IN ('revision_requested', 'receipt_issue')
                OR b.delivery_urgency = 'urgent'
                OR (COALESCE(b.actual_purchase_amount, 0) > COALESCE(planned_amount, 0) AND COALESCE(planned_amount, 0) > 0)
            ORDER BY b.needed_at, b.created_at DESC
            LIMIT 80
            """,
            material_params,
        ).fetchall()
    )
    for batch in material_rows:
        if not project_visible_for_account(batch, account):
            continue
        status = str(batch.get("status") or "")
        blocker_type = "no_material"
        severity = "medium"
        title = f"Материал тормозит объект: {batch.get('items_count') or 0} позиций"
        if status == "receipt_issue":
            blocker_type = "quality_problem"
            severity = "high"
            title = "Проблема при приёмке материалов"
        elif status == "revision_requested":
            severity = "medium"
            title = "Заявка на материалы возвращена на уточнение"
        elif str(batch.get("delivery_urgency") or "") == "urgent":
            severity = "high"
            title = "Срочная заявка на материалы"
        rows.append(
            {
                "id": f"material-{batch['linked_material_request_id']}",
                "source": "material",
                "project_id": batch["project_id"],
                "project_title": batch["project_title"],
                "title": title,
                "description": batch.get("revision_comment") or batch.get("procurement_comment") or batch.get("comment") or "",
                "blocker_type": blocker_type,
                "responsible_user_id": batch.get("responsible_user_id"),
                "responsible_name": batch.get("responsible_name") or "Снабжение",
                "due_date": batch.get("due_date"),
                "severity": severity,
                "status": "open",
                "linked_task_id": None,
                "linked_material_request_id": batch.get("linked_material_request_id"),
                "linked_issue_id": None,
                "created_by": batch.get("created_by"),
                "created_by_name": batch.get("created_by_name"),
                "created_at": batch.get("created_at"),
            }
        )

    remark_params: list[object] = []
    remark_where = "WHERE p.status != 'archived' AND r.status NOT IN ('accepted', 'closed')"
    if project_id:
        remark_where += " AND r.project_id = ?"
        remark_params.append(project_id)
    remark_rows = rows_to_dicts(
        db.execute(
            f"""
            SELECT r.id AS linked_issue_id, r.project_id, p.title AS project_title,
                   p.foreman_id, p.foreman_id AS project_foreman_id,
                   r.description AS title, r.zone, r.due_date, r.status,
                   r.responsible_id AS responsible_user_id, responsible.name AS responsible_name,
                   r.created_by, creator.name AS created_by_name, r.created_at
            FROM object_remarks r
            JOIN projects p ON p.id = r.project_id
            LEFT JOIN users responsible ON responsible.id = r.responsible_id
            LEFT JOIN users creator ON creator.id = r.created_by
            {remark_where}
              AND (
                    r.is_blocker = 1
                    OR r.status = 'returned'
                    OR (r.due_date IS NOT NULL AND date(r.due_date) < date('now'))
              )
            ORDER BY r.due_date, r.created_at DESC
            LIMIT 80
            """,
            remark_params,
        ).fetchall()
    )
    for remark in remark_rows:
        if not project_visible_for_account(remark, account):
            continue
        rows.append(
            {
                "id": f"issue-{remark['linked_issue_id']}",
                "source": "issue",
                "project_id": remark["project_id"],
                "project_title": remark["project_title"],
                "title": f"Замечание тормозит объект: {remark.get('title') or 'без описания'}",
                "description": remark.get("zone") or "",
                "blocker_type": "quality_problem",
                "responsible_user_id": remark.get("responsible_user_id"),
                "responsible_name": remark.get("responsible_name"),
                "due_date": remark.get("due_date"),
                "severity": "high" if str(remark.get("due_date") or "") < date.today().isoformat() else "medium",
                "status": "open",
                "linked_task_id": None,
                "linked_material_request_id": None,
                "linked_issue_id": remark.get("linked_issue_id"),
                "created_by": remark.get("created_by"),
                "created_by_name": remark.get("created_by_name"),
                "created_at": remark.get("created_at"),
            }
        )

    return rows


def save_estimate_job_file(
    db,
    estimate_job_id: int,
    file_data: dict,
    uploaded_by: int | None = None,
    replace_file_id: int | None = None,
    replacement_note: str = "",
) -> int | None:
    file_name = safe_file_name(file_data.get("file_name") or file_data.get("title") or "file")
    encoded = file_data.get("file_base64") or ""
    if not encoded:
        return None
    if "," in encoded:
        encoded = encoded.split(",", 1)[1]
    raw = base64.b64decode(encoded)
    target_name = f"{int(time.time() * 1000)}_{file_name}"
    stored_path = save_uploaded_file(db, estimate_job_id, "estimate_job", "attachments", target_name, raw)
    replaced_file = None
    version_no = 1
    if replace_file_id:
        replaced_file = db.execute(
            "SELECT * FROM estimate_job_files WHERE id = ? AND estimate_job_id = ?",
            (replace_file_id, estimate_job_id),
        ).fetchone()
        if replaced_file:
            version_no = int(replaced_file["version_no"] or 1) + 1
            db.execute(
                """
                UPDATE estimate_job_files
                SET is_current = 0,
                    replaced_at = CURRENT_TIMESTAMP,
                    replacement_note = ?
                WHERE id = ?
                """,
                (replacement_note, int(replaced_file["id"])),
            )
    cursor = db.execute(
        """
        INSERT INTO estimate_job_files (
            estimate_job_id, title, file_name, file_path, mime_type, file_size,
            version_no, is_current, replaced_file_id, replacement_note, uploaded_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        """,
        (
            estimate_job_id,
            str(file_data.get("title") or (replaced_file["title"] if replaced_file else "") or file_name).strip() or file_name,
            file_name,
            stored_path,
            file_data.get("mime_type") or mimetypes.guess_type(file_name)[0] or "application/octet-stream",
            len(raw),
            version_no,
            int(replaced_file["id"]) if replaced_file else None,
            replacement_note,
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
        detail["tasks"] = normalize_task_rows(attach_task_events(
            db,
            rows_to_dicts(
                db.execute(
                    """
                    SELECT t.*, assignee.name AS assignee_name, creator.name AS creator_name, reviewer.name AS reviewer_name,
                           c.title AS contract_title, c.type AS contract_type
                    FROM tasks t
                    LEFT JOIN users assignee ON assignee.id = t.assignee_id
                    LEFT JOIN users creator ON creator.id = t.creator_id
                    LEFT JOIN users reviewer ON reviewer.id = t.reviewer_id
                    LEFT JOIN contracts c ON c.id = t.contract_id
                    WHERE t.project_id = ?
                    ORDER BY t.due_date
                    """,
                    (project_id,),
                ).fetchall()
            ),
        ))
        detail["materials"] = rows_to_dicts(
            db.execute(
                """
                SELECT m.*, em.name AS estimate_material_name, em.unit AS estimate_material_unit,
                       em.estimated_quantity, em.unit_price,
                       creator.name AS creator_name, creator.role AS creator_role,
                       p.foreman_id AS project_foreman_id, p.title AS project_title,
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
                      b.actual_purchase_amount AS batch_actual_purchase_amount,
                      source_variation.id AS batch_variation_id,
                      source_variation.title AS batch_variation_title,
                      source_variation.status AS batch_variation_status,
                      b.created_at AS batch_created_at
                FROM material_requests m
                LEFT JOIN projects p ON p.id = m.project_id
                LEFT JOIN material_request_batches b ON b.id = m.batch_id
                LEFT JOIN estimate_materials em ON em.id = m.estimate_material_id
                LEFT JOIN users creator ON creator.id = m.creator_id
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
        detail["photo_reports"] = photo_reports_payload(db, account, project_id)
        detail["object_remarks"] = object_remarks_payload(db, account, project_id)
        detail["blockers"] = blockers_payload(db, account, project_id)
        detail["documents"] = filter_documents_for_account(
            rows_to_dicts(db.execute("SELECT * FROM documents WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall()),
            account,
        )
        detail["events"] = rows_to_dicts(
            db.execute(
                """
                SELECT e.*, u.name AS author_name, u.role AS author_role
                FROM events e
                LEFT JOIN users u ON u.id = e.author_id
                WHERE e.project_id = ?
                ORDER BY e.created_at DESC
                """,
                (project_id,),
            ).fetchall()
        )
        detail["notifications"] = rows_to_dicts(db.execute("SELECT * FROM notifications WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall())
        detail = sanitize_project_for_account(detail, account)
        return detail


class AppHandler(BaseHTTPRequestHandler):
    def do_HEAD(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path != "/health" and not is_authorized(self):
            if path.startswith("/api/"):
                self.send_response(401)
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", "0")
                self.end_headers()
            else:
                next_path = path + (f"?{parsed.query}" if parsed.query else "")
                redirect_response(self, login_location(next_path))
            return
        if path == "/health":
            self.send_response(200)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        document_download = re.match(r"^/api/documents/(\d+)/download$", path)
        if document_download:
            self.serve_document_download(int(document_download.group(1)))
            return
        estimate_job_file_download = re.match(r"^/api/estimate-job-files/(\d+)/download$", path)
        if estimate_job_file_download:
            self.serve_estimate_job_file_download(int(estimate_job_file_download.group(1)))
            return
        self.send_error(404)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        audit_login = re.match(r"^/ai-audit-login/([^/]+)$", path)
        if audit_login:
            self.handle_ai_audit_login(unquote(audit_login.group(1)))
            return
        audit_snapshot = re.match(r"^/ai-audit-snapshot/([^/]+)$", path)
        if audit_snapshot:
            self.handle_ai_audit_snapshot(unquote(audit_snapshot.group(1)))
            return
        if path == "/logout":
            logout_response(self)
            return
        if path == "/login":
            if is_authorized(self):
                redirect_response(self, "/")
                return
            self.serve_static("login.html")
            return
        if path == "/sw.js":
            self.serve_static("sw.js")
            return
        if path.startswith("/static/"):
            self.serve_static(path.replace("/static/", "", 1))
            return
        if path != "/health" and not is_authorized(self):
            if path.startswith("/api/"):
                api_auth_required_response(self)
            else:
                next_path = path + (f"?{parsed.query}" if parsed.query else "")
                redirect_response(self, login_location(next_path))
            return
        spa_routes = {
            "/",
            "/today",
            "/objects",
            "/tasks",
            "/materials",
            "/photo-reports",
            "/object-issues",
            "/documents",
            "/signals",
            "/feedback",
            "/settings",
            "/estimates",
            "/works",
            "/variations",
            "/locations",
        }
        if path in spa_routes:
            self.serve_static("index.html")
            return
        if path == "/health":
            json_response(self, {"status": "ok"})
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
        if parsed.path == "/api/login":
            try:
                self.handle_login(read_json(self))
            except Exception:
                json_response(self, {"error": "Не удалось прочитать данные входа"}, 400)
            return
        if is_authorized(self) and is_read_only_account(current_access_account(self)):
            json_response(self, {"error": "Режим ИИ-аудитора: изменения запрещены."}, 403)
            return
        if not parsed.path.startswith("/api/"):
            self.send_error(404)
            return
        if not is_authorized(self):
            api_auth_required_response(self)
            return
        if is_read_only_account(current_access_account(self)):
            json_response(self, {"error": "Режим ИИ-аудитора: изменения запрещены."}, 403)
            return
        try:
            self.handle_api_post(parsed.path, read_json(self))
        except PermissionError as exc:
            json_response(self, {"error": str(exc)}, 403)
        except Exception as exc:
            json_response(self, {"error": str(exc)}, 400)

    def reject_mutating_method(self) -> None:
        if not is_authorized(self):
            api_auth_required_response(self)
            return
        if is_read_only_account(current_access_account(self)):
            json_response(self, {"error": "Режим ИИ-аудитора: изменения запрещены."}, 403)
            return
        self.send_error(405)

    def do_PUT(self) -> None:
        self.reject_mutating_method()

    def do_PATCH(self) -> None:
        self.reject_mutating_method()

    def do_DELETE(self) -> None:
        self.reject_mutating_method()

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
        if file_path.name == "login.html":
            self.send_header("Cache-Control", "no-store")
        elif file_path.name == "sw.js":
            self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        write_response_body(self, body)

    def handle_login(self, data: dict) -> None:
        login = str(data.get("login") or data.get("username") or "").strip()
        password = str(data.get("password") or "").strip()
        account = authenticate_access_account(login, password)
        if not account:
            json_response(self, {"error": "Логин или пароль не подошли"}, 401)
            return
        self._access_account_checked = True
        self._access_account = account
        self._issue_session_cookie = True
        json_response(self, {"ok": True, "redirect": safe_next_path(str(data.get("next") or "/"))})

    def audit_login_diagnostic_page(self, diagnostic: dict, *, session_created: bool, redirect_target: str = "/", cookie: str | None = None, status: int = 200) -> None:
        valid = bool(diagnostic.get("valid"))
        title = "AI-аудит: вход разрешён" if valid and session_created else "AI-аудит: вход не выполнен"
        reason = diagnostic.get("reason") or ("OK" if valid else "Причина не указана")
        meta_refresh = f'<meta http-equiv="refresh" content="1; url={html.escape(redirect_target, quote=True)}" />' if valid and session_created else ""
        body = f"""<!doctype html>
        <html lang="ru">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="robots" content="noindex" />
          {meta_refresh}
          <title>{html.escape(title)}</title>
          <style>
            body {{ margin:0; min-height:100vh; display:grid; place-items:center; background:#f4f6f8; font-family:Segoe UI, Arial, sans-serif; color:#142127; }}
            main {{ width:min(560px, calc(100% - 28px)); background:white; border:1px solid #d8e0e4; border-radius:10px; padding:22px; box-shadow:0 18px 48px rgba(20,33,39,.12); }}
            h1 {{ margin:0 0 8px; font-size:24px; }}
            .status {{ display:inline-flex; padding:5px 10px; border-radius:999px; background:{'#e6f5eb' if valid and session_created else '#f8e8e8'}; color:{'#287347' if valid and session_created else '#b94646'}; font-weight:700; }}
            .grid {{ display:grid; gap:8px; margin:18px 0; }}
            .row {{ display:grid; grid-template-columns:1fr auto; gap:12px; border-bottom:1px solid #eef2f4; padding-bottom:7px; }}
            a {{ display:inline-flex; justify-content:center; min-height:40px; align-items:center; border-radius:8px; border:0; padding:0 14px; background:#206f68; color:white; text-decoration:none; font-weight:700; }}
            .muted {{ color:#66737c; }}
          </style>
        </head>
        <body>
          <main>
            <span class="status">{'token valid' if valid else 'token invalid'}</span>
            <h1>{html.escape(title)}</h1>
            <p class="muted">Токен в открытом виде не показывается и не записывается в журнал.</p>
            <div class="grid">
              <div class="row"><span>reason</span><strong>{html.escape(str(reason))}</strong></div>
              <div class="row"><span>expires_at</span><strong>{html.escape(str(diagnostic.get('expires_at') or 'не задан'))}</strong></div>
              <div class="row"><span>uses_left</span><strong>{html.escape(str(diagnostic.get('uses_left') or 0))}</strong></div>
              <div class="row"><span>session_created</span><strong>{'true' if session_created else 'false'}</strong></div>
              <div class="row"><span>redirect_target</span><strong>{html.escape(redirect_target if session_created else '/login')}</strong></div>
            </div>
            {'<a href="' + html.escape(redirect_target, quote=True) + '">Открыть приложение в режиме аудита</a>' if session_created else '<a href="/login?audit_error=invalid">Перейти на вход</a>'}
          </main>
        </body>
        </html>"""
        html_response(self, body, status=status, cookie=cookie)

    def audit_invalid_redirect(self, diagnostic: dict | None = None) -> None:
        self.audit_login_diagnostic_page(
            diagnostic or {"valid": False, "reason": "Токен невалиден", "expires_at": "", "uses_left": 0},
            session_created=False,
            status=401,
            cookie=expired_session_cookie(self),
        )

    def handle_ai_audit_login(self, raw_token: str) -> None:
        with connect() as db:
            diagnostic = audit_token_diagnostic(db, raw_token)
            token_row = validate_audit_token(db, raw_token, consume=True)
        if not token_row:
            self.audit_invalid_redirect(diagnostic)
            return
        account = audit_account_from_token_row(token_row)
        self._access_account_checked = True
        self._access_account = account
        self._issue_session_cookie = False
        diagnostic["used_count"] = int(diagnostic.get("used_count") or 0) + 1
        self.audit_login_diagnostic_page(
            diagnostic,
            session_created=True,
            redirect_target="/?view=today&audit=1",
            cookie=session_cookie_header(self, account, force_secure=session_cookie_secure(self)),
        )

    def handle_ai_audit_snapshot(self, raw_token: str) -> None:
        with connect() as db:
            token_row = validate_audit_token(db, raw_token, consume=False)
            if not token_row:
                self.audit_invalid_redirect()
                return
            account = audit_account_from_token_row(token_row)
            summary = {
                "projects": db.execute("SELECT COUNT(*) AS count FROM projects WHERE status != 'archived' AND COALESCE(bitrix_ref, '') != '__knowledge_base__'").fetchone()["count"],
                "task_waiting": db.execute("SELECT COUNT(*) AS count FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.status != 'archived' AND t.status = 'completed_pending_acceptance'").fetchone()["count"],
                "task_returned": db.execute("SELECT COUNT(*) AS count FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.status != 'archived' AND t.status = 'returned'").fetchone()["count"],
                "estimate_jobs_open": db.execute("SELECT COUNT(*) AS count FROM estimate_jobs WHERE status IN ('estimate_new', 'estimate_in_work', 'estimate_returned', 'estimate_question')").fetchone()["count"],
            }
            project_rows = rows_to_dicts(
                db.execute(
                    """
                    SELECT p.*, foreman.name AS foreman_name, estimator.name AS estimator_name,
                           procurement.name AS procurement_name, tech.name AS tech_supervisor_name,
                           customer.phone AS customer_phone, customer.email AS customer_email
                    FROM projects p
                    LEFT JOIN customers customer ON customer.id = p.customer_id
                    LEFT JOIN users foreman ON foreman.id = p.foreman_id
                    LEFT JOIN users estimator ON estimator.id = p.estimator_id
                    LEFT JOIN users procurement ON procurement.id = p.procurement_manager_id
                    LEFT JOIN users tech ON tech.id = p.tech_supervisor_id
                    WHERE p.status != 'archived'
                      AND COALESCE(p.bitrix_ref, '') != '__knowledge_base__'
                    ORDER BY p.updated_at DESC
                    LIMIT 3
                    """
                ).fetchall()
            )
            project_rows = [sanitize_project_for_account(row, account) for row in project_rows]
            project_ids = [int(row["id"]) for row in project_rows]
            task_rows = rows_to_dicts(
                db.execute(
                    """
                    SELECT t.*, p.title AS project_title, assignee.name AS assignee_name,
                           creator.name AS creator_name, reviewer.name AS reviewer_name
                    FROM tasks t
                    JOIN projects p ON p.id = t.project_id
                    LEFT JOIN users assignee ON assignee.id = t.assignee_id
                    LEFT JOIN users creator ON creator.id = t.creator_id
                    LEFT JOIN users reviewer ON reviewer.id = t.reviewer_id
                    WHERE p.status != 'archived'
                    ORDER BY t.created_at DESC
                    LIMIT 4
                    """
                ).fetchall()
            )
            task_rows = normalize_task_rows(sanitize_tasks_for_account(task_rows, account))
            material_rows = rows_to_dicts(
                db.execute(
                    """
                    SELECT m.*, p.title AS project_title, b.status AS batch_status,
                           b.delivery_urgency AS batch_delivery_urgency,
                           b.receipt_status AS receipt_status,
                           b.actual_purchase_amount AS actual_purchase_amount,
                           m.total_amount AS batch_total_amount
                    FROM material_requests m
                    JOIN projects p ON p.id = m.project_id
                    LEFT JOIN material_request_batches b ON b.id = m.batch_id
                    ORDER BY COALESCE(b.created_at, m.created_at) DESC
                    LIMIT 4
                    """
                ).fetchall()
            )
            material_rows = sanitize_material_rows_for_account(material_rows, account)
            photo_rows = sanitize_documents_for_account(photo_reports_payload(db, account), account)
            remark_rows = object_remarks_payload(db, account)
            blocker_rows = blockers_payload(db, account)[:6]
            document_rows = sanitize_documents_for_account(
                rows_to_dicts(
                    db.execute(
                        """
                        SELECT d.*, p.title AS project_title
                        FROM documents d
                        LEFT JOIN projects p ON p.id = d.project_id
                        WHERE COALESCE(d.related_type, 'project') != 'knowledge_base'
                        ORDER BY d.created_at DESC
                        LIMIT 4
                        """
                    ).fetchall()
                ),
                account,
            )
            notification_rows = sanitize_notifications_for_account(
                rows_to_dicts(
                    db.execute(
                        """
                        SELECT n.*, p.title AS project_title
                        FROM notifications n
                        LEFT JOIN projects p ON p.id = n.project_id
                        ORDER BY n.created_at DESC, n.id DESC
                        LIMIT 5
                        """
                    ).fetchall()
                ),
                account,
            )
            feedback_rows = sanitize_feedback_items_for_account(
                rows_to_dicts(
                    db.execute(
                        """
                        SELECT *
                        FROM feedback_items
                        ORDER BY created_at DESC, id DESC
                        LIMIT 3
                        """
                    ).fetchall()
                ),
                account,
            )
            user_rows = sanitize_users_for_account(rows_to_dicts(db.execute("SELECT * FROM users WHERE is_active = 1 ORDER BY id LIMIT 6").fetchall()), account)

        status_map, role_map, type_map = frontend_label_maps()
        feature_flags = snapshot_feature_flags()
        generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
        app_version = frontend_asset_version()
        commit_hash = current_commit_hash()
        qa_report = latest_qa_report()
        qa_checks = qa_report.get("checks") if isinstance(qa_report.get("checks"), dict) else {}
        qa_overall = str(qa_report.get("overall") or "not_run")
        qa_generated_at = str(qa_report.get("generatedAt") or "not_run")
        qa_app_version = str(qa_report.get("appVersion") or app_version or "unknown")
        qa_commit = str(qa_report.get("commit") or commit_hash or "unknown")
        qa_environment = "production" if session_cookie_secure(self) else "local"
        token_uses_left = "без лимита" if int(token_row.get("unlimited_until_expiry") or 0) == 1 else max(0, int(token_row.get("max_uses") or 0) - int(token_row.get("used_count") or 0))

        def e(value: object) -> str:
            return html.escape(snapshot_clean_text(value, status_map), quote=True)

        def label(mapping: dict[str, str], value: object, fallback: str = "Не задано") -> str:
            return snapshot_label(mapping, value, fallback)

        def status_level(value: object) -> str:
            key = str(value or "")
            if key in {"overdue", "danger", "problem", "returned", "revision_requested", "rejected", "receipt_issue", "no_material", "quality_problem", "critical", "high"}:
                return "danger"
            if key in {"warning", "review", "completed_pending_acceptance", "estimate_question", "estimate_returned", "submitted_to_construction", "decision_required", "need_approval", "estimate_hold", "new", "feedback_new", "open", "waiting_external", "waiting_client_decision", "waiting_owner_decision", "waiting_project_documentation", "estimate_not_approved", "subcontractor_problem", "no_photo_report", "medium", "check", "approval"}:
                return "warning"
            if key in {"success", "accepted", "approved", "closed", "completed", "received", "on_site", "agreed", "done", "feedback_done", "estimate_done"}:
                return "success"
            if key in {"blue", "in_progress", "in_progress_task", "ordered", "in_transit", "delivery_scheduled", "delivery_confirmed", "estimate_in_work", "in_review", "active", "in_work", "feedback_in_work"}:
                return "blue"
            return "neutral"

        def badge(text: object, level: str = "neutral") -> str:
            return f'<span class="badge {e(level)}">{e(text)}</span>'

        def status_badge(value: object) -> str:
            return badge(label(status_map, value), status_level(value))

        def type_badge(value: object) -> str:
            return badge(label(type_map, value, "Не разобрано"), "neutral")

        def chips(items: list[str]) -> str:
            return "".join(f'<span class="chip">{e(item)}</span>' for item in items if str(item or "").strip())

        def rows(items: list[dict], renderer, empty: str = "Примеров пока нет") -> str:
            if not items:
                return f'<p class="muted">{e(empty)}</p>'
            return "".join(renderer(item) for item in items)

        def block(title: str, actions: list[str], visible: list[str], body: str, mobile: bool = False) -> str:
            device_class = " phone-frame" if mobile else ""
            return f"""
            <section class="snapshot-block{device_class}">
              <header>
                <h2>{e(title)}</h2>
                <div class="chips">{chips(visible)}</div>
              </header>
              <div class="snapshot-render">{body}</div>
              <footer>
                <strong>Основные действия:</strong>
                <div class="chips actions">{chips(actions)}</div>
              </footer>
            </section>
            """

        def feature_row(name: str, enabled: bool) -> str:
            value = "true" if enabled else "false"
            missing = "" if enabled else f'<small class="missing">Фича не внедрена: {e(name)}</small>'
            return f'<div class="meta-row"><span><code>{e(name)}</code></span><strong>{value}</strong>{missing}</div>'

        def qa_row(key: str, title: str) -> str:
            value = qa_snapshot_status(qa_report, key)
            level = "success" if value == "ok" else "danger" if value == "failed" else "neutral"
            return f'<div class="meta-row"><span><code>{e(key)}</code> {e(title)}</span>{badge(value, level)}</div>'

        def project_tasks(project_id: int) -> list[dict]:
            return [task for task in task_rows if int(task.get("project_id") or 0) == project_id]

        def project_materials(project_id: int) -> list[dict]:
            return [row for row in material_rows if int(row.get("project_id") or 0) == project_id]

        def latest_photo_date(project_id: int) -> str:
            dates = [str(row.get("report_date") or row.get("created_at") or "")[:10] for row in photo_rows if int(row.get("project_id") or 0) == project_id]
            return sorted([item for item in dates if item])[-1] if dates else ""

        def material_is_risky(row: dict) -> bool:
            pipeline = snapshot_material_pipeline_status(row)
            actual = float(row.get("actual_purchase_amount") or 0)
            planned = float(row.get("batch_total_amount") or row.get("total_amount") or 0)
            return pipeline == "problem" or str(row.get("batch_status") or row.get("status") or "") in {"returned", "revision_requested"} or str(row.get("batch_delivery_urgency") or "") == "urgent" or (actual > planned > 0)

        def project_attention(project: dict) -> list[tuple[str, int, str]]:
            pid = int(project.get("id") or 0)
            tasks = project_tasks(pid)
            materials = project_materials(pid)
            remarks = [row for row in remark_rows if int(row.get("project_id") or 0) == pid]
            items: list[tuple[str, int, str]] = []
            overdue = [task for task in tasks if snapshot_task_is_overdue(task)]
            returned = [task for task in tasks if str(task.get("status") or "") == "returned"]
            risky = [row for row in materials if material_is_risky(row)]
            open_remarks = [row for row in remarks if str(row.get("status") or "") not in {"accepted", "closed"}]
            if overdue:
                items.append(("Просроченные задачи", len(overdue), "danger"))
            if returned:
                items.append(("Возвращённые задачи", len(returned), "warning"))
            if risky:
                items.append(("Материалы с проблемами", len(risky), "danger"))
            if open_remarks:
                items.append(("Незакрытые замечания", len(open_remarks), "warning"))
            return items

        def project_card(project: dict) -> str:
            pid = int(project.get("id") or 0)
            tasks = project_tasks(pid)
            materials = project_materials(pid)
            open_tasks = [task for task in tasks if snapshot_task_is_open(task)]
            overdue = [task for task in tasks if snapshot_task_is_overdue(task)]
            risky = [row for row in materials if material_is_risky(row)]
            attention = project_attention(project)
            return f"""
            <article class="sample-row">
              <div class="row-head"><strong>{e(project.get("title") or "Объект")}</strong>{status_badge(project.get("status"))}</div>
              <div class="muted">Ответственный: {e(project.get("foreman_name") or "прораб не назначен")} · этап: {e(label(status_map, project.get("stage") or project.get("status")))}</div>
              <div class="metrics">
                {badge(f"открытые задачи: {len(open_tasks)}", "blue" if open_tasks else "neutral")}
                {badge(f"просрочено: {len(overdue)}", "danger" if overdue else "neutral")}
                {badge(f"материалы под риском: {len(risky)}", "warning" if risky else "neutral")}
              </div>
              <div class="muted">последний фотоотчёт: {e(latest_photo_date(pid) or "не найден")}</div>
              <div class="attention-mini"><strong>Что требует внимания</strong>{chips([f"{title}: {count}" for title, count, _ in attention]) or '<span class="muted">Критичных сигналов нет</span>'}</div>
            </article>
            """

        def task_card(task: dict) -> str:
            return f"""
            <article class="sample-row">
              <div class="row-head"><span>{type_badge(task.get("task_type") or "task")} <strong>{e(task.get("title") or "Задача")}</strong></span>{status_badge(task.get("status"))}</div>
              <div class="muted">{e(task.get("project_title") or "Объект не указан")} · ответственный: {e(task.get("assignee_name") or "не назначен")}</div>
              <div class="chips">{badge(task.get("due_date") or "без срока", "danger" if snapshot_task_is_overdue(task) else "neutral")}</div>
              <p class="short-description">{e(task.get("description") or "")}</p>
            </article>
            """

        def material_card(row: dict) -> str:
            pipeline = snapshot_material_pipeline_status(row)
            urgent = str(row.get("batch_delivery_urgency") or "") == "urgent"
            return f"""
            <article class="sample-row">
              <div class="row-head"><strong>{e(row.get("title") or "Материал")}</strong>{status_badge(pipeline)}</div>
              <div class="chips">{type_badge(row.get("basis_type"))}{badge("Срочно", "danger") if urgent else ""}</div>
              <div class="muted">{e(row.get("project_title") or "Объект не указан")} · количество: {e(row.get("requested_quantity") or row.get("quantity") or "не задано")} · срок: {e(row.get("needed_at") or "без срока")}</div>
            </article>
            """

        def snapshot_document_type(row: dict) -> str:
            raw = str(row.get("type") or "").strip()
            if raw == "project_documentation":
                return "project"
            if raw in {"smetter_materials", "smetter_work_task", "variation_estimate"}:
                return "estimate"
            if raw in {"contract", "additional_agreement"}:
                return "contract"
            if raw in {"act", "ks_2", "ks_3"}:
                return "act"
            if raw == "media":
                return "photo_video"
            if raw == "variation_attachment":
                return "extra_work_attachment"
            if raw == "service_file":
                return "service_screenshot"
            if raw in {"invoice", "photo_video", "extra_work_attachment", "service_screenshot", "other"}:
                return raw
            name = f"{row.get('title') or ''} {row.get('file_name') or ''}".lower()
            mime = str(row.get("mime_type") or "").lower()
            process_type = str(row.get("process_type") or "").lower()
            if process_type.startswith("variation:"):
                return "extra_work_attachment"
            if mime.startswith("image/") or mime.startswith("video/"):
                if re.search(r"кнопка|экран|ошибка|скрин|screenshot|feedback|интерфейс", name):
                    return "service_screenshot"
                return "photo_video"
            if re.search(r"проект|узел|решени", name):
                return "project"
            if re.search(r"смет|задани[ея]\s+на\s+работ|smetter|work_assignment|purchase", name):
                return "estimate"
            if re.search(r"договор|допник|доп\.?\s*соглаш|contract", name):
                return "contract"
            if re.search(r"\bакт\b|кс-?2|кс-?3", name):
                return "act"
            if re.search(r"сч[её]т|invoice", name):
                return "invoice"
            if re.search(r"скрин|служеб|интерфейс|feedback", name):
                return "service_screenshot"
            return "unclassified" if not raw else "other"

        def document_card(row: dict) -> str:
            return f"""
            <article class="sample-row">
              <div class="row-head"><strong>{e(row.get("title") or row.get("file_name") or "Документ")}</strong>{type_badge(snapshot_document_type(row))}</div>
              <div class="muted">{e(row.get("project_title") or "без объекта")} · файл скрыт в режиме аудита</div>
            </article>
            """

        def photo_card(row: dict) -> str:
            attachments = row.get("attachments") or []
            return f"""
            <article class="sample-row">
              <div class="row-head"><strong>{e(row.get("project_title") or "Фотоотчёт")}</strong>{status_badge(row.get("review_status") or "review")}</div>
              <div class="chips">{type_badge("photo_report")}{badge(f"файлов: {len(attachments)}", "blue" if attachments else "neutral")}</div>
              <div class="muted">дата: {e(row.get("report_date") or row.get("created_at") or "не задана")} · автор: {e(row.get("author_name") or "не указан")}</div>
            </article>
            """

        def remark_card(row: dict) -> str:
            return f"""
            <article class="sample-row">
              <div class="row-head"><strong>{e(row.get("description") or "Замечание")}</strong>{status_badge(row.get("status"))}</div>
              <div class="chips">{type_badge("object_remark")}{badge(row.get("due_date") or "без срока", "neutral")}</div>
              <div class="muted">{e(row.get("project_title") or "Объект не указан")} · ответственный: {e(row.get("responsible_name") or "не назначен")}</div>
            </article>
            """

        def feedback_card(row: dict) -> str:
            return f"""
            <article class="sample-row">
              <div class="row-head"><strong>{e(row.get("sender_name") or "Автор скрыт")}</strong>{status_badge(row.get("status"))}</div>
              <p>{e(row.get("text") or "Без текста")}</p>
            </article>
            """

        def blocker_card(row: dict) -> str:
            return f"""
            <article class="sample-row">
              <div class="row-head"><strong>{e(row.get("title") or "Блокер объекта")}</strong>{status_badge(row.get("status") or "open")}</div>
              <div class="chips">{type_badge(row.get("blocker_type") or "other")}{badge(label(status_map, row.get("severity") or "medium"), status_level(row.get("severity") or "medium"))}</div>
              <div class="muted">{e(row.get("project_title") or "Объект не указан")} · ответственный: {e(row.get("responsible_name") or "не назначен")} · срок: {e(row.get("due_date") or "без срока")}</div>
            </article>
            """

        def user_card(row: dict) -> str:
            return f"""
            <article class="sample-row">
              <div class="row-head"><strong>{e(row.get("name") or "Сотрудник")}</strong>{badge(label(role_map, row.get("role"), "Роль скрыта"))}</div>
              <div class="muted">контакты скрыты в режиме аудита</div>
            </article>
            """

        today = date.today().isoformat()
        today_tasks = [task for task in task_rows if snapshot_task_is_open(task) and str(task.get("due_date") or "") == today]
        overdue_tasks = [task for task in task_rows if snapshot_task_is_overdue(task)]
        returned_tasks = [task for task in task_rows if str(task.get("status") or "") == "returned"]
        waiting_tasks = [task for task in task_rows if str(task.get("status") or "") == "completed_pending_acceptance"]
        risky_materials = [row for row in material_rows if material_is_risky(row)]
        no_photo_projects = [project for project in project_rows if int(project.get("id") or 0) not in {int(row.get("project_id") or 0) for row in photo_rows if str(row.get("report_date") or row.get("created_at") or "")[:10] == today}]

        def decision_card(item: dict) -> str:
            return f"""
            <article class="sample-row decision-row">
              <div class="row-head"><strong>{e(item.get("type"))}: {e(item.get("object"))} — {e(item.get("title"))}</strong>{badge(item.get("criticality"), item.get("level") or "neutral")}</div>
              <div class="muted">Ответственный: {e(item.get("responsible"))} · Срок: {e(item.get("due"))}</div>
              <div class="chips">{badge(item.get("action") or "Открыть", "blue")}</div>
            </article>
            """

        decision_items: list[dict] = []
        for task in overdue_tasks[:4]:
            decision_items.append({"type": "Просрочено", "object": task.get("project_title") or "Объект", "title": task.get("title") or "Задача", "responsible": task.get("assignee_name") or "не назначен", "due": task.get("due_date") or "без срока", "criticality": "Высокая", "level": "danger", "action": "Открыть задачу"})
        for task in returned_tasks[:4]:
            decision_items.append({"type": "Возвращено", "object": task.get("project_title") or "Объект", "title": task.get("title") or "Задача", "responsible": task.get("assignee_name") or "не назначен", "due": task.get("due_date") or "без срока", "criticality": "Средняя", "level": "warning", "action": "Открыть задачу"})
        for task in waiting_tasks[:4]:
            decision_items.append({"type": "Ждёт проверки", "object": task.get("project_title") or "Объект", "title": task.get("title") or "Задача", "responsible": task.get("reviewer_name") or "не назначен", "due": task.get("due_date") or "без срока", "criticality": "Рабочая", "level": "blue", "action": "Открыть задачу"})
        for row in risky_materials[:4]:
            decision_items.append({"type": "Материал", "object": row.get("project_title") or "Объект", "title": row.get("title") or "Материал", "responsible": "Снабжение", "due": row.get("needed_at") or "без срока", "criticality": "Под риском", "level": "warning", "action": "Открыть заявку"})
        for project in no_photo_projects[:4]:
            decision_items.append({"type": "Нет фотоотчёта", "object": project.get("title") or "Объект", "title": "Сделать фотоотчёт", "responsible": project.get("tech_supervisor_name") or project.get("foreman_name") or "не назначен", "due": today, "criticality": "Средняя", "level": "warning", "action": "Открыть объект"})

        today_body = f"""
        <div class="metric-grid">
          <div class="metric"><span>Мои задачи сегодня</span><strong>{len(today_tasks)}</strong></div>
          <div class="metric danger"><span>Просрочено</span><strong>{len(overdue_tasks)}</strong></div>
          <div class="metric warning"><span>Возвращено</span><strong>{len(returned_tasks)}</strong></div>
          <div class="metric blue"><span>Ждут проверки</span><strong>{len(waiting_tasks)}</strong></div>
          <div class="metric warning"><span>Материалы под риском</span><strong>{len(risky_materials)}</strong></div>
          <div class="metric"><span>Без фотоотчёта сегодня</span><strong>{len(no_photo_projects)}</strong></div>
        </div>
        <h3>Требует решения</h3>
        {rows(decision_items[:10], decision_card, "Критичных сигналов нет")}
        <h3>Активные объекты</h3>
        {rows(project_rows[:3], project_card, "Активных объектов пока нет")}
        """

        selected_project_body = project_card(project_rows[0]) if project_rows else '<p class="muted">Пример объекта пока отсутствует</p>'
        short_task_body = task_card(task_rows[0]) if task_rows else '<p class="muted">Пример задачи пока отсутствует</p>'
        photo_empty_body = f"""
        <article class="sample-row empty-demo">
          <strong>Фотоотчётов пока нет</strong>
          <p>По активным объектам сегодня нет {len(no_photo_projects)} фотоотчётов.</p>
          <div class="chips">{chips([project.get("title") or "Объект" for project in no_photo_projects[:6]])}</div>
        </article>
        """
        remark_empty_body = """
        <article class="sample-row empty-demo">
          <strong>Замечаний по объектам пока нет</strong>
          <p>Здесь будут строительные замечания: дефекты, переделки, контроль качества.</p>
          <div class="chips"><span class="chip">Фото до</span><span class="chip">Описание</span><span class="chip">Ответственный</span><span class="chip">Срок</span><span class="chip">Фото после</span><span class="chip">Принято</span></div>
        </article>
        """
        project_body = rows(project_rows, project_card)
        task_body = rows(task_rows, task_card)
        material_body = rows(material_rows, material_card)
        document_body = rows(document_rows, document_card)
        photo_body = rows(photo_rows, photo_card, "Фотоотчётов пока нет")
        remark_body = rows(remark_rows, remark_card, "Замечаний по объектам пока нет")
        feedback_body = rows(feedback_rows, feedback_card)
        notification_body = rows(notification_rows, lambda row: f'<article class="sample-row"><div class="row-head"><strong>{e(row.get("title") or "Событие")}</strong>{badge(row.get("created_at") or "")}</div><p>{e(row.get("text") or "")}</p></article>', "Событий пока нет")
        settings_body = rows(user_rows, user_card)

        role_variants = [
            ("Руководитель", label(role_map, "owner", "Ген.директор"), ["Все разделы", "Контроль сроков", "Удаление из архива"], ["Сводка", "Объекты", "Задачи", "Финансы"]),
            ("Руководитель проекта", label(role_map, "construction_manager", "Рук. по строительству"), ["Приём объекта", "Назначение ответственных", "Возврат на доработку"], ["Объекты", "Задачи", "Работы", "Материалы"]),
            ("Прораб", label(role_map, "foreman", "Прораб"), ["Задачи", "Работы", "Материалы", "Фотоотчёты"], ["Назначенные объекты", "Заявки", "Проектные файлы"]),
            ("Мастер", "Полевой исполнитель", ["Видит свои задачи", "Смотрит работы", "Передаёт фото"], ["Задачи", "Работы", "Материалы"]),
            ("Снабжение", label(role_map, "procurement_manager", "Снабжение"), ["Приём заявок", "Доставка", "Проблемы по материалам"], ["Материалы", "Локации", "Файлы проекта"]),
        ]
        roles_body = "".join(
            f"""
            <article class="sample-row">
              <div class="row-head"><strong>{e(title)}</strong>{badge(subtitle)}</div>
              <div><strong>Основные действия:</strong><div class="chips">{chips(actions)}</div></div>
              <div><strong>Видит:</strong><div class="chips">{chips(visible)}</div></div>
            </article>
            """
            for title, subtitle, actions, visible in role_variants
        )

        feature_body = "".join(feature_row(key, value) for key, value in feature_flags.items())
        app_js_snapshot = (STATIC_DIR / "app.js").read_text(encoding="utf-8", errors="replace") if (STATIC_DIR / "app.js").exists() else ""
        index_snapshot = (STATIC_DIR / "index.html").read_text(encoding="utf-8", errors="replace") if (STATIC_DIR / "index.html").exists() else ""
        server_snapshot = Path(__file__).read_text(encoding="utf-8", errors="replace")
        first_tz_checks = {
            "human_status_labels": "ok" if feature_flags.get("human_status_labels") else "missing",
            "today_screen": "ok" if feature_flags.get("today_screen") else "missing",
            "object_attention_block": "ok" if feature_flags.get("object_attention_block") else "missing",
            "task_short_cards": "ok" if all(marker in app_js_snapshot for marker in ["task-summary-title", "task-description-clamp", "renderCompactTaskRow"]) else "partial",
            "photo_reports_entity": "ok" if feature_flags.get("photo_reports_entity") else "missing",
            "object_issues_entity": "ok" if feature_flags.get("object_issues_entity") else "missing",
            "feedback_split": "ok" if "object_remarksView" in index_snapshot and "feedbackView" in index_snapshot else "missing",
            "document_classification": "ok" if "documentTypeKey" in app_js_snapshot and "classification-notice" in app_js_snapshot else "missing",
            "live_audit_login": "ok" if "ai-audit-login" in server_snapshot else "missing",
        }
        first_tz_body = "".join(
            f'<div class="meta-row"><span><code>{e(key)}</code></span><strong>{e(value)}</strong></div>'
            for key, value in first_tz_checks.items()
        )
        stage3_checks = {
            "role_based_today": "ok" if "roleTodayProfile" in app_js_snapshot and "todayRoleQuestion" in index_snapshot else "missing",
            "task_card_layout": "ok" if all(marker in app_js_snapshot for marker in ["task-summary-title", "task-summary-meta", "task-description-clamp"]) else "partial",
            "task_type_rules": "ok" if all(marker in app_js_snapshot for marker in ["check", "approval", "inferTaskType"]) else "partial",
            "signals_deduplication": "ok" if "dedupeSignals" in app_js_snapshot else "missing",
            "blockers": "ok" if "CREATE TABLE IF NOT EXISTS blockers" in ((APP_DIR / "database.py").read_text(encoding="utf-8", errors="replace")) and "/api/blockers" in server_snapshot else "partial",
            "materials_filters": "ok" if "data-material-quick-filter" in index_snapshot and "materialBatchMatchesQuickFilter" in app_js_snapshot else "missing",
            "document_classification_rules": "ok" if "photo_video" in app_js_snapshot and "service_screenshot" in app_js_snapshot and "knowledgeClassificationOnly" in app_js_snapshot else "partial",
            "mobile_quick_actions": "ok" if "mobileQuickActionsForRole" in app_js_snapshot and "mobile-bottom-nav" in index_snapshot else "missing",
            "empty_states": "ok" if "renderPhotoEmptyState" in app_js_snapshot and "renderRemarkEmptyState" in app_js_snapshot and "empty-state" in app_js_snapshot else "partial",
            "live_audit_login": "ok" if "audit_login_diagnostic_page" in server_snapshot and "session_created" in server_snapshot else "partial",
        }
        stage3_body = "".join(
            f'<div class="meta-row"><span><code>{e(key)}</code></span><strong>{e(value)}</strong></div>'
            for key, value in stage3_checks.items()
        )
        def role_today_sample(role_title: str, question: str, visible: list[str], actions: list[str]) -> str:
            return f"""
            <article class="sample-row">
              <div class="row-head"><strong>{e(role_title)}</strong>{badge("Сегодня", "blue")}</div>
              <p><strong>{e(question)}</strong></p>
              <div><strong>Показывает:</strong><div class="chips">{chips(visible)}</div></div>
              <div><strong>Действия:</strong><div class="chips">{chips(actions)}</div></div>
            </article>
            """

        today_owner_body = role_today_sample(
            "Руководитель",
            "Где горит и где нужно моё решение?",
            ["Требует моего решения", "Просрочки", "Блокеры", "Материалы под риском", "Объекты без фотоотчёта"],
            ["Открыть проблемный объект", "Открыть задачу", "Посмотреть сигналы"],
        )
        today_foreman_body = role_today_sample(
            "Прораб",
            "Что мне сегодня сделать на объекте?",
            ["Мои объекты", "Мои задачи", "Материалы к получению", "Замечания к закрытию"],
            ["Добавить фотоотчёт", "Создать заявку", "Отметить выполнено"],
        )
        today_master_body = role_today_sample(
            "Мастер",
            "Что сделать, где сделать, как подтвердить?",
            ["Что сделать сегодня", "Где сделать", "Срок", "Фото/видео"],
            ["Готово", "Сообщить проблему", "Добавить фото"],
        )

        signal_group_body = f"""
        <article class="sample-row">
          <div class="row-head"><strong>[Материалы вне основной сметы] {e((project_rows[0] or {}).get("title") if project_rows else "Объект")}</strong>{badge("новый", "warning")}</div>
          <div class="muted">27 позиций · создано {e(today)}</div>
          <div class="chips">{chips(["первые 3 позиции", "ещё 24 позиции", "Действие: открыть заявку"])}</div>
        </article>
        """
        blocker_body = rows(blocker_rows, blocker_card, "Блокеров пока нет")
        mobile_menu_body = """
        <article class="sample-row">
          <div class="chips"><span class="chip">Сегодня</span><span class="chip">Объекты</span><span class="chip">+</span><span class="chip">Уведомления</span><span class="chip">Я</span></div>
          <p class="muted">Кнопка “+” открывает быстрые действия по роли: фото, задача, замечание, материал или проблема.</p>
        </article>
        """
        qa_body = f"""
        <section class="meta-panel">
          <div class="meta-row"><span>generatedAt</span><strong>{e(qa_generated_at)}</strong></div>
          <div class="meta-row"><span>appVersion</span><strong>{e(qa_app_version)}</strong></div>
          <div class="meta-row"><span>commitHash</span><strong>{e(qa_commit)}</strong></div>
          <div class="meta-row"><span>environment</span><strong>{e(qa_environment)}</strong></div>
          <div class="meta-row"><span>audit user role</span><strong>{e(label(role_map, account.get("role"), "ИИ-аудитор"))}</strong></div>
          <div class="meta-row"><span>token expires_at</span><strong>{e(token_row.get("expires_at") or "не задан")}</strong></div>
          <div class="meta-row"><span>uses_left</span><strong>{e(token_uses_left)}</strong></div>
          <div class="meta-row"><span>QA status</span>{badge(qa_overall, "success" if qa_overall == "PASS" else "danger" if qa_overall == "FAIL" else "warning" if qa_overall == "PARTIAL" else "neutral")}</div>
        </section>
        <section class="meta-panel">
          {qa_row("scroll_tests", "Прокрутка")}
          {qa_row("button_tests", "Кнопки")}
          {qa_row("navigation_tests", "Навигация")}
          {qa_row("role_tests", "Роли")}
          {qa_row("readonly_tests", "Read-only аудит")}
          {qa_row("mobile_tests", "Мобильная версия")}
          {qa_row("console_errors", "Ошибки консоли")}
          {qa_row("visual_regression", "Визуальная проверка")}
          {qa_row("max_report_format", "Формат MAX-отчёта")}
        </section>
        """
        metadata_body = f"""
        <section class="meta-panel">
          <div class="meta-row"><span>generatedAt</span><strong>{e(generated_at)}</strong></div>
          <div class="meta-row"><span>appVersion</span><strong>{e(app_version)}</strong></div>
          <div class="meta-row"><span>commitHash</span><strong>{e(commit_hash or "не доступен в контейнере")}</strong></div>
          <div class="meta-row"><span>environment</span><strong>{e(qa_environment)}</strong></div>
          <div class="meta-row"><span>audit user role</span><strong>{e(label(role_map, account.get("role"), "ИИ-аудитор"))}</strong></div>
          <div class="meta-row"><span>token expires_at</span><strong>{e(token_row.get("expires_at") or "не задан")}</strong></div>
          <div class="meta-row"><span>uses_left</span><strong>{e(token_uses_left)}</strong></div>
        </section>
        <section class="meta-panel">
          <h2>UX-фичи</h2>
          {feature_body}
        </section>
        """

        html_body = f"""<!doctype html>
        <html lang="ru">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="robots" content="noindex" />
          <title>AI UX-аудит - Строительный контур</title>
          <style>
            :root {{ --bg:#f4f6f8; --surface:#fff; --line:#d8e0e4; --text:#142127; --muted:#66737c; --brand:#226f68; --soft:#eef5f3; --danger:#b94646; --warning:#a56a09; --blue:#2f6da8; --success:#287347; }}
            * {{ box-sizing:border-box; }}
            body {{ margin:0; background:var(--bg); color:var(--text); font-family:Segoe UI, Arial, sans-serif; }}
            main {{ width:min(1180px, 100%); margin:0 auto; padding:24px; }}
            h1 {{ margin:0 0 8px; font-size:28px; }}
            h3 {{ margin:10px 0 4px; font-size:15px; }}
            .lead {{ color:var(--muted); margin:0 0 22px; max-width:820px; line-height:1.45; }}
            .grid {{ display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px; }}
            .top-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }}
            .snapshot-block {{ background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:16px; min-height:240px; }}
            .snapshot-block header {{ display:grid; gap:8px; border-bottom:1px solid var(--line); padding-bottom:12px; margin-bottom:12px; }}
            h2 {{ margin:0; font-size:18px; }}
            .chips {{ display:flex; flex-wrap:wrap; gap:6px; }}
            .chip {{ display:inline-flex; align-items:center; min-height:24px; padding:3px 8px; border-radius:999px; background:var(--soft); color:#15544e; font-size:12px; }}
            .snapshot-actions .chip {{ background:#f7f1df; color:#70510d; }}
            .badge {{ display:inline-flex; align-items:center; min-height:24px; padding:3px 8px; border-radius:999px; background:#edf2f4; color:#39464d; font-size:12px; white-space:nowrap; }}
            .badge.danger {{ background:#f8e8e8; color:var(--danger); }}
            .badge.warning {{ background:#fff3d8; color:var(--warning); }}
            .badge.success {{ background:#e6f5eb; color:var(--success); }}
            .badge.blue {{ background:#e8f1fb; color:var(--blue); }}
            .snapshot-render {{ display:grid; gap:8px; min-height:96px; }}
            .sample-row {{ border:1px solid var(--line); border-radius:7px; padding:10px; background:#fbfcfc; line-height:1.35; }}
            .row-head {{ display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:6px; }}
            .metrics, .metric-grid {{ display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }}
            .metric-grid {{ display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); }}
            .metric {{ border:1px solid var(--line); border-radius:7px; padding:8px; background:#fbfcfc; }}
            .metric span {{ display:block; color:var(--muted); font-size:12px; }}
            .metric strong {{ font-size:22px; }}
            .metric.danger strong {{ color:var(--danger); }}
            .metric.warning strong {{ color:var(--warning); }}
            .metric.blue strong {{ color:var(--blue); }}
            .attention-mini {{ display:grid; gap:6px; margin-top:8px; padding-top:8px; border-top:1px solid var(--line); }}
            .decision-row .row-head strong {{ line-height:1.35; }}
            .short-description {{ color:var(--muted); margin:6px 0 0; line-height:1.35; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }}
            .empty-demo {{ background:#f7fbfb; border-style:dashed; }}
            .meta-panel {{ background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:12px; display:grid; gap:8px; }}
            .meta-row {{ display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; border-bottom:1px solid #eef2f4; padding-bottom:7px; }}
            .meta-row:last-child {{ border-bottom:0; padding-bottom:0; }}
            .missing {{ grid-column:1 / -1; color:var(--danger); }}
            footer {{ margin-top:14px; display:grid; gap:8px; }}
            .muted {{ color:var(--muted); }}
            .phone-frame {{ max-width:360px; justify-self:center; border-color:#172026; box-shadow:0 10px 28px rgba(20,33,39,.16); }}
            .banner {{ background:#132126; color:white; border-radius:8px; padding:14px 16px; margin-bottom:16px; }}
            @media (max-width: 820px) {{ .grid, .top-grid, .metric-grid {{ grid-template-columns:1fr; }} main {{ padding:14px; }} }}
          </style>
        </head>
        <body>
          <main>
            <div class="banner">Режим UX-аудита: данные обезличены, скачивание файлов и любые изменения запрещены.</div>
            <h1>Строительный контур - snapshot для UX-аудита</h1>
            <p class="lead">Эта страница показывает основные экраны приложения в статичном виде. Примеры данных обезличены: телефоны, e-mail, адреса, договоры, файлы и финансовые суммы скрыты.</p>
            <div class="top-grid">{metadata_body}</div>
            <div class="grid">
              {block("QA-проверки", ["Открыть qa-report", "Посмотреть скриншоты", "Разобрать FAIL/PARTIAL"], ["Фактический прогон", "Quality gate", "Без фальшивого ok"], qa_body)}
              {block("Проверка первого ТЗ", ["Сверить контракт", "Найти частичные пункты"], ["UX-контракт", "Аудит", "Статусы"], first_tz_body)}
              {block("Проверка этапа 3", ["Сверить ролевые сценарии", "Проверить мобильный UX", "Проверить блокеры"], ["Роли", "Сигналы", "Блокеры", "Мобильный UX"], stage3_body)}
              {block("1. Сегодня", ["Открыть задачи", "Открыть материалы", "Открыть фотоотчёты"], ["Мои задачи", "Требует решения", "Активные объекты"], today_body)}
              {block("2. Сегодня для руководителя", ["Открыть проблемный объект", "Открыть задачу", "Посмотреть сигналы"], ["Руководитель", "Решения", "Блокеры"], today_owner_body)}
              {block("3. Сегодня для прораба", ["Добавить фотоотчёт", "Создать заявку", "Отметить выполнено"], ["Прораб", "Мои объекты", "Материалы"], today_foreman_body)}
              {block("4. Сегодня для мастера", ["Готово", "Сообщить проблему", "Добавить фото"], ["Мастер", "Простой режим", "Фото"], today_master_body, mobile=True)}
              {block("5. Ролевые варианты", ["Сравнить видимость", "Проверить ограничения", "Оценить сценарий роли"], ["Роли", "Доступы", "Сценарии"], roles_body)}
              {block("6. Сгруппированный сигнал", ["Открыть заявку", "Развернуть список", "Скрыть сигнал"], ["Дедупликация", "Группировка", "Сигналы"], signal_group_body)}
              {block("7. Блокер", ["Открыть объект", "Назначить ответственного", "Закрыть после решения"], ["Блокер", "Ответственный", "Срок"], blocker_body)}
              {block("8. Сигналы", ["Открыть объекты", "Открыть задачи", "Посмотреть события"], ["Сигналы", "Сводка", "Задачи"], notification_body)}
              {block("9. Список объектов", ["Выбрать объект", "Открыть карточку", "Перейти к задачам"], ["Объекты", "Статусы", "Прораб"], project_body)}
              {block("10. Карточка объекта", ["Открыть задачи", "Добавить фотоотчёт", "Создать замечание", "Запросить материал", "Открыть документы"], ["Один выбранный объект", "Метрики", "Ближайшие действия"], selected_project_body)}
              {block("11. Задача в коротком формате", ["Развернуть задачу", "Свернуть задачу", "Посмотреть комментарии"], ["Тип", "Ответственный", "Срок", "Статус"], short_task_body)}
              {block("12. Задачи", ["Развернуть задачу", "Свернуть задачу", "Посмотреть комментарии"], ["Тип", "Ответственный", "Срок", "Статус"], task_body)}
              {block("13. Материалы / заявки", ["Открыть заявку", "Посмотреть статус", "Посмотреть основание"], ["Все", "Мои", "Срочные", "Без срока", "Тормозит объект", "Вне сметы"], material_body)}
              {block("14. Пример заявки на материал", ["Открыть заявку", "Изменить статус", "Добавить комментарий"], ["Материал", "Срок", "Статус", "Ответственный"], material_body)}
              {block("15. Фотоотчёты", ["Открыть карточку отчёта", "Посмотреть вложения", "Проверить статус"], ["Фотоотчёты", "Файлы", "Проверка"], photo_body)}
              {block("16. Пустое состояние фотоотчётов", ["Открыть объект", "Добавить фотоотчёт"], ["Пустое состояние", "Список объектов"], photo_empty_body)}
              {block("17. Замечания по объектам", ["Открыть замечание", "Проверить фото до/после", "Посмотреть ответственного"], ["Объект", "Зона", "Срок", "Проверка"], remark_body)}
              {block("18. Пустое состояние замечаний", ["Создать замечание", "Назначить ответственного"], ["Пример структуры", "Контроль качества"], remark_empty_body)}
              {block("19. Документы", ["Открыть папку", "Посмотреть список", "Проверить классификацию"], ["Проект", "Смета", "Договор", "Акт", "Счёт", "Фото/видео", "Не разобрано"], document_body)}
              {block("20. Мобильное меню с кнопкой +", ["Открыть быстрое действие", "Добавить фото", "Сообщить проблему"], ["Сегодня", "Объекты", "+", "Уведомления", "Я"], mobile_menu_body, mobile=True)}
              {block("21. Обратная связь по программе", ["Фильтровать", "Открыть сообщение", "Смотреть статус"], ["MAX", "Комментарии", "Статусы"], feedback_body)}
              {block("22. Настройки", ["Оценить структуру ролей", "Смотреть список участников"], ["Роли", "Уведомления", "MAX"], settings_body)}
              {block("23. Мобильный вид карточки объекта", ["Развернуть раздел", "Свернуть раздел", "Перейти к задачам"], ["Обзор", "Вкладки", "Документы"], selected_project_body, mobile=True)}
              {block("24. Мобильный вид задачи", ["Развернуть задачу", "Свернуть задачу", "Посмотреть комментарии"], ["Задачи", "Комментарии", "Статусы"], short_task_body, mobile=True)}
            </div>
          </main>
        </body>
        </html>"""
        for forbidden in SNAPSHOT_FORBIDDEN_ENUMS:
            html_body = re.sub(
                rf"(?<![A-Za-z0-9_]){re.escape(forbidden)}(?![A-Za-z0-9_])",
                status_map.get(forbidden, "служебный статус"),
                html_body,
            )
        html_response(self, html_body)

    def serve_document_download(self, document_id: int) -> None:
        with connect() as db:
            if is_ai_auditor_account(current_access_account(self)):
                self.send_error(403)
                return
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
                    href = yandex_disk_download_url(stored_path)
                except (HTTPError, URLError, TimeoutError, RuntimeError, OSError):
                    self.send_error(502)
                    return
                redirect_response(self, href, 302)
                return
            else:
                file_path = (DATA_DIR / stored_path).resolve()
                if DATA_DIR.resolve() not in file_path.parents and file_path != DATA_DIR.resolve():
                    self.send_error(403)
                    return
                if not file_path.exists() or not file_path.is_file():
                    self.send_error(404)
                    return
                file_name = document["file_name"] or file_path.name
            content_type = document["mime_type"] or mimetypes.guess_type(file_name)[0] or "application/octet-stream"
            stream_local_file(self, file_path, file_name, content_type)

    def serve_estimate_job_file_download(self, file_id: int) -> None:
        with connect() as db:
            if is_ai_auditor_account(current_access_account(self)):
                self.send_error(403)
                return
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
                    href = yandex_disk_download_url(stored_path)
                except (HTTPError, URLError, TimeoutError, RuntimeError, OSError):
                    self.send_error(502)
                    return
                redirect_response(self, href, 302)
                return
            else:
                file_path = (DATA_DIR / stored_path).resolve()
                if DATA_DIR.resolve() not in file_path.parents and file_path != DATA_DIR.resolve():
                    self.send_error(403)
                    return
                if not file_path.exists() or not file_path.is_file():
                    self.send_error(404)
                    return
                file_name = item["file_name"] or file_path.name
            content_type = item["mime_type"] or mimetypes.guess_type(file_name)[0] or "application/octet-stream"
            stream_local_file(self, file_path, file_name, content_type)

    def serve_material_requests_export(self, query: dict[str, list[str]]) -> None:
        if is_ai_auditor_account(current_access_account(self)):
            self.send_error(403)
            return
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
                  AND COALESCE(m.change_type, '') != 'removed'
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
        write_response_body(self, body)

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
                  AND COALESCE(m.change_type, '') != 'removed'
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
        write_response_body(self, body)

    def serve_work_items_print(self, query: dict[str, list[str]]) -> None:
        if is_ai_auditor_account(current_access_account(self)):
            self.send_error(403)
            return
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
        write_response_body(self, body)

    def handle_api_get(self, path: str, query: dict[str, list[str]]) -> None:
        with connect() as db:
            account = current_access_account(self) or {}
            archive_completed_material_batches(db)
            if path == "/api/session":
                user = None
                if account.get("user_id"):
                    user = db.execute("SELECT id, name, role, email FROM users WHERE id = ?", (account["user_id"],)).fetchone()
                user_payload = row_to_dict(user) if user else None
                if user_payload and is_ai_auditor_account(account):
                    user_payload = sanitize_user_for_audit(user_payload)
                json_response(
                    self,
                    {
                        "login": account.get("login") or "",
                        "role": account.get("role") or (user["role"] if user else "owner"),
                        "user_id": account.get("user_id") or (user["id"] if user else 1),
                        "can_switch_role": bool(account.get("can_switch_role")),
                        "user": user_payload,
                    },
                )
                return

            if path == "/api/users":
                rows = db.execute("SELECT * FROM users WHERE is_active = 1 ORDER BY id").fetchall()
                json_response(self, sanitize_users_for_account(rows_to_dicts(rows), account))
                return

            if path == "/api/notifications":
                notification_filter = ""
                params: list[object] = []
                if account_role(account) not in {"owner", "construction_manager", "finance_director", "ai_auditor"}:
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
                json_response(self, sanitize_notifications_for_account(rows_to_dicts(rows), account))
                return

            if path == "/api/blockers":
                if account_role(account) not in {"owner", "construction_manager", "finance_director", "foreman", "master", "procurement_manager", "estimator", "technical_supervisor", "ai_auditor"}:
                    json_response(self, [])
                    return
                project_id = int((query.get("project_id") or ["0"])[0] or 0)
                json_response(self, blockers_payload(db, account, project_id or None))
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
                    item["decision_comment"] = clean_feedback_decision_comment(item.get("decision_comment"))
                    item.pop("attachments_json", None)
                items = sanitize_feedback_items_for_account(items, account)
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
                    "estimate_jobs_open": db.execute("SELECT COUNT(*) AS count FROM estimate_jobs WHERE status IN ('estimate_new', 'estimate_in_work', 'estimate_returned', 'estimate_question')").fetchone()["count"],
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
                           estimator.name AS estimator_name,
                           estimator.email AS estimator_email
                    FROM estimate_jobs j
                    LEFT JOIN projects p ON p.id = j.project_id
                    LEFT JOIN users manager ON manager.id = j.manager_id
                    LEFT JOIN users estimator ON estimator.id = j.estimator_id
                    ORDER BY
                        CASE j.status
                            WHEN 'estimate_new' THEN 1
                            WHEN 'estimate_returned' THEN 2
                            WHEN 'estimate_question' THEN 3
                            WHEN 'estimate_in_work' THEN 4
                            WHEN 'estimate_hold' THEN 5
                            WHEN 'estimate_done' THEN 6
                            ELSE 7
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
                jobs = sanitize_estimate_jobs_for_account(jobs, account)
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
                estimate_material_rows = rows_to_dicts(rows)
                if is_ai_auditor_account(account):
                    for row in estimate_material_rows:
                        row["unit_price"] = 0
                        row["total_price"] = 0
                json_response(self, estimate_material_rows)
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
                work_rows = rows_to_dicts(rows)
                if is_ai_auditor_account(account):
                    for row in work_rows:
                        row["unit_price"] = 0
                        row["total_price"] = 0
                json_response(self, work_rows)
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
                project_rows = [sanitize_project_for_account(project, account) for project in project_rows]
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
                           b.actual_purchase_amount AS batch_actual_purchase_amount,
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
                material_rows = sanitize_material_rows_for_account(material_rows, account)
                json_response(self, material_rows)
                return

            if path == "/api/photo-reports":
                project_id = int((query.get("project_id") or ["0"])[0] or 0) or None
                json_response(self, photo_reports_payload(db, account, project_id))
                return

            if path == "/api/object-remarks":
                project_id = int((query.get("project_id") or ["0"])[0] or 0) or None
                json_response(self, object_remarks_payload(db, account, project_id))
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
                           reviewer.name AS reviewer_name, reviewer.role AS reviewer_role,
                           c.title AS contract_title, c.type AS contract_type
                    FROM tasks t
                    JOIN projects p ON p.id = t.project_id
                    LEFT JOIN users assignee ON assignee.id = t.assignee_id
                    LEFT JOIN users creator ON creator.id = t.creator_id
                    LEFT JOIN users reviewer ON reviewer.id = t.reviewer_id
                    LEFT JOIN contracts c ON c.id = t.contract_id
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
                if path == "/api/contracts" and is_ai_auditor_account(account):
                    json_response(self, [])
                    return
                if path == "/api/contracts" and account_role(account) not in {"owner", "construction_manager", "finance_director", "accountant", "ai_auditor"}:
                    json_response(self, [])
                    return
                if path == "/api/events" and account_role(account) not in {"owner", "construction_manager", "finance_director", "accountant", "ai_auditor"}:
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
                    elif role not in {"owner", "construction_manager", "finance_director", "technical_supervisor", "ai_auditor"}:
                        rows = []
                    rows = normalize_task_rows(attach_task_events(db, rows))
                    rows = sanitize_tasks_for_account(rows, account)
                json_response(self, rows)
                return

            if path == "/api/document-folders":
                related_type = (query.get("related_type") or ["knowledge_base"])[0]
                if related_type != "knowledge_base" or not can_view_knowledge_base(account):
                    json_response(self, [])
                    return
                folders = knowledge_folders_with_paths(db)
                json_response(self, folders)
                return

            if path == "/api/documents":
                related_type = (query.get("related_type") or ["project"])[0]
                if related_type == "knowledge_base":
                    if not can_view_knowledge_base(account):
                        json_response(self, [])
                        return
                    rows = db.execute(
                        """
                        SELECT d.*, p.title AS project_title, u.name AS owner_name, f.title AS folder_title
                        FROM documents d
                        LEFT JOIN projects p ON p.id = d.project_id
                        LEFT JOIN users u ON u.id = d.owner_id
                        LEFT JOIN knowledge_folders f ON f.id = d.folder_id
                        WHERE d.related_type = 'knowledge_base'
                        ORDER BY COALESCE(f.title, ''), d.created_at DESC
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
                else:
                    documents = attach_knowledge_folder_paths(db, documents)
                    documents = sanitize_documents_for_account(documents, account)
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

            if path == "/api/photo-reports":
                if not can_manage_object_workflow(account):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                force_max = force_personal_max(data)
                project_id = int(data.get("project_id") or 0)
                project = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
                if not project or not project_visible_for_account(row_to_dict(project), account):
                    json_response(self, {"error": "Project not found"}, 404)
                    return
                actor_id = int(data.get("author_id") or 0) or account_user_id(account) or user_id_by_role(db, "construction_manager")
                cursor = db.execute(
                    """
                    INSERT INTO photo_reports (
                        project_id, report_date, author_id, stage, zones, comment, related_task_ids, status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        project_id,
                        data.get("report_date") or datetime.utcnow().date().isoformat(),
                        actor_id,
                        str(data.get("stage") or ""),
                        str(data.get("zones") or ""),
                        str(data.get("comment") or ""),
                        json.dumps(data.get("related_task_ids") or [], ensure_ascii=False),
                        data.get("status") or "review",
                    ),
                )
                report_id = int(cursor.lastrowid)
                document_ids = save_process_attachments(
                    db,
                    project_id=project_id,
                    attachments=data.get("attachments") or [],
                    related_type="photo_report",
                    doc_type="photo_report",
                    process_type=f"photo_report:{report_id}",
                    owner_id=actor_id,
                )
                for document_id in document_ids:
                    db.execute(
                        "INSERT INTO photo_report_documents (photo_report_id, document_id) VALUES (?, ?)",
                        (report_id, document_id),
                    )
                db.execute(
                    """
                    INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                    VALUES (?, 'photo_report', ?, ?, 'internal', 'photo_report')
                    """,
                    (
                        project_id,
                        f"Добавлен фотоотчёт за {data.get('report_date') or datetime.utcnow().date().isoformat()}: {len(document_ids)} файл(ов)",
                        actor_id,
                    ),
                )
                for watcher_id in {project["foreman_id"], user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")}:
                    if watcher_id and int(watcher_id) != int(actor_id or 0):
                        create_notification(
                            db,
                            project_id,
                            int(watcher_id),
                            role_by_user_id(db, int(watcher_id)),
                            "Новый фотоотчёт по объекту",
                            f"{project['title']}: фотоотчёт за {data.get('report_date') or datetime.utcnow().date().isoformat()}",
                            "photo_report",
                            report_id,
                            force_max=force_max,
                        )
                json_response(self, {"id": report_id, "documents": document_ids}, 201)
                return

            if path == "/api/object-remarks":
                if not can_manage_object_workflow(account):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                force_max = force_personal_max(data)
                project_id = int(data.get("project_id") or 0)
                project = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
                if not project or not project_visible_for_account(row_to_dict(project), account):
                    json_response(self, {"error": "Project not found"}, 404)
                    return
                actor_id = account_user_id(account) or user_id_by_role(db, "construction_manager")
                responsible_id = int(data.get("responsible_id") or 0) or None
                before_doc = save_process_attachments(
                    db,
                    project_id=project_id,
                    attachments=[data.get("photo_before") or {}],
                    related_type="object_remark",
                    doc_type="object_remark_photo",
                    process_type="object_remark:before",
                    owner_id=actor_id,
                )
                after_doc = save_process_attachments(
                    db,
                    project_id=project_id,
                    attachments=[data.get("photo_after") or {}],
                    related_type="object_remark",
                    doc_type="object_remark_photo",
                    process_type="object_remark:after",
                    owner_id=actor_id,
                )
                cursor = db.execute(
                    """
                    INSERT INTO object_remarks (
                        project_id, zone, description, responsible_id, due_date, status,
                        photo_before_document_id, photo_after_document_id, checked_by_id, created_by
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        project_id,
                        str(data.get("zone") or ""),
                        str(data.get("description") or ""),
                        responsible_id,
                        data.get("due_date") or None,
                        data.get("status") or "new",
                        before_doc[0] if before_doc else None,
                        after_doc[0] if after_doc else None,
                        int(data.get("checked_by_id") or 0) or None,
                        actor_id,
                    ),
                )
                remark_id = int(cursor.lastrowid)
                db.execute(
                    """
                    INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                    VALUES (?, 'object_remark', ?, ?, 'internal', 'object_remark')
                    """,
                    (
                        project_id,
                        f"Добавлено замечание: {data.get('description') or 'без описания'}",
                        actor_id,
                    ),
                )
                if responsible_id:
                    create_notification(
                        db,
                        project_id,
                        responsible_id,
                        role_by_user_id(db, responsible_id),
                        "Новое замечание по объекту",
                        f"{project['title']}: {data.get('description') or 'замечание'}",
                        "object_remark",
                        remark_id,
                        force_max=force_max,
                    )
                json_response(self, {"id": remark_id}, 201)
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
                    (status, clean_feedback_decision_comment(data.get("comment")), int(feedback_action.group(1))),
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
                        ("site_costs_policy", "Организация строительной площадки"),
                    ],
                )
                status = data.get("status") or "estimate_new"
                if status not in {"estimate_new", "estimate_in_work", "estimate_done", "estimate_hold", "estimate_returned", "estimate_question"}:
                    status = "estimate_new"
                project_id = int(data.get("project_id") or 0) or None
                site_costs_policy = data.get("site_costs_policy") or "include"
                if site_costs_policy not in {"include", "exclude", "clarify"}:
                    site_costs_policy = "include"
                cursor = db.execute(
                    """
                    INSERT INTO estimate_jobs (
                        project_id, title, customer_name, manager_id, estimator_id,
                        received_at, due_date, delivered_at, status, priority, source,
                        smetter_url, estimate_type, site_costs_policy, site_costs_comment,
                        comment, result_comment, return_comment, question_comment
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        data.get("smetter_url") or "",
                        data.get("estimate_type") or "",
                        site_costs_policy,
                        data.get("site_costs_comment") or "",
                        data.get("comment") or "",
                        data.get("result_comment") or "",
                        data.get("return_comment") or "",
                        data.get("question_comment") or "",
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

            estimate_job_files_action = re.match(r"^/api/estimate-jobs/(\d+)/files$", path)
            if estimate_job_files_action:
                estimate_job_id = int(estimate_job_files_action.group(1))
                row = db.execute("SELECT * FROM estimate_jobs WHERE id = ?", (estimate_job_id,)).fetchone()
                if not row:
                    json_response(self, {"error": "Estimate job not found"}, 404)
                    return
                if row["status"] != "estimate_done":
                    json_response(self, {"error": "Файлы можно добавлять этим способом только после сдачи сметы"}, 400)
                    return
                if not can_manage_estimate_job_files(row, account):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                attachments = [item for item in data.get("attachments") or [] if isinstance(item, dict) and item.get("file_base64")]
                smetter_url = str(data.get("smetter_url") or "").strip()
                if not attachments and not smetter_url:
                    json_response(self, {"error": "Прикрепите файл сметы или укажите ссылку на Сметтер"}, 400)
                    return
                if smetter_url:
                    db.execute(
                        "UPDATE estimate_jobs SET smetter_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        (smetter_url, estimate_job_id),
                    )
                replace_file_id = int(data.get("replace_file_id") or 0) or None
                replacement_note = str(data.get("replacement_note") or "").strip()
                saved_ids: list[int] = []
                if replace_file_id and attachments:
                    replaced_file = db.execute(
                        "SELECT * FROM estimate_job_files WHERE id = ? AND estimate_job_id = ?",
                        (replace_file_id, estimate_job_id),
                    ).fetchone()
                    if not replaced_file:
                        json_response(self, {"error": "Файл для замены не найден"}, 404)
                        return
                    if len(attachments) > 1:
                        json_response(self, {"error": "Для замены выберите один новый файл"}, 400)
                        return
                    new_file_id = save_estimate_job_file(
                        db,
                        estimate_job_id,
                        attachments[0],
                        account_user_id(account),
                        replace_file_id,
                        replacement_note,
                    )
                    if new_file_id:
                        saved_ids.append(new_file_id)
                elif attachments:
                    for attachment in attachments:
                        new_file_id = save_estimate_job_file(db, estimate_job_id, attachment, account_user_id(account))
                        if new_file_id:
                            saved_ids.append(new_file_id)
                action_text = "заменен файл сметы" if replace_file_id and attachments else ("добавлен файл сметы" if attachments else "обновлена ссылка на Сметтер")
                notify_users(
                    db,
                    {row["manager_id"], row["estimator_id"], user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")} - {None},
                    row["project_id"],
                    "Файлы сданной сметы обновлены",
                    f"{row['title']}: {action_text}. Новых файлов: {len(saved_ids)}",
                    "estimate_job",
                    estimate_job_id,
                )
                if row["project_id"]:
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'estimate_files', ?, ?, 'internal', 'estimate_job')
                        """,
                        (
                            row["project_id"],
                            f"{row['title']}: {action_text}. Новых файлов: {len(saved_ids)}",
                            account_user_id(account),
                        ),
                    )
                json_response(self, {"id": estimate_job_id, "files": saved_ids})
                return

            estimate_job_file_delete = re.match(r"^/api/estimate-job-files/(\d+)/delete$", path)
            if estimate_job_file_delete:
                file_id = int(estimate_job_file_delete.group(1))
                file_row = db.execute("SELECT * FROM estimate_job_files WHERE id = ?", (file_id,)).fetchone()
                if not file_row:
                    json_response(self, {"error": "Estimate file not found"}, 404)
                    return
                row = db.execute("SELECT * FROM estimate_jobs WHERE id = ?", (int(file_row["estimate_job_id"]),)).fetchone()
                if not row:
                    json_response(self, {"error": "Estimate job not found"}, 404)
                    return
                if not can_manage_estimate_job_files(row, account):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                was_current = int(file_row["is_current"] or 0) != 0
                db.execute("DELETE FROM estimate_job_files WHERE id = ?", (file_id,))
                if was_current:
                    latest_file = db.execute(
                        """
                        SELECT id
                        FROM estimate_job_files
                        WHERE estimate_job_id = ?
                        ORDER BY version_no DESC, id DESC
                        LIMIT 1
                        """,
                        (int(file_row["estimate_job_id"]),),
                    ).fetchone()
                    if latest_file:
                        db.execute(
                            """
                            UPDATE estimate_job_files
                            SET is_current = 1,
                                replaced_at = NULL
                            WHERE id = ?
                            """,
                            (int(latest_file["id"]),),
                        )
                notify_users(
                    db,
                    {row["manager_id"], row["estimator_id"], user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")} - {None},
                    row["project_id"],
                    "Файл сданной сметы удален",
                    f"{row['title']}: удален файл {file_row['file_name']}.",
                    "estimate_job",
                    int(file_row["estimate_job_id"]),
                )
                if row["project_id"]:
                    db.execute(
                        """
                        INSERT INTO events (project_id, type, text, author_id, visibility, related_type)
                        VALUES (?, 'estimate_files', ?, ?, 'internal', 'estimate_job')
                        """,
                        (
                            row["project_id"],
                            f"{row['title']}: удален файл сданной сметы {file_row['file_name']}.",
                            account_user_id(account),
                        ),
                    )
                json_response(self, {"deleted": file_id})
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
                    if not can_delete_estimate_job(row, account):
                        json_response(self, {"error": "Forbidden"}, 403)
                        return
                    db.execute("DELETE FROM estimate_jobs WHERE id = ?", (estimate_job_id,))
                    json_response(self, {"deleted": estimate_job_id})
                    return
                if not can_manage_estimate_jobs(account):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                if action == "update":
                    if not can_update_estimate_job(row, account):
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
                            ("site_costs_policy", "Организация строительной площадки"),
                        ],
                    )
                    site_costs_policy = data.get("site_costs_policy") or "include"
                    if site_costs_policy not in {"include", "exclude", "clarify"}:
                        site_costs_policy = "include"
                    resend_to_estimator = row["status"] in {"estimate_returned", "estimate_question"} and account_role(account) in {"sales_manager", "owner", "construction_manager"}
                    next_status = "estimate_new" if resend_to_estimator else row["status"]
                    next_return_comment = "" if resend_to_estimator else row["return_comment"] or ""
                    next_question_comment = "" if resend_to_estimator else row["question_comment"] or ""
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
                            smetter_url = ?,
                            estimate_type = ?,
                            site_costs_policy = ?,
                            site_costs_comment = ?,
                            comment = ?,
                            status = ?,
                            return_comment = ?,
                            question_comment = ?,
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
                            data.get("smetter_url") or "",
                            data.get("estimate_type") or "",
                            site_costs_policy,
                            data.get("site_costs_comment") or "",
                            data.get("comment") or "",
                            next_status,
                            next_return_comment,
                            next_question_comment,
                            estimate_job_id,
                        ),
                    )
                    attachments = [item for item in data.get("attachments") or [] if isinstance(item, dict) and item.get("file_base64")]
                    for attachment in attachments:
                        save_estimate_job_file(db, estimate_job_id, attachment, account_user_id(account))
                    if resend_to_estimator:
                        notify_users(
                            db,
                            {int(data.get("estimator_id") or 0), int(data.get("manager_id") or 0), user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")} - {0, None},
                            row["project_id"],
                            "Сметное задание уточнено",
                            f"{data.get('title')} снова отправлено сметчику после ответа менеджера.",
                            "estimate_job",
                            estimate_job_id,
                        )
                    json_response(self, {"id": estimate_job_id})
                    return
                status = data.get("status") or row["status"]
                if status not in {"estimate_new", "estimate_in_work", "estimate_done", "estimate_hold", "estimate_returned", "estimate_question"}:
                    json_response(self, {"error": "Unknown status"}, 400)
                    return
                if not can_change_estimate_job_status(row, status, account, db):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                return_comment = str(data.get("return_comment") or "").strip()
                question_comment = str(data.get("question_comment") or "").strip()
                if status == "estimate_returned" and not return_comment:
                    json_response(self, {"error": "Укажите причину возврата задания менеджеру"}, 400)
                    return
                if status == "estimate_question" and not question_comment:
                    json_response(self, {"error": "Напишите уточняющий вопрос менеджеру"}, 400)
                    return
                delivered_at = data.get("delivered_at") or (date.today().isoformat() if status == "estimate_done" else None)
                result_comment = data.get("result_comment") or row["result_comment"] or ""
                attachments = [item for item in data.get("attachments") or [] if isinstance(item, dict) and item.get("file_base64")]
                db.execute(
                    """
                    UPDATE estimate_jobs
                    SET status = ?,
                        delivered_at = ?,
                        result_comment = ?,
                        return_comment = ?,
                        question_comment = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (
                        status,
                        delivered_at if status == "estimate_done" else None,
                        result_comment,
                        return_comment if status == "estimate_returned" else row["return_comment"] or "",
                        question_comment if status == "estimate_question" else row["question_comment"] or "",
                        estimate_job_id,
                    ),
                )
                if status == "estimate_done":
                    for attachment in attachments:
                        save_estimate_job_file(db, estimate_job_id, attachment, account_user_id(account))
                notification_title = "Статус сметы изменен"
                notification_message = f"{row['title']}: {status}"
                if status == "estimate_returned":
                    notification_title = "Сметное задание возвращено менеджеру"
                    notification_message = f"{row['title']}. Причина: {return_comment}"
                elif status == "estimate_question":
                    notification_title = "Уточнение по сметному заданию"
                    notification_message = f"{row['title']}. Вопрос: {question_comment}"
                elif status == "estimate_in_work":
                    notification_message = f"{row['title']} взято сметчиком в работу."
                elif status == "estimate_done":
                    notification_message = f"{row['title']} отмечено как сданное."
                notify_users(
                    db,
                    {row["manager_id"], row["estimator_id"], user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")} - {None},
                    row["project_id"],
                    notification_title,
                    notification_message,
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
                force_max = force_personal_max(data)

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
                        force_max=force_max,
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
                        force_max=force_max,
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
                            force_max=force_max,
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
                            force_max=force_max,
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

            folder_action = re.match(r"^/api/document-folders/(\d+)/delete$", path)
            if folder_action:
                folder_id = int(folder_action.group(1))
                if account_role(account) not in {"owner", "construction_manager"}:
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                folder = db.execute("SELECT * FROM knowledge_folders WHERE id = ?", (folder_id,)).fetchone()
                if not folder:
                    json_response(self, {"error": "Folder not found"}, 404)
                    return
                children_count = db.execute("SELECT COUNT(*) AS count FROM knowledge_folders WHERE parent_id = ?", (folder_id,)).fetchone()["count"]
                document_count = db.execute("SELECT COUNT(*) AS count FROM documents WHERE folder_id = ?", (folder_id,)).fetchone()["count"]
                if int(children_count or 0) or int(document_count or 0):
                    json_response(self, {"error": "Папку можно удалить только когда в ней нет файлов и подпапок."}, 400)
                    return
                db.execute("DELETE FROM knowledge_folders WHERE id = ?", (folder_id,))
                db.commit()
                json_response(self, {"deleted": folder_id})
                return

            document_move_action = re.match(r"^/api/documents/(\d+)/move$", path)
            if document_move_action:
                document_id = int(document_move_action.group(1))
                if account_role(account) not in {"owner", "construction_manager", "finance_director"}:
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                document = db.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
                if not document:
                    json_response(self, {"error": "Document not found"}, 404)
                    return
                if (document["related_type"] or "") != "knowledge_base":
                    raise ValueError("Перемещать через эту кнопку можно только материалы базы знаний.")
                folder_id = validate_knowledge_folder(db, int(data.get("folder_id") or 0) or None)
                try:
                    moved_path = move_stored_file(db, document, folder_id)
                except (HTTPError, URLError, TimeoutError, RuntimeError, OSError) as exc:
                    json_response(self, {"error": f"Не удалось переместить файл в хранилище: {exc}"}, 500)
                    return
                db.execute(
                    """
                    UPDATE documents
                    SET folder_id = ?, file_path = COALESCE(?, file_path), updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (folder_id, moved_path, document_id),
                )
                db.commit()
                json_response(
                    self,
                    {
                        "id": document_id,
                        "folder_id": folder_id,
                        "folder_path": knowledge_folder_path(db, folder_id),
                    },
                )
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

            task_type_update = re.match(r"^/api/tasks/(\d+)/type$", path)
            if task_type_update:
                task_id = int(task_type_update.group(1))
                row = db.execute(
                    """
                    SELECT t.*, p.title AS project_title
                    FROM tasks t
                    JOIN projects p ON p.id = t.project_id
                    WHERE t.id = ?
                    """,
                    (task_id,),
                ).fetchone()
                if not row:
                    json_response(self, {"error": "Task not found"}, 404)
                    return
                role = account_role(account)
                user_id = account_user_id(account)
                if role not in {"owner", "construction_manager", "finance_director"} and user_id not in {int(row["creator_id"] or 0), int(row["reviewer_id"] or 0)}:
                    raise PermissionError("Недостаточно прав для изменения типа задачи.")
                next_type = normalize_task_type_value(
                    data.get("task_type"),
                    row["title"],
                    row["description"],
                    row["related_type"],
                )
                db.execute(
                    "UPDATE tasks SET task_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (next_type, task_id),
                )
                create_task_event(
                    db,
                    task_id=task_id,
                    project_id=int(row["project_id"]),
                    actor_id=user_id or None,
                    action="comment",
                    status_from=row["status"],
                    status_to=row["status"],
                    comment=f"Тип задачи изменён на: {next_type}",
                )
                json_response(self, {"id": task_id, "task_type": next_type})
                return

            task_action = re.match(r"^/api/tasks/(\d+)/(complete|accept|return|postpone|delete)$", path)
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

                request_role = account_role(account)
                request_user_id = account_user_id(account)
                privileged_task_role = request_role in {"owner", "construction_manager", "finance_director"}
                force_max = force_personal_max(data)
                if action in {"complete", "postpone"} and not privileged_task_role and (not request_user_id or request_user_id != task["assignee_id"]):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                if action in {"accept", "return"} and not privileged_task_role and (not request_user_id or request_user_id not in {task["reviewer_id"], task["creator_id"]}):
                    json_response(self, {"error": "Forbidden"}, 403)
                    return

                if action == "delete":
                    if request_role not in {"owner", "construction_manager"}:
                        raise ValueError("Удалять задачи может только ген.директор или руководитель строительства.")
                    if task["status"] in {"accepted", "completed_pending_acceptance"}:
                        raise ValueError("Завершенную задачу удалить нельзя. Она остается в истории объекта.")
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
                    comment = str(data.get("comment") or "").strip()
                    if not comment:
                        raise ValueError("После выполнения задачи напишите, что именно сделано.")
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
                    event_id = create_task_event(
                        db,
                        task_id=task_id,
                        project_id=task["project_id"],
                        actor_id=actor_id or task["assignee_id"],
                        action="complete",
                        status_from=task["status"],
                        status_to="completed_pending_acceptance",
                        comment=comment,
                        due_date=task["due_date"],
                    )
                    save_task_event_attachments(db, project_id=task["project_id"], event_id=event_id, attachments=data.get("attachments") or [], owner_id=actor_id or task["assignee_id"])
                    reviewer_id = task["reviewer_id"] or task["creator_id"] or user_id_by_role(db, "construction_manager")
                    create_notification(
                        db,
                        task["project_id"],
                        reviewer_id,
                        role_by_user_id(db, reviewer_id),
                        "Задача выполнена, нужна приемка",
                        f"{task['project_title']}: {task['title']}",
                        "task",
                        task_id,
                        force_max=force_max,
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
                                "task",
                                task_id,
                                force_max=force_max,
                            )
                    db.commit()
                    json_response(self, {"id": task_id, "status": "completed_pending_acceptance"})
                    return

                if action == "accept":
                    comment = str(data.get("comment") or "").strip() or "Проверяющий принял выполнение."
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
                    event_id = create_task_event(
                        db,
                        task_id=task_id,
                        project_id=task["project_id"],
                        actor_id=actor_id or task["reviewer_id"] or task["creator_id"],
                        action="accept",
                        status_from=task["status"],
                        status_to="accepted",
                        comment=comment,
                        due_date=task["due_date"],
                    )
                    save_task_event_attachments(db, project_id=task["project_id"], event_id=event_id, attachments=data.get("attachments") or [], owner_id=actor_id or task["reviewer_id"] or task["creator_id"])
                    create_notification(
                        db,
                        task["project_id"],
                        task["assignee_id"],
                        role_by_user_id(db, task["assignee_id"]),
                        "Выполнение задачи принято",
                        f"{task['project_title']}: {task['title']}",
                        "task",
                        task_id,
                        force_max=force_max,
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
                    event_id = create_task_event(
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
                    save_task_event_attachments(db, project_id=task["project_id"], event_id=event_id, attachments=data.get("attachments") or [], owner_id=actor_id or task["reviewer_id"] or task["creator_id"])
                    create_notification(
                        db,
                        task["project_id"],
                        task["assignee_id"],
                        role_by_user_id(db, task["assignee_id"]),
                        "Задача возвращена на доработку",
                        f"{task['project_title']}: {task['title']}. {comment}",
                        "task",
                        task_id,
                        force_max=force_max,
                    )
                    db.commit()
                    json_response(self, {"id": task_id, "status": "returned"})
                    return

                if action == "postpone":
                    comment = str(data.get("comment") or "").strip()
                    due_date = data.get("due_date") or task["due_date"]
                    if not comment:
                        raise ValueError("Напишите причину переноса или частичного выполнения.")
                    db.execute(
                        """
                        UPDATE tasks
                        SET status = 'in_progress_task',
                            rejection_comment = ?,
                            due_date = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (comment, due_date, task_id),
                    )
                    event_id = create_task_event(
                        db,
                        task_id=task_id,
                        project_id=task["project_id"],
                        actor_id=actor_id or task["assignee_id"],
                        action="postpone",
                        status_from=task["status"],
                        status_to="in_progress_task",
                        comment=comment,
                        due_date=due_date,
                    )
                    save_task_event_attachments(db, project_id=task["project_id"], event_id=event_id, attachments=data.get("attachments") or [], owner_id=actor_id or task["assignee_id"])
                    watcher_ids = {task["creator_id"], task["reviewer_id"], user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")}
                    for watcher_id in watcher_ids:
                        if watcher_id and watcher_id != actor_id:
                            create_notification(
                                db,
                                task["project_id"],
                                int(watcher_id),
                                role_by_user_id(db, int(watcher_id)),
                                "Задача перенесена или выполнена частично",
                                f"{task['project_title']}: {task['title']}. {comment}",
                                "task",
                                task_id,
                                force_max=force_max,
                            )
                    db.commit()
                    json_response(self, {"id": task_id, "status": "in_progress_task"})
                    return

            task_comment = re.match(r"^/api/tasks/(\d+)/comment$", path)
            if task_comment:
                task_id = int(task_comment.group(1))
                actor_id = int(data.get("actor_id") or 0) or account_user_id(account) or None
                comment = str(data.get("comment") or "").strip()
                attachments = data.get("attachments") or []
                force_max = force_personal_max(data)
                if not comment and not attachments:
                    raise ValueError("Напишите комментарий по задаче или прикрепите файл.")
                task = db.execute(
                    """
                    SELECT t.*, p.title AS project_title, p.foreman_id AS project_foreman_id,
                           p.tech_supervisor_id AS project_tech_supervisor_id
                    FROM tasks t
                    JOIN projects p ON p.id = t.project_id
                    WHERE t.id = ?
                    """,
                    (task_id,),
                ).fetchone()
                if not task:
                    json_response(self, {"error": "Task not found"}, 404)
                    return
                role = account_role(account)
                user_id = account_user_id(account)
                participant_ids = {
                    int(value)
                    for value in (task["assignee_id"], task["creator_id"], task["reviewer_id"], task["project_foreman_id"], task["project_tech_supervisor_id"])
                    if value
                }
                can_comment = role in {"owner", "construction_manager", "finance_director"} or user_id in participant_ids
                if not can_comment:
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                event_id = create_task_event(
                    db,
                    task_id=task_id,
                    project_id=task["project_id"],
                    actor_id=actor_id,
                    action="comment",
                    status_from=task["status"],
                    status_to=task["status"],
                    comment=comment,
                    due_date=task["due_date"],
                )
                save_task_event_attachments(db, project_id=task["project_id"], event_id=event_id, attachments=attachments, owner_id=actor_id)
                watcher_ids = {
                    task["assignee_id"],
                    task["creator_id"],
                    task["reviewer_id"],
                    user_id_by_role(db, "construction_manager"),
                    user_id_by_role(db, "owner"),
                }
                for watcher_id in watcher_ids:
                    if watcher_id and watcher_id != actor_id:
                        create_notification(
                            db,
                            task["project_id"],
                            int(watcher_id),
                            role_by_user_id(db, int(watcher_id)),
                            "Комментарий к задаче",
                            f"{task['project_title']}: {task['title']}. {comment[:180]}",
                            "task",
                            task_id,
                            force_max=force_max,
                        )
                db.commit()
                json_response(self, {"id": task_id, "comment": comment})
                return

            material_batch_action = re.match(r"^/api/material-request-batches/(\d+)/(accept|return|resubmit|schedule|save_actuals|resolve_issue|receive|update|delete|create_variation)$", path)
            if material_batch_action:
                batch_id = int(material_batch_action.group(1))
                action = material_batch_action.group(2)
                batch = db.execute(
                    """
                    SELECT b.*, p.title AS project_title, p.foreman_id, p.estimator_id, p.construction_manager_id
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
                force_max = force_personal_max(data)
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
                          AND COALESCE(m.change_type, '') != 'removed'
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
                        {
                            user_id
                            for user_id in (watcher_ids | {user_id_by_role(db, "procurement_manager"), batch["estimator_id"]})
                            if user_id
                        },
                        batch["project_id"],
                        "Создана допработа из заявки материалов",
                        message,
                        "variation",
                        variation_id,
                        force_max=force_max,
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
                        force_max=force_max,
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
                            remove_comment = "Удалено при исправлении заявки."
                            if update_comment:
                                remove_comment += f" {update_comment}"
                            db.execute(
                                """
                                UPDATE material_requests
                                SET needed_at = ?,
                                    delivery_urgency = ?,
                                    procurement_status = 'removed',
                                    total_amount = 0,
                                    change_type = 'removed',
                                    comment = ?,
                                    updated_at = CURRENT_TIMESTAMP
                                WHERE id = ? AND batch_id = ?
                                """,
                                (new_needed_at, new_urgency, remove_comment, request_id, batch_id),
                            )
                            continue
                        quantity = number_value(item.get("quantity"))
                        if quantity <= 0:
                            raise ValueError("Количество в строке заявки должно быть больше нуля.")
                        comment = str(item.get("comment") or "").strip()
                        title = str(item.get("title") or existing["title"] or "").strip()
                        basis_type = str(item.get("basis_type") or existing["basis_type"] or "main_estimate").strip()
                        requested_unit = str(item.get("unit") or existing["requested_unit"] or existing["estimate_material_unit"] or "").strip()
                        unit_price = number_value(existing["unit_price"])
                        total_amount = quantity * unit_price if unit_price else number_value(existing["total_amount"])
                        previous_change_type = str(existing["change_type"] or "").strip()
                        changed = (
                            title != str(existing["title"] or "").strip()
                            or basis_type != str(existing["basis_type"] or "").strip()
                            or abs(quantity - number_value(existing["requested_quantity"])) > 0.000001
                            or requested_unit != str(existing["requested_unit"] or existing["estimate_material_unit"] or "").strip()
                            or comment != str(existing["comment"] or "").strip()
                        )
                        change_type = previous_change_type
                        if previous_change_type == "removed":
                            change_type = "changed"
                        elif previous_change_type != "added" and changed:
                            change_type = "changed"
                        db.execute(
                            """
                            UPDATE material_requests
                            SET title = ?,
                                basis_type = ?,
                                needed_at = ?,
                                delivery_urgency = ?,
                                requested_quantity = ?,
                                requested_unit = ?,
                                total_amount = ?,
                                comment = ?,
                                change_type = ?,
                                procurement_status = 'new',
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ? AND batch_id = ?
                            """,
                            (title, basis_type, new_needed_at, new_urgency, quantity, requested_unit, total_amount, comment, change_type, request_id, batch_id),
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
                        item_unit = str(item.get("unit") or "").strip()
                        quantity = number_value(item.get("quantity"))
                        reason = str(item.get("reason") or "").strip()
                        if not material_name and not item_name and quantity <= 0:
                            continue
                        if not material_name or not item_name or not item_unit or quantity <= 0 or reason not in allowed_extra_reasons:
                            raise ValueError("Заполните материал, наименование, ед. измерения, количество и причину для дополнительных материалов.")
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
                            requested_unit=item_unit,
                            total_amount=0,
                            comment=f"{extra_reason_labels[reason]}. {update_comment}".strip(),
                            change_type="added",
                        )
                    remaining = db.execute("SELECT COUNT(*) AS count FROM material_requests WHERE batch_id = ? AND COALESCE(change_type, '') != 'removed'", (batch_id,)).fetchone()["count"]
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
                        force_max=force_max,
                    )
                    notify_material_deviation_for_estimators(
                        db,
                        batch_id,
                        batch,
                        "Заявка исправлена и повторно отправлена снабжению.",
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
                          AND COALESCE(change_type, '') != 'removed'
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
                            force_max=force_max,
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
                          AND COALESCE(change_type, '') != 'removed'
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
                        force_max=force_max,
                    )
                    notify_material_deviation_for_estimators(
                        db,
                        batch_id,
                        batch,
                        "Заявка повторно отправлена снабжению после доработки.",
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
                            force_max=force_max,
                        )
                    json_response(self, {"id": batch_id, "status": "new"})
                    return
                if action == "save_actuals":
                    if str(data.get("actor_role") or "") != "procurement_manager":
                        raise ValueError("Сохранить цены закупки может только снабжение.")
                    if str(batch["status"] or "") not in {"in_work", "delivery_scheduled", "received", "receipt_issue"}:
                        raise ValueError("Цены закупки можно сохранять после принятия заявки снабжением в работу.")
                    comment = str(data.get("comment") or "").strip()
                    actual_purchase_amount = save_material_actual_items(db, batch_id, data.get("actual_items") or [])
                    db.execute(
                        """
                        UPDATE material_request_batches
                        SET actual_purchase_amount = ?,
                            procurement_comment = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (actual_purchase_amount, comment or batch["procurement_comment"] or "", batch_id),
                    )
                    notify_material_actual_cost_overrun(db, batch_id, batch)
                    if force_max:
                        price_message = f"{batch['project_title']}: снабжение сохранило фактические цены закупки по заявке от {format_date_ru(batch['created_at'])}."
                        if actual_purchase_amount:
                            price_message += f" Сумма закупки: {actual_purchase_amount:g} ₽."
                        notify_users(
                            db,
                            watcher_ids,
                            batch["project_id"],
                            "Фактические цены закупки сохранены",
                            price_message,
                            "material_request_batch",
                            batch_id,
                            force_max=True,
                        )
                    json_response(self, {"id": batch_id, "status": batch["status"], "actual_purchase_amount": actual_purchase_amount})
                    return
                if action == "schedule":
                    delivery_date = data.get("scheduled_delivery_date") or ""
                    if not delivery_date:
                        raise ValueError("Укажите дату доставки.")
                    comment = str(data.get("comment") or "").strip()
                    actual_purchase_amount = save_material_actual_items(db, batch_id, data.get("actual_items") or [])
                    db.execute(
                        """
                        UPDATE material_request_batches
                        SET status = 'delivery_scheduled',
                            scheduled_delivery_date = ?,
                            procurement_comment = ?,
                            actual_purchase_amount = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (delivery_date, comment, actual_purchase_amount, batch_id),
                    )
                    db.execute(
                        """
                        UPDATE material_requests
                        SET procurement_status = 'delivery', actual_delivery_date = ?, procurement_comment = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE batch_id = ?
                          AND COALESCE(change_type, '') != 'removed'
                        """,
                        (delivery_date, comment, batch_id),
                    )
                    message = f"{batch['project_title']}: заявка на материалы от {format_date_ru(batch['created_at'])} обработана. Доставка состоится {format_date_ru(delivery_date)}."
                    if actual_purchase_amount:
                        message += f" Фактическая стоимость закупки: {actual_purchase_amount:g} ₽."
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
                        force_max=force_max,
                    )
                    notify_material_actual_cost_overrun(db, batch_id, batch)
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
                          AND COALESCE(change_type, '') != 'removed'
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
                        force_max=force_max,
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
                    allowed_receivers = {int(batch["foreman_id"] or 0), int(batch["creator_id"] or 0)} - {0}
                    can_receive = actor_role == "foreman" and actor_id and int(actor_id) in allowed_receivers
                    if not can_receive:
                        raise ValueError("Подтвердить получение материалов может прораб объекта или прораб, создавший заявку.")
                    if str(batch["status"] or "") != "delivery_scheduled":
                        raise ValueError("Подтверждение получения появится после того, как снабжение назначит доставку.")
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
                          AND COALESCE(change_type, '') != 'removed'
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
                        force_max=force_max,
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
                      AND COALESCE(change_type, '') != 'removed'
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
                        force_max=force_max,
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
                force_max = force_personal_max(data)
                creator_role = data.get("creator_role") or "construction_manager"
                creator_id = int(data.get("creator_id") or 0) or user_id_by_role(db, creator_role) or user_id_by_role(db, "construction_manager") or 2
                reviewer_id = int(data.get("reviewer_id") or creator_id)
                assignee_id = int(data.get("assignee_id") or 2)
                project_id = int(data["project_id"])
                contract_id = int(data.get("contract_id") or 0) or first_project_contract_id(db, project_id)
                task_type = normalize_task_type_value(
                    data.get("task_type"),
                    data.get("title") or "Новая задача",
                    data.get("description") or "",
                    data.get("related_type") or "project",
                )
                cursor = db.execute(
                    """
                    INSERT INTO tasks (
                        project_id, title, assignee_id, creator_id, reviewer_id, due_date,
                        status, priority, task_type, related_type, description, start_date, contract_id
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        project_id,
                        data.get("title") or "Новая задача",
                        assignee_id,
                        creator_id,
                        reviewer_id,
                        data.get("due_date") or None,
                        data.get("priority") or "normal",
                        task_type,
                        data.get("related_type") or "project",
                        data.get("description") or "",
                        data.get("start_date") or None,
                        contract_id,
                    ),
                )
                project = db.execute("SELECT title FROM projects WHERE id = ?", (project_id,)).fetchone()
                create_task_event(
                    db,
                    task_id=int(cursor.lastrowid),
                    project_id=project_id,
                    actor_id=creator_id,
                    action="create",
                    status_from="",
                    status_to="new",
                    comment=data.get("description") or "Задача поставлена.",
                    due_date=data.get("due_date") or None,
                )
                create_notification(
                    db,
                    project_id,
                    assignee_id,
                    role_by_user_id(db, assignee_id),
                    "Назначена новая задача",
                    f"{project['title'] if project else 'Объект'}: {data.get('title') or 'Новая задача'}",
                    "task",
                    int(cursor.lastrowid),
                    force_max=force_max,
                )
                for watcher_id in (user_id_by_role(db, "construction_manager"), user_id_by_role(db, "owner")):
                    if watcher_id and watcher_id not in {assignee_id, creator_id}:
                        create_notification(
                            db,
                            project_id,
                            watcher_id,
                            role_by_user_id(db, watcher_id),
                            "Назначена новая задача",
                            f"{project['title'] if project else 'Объект'}: {data.get('title') or 'Новая задача'}",
                            "task",
                            int(cursor.lastrowid),
                            force_max=force_max,
                        )
                json_response(self, {"id": cursor.lastrowid}, 201)
                return

            if path == "/api/blockers":
                role = account_role(account)
                if role not in {"owner", "construction_manager", "finance_director", "foreman", "master", "procurement_manager", "estimator", "technical_supervisor"}:
                    raise PermissionError("Недостаточно прав для создания блокера.")
                project_id = int(data.get("project_id") or 0)
                if not project_id:
                    raise ValueError("Выберите объект.")
                project = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
                if not project or not project_visible_for_account(row_to_dict(project), account):
                    raise PermissionError("Объект недоступен.")
                title = str(data.get("title") or "").strip()
                if not title:
                    raise ValueError("Укажите, что тормозит объект.")
                cursor = db.execute(
                    """
                    INSERT INTO blockers (
                        project_id, title, description, blocker_type, responsible_user_id,
                        due_date, severity, status, linked_task_id, linked_material_request_id,
                        linked_issue_id, created_by
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
                    """,
                    (
                        project_id,
                        title,
                        str(data.get("description") or "").strip(),
                        data.get("blocker_type") or "other",
                        int(data.get("responsible_user_id") or 0) or None,
                        data.get("due_date") or None,
                        data.get("severity") or "medium",
                        int(data.get("linked_task_id") or 0) or None,
                        int(data.get("linked_material_request_id") or 0) or None,
                        int(data.get("linked_issue_id") or 0) or None,
                        account_user_id(account) or None,
                    ),
                )
                message = f"{project['title']}: блокер — {title}"
                for watcher_id in {user_id_by_role(db, "owner"), user_id_by_role(db, "construction_manager"), int(data.get("responsible_user_id") or 0) or None}:
                    if watcher_id:
                        create_notification(
                            db,
                            project_id,
                            watcher_id,
                            role_by_user_id(db, watcher_id),
                            "Новый блокер объекта",
                            message,
                            "blocker",
                            int(cursor.lastrowid),
                            force_max=force_personal_max(data),
                        )
                json_response(self, {"id": cursor.lastrowid}, 201)
                return

            if path == "/api/material-requests/bulk":
                force_max = force_personal_max(data)
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
                project = db.execute(
                    "SELECT id, title, foreman_id, estimator_id, construction_manager_id FROM projects WHERE id = ?",
                    (project_id,),
                ).fetchone()
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
                    item_unit = str(item.get("unit") or "").strip()
                    quantity = number_value(item.get("quantity"))
                    reason = str(item.get("reason") or "").strip()
                    if not material_name and not item_name and quantity <= 0:
                        continue
                    if not material_name or not item_name or not item_unit or quantity <= 0 or reason not in allowed_extra_reasons:
                        raise ValueError("Заполните материал, наименование, ед. измерения, количество и причину для дополнительных материалов.")
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
                            requested_unit=item_unit,
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
                    force_max=force_max,
                )
                if project and any(
                    row["basis_type"] != "main_estimate"
                    for row in db.execute("SELECT basis_type FROM material_requests WHERE batch_id = ?", (batch_id,)).fetchall()
                ):
                    notify_material_deviation_for_estimators(
                        db,
                        batch_id,
                        project,
                        "Заявка создана прорабом или руководителем.",
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

            if path == "/api/document-folders":
                if account_role(account) not in {"owner", "construction_manager", "finance_director"}:
                    json_response(self, {"error": "Forbidden"}, 403)
                    return
                parent_id = int(data.get("parent_id") or 0) or None
                folder_id = ensure_knowledge_folder(db, data.get("title"), parent_id, account_user_id(account) or None)
                folders = knowledge_folders_with_paths(db)
                folder = next((item for item in folders if int(item["id"]) == folder_id), {"id": folder_id})
                json_response(self, folder, 201)
                return

            if path == "/api/documents":
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

                def save_document_payload(item: dict) -> int | None:
                    item_file = dict(item.get("document_file") or {})
                    if not item_file.get("file_base64"):
                        return None
                    base_folder_id = int(item.get("folder_id") or data.get("folder_id") or 0) or None
                    relative_path = item.get("relative_path") or item_file.get("relative_path") or ""
                    relative_parts = normalize_relative_path(relative_path)
                    file_name = item_file.get("file_name") or item.get("title") or data.get("title") or "Документ"
                    folder_parts = relative_parts[:-1] if relative_parts else []
                    folder_id = ensure_knowledge_folder_path(
                        db,
                        base_folder_id,
                        folder_parts if related_type == "knowledge_base" else [],
                        account_user_id(account) or None,
                    )
                    folder_path = knowledge_folder_path(db, folder_id) if related_type == "knowledge_base" else ""
                    item_file["related_section"] = item.get("related_section") or data.get("related_section") or ""
                    item_file["contract_id"] = item.get("contract_id") or data.get("contract_id") or None
                    item_file["process_type"] = item.get("process_type") or data.get("process_type") or ""
                    title = item.get("title") or data.get("title") or file_name
                    doc_type = item.get("type") or data.get("type") or "other"
                    owner_id = int(item.get("owner_id") or data.get("owner_id") or 0) or account_user_id(account) or 2
                    document_id = save_document_file(
                        db,
                        project_id,
                        item_file,
                        title,
                        doc_type,
                        related_type,
                        folder_id=folder_id,
                        folder_path=folder_path,
                        owner_id=owner_id,
                    )
                    if not document_id:
                        return None
                    db.execute(
                        """
                        UPDATE documents
                        SET version = ?, status = ?, owner_id = ?, due_date = ?,
                            related_section = ?, contract_id = ?, process_type = ?, folder_id = ?
                        WHERE id = ?
                        """,
                        (
                            item.get("version") or data.get("version") or "",
                            item.get("status") or data.get("status") or "draft",
                            owner_id,
                            item.get("due_date") or data.get("due_date") or None,
                            item.get("related_section") or data.get("related_section") or "",
                            int(item.get("contract_id") or data.get("contract_id") or 0) or None,
                            item.get("process_type") or data.get("process_type") or "",
                            folder_id,
                            document_id,
                        ),
                    )
                    return document_id

                documents_payload = data.get("documents")
                if isinstance(documents_payload, list) and documents_payload:
                    document_ids = [doc_id for doc_id in (save_document_payload(item or {}) for item in documents_payload) if doc_id]
                    if not document_ids:
                        json_response(self, {"error": "Не найден ни один файл для загрузки"}, 400)
                        return
                    json_response(self, {"ids": document_ids, "count": len(document_ids)}, 201)
                    return

                file_data = data.get("document_file") or {}
                if file_data.get("file_base64"):
                    document_id = save_document_payload(data)
                    json_response(self, {"id": document_id}, 201)
                    return

                folder_id = validate_knowledge_folder(db, int(data.get("folder_id") or 0) or None) if related_type == "knowledge_base" else None
                cursor = db.execute(
                    """
                    INSERT INTO documents (
                        project_id, folder_id, title, type, version, status, owner_id, due_date, related_type,
                        related_section, contract_id, process_type, file_name, file_path, mime_type, file_size
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)
                    """,
                    (
                        project_id,
                        folder_id,
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
                        raise ValueError("В файле материалов по доп. соглашению не найдены позиции. Загрузите выгрузку материалов из Сметтера.")
                    materials_file["contract_id"] = contract_id
                    materials_file["process_type"] = "additional_agreement_materials"
                    save_document_file(
                        db,
                        project_id,
                        materials_file,
                        "Материалы по доп. соглашению из Сметтера",
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
                            "Материалы по доп. соглашению",
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
                        raise ValueError("В файле работ по доп. соглашению не найдены работы. Загрузите задание на работы из Сметтера.")
                    works_file["contract_id"] = contract_id
                    works_file["process_type"] = "additional_agreement_works"
                    save_document_file(
                        db,
                        project_id,
                        works_file,
                        "Задание на работы по доп. соглашению из Сметтера",
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
                        "Работы по доп. соглашению требуют решения",
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
