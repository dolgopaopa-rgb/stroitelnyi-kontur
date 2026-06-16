#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT / "app" / "static"


@dataclass
class AgentCheck:
    agent: str
    name: str
    status: str
    details: str
    recommendation: str = ""


def read_text(relative_path: str) -> str:
    path = ROOT / relative_path
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def add(
    checks: list[AgentCheck],
    agent: str,
    name: str,
    status: str,
    details: str,
    recommendation: str = "",
) -> None:
    checks.append(AgentCheck(agent=agent, name=name, status=status, details=details, recommendation=recommendation))


def has_all(text: str, needles: list[str]) -> bool:
    return all(needle in text for needle in needles)


def basic_auth_headers(username: str | None, password: str | None) -> dict[str, str]:
    if not username or not password:
        return {}
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    return {"Authorization": f"Basic {token}"}


def absolute_url(base_url: str, path: str) -> str:
    return urllib.parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))


def fetch_url(
    base_url: str,
    path: str,
    headers: dict[str, str] | None = None,
    timeout: int = 20,
) -> tuple[int, dict[str, str], bytes, str]:
    request = urllib.request.Request(
        absolute_url(base_url, path),
        headers={
            "User-Agent": "kontur-agent-suite/1.0",
            **(headers or {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, dict(response.headers), response.read(), ""
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read(), ""
    except Exception as exc:  # pragma: no cover - network environment differs by runner.
        return 0, {}, b"", str(exc)


def run_command(command: list[str], timeout: int = 60) -> tuple[int, str]:
    try:
        result = subprocess.run(
            command,
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            check=False,
        )
        return result.returncode, result.stdout.strip()
    except Exception as exc:  # pragma: no cover - local tool availability differs by machine.
        return 127, str(exc)


def git_tracked_files() -> list[str]:
    code, output = run_command(["git", "ls-files"], timeout=30)
    if code != 0:
        return []
    return [line.strip() for line in output.splitlines() if line.strip()]


def find_node() -> str | None:
    candidates = [
        os.environ.get("NODE"),
        shutil.which("node"),
        str(Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies" / "node" / "bin" / "node.exe"),
        str(Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies" / "node" / "bin" / "node"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return None


def asset_version_from_index(index_html: str) -> str | None:
    match = re.search(r'app(?:\.compat)?\.js\?v=([^"]+)', index_html)
    return match.group(1) if match else None


def agent_availability(checks: list[AgentCheck], base_url: str, headers: dict[str, str]) -> None:
    agent = "Доступность сайта"
    status, _, body, error = fetch_url(base_url, "/health", headers)
    if status == 200:
        add(checks, agent, "Health endpoint", "OK", "/health отвечает HTTP 200.")
    else:
        add(checks, agent, "Health endpoint", "FAIL", f"/health вернул HTTP {status or error}.", "Проверить контейнер приложения и reverse proxy.")

    status, _, body, error = fetch_url(base_url, "/login", headers)
    login_text = body.decode("utf-8", "replace")
    if status == 200 and ("password" in login_text or "Пароль" in login_text):
        add(checks, agent, "Страница входа", "OK", "Страница входа доступна и содержит форму пароля.")
    else:
        add(checks, agent, "Страница входа", "WARN", f"/login вернул HTTP {status or error}.", "Проверить страницу входа с мобильного и desktop.")

    status, _, body, error = fetch_url(base_url, "/", headers)
    if status in {200, 401, 403}:
        add(checks, agent, "Главная точка входа", "OK", f"/ отвечает ожидаемым HTTP {status}.")
    else:
        add(checks, agent, "Главная точка входа", "FAIL", f"/ вернул HTTP {status or error}.", "Проверить доступность production.")


def agent_build_syntax(checks: list[AgentCheck]) -> None:
    agent = "Сборка и синтаксис"
    python_files = [
        "app/database.py",
        "app/server.py",
        "app/send_max_message.py",
        "tools/create_ai_audit_token.py",
        "tools/kontur_quality_agent.py",
        "tools/kontur_agent_suite.py",
    ]
    code, output = run_command([sys.executable, "-m", "py_compile", *python_files], timeout=120)
    if code == 0:
        add(checks, agent, "Python syntax", "OK", f"Проверены файлы: {', '.join(python_files)}.")
    else:
        add(checks, agent, "Python syntax", "FAIL", output or "py_compile завершился ошибкой.", "Исправить синтаксис Python до деплоя.")

    node = find_node()
    if not node:
        add(checks, agent, "JavaScript syntax", "INFO", "Node.js не найден локально, JS-синтаксис пропущен.")
        return
    js_files = ["app/static/app.js", "app/static/app.compat.js"]
    failures: list[str] = []
    for file_name in js_files:
        if not (ROOT / file_name).exists():
            continue
        code, output = run_command([node, "--check", file_name], timeout=120)
        if code != 0:
            failures.append(f"{file_name}: {output}")
    if failures:
        add(checks, agent, "JavaScript syntax", "FAIL", "\n".join(failures), "Исправить JS до сборки и деплоя.")
    else:
        add(checks, agent, "JavaScript syntax", "OK", f"Проверены файлы: {', '.join(js_files)}.")


def agent_static_pwa(checks: list[AgentCheck], base_url: str, headers: dict[str, str]) -> None:
    agent = "Статика и PWA"
    index_html = read_text("app/static/index.html")
    manifest_text = read_text("app/static/manifest.webmanifest")
    sw_text = read_text("app/static/sw.js")
    repo_version = asset_version_from_index(index_html)

    if repo_version and repo_version in sw_text:
        add(checks, agent, "Версия фронтенда и service worker", "OK", f"Версия {repo_version} синхронизирована в index.html и sw.js.")
    else:
        add(checks, agent, "Версия фронтенда и service worker", "FAIL", "Версия app.js в index.html не совпадает с кэшем service worker.", "Обновить query version и CACHE_NAME вместе.")

    static_assets = [
        "/static/styles.css",
        "/static/app.js",
        "/static/app.compat.js",
        "/static/manifest.webmanifest",
        "/static/sw.js",
        "/static/assets/g2-logo-192.png",
        "/static/assets/g2-logo-512.png",
    ]
    missing: list[str] = []
    for asset in static_assets:
        status, _, _, error = fetch_url(base_url, asset, headers, timeout=20)
        if status != 200:
            missing.append(f"{asset}: {status or error}")
    if missing:
        add(checks, agent, "Production static assets", "FAIL", "; ".join(missing), "Проверить Docker volume, static route и Caddy.")
    else:
        add(checks, agent, "Production static assets", "OK", "Основные CSS/JS/PWA-ресурсы доступны на production.")

    try:
        manifest = json.loads(manifest_text)
    except json.JSONDecodeError as exc:
        add(checks, agent, "Manifest JSON", "FAIL", str(exc), "Исправить manifest.webmanifest.")
        return
    icons = manifest.get("icons", [])
    icon_sizes = {icon.get("sizes") for icon in icons}
    if manifest.get("display") == "standalone" and {"192x192", "512x512"}.issubset(icon_sizes):
        add(checks, agent, "PWA manifest", "OK", "Есть standalone-режим и иконки 192/512.")
    else:
        add(checks, agent, "PWA manifest", "WARN", "Manifest не полностью готов для установки на телефон.", "Проверить display, start_url и иконки.")


def agent_mobile_compatibility(checks: list[AgentCheck]) -> None:
    agent = "Мобильность"
    app_text = read_text("app/static/app.js")
    compat_text = read_text("app/static/app.compat.js")
    login_text = read_text("app/static/login.html")

    if has_all(app_text, ["pullRefresh", "touchstart", "touchmove", "refreshAppFromUser"]):
        add(checks, agent, "Pull-to-refresh", "OK", "В коде есть жест обновления потягиванием вниз.")
    else:
        add(checks, agent, "Pull-to-refresh", "WARN", "Не найден полный контракт pull-to-refresh.", "Проверить мобильное обновление страниц.")

    if has_all(app_text, ["wheel", "scrollBy"]) or "overscroll-behavior" in read_text("app/static/styles.css"):
        add(checks, agent, "Прокрутка колесом и жестами", "OK", "Есть явная поддержка скролла страницы/контента.")
    else:
        add(checks, agent, "Прокрутка колесом и жестами", "WARN", "Не найден контракт исправления скролла.", "Проверить desktop wheel и мобильный scroll.")

    forbidden_modern_syntax = ["?.", "??"]
    if compat_text and not any(item in compat_text for item in forbidden_modern_syntax):
        add(checks, agent, "Huawei/старый WebView bundle", "OK", "app.compat.js не содержит optional chaining/nullish coalescing.")
    else:
        add(checks, agent, "Huawei/старый WebView bundle", "WARN", "В app.compat.js найдены современные операторы или файл пустой.", "Пересобрать совместимый bundle.")

    if has_all(login_text, ["password", "passwordPaste", "clipboard"]) and ("Показать" in login_text or "show" in login_text):
        add(checks, agent, "Мобильный вход", "OK", "На странице входа есть вставка и показ пароля.")
    else:
        add(checks, agent, "Мобильный вход", "WARN", "Не найден полный набор удобств для ввода пароля.", "Проверить вставку, очистку и показ пароля на телефоне.")


def agent_roles_access(checks: list[AgentCheck]) -> None:
    agent = "Роли и доступы"
    app_text = read_text("app/static/app.js")
    server_text = read_text("app/server.py")
    database_text = read_text("app/database.py")

    required_roles = [
        "owner",
        "construction_manager",
        "finance_director",
        "accountant",
        "sales_manager",
        "foreman",
        "procurement_manager",
        "estimator",
        "technical_supervisor",
        "ai_auditor",
    ]
    missing_roles = [role for role in required_roles if role not in app_text]
    if not missing_roles and "const viewAccess" in app_text:
        add(checks, agent, "Матрица видимости меню", "OK", "В интерфейсе есть viewAccess для всех ключевых ролей.")
    else:
        add(checks, agent, "Матрица видимости меню", "FAIL", f"Не найдены роли: {', '.join(missing_roles) or 'viewAccess'}.", "Восстановить матрицу видимости.")

    manager_contract = 'sales_manager: ["today", "dashboard", "projects", "estimates", "documents"]'
    if manager_contract in app_text:
        add(checks, agent, "Менеджер видит только нужные разделы", "OK", "Меню менеджера ограничено рабочим столом, объектами, сметами и документами.")
    else:
        add(checks, agent, "Менеджер видит только нужные разделы", "WARN", "Контракт меню менеджера изменился.", "Проверить, что менеджер не видит задачи/работы/материалы/журнал.")

    if has_all(server_text, ["ai_auditor", "READ_ONLY_ROLES", "is_read_only_account", "reject_mutating_method", "403"]) and "audit_tokens" in database_text:
        add(checks, agent, "ИИ-аудитор только читает", "OK", "Есть audit_tokens и серверная защита write-методов для ai_auditor.")
    else:
        add(checks, agent, "ИИ-аудитор только читает", "FAIL", "Не найден полный read-only контракт ИИ-аудитора.", "Запретить POST/PUT/PATCH/DELETE для ai_auditor.")

    if has_all(app_text, ["documentAccess", "visibleDocuments", "projectFileDocumentTypes"]):
        add(checks, agent, "Доступ к документам", "OK", "Документы фильтруются по роли и типу.")
    else:
        add(checks, agent, "Доступ к документам", "WARN", "Не найден полный контракт фильтрации документов.", "Проверить, что прорабы и снабжение не видят лишние договоры/сметы.")


def agent_security(checks: list[AgentCheck]) -> None:
    agent = "Безопасность"
    tracked = set(git_tracked_files())
    risky_tracked = sorted(path for path in tracked if path.endswith((".env", ".pem", ".key", ".sqlite", ".db")))
    if risky_tracked:
        add(checks, agent, "Секреты и рабочие базы в Git", "FAIL", f"В Git попали рискованные файлы: {', '.join(risky_tracked)}.", "Убрать секреты/базы из репозитория и сменить скомпрометированные доступы.")
    else:
        add(checks, agent, "Секреты и рабочие базы в Git", "OK", "В отслеживаемых файлах нет .env, ключей и рабочих баз.")

    gitignore = read_text(".gitignore")
    if has_all(gitignore, [".env", "data/", "__pycache__"]):
        add(checks, agent, "Gitignore", "OK", ".env, data и кэш исключены.")
    else:
        add(checks, agent, "Gitignore", "WARN", ".gitignore может пропустить рабочие данные.", "Проверить исключения для секретов, загрузок и баз.")

    server_text = read_text("app/server.py")
    if has_all(server_text, ["HttpOnly", "SameSite=Lax"]) and ("Secure" in server_text or "localhost" in server_text):
        add(checks, agent, "Session cookie", "OK", "Cookie сессии помечается HttpOnly/SameSite и учитывает Secure.")
    else:
        add(checks, agent, "Session cookie", "WARN", "Не найден полный контракт cookie-сессии.", "Проверить флаги Secure, HttpOnly, SameSite.")

    if "token_hash" in read_text("app/database.py") and "sha256" in read_text("tools/create_ai_audit_token.py"):
        add(checks, agent, "Audit token storage", "OK", "Токены ИИ-аудита хранятся как hash.")
    else:
        add(checks, agent, "Audit token storage", "FAIL", "Не найден hash-контракт audit token.", "Не хранить audit token в открытом виде.")


def agent_documents_files(checks: list[AgentCheck]) -> None:
    agent = "Документы и файлы"
    app_text = read_text("app/static/app.js")
    server_text = read_text("app/server.py")
    database_text = read_text("app/database.py")

    if has_all(database_text, ["knowledge_folders", "folder_id", "idx_documents_folder"]):
        add(checks, agent, "Папки базы знаний", "OK", "В базе есть папки и привязка документов к папке.")
    else:
        add(checks, agent, "Папки базы знаний", "FAIL", "Не найден контракт папок базы знаний.", "Вернуть knowledge_folders и folder_id.")

    if has_all(app_text, ["dragover", "drop", "webkitGetAsEntry", "uploadKnowledgeFiles"]):
        add(checks, agent, "Drag-and-drop загрузка", "OK", "Поддержана загрузка файлов и папок перетаскиванием.")
    else:
        add(checks, agent, "Drag-and-drop загрузка", "WARN", "Не найден полный drag-and-drop контракт.", "Проверить загрузку папки внутрь текущей папки.")

    if has_all(server_text, ["do_HEAD", "Range", "Content-Range"]):
        add(checks, agent, "Открытие больших файлов", "OK", "Сервер поддерживает HEAD/Range для просмотра медиа и файлов.")
    else:
        add(checks, agent, "Открытие больших файлов", "WARN", "Не найден HEAD/Range контракт.", "Проверить открытие PDF/фото/видео с мобильного интернета.")

    if has_all(server_text, ["YANDEX_DISK", "download_from_yandex_disk", "upload_to_yandex_disk"]):
        add(checks, agent, "Облачное хранилище", "OK", "Есть интеграционный слой Яндекс.Диска для файлов.")
    else:
        add(checks, agent, "Облачное хранилище", "INFO", "Интеграция облачного хранения не обнаружена или не включена.")


def agent_max_notifications(checks: list[AgentCheck]) -> None:
    agent = "MAX и уведомления"
    server_text = read_text("app/server.py")
    send_text = read_text("app/send_max_message.py")
    app_text = read_text("app/static/app.js")

    if has_all(send_text, ["--message-base64", "message_base64", "utf-8"]) and "MAX_API_URL" in server_text:
        add(checks, agent, "Кодировка сообщений в MAX", "OK", "Отправка в MAX поддерживает base64/UTF-8.")
    else:
        add(checks, agent, "Кодировка сообщений в MAX", "FAIL", "Не найден безопасный UTF-8 контракт отправки в MAX.", "Использовать base64-сообщения и UTF-8.")

    if has_all(server_text, ["send_max_message", "max_notifications_enabled", "force_personal_max"]):
        add(checks, agent, "Персональные уведомления", "OK", "Есть возможность принудительно отправлять MAX-уведомление адресату.")
    else:
        add(checks, agent, "Персональные уведомления", "WARN", "Не найден полный контракт персональных MAX-уведомлений.", "Проверить опцию 'Уведомить личным сообщением'.")

    if has_all(app_text, ["notify_personal", "Уведомить личным сообщением"]):
        add(checks, agent, "Опция в интерфейсе", "OK", "В интерфейсе есть выбор личного уведомления.")
    else:
        add(checks, agent, "Опция в интерфейсе", "WARN", "Не найден UI-переключатель личного уведомления.", "Добавить явный чекбокс в операции, где нужен адресный MAX.")

    if "max_message_text_is_corrupted" in server_text or "????????" in send_text:
        add(checks, agent, "Защита от знаков вопроса", "OK", "В коде есть защита от испорченной кодировки сообщений.")
    else:
        add(checks, agent, "Защита от знаков вопроса", "WARN", "Не найден отдельный детектор испорченного текста.", "Не отправлять в рабочий чат сообщения с поврежденной кириллицей.")


def agent_construction_logic(checks: list[AgentCheck]) -> None:
    agent = "Строительная логика"
    database_text = read_text("app/database.py")
    server_text = read_text("app/server.py")
    app_text = read_text("app/static/app.js")

    required_tables = [
        "projects",
        "customers",
        "tasks",
        "task_events",
        "material_requests",
        "material_request_batches",
        "estimate_materials",
        "work_items",
        "work_extra_items",
        "estimate_jobs",
        "estimate_job_files",
        "object_remarks",
        "photo_reports",
        "variations",
        "contracts",
    ]
    missing = [name for name in required_tables if name not in database_text]
    if missing:
        add(checks, agent, "Модель стройки", "FAIL", f"Нет таблиц/сущностей: {', '.join(missing)}.", "Вернуть ключевые сущности процесса.")
    else:
        add(checks, agent, "Модель стройки", "OK", "Есть объекты, задачи, материалы, работы, сметы, замечания, фотоотчеты и договоры.")

    if has_all(server_text, ["parse_smetter_work_task_xlsx", "parse_uploaded_works", "import_smetter_works_from_documents", "используемые материалы", "break"]):
        add(checks, agent, "Разделение работ и материалов Сметтера", "OK", "Есть отдельный импорт материалов и заданий на работы.")
    else:
        add(checks, agent, "Разделение работ и материалов Сметтера", "WARN", "Контракт разделения работ/материалов может быть неполным.", "Проверить, что материалы из файла задания на работы игнорируются.")

    if has_all(app_text, ["estimate_done", "estimate_returned", "replace", "version_no"]):
        add(checks, agent, "Сметные задания и версии файлов", "OK", "Сметчик может работать со статусами и версиями файлов.")
    else:
        add(checks, agent, "Сметные задания и версии файлов", "WARN", "Не найден полный контракт версий сметы.", "Проверить добавление/замену файла после сдачи сметы.")

    if has_all(app_text, ["materials_pipeline", "need_approval", "in_transit", "on_site"]) or has_all(app_text, ["Нужно согласовать", "В пути", "На объекте"]):
        add(checks, agent, "Pipeline материалов", "OK", "Материалы отображаются как процесс согласования/заказа/доставки.")
    else:
        add(checks, agent, "Pipeline материалов", "WARN", "Не найден полный pipeline материалов.", "Проверить статусы: согласование, заказано, в пути, на объекте, проблема, закрыто.")


def agent_ux_design(checks: list[AgentCheck]) -> None:
    agent = "UX и дизайн"
    app_text = read_text("app/static/app.js")
    styles = read_text("app/static/styles.css")
    index_html = read_text("app/static/index.html")

    if has_all(app_text, ["statusLabelMap", "statusLevel"]) and "statusLabelMap[value]" in app_text:
        add(checks, agent, "Человеческие статусы", "OK", "Есть единая карта человекочитаемых статусов и цветов.")
    else:
        add(checks, agent, "Человеческие статусы", "FAIL", "Не найден единый statusLabelMap/statusLevel.", "Не показывать пользователям технические enum.")

    raw_enums = ["in_progress", "main_estimate", "construction_manager", "procurement_manager"]
    if any(f">{enum}<" in index_html for enum in raw_enums):
        add(checks, agent, "Технические enum в HTML", "FAIL", "В HTML видны технические enum.", "Заменить на русские подписи.")
    else:
        add(checks, agent, "Технические enum в HTML", "OK", "В index.html не найдены видимые технические enum.")

    if has_all(app_text, ["todayView", "renderToday", "Требует решения"]):
        add(checks, agent, "Экран Сегодня", "OK", "Есть отдельный фокусный экран на сегодня.")
    else:
        add(checks, agent, "Экран Сегодня", "WARN", "Не найден полный экран Сегодня.", "Проверить /today и блоки внимания.")

    server_text = read_text("app/server.py")
    snapshot_contract = [
        "generatedAt",
        "appVersion",
        "Проверка первого ТЗ",
        "human_status_labels",
        "today_screen",
        "object_attention_block",
        "task_short_cards",
        "photo_reports_entity",
        "object_issues_entity",
        "document_classification",
        "live_audit_login",
        "frontend_label_maps",
        "SNAPSHOT_FORBIDDEN_ENUMS",
    ]
    if has_all(server_text, snapshot_contract):
        add(checks, agent, "AI audit snapshot UX", "OK", "Snapshot содержит метаданные, UX-фичи и использует карты подписей живого интерфейса.")
    else:
        add(checks, agent, "AI audit snapshot UX", "WARN", "Snapshot может отставать от актуального UX.", "Проверить /ai-audit-snapshot/:token и список UX-фич.")

    if has_all(app_text, ["toggle", "expanded", "collapsed"]) or has_all(styles, ["details", "summary"]):
        add(checks, agent, "Сворачивание длинных блоков", "OK", "В коде есть контракты раскрытия/сворачивания.")
    else:
        add(checks, agent, "Сворачивание длинных блоков", "WARN", "Не найден общий контракт сворачивания.", "Проверить объекты, задачи, материалы и базу знаний.")

    if has_all(styles, ["spinner", "loading"]) and "setAppLoading" in app_text:
        add(checks, agent, "Инфографика загрузки", "OK", "Есть глобальная загрузка и визуальный индикатор.")
    else:
        add(checks, agent, "Инфографика загрузки", "WARN", "Не найден полный индикатор загрузки.", "Добавить видимый кружок при сохранении и загрузке файлов.")


def agent_api_smoke(checks: list[AgentCheck], base_url: str, headers: dict[str, str]) -> None:
    agent = "API smoke"
    if "Authorization" not in headers:
        add(checks, agent, "Авторизованные API", "INFO", "Логин/пароль не переданы, глубокий API smoke пропущен.")
        return
    endpoints = [
        "/api/session",
        "/api/users",
        "/api/projects",
        "/api/tasks",
        "/api/material-requests",
        "/api/summary",
        "/api/estimate-jobs",
        "/api/feedback",
    ]
    bad: list[str] = []
    ok_count = 0
    for endpoint in endpoints:
        status, response_headers, body, error = fetch_url(base_url, endpoint, headers, timeout=20)
        content_type = response_headers.get("Content-Type", "")
        if status == 200 and ("json" in content_type or body[:1] in {b"{", b"["}):
            ok_count += 1
            continue
        bad.append(f"{endpoint}: {status or error}")
    if bad:
        add(checks, agent, "Основные JSON API", "WARN", "; ".join(bad), "Проверить Basic/session auth и API-роуты.")
    else:
        add(checks, agent, "Основные JSON API", "OK", f"Проверено API endpoints: {ok_count}.")


def agent_core_quality(checks: list[AgentCheck], base_url: str, username: str | None, password: str | None) -> None:
    agent = "Основной QA-агент"
    sys.path.insert(0, str(ROOT / "tools"))
    import kontur_quality_agent as qa  # pylint: disable=import-outside-toplevel

    core_checks, recommendations = qa.run_checks(base_url, username, password)
    failed = sum(1 for item in core_checks if item.status == "FAIL")
    warnings = sum(1 for item in core_checks if item.status == "WARN")
    status = "FAIL" if failed else ("WARN" if warnings else "OK")
    add(
        checks,
        agent,
        "Итог старшего QA",
        status,
        f"Проверок: {len(core_checks)}, FAIL: {failed}, WARN: {warnings}, рекомендаций: {len(recommendations)}.",
        "Сначала исправлять FAIL, затем WARN." if status != "OK" else "",
    )
    for item in core_checks:
        if item.status in {"FAIL", "WARN"}:
            add(checks, agent, item.name, item.status, item.details, item.recommendation)


def build_report(base_url: str, checks: list[AgentCheck]) -> str:
    now = dt.datetime.now(dt.timezone.utc).astimezone()
    totals = {status: sum(1 for item in checks if item.status == status) for status in ["OK", "WARN", "FAIL", "INFO"]}
    agents = list(dict.fromkeys(item.agent for item in checks))
    lines = [
        "# Совет агентов Строительного контура",
        "",
        f"- Дата проверки: {now:%Y-%m-%d %H:%M:%S %Z}",
        f"- Адрес: {base_url}",
        f"- Агентов: {len(agents)}",
        f"- OK: {totals['OK']}",
        f"- WARN: {totals['WARN']}",
        f"- FAIL: {totals['FAIL']}",
        f"- INFO: {totals['INFO']}",
        "",
        "## Состав агентов",
        "",
    ]
    lines.extend(f"- {agent}" for agent in agents)
    lines.extend(["", "## Проверки", ""])
    for agent in agents:
        lines.extend([f"### {agent}", ""])
        for item in [check for check in checks if check.agent == agent]:
            lines.append(f"- **{item.status}** {item.name}: {item.details}")
            if item.recommendation:
                lines.append(f"  Рекомендация: {item.recommendation}")
        lines.append("")
    if totals["FAIL"]:
        lines.extend(["## Решение", "", "Есть критичные нарушения. Деплой или приемку лучше остановить до исправления FAIL."])
    elif totals["WARN"]:
        lines.extend(["## Решение", "", "Критичных нарушений нет, но есть предупреждения для ближайшей доработки."])
    else:
        lines.extend(["## Решение", "", "Критичных нарушений и предупреждений нет."])
    lines.append("")
    return "\n".join(lines)


def write_reports(report: str, report_dir: Path) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    timestamp = dt.datetime.now(dt.timezone.utc).astimezone().strftime("%Y%m%d-%H%M%S")
    (report_dir / "latest.md").write_text(report, encoding="utf-8")
    (report_dir / f"suite-{timestamp}.md").write_text(report, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Agent suite for Stroitelnyi Kontur.")
    parser.add_argument("--url", default=os.environ.get("KONTUR_URL", "https://kontur.derevgroup.ru"))
    parser.add_argument("--username", default=os.environ.get("KONTUR_BASIC_USER"))
    parser.add_argument("--password", default=os.environ.get("KONTUR_BASIC_PASSWORD"))
    parser.add_argument("--report-dir", default="")
    args = parser.parse_args()

    headers = basic_auth_headers(args.username, args.password)
    checks: list[AgentCheck] = []

    agent_availability(checks, args.url, headers)
    agent_build_syntax(checks)
    agent_static_pwa(checks, args.url, headers)
    agent_mobile_compatibility(checks)
    agent_roles_access(checks)
    agent_security(checks)
    agent_documents_files(checks)
    agent_max_notifications(checks)
    agent_construction_logic(checks)
    agent_ux_design(checks)
    agent_api_smoke(checks, args.url, headers)
    agent_core_quality(checks, args.url, args.username, args.password)

    report = build_report(args.url, checks)
    print(report)
    if args.report_dir:
        write_reports(report, ROOT / args.report_dir)
    return 1 if any(item.status == "FAIL" for item in checks) else 0


if __name__ == "__main__":
    raise SystemExit(main())
