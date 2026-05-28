#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import re
import sys
import textwrap
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Check:
    name: str
    status: str
    details: str
    recommendation: str = ""


@dataclass
class Recommendation:
    perspective: str
    severity: str
    title: str
    details: str
    action: str


def auth_header(username: str | None, password: str | None) -> dict[str, str]:
    if not username or not password:
        return {}
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    return {"Authorization": f"Basic {token}"}


def fetch(url: str, headers: dict[str, str] | None = None, timeout: int = 20) -> tuple[int, dict[str, str], bytes]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "kontur-quality-agent/1.0",
            **(headers or {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read()


def absolute_url(base_url: str, href: str) -> str:
    return urllib.parse.urljoin(base_url.rstrip("/") + "/", href)


def text_from(body: bytes) -> str:
    return body.decode("utf-8", "replace")


def add(checks: list[Check], name: str, status: str, details: str, recommendation: str = "") -> None:
    checks.append(Check(name=name, status=status, details=details, recommendation=recommendation))


def status_icon(status: str) -> str:
    return {
        "OK": "OK",
        "WARN": "WARN",
        "FAIL": "FAIL",
        "INFO": "INFO",
    }.get(status, status)


def extract_asset(html: str, pattern: str) -> str | None:
    match = re.search(pattern, html)
    return match.group(1) if match else None


def asset_version_from_html(html: str) -> str | None:
    match = re.search(r'app\.js\?v=([^"]+)', html)
    return match.group(1) if match else None


def repository_asset_version() -> str | None:
    index_path = Path(__file__).resolve().parents[1] / "app" / "static" / "index.html"
    if not index_path.exists():
        return None
    return asset_version_from_html(index_path.read_text(encoding="utf-8", errors="replace"))


def repository_file(relative_path: str) -> str:
    path = Path(__file__).resolve().parents[1] / relative_path
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def has_all(text: str, needles: list[str]) -> bool:
    return all(needle in text for needle in needles)


def check_static_contract(
    checks: list[Check],
    name: str,
    ok: bool,
    details: str,
    recommendation: str,
) -> None:
    add(checks, name, "OK" if ok else "FAIL", details, "" if ok else recommendation)


def check_repository_ui_contracts(checks: list[Check], recommendations: list[Recommendation]) -> None:
    html = repository_file("app/static/index.html")
    app_text = repository_file("app/static/app.js")
    sw_text = repository_file("app/static/sw.js")
    server_text = repository_file("app/server.py")

    if not html or not app_text:
        add(
            checks,
            "Repository UI files",
            "FAIL",
            "Не удалось прочитать app/static/index.html или app/static/app.js.",
            "Проверить структуру репозитория и путь запуска агента.",
        )
        return

    button_contracts = [
        ("refreshButton", "Обновить данные", ['qs("#refreshButton").addEventListener("click"', "loadAll().then"]),
        ("logoutButton", "Выйти", ['qs("#logoutButton")?.addEventListener("click"', 'window.location.href = "/logout"']),
        ("newProjectButton", "Новый объект", ['qs("#newProjectButton").addEventListener("click"', "resetProjectDialog()", 'qs("#projectDialog").showModal()']),
        ("newTaskButton", "Добавить задачу", ['qs("#newTaskButton").addEventListener("click"', 'qs("#taskDialog").showModal()']),
        ("newMaterialButton", "Добавить заявку", ['qs("#newMaterialButton").addEventListener("click"', 'qs("#materialDialog").showModal()']),
        ("newVariationButton", "Добавить допработу", ['qs("#newVariationButton").addEventListener("click"', 'qs("#variationDialog").showModal()']),
        ("newDocumentButton", "Добавить материал базы знаний", ['qs("#newDocumentButton").addEventListener("click"', 'qs("#documentDialog").showModal()']),
        ("newEventButton", "Добавить событие", ['qs("#newEventButton").addEventListener("click"', 'qs("#eventDialog").showModal()']),
        ("newContractButton", "Добавить договор", ['qs("#newContractButton")?.addEventListener("click"', "openContractDialog"]),
        ("refreshFeedbackButton", "Обновить обратную связь", ['qs("#refreshFeedbackButton")?.addEventListener("click"', "renderFeedback()"]),
        ("deleteSelectedFeedbackButton", "Удалить выбранную обратную связь", ['qs("#deleteSelectedFeedbackButton")?.addEventListener("click"', "/api/feedback/delete-bulk"]),
        ("loadMaterialEstimateButton", "Материалы по смете в заявке", ['qs("#loadMaterialEstimateButton").addEventListener("click"', "loadMaterialEstimatePicker"]),
        ("addExtraMaterialButton", "Добавить дополнительный материал", ['qs("#addExtraMaterialButton").addEventListener("click"', "addExtraMaterialRow"]),
        ("toggleEstimateMaterialsButton", "Показать материалы по смете", ['qs("#toggleEstimateMaterialsButton").addEventListener("click"', "state.showEstimateMaterials"]),
        ("exportCompletedMaterialsButton", "Выгрузить выполненные заявки", ['qs("#exportCompletedMaterialsButton").addEventListener("click"', "/api/material-requests/export"]),
        ("refreshEstimateButton", "Обновить сметные материалы", ['qs("#refreshEstimateButton").addEventListener("click"', "renderEstimateMaterials"]),
        ("previewEstimateButton", "Предпросмотр файла материалов", ['qs("#previewEstimateButton").addEventListener("click"', "loadEstimatePreview"]),
        ("printWorksButton", "Печать работ", ['qs("#printWorksButton").addEventListener("click"', "/api/work-items/print"]),
    ]

    missing_buttons = []
    missing_handlers = []
    for element_id, title, handler_needles in button_contracts:
        if f'id="{element_id}"' not in html:
            missing_buttons.append(title)
        elif not has_all(app_text, handler_needles):
            missing_handlers.append(title)

    check_static_contract(
        checks,
        "UI buttons contract",
        not missing_buttons and not missing_handlers,
        "Ключевые кнопки найдены в HTML и имеют обработчики в app.js."
        if not missing_buttons and not missing_handlers
        else f"Нет кнопок: {', '.join(missing_buttons) or 'нет'}; нет обработчиков: {', '.join(missing_handlers) or 'нет'}.",
        "Восстановить кнопку или обработчик. Если кнопка больше не нужна, удалить ее и из HTML, и из списка контрактов агента.",
    )

    form_contracts = [
        ("projectForm", "Форма объекта", ['qs("#projectForm").addEventListener("submit"', "/api/projects"]),
        ("taskForm", "Форма задачи", ['qs("#taskForm").addEventListener("submit"', "/api/tasks"]),
        ("materialForm", "Форма заявки материалов", ['qs("#materialForm").addEventListener("submit"', "/api/material-requests/bulk"]),
        ("documentForm", "Форма базы знаний", ['qs("#documentForm").addEventListener("submit"', "/api/documents"]),
        ("variationForm", "Форма допработы", ['qs("#variationForm").addEventListener("submit"', "/api/variations"]),
        ("workExtraForm", "Форма появившейся работы", ['qs("#workExtraForm").addEventListener("submit"', "/api/work-extra-items"]),
        ("supplierLocationForm", "Форма локации поставщика", ['qs("#supplierLocationForm").addEventListener("submit"', "/api/supplier-locations"]),
        ("estimateImportForm", "Форма загрузки материалов", ['qs("#estimateImportForm").addEventListener("submit"', "/api/estimate-materials/import"]),
        ("contractForm", "Форма договора", ['qs("#contractForm").addEventListener("submit"', "/api/contracts"]),
        ("eventForm", "Форма журнала", ['qs("#eventForm").addEventListener("submit"', "/api/events"]),
    ]
    missing_forms = []
    missing_form_handlers = []
    for form_id, title, handler_needles in form_contracts:
        if f'id="{form_id}"' not in html:
            missing_forms.append(title)
        elif not has_all(app_text, handler_needles):
            missing_form_handlers.append(title)

    check_static_contract(
        checks,
        "UI forms contract",
        not missing_forms and not missing_form_handlers,
        "Ключевые формы найдены и отправляются через ожидаемые API."
        if not missing_forms and not missing_form_handlers
        else f"Нет форм: {', '.join(missing_forms) or 'нет'}; нет submit-обработчиков: {', '.join(missing_form_handlers) or 'нет'}.",
        "Восстановить submit-обработчик, чтобы форма не выглядела как сохраненная, когда на самом деле ничего не произошло.",
    )

    scenario_contracts = [
        (
            "Role persistence scenario",
            "Выбранная тестовая роль сохраняется после обновления страницы.",
            ["localStorage.getItem(\"currentRole\")", "state.canSwitchRole && savedRole ? savedRole : ownRole", "localStorage.setItem(\"currentRole\", state.currentRole)"],
            "Сохранить выбранную роль в localStorage и не перезаписывать ее ролью учетной записи при reload.",
        ),
        (
            "New project draft scenario",
            "Карточка нового объекта имеет автосохранение текстовых полей и понятные ошибки.",
            ["PROJECT_FORM_DRAFT_KEY", "restoreProjectFormDraft", "missingProjectRequiredFields", "projectFormStatus", "setProjectSaving", "novalidate"],
            "Вернуть автосохранение и ручную валидацию формы, чтобы менеджер не терял заполненную карточку.",
        ),
        (
            "Navigation access scenario",
            "Меню ограничивается по ролям менеджера и прораба.",
            ['sales_manager: ["dashboard", "projects", "variations"]', 'foreman: ["dashboard", "tasks", "works", "materials", "variations", "locations", "documents"]', "syncNavigationAccess"],
            "Проверить матрицу ролей: менеджеру и прорабу нельзя показывать лишние разделы.",
        ),
        (
            "New project contact fields scenario",
            "Новая карточка объекта требует телефон, e-mail и ссылку на локацию из Яндекса.",
            ['name="customer_phone"', 'name="customer_email"', 'name="navigator_url"', "PROJECT_TEXT_DRAFT_FIELDS", "ensure_customer(db, data.get(\"customer_name\"), data.get(\"customer_phone\"), data.get(\"customer_email\"))"],
            "Вернуть поля контактов и локации в форму, черновик и серверное сохранение.",
        ),
        (
            "Project approval guard",
            "Менеджер не может принять объект в работу вместо руководителя строительства.",
            ['"accept": {"owner", "construction_manager", "finance_director"}', '"submit": {"owner", "sales_manager", "finance_director"}'],
            "Вернуть разделение полномочий: менеджер передает, руководитель строительства принимает или возвращает.",
        ),
        (
            "Permanent delete guard",
            "Удаление навсегда разрешено только гендиректору.",
            ['"delete": {"owner"}', "canDeleteForever()", "currentRoleBase() === \"owner\""],
            "Оставить окончательное удаление только роли owner.",
        ),
    ]

    broken_scenarios = []
    combined_text = "\n".join([html, app_text, server_text])
    for name, details, needles, recommendation in scenario_contracts:
        ok = has_all(combined_text, needles)
        check_static_contract(checks, name, ok, details if ok else f"Нарушен сценарий: {details}", recommendation)
        if not ok:
            broken_scenarios.append(name)

    repo_version = asset_version_from_html(html)
    sw_has_version = bool(repo_version and repo_version in sw_text)
    check_static_contract(
        checks,
        "Repository PWA cache contract",
        sw_has_version,
        f"Версия фронтенда `{repo_version}` есть в service worker." if sw_has_version else "Версия app.js из index.html не найдена в service worker.",
        "После каждой фронтенд-правки обновлять версию в index.html и sw.js, иначе мобильная версия может взять старый код.",
    )

    if broken_scenarios:
        add_rec(
            recommendations,
            "Сценарии и кнопки",
            "high",
            "Нарушены критичные пользовательские сценарии",
            f"Агент нашел проблемы в сценариях: {', '.join(broken_scenarios)}.",
            "Сначала восстановить сценарии, потом выкатывать правку пользователям.",
        )


def check_json_endpoint(base_url: str, path: str, headers: dict[str, str], checks: list[Check]):
    url = absolute_url(base_url, path)
    status, _, body = fetch(url, headers=headers)
    if status != 200:
        add(checks, f"API {path}", "FAIL", f"Endpoint вернул HTTP {status}.", "Проверить логи сервера и права доступа.")
        return None
    try:
        payload = json.loads(text_from(body))
    except json.JSONDecodeError:
        add(checks, f"API {path}", "FAIL", "Endpoint вернул не JSON.", "Проверить обработчик API.")
        return None
    add(checks, f"API {path}", "OK", "Endpoint доступен и возвращает JSON.")
    return payload


def parse_date(value: str | None) -> dt.date | None:
    if not value:
        return None
    try:
        return dt.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def is_open_task(task: dict) -> bool:
    return task.get("status") not in {"accepted"}


def active_project(project: dict) -> bool:
    return project.get("status") != "archived"


def unique_material_batches(material_rows: list[dict]) -> list[dict]:
    batches: dict[str, dict] = {}
    for item in material_rows:
        key = str(item.get("batch_id") or f"material-{item.get('id')}")
        batches.setdefault(key, item)
    return list(batches.values())


def add_rec(
    recommendations: list[Recommendation],
    perspective: str,
    severity: str,
    title: str,
    details: str,
    action: str,
) -> None:
    recommendations.append(Recommendation(perspective, severity, title, details, action))


def build_recommendations(api_data: dict[str, object], html: str, app_text: str, sw_text: str) -> list[Recommendation]:
    recommendations: list[Recommendation] = []
    today = dt.date.today()
    projects = api_data.get("/api/projects") if isinstance(api_data.get("/api/projects"), list) else []
    tasks = api_data.get("/api/tasks") if isinstance(api_data.get("/api/tasks"), list) else []
    users = api_data.get("/api/users") if isinstance(api_data.get("/api/users"), list) else []
    materials = api_data.get("/api/material-requests") if isinstance(api_data.get("/api/material-requests"), list) else []
    summary = api_data.get("/api/summary") if isinstance(api_data.get("/api/summary"), dict) else {}
    batches = unique_material_batches(materials)

    if "dashboardAttention" not in html or "buildDashboardAttention" not in app_text:
        add_rec(
            recommendations,
            "Дизайн и управление",
            "high",
            "Нужен единый блок внимания на рабочем столе",
            "Руководителю не хватает одного места, где собраны просрочки, приемка, проблемные заявки и непривязанные уведомления.",
            "Добавить компактный блок контроля на рабочий стол и вести его к нужным разделам.",
        )
    else:
        add_rec(
            recommendations,
            "Дизайн и управление",
            "accepted",
            "Блок внимания на рабочем столе принят",
            "В интерфейсе уже есть точка входа для просрочек, приемки, проблемных материалов и организационных рисков.",
            "Проверить с руководителями, не нужно ли менять порядок сигналов.",
        )

    overdue_tasks = [
        task for task in tasks
        if is_open_task(task) and (due := parse_date(task.get("due_date"))) and due < today
    ]
    if overdue_tasks:
        add_rec(
            recommendations,
            "Строительный процесс",
            "high",
            f"Просроченные задачи: {len(overdue_tasks)}",
            "Просрочка в строительной задаче должна приводить к решению: принять факт, вернуть, перенести срок или зафиксировать причину.",
            "На рабочем столе держать просрочки отдельным сигналом и вести в фильтр задач.",
        )

    waiting_tasks = [task for task in tasks if task.get("status") == "completed_pending_acceptance"]
    if waiting_tasks:
        add_rec(
            recommendations,
            "Строительный процесс",
            "medium",
            f"Задачи ждут приемки: {len(waiting_tasks)}",
            "Если выполненные задачи долго не принимаются, у прораба и технадзора появляется разрыв в ответственности.",
            "Показывать задачи к приемке на рабочем столе и в уведомлениях принимающего.",
        )

    unassigned_projects = [
        project for project in projects
        if active_project(project)
        and project.get("status") == "in_progress"
        and (not project.get("foreman_id") or not project.get("estimator_id") or not project.get("procurement_manager_id") or not project.get("tech_supervisor_id"))
    ]
    if unassigned_projects:
        add_rec(
            recommendations,
            "Строительный процесс",
            "medium",
            f"Объекты в работе без полного состава ответственных: {len(unassigned_projects)}",
            "Для объекта в работе должны быть понятны прораб, сметчик, снабжение и технадзор.",
            "Вывести это как организационный сигнал и не терять в общем списке объектов.",
        )

    missing_documents = [
        project for project in projects
        if active_project(project) and (not project.get("estimate_file_name") or not project.get("work_task_file_name"))
    ]
    if missing_documents:
        add_rec(
            recommendations,
            "Строительный процесс",
            "medium",
            f"Объекты без полного комплекта Сметтер-файлов: {len(missing_documents)}",
            "Материалы и работы должны расходиться по разным выгрузкам, иначе прораб и снабжение будут видеть лишнее.",
            "В карточке объекта явно показывать отсутствие файла материалов или задания на работы.",
        )

    returned_materials = [batch for batch in batches if batch.get("batch_status") == "returned"]
    receipt_issues = [batch for batch in batches if batch.get("batch_status") == "receipt_issue"]
    urgent_materials = [
        batch for batch in batches
        if batch.get("batch_delivery_urgency") == "urgent" and batch.get("batch_status") not in {"received", "archived"}
    ]
    if returned_materials or receipt_issues or urgent_materials:
        add_rec(
            recommendations,
            "Снабжение",
            "high" if receipt_issues or urgent_materials else "medium",
            "Материальные заявки требуют отдельного внимания",
            f"Возвращено: {len(returned_materials)}, проблемы приемки: {len(receipt_issues)}, срочные: {len(urgent_materials)}.",
            "Держать проблемные и срочные заявки на рабочем столе, а не только внутри раздела Материалы.",
        )

    unbound_users = [
        user for user in users
        if user.get("is_active") and user.get("role") in {"owner", "construction_manager", "finance_director", "accountant", "foreman", "procurement_manager", "technical_supervisor", "estimator"} and not user.get("max_chat_id")
    ]
    if unbound_users:
        add_rec(
            recommendations,
            "Инженерия и уведомления",
            "medium",
            f"MAX не привязан у сотрудников: {len(unbound_users)}",
            "Личные уведомления не будут надежными, пока все ключевые роли не привязаны к MAX.",
            "Показывать непривязанные MAX-уведомления как отдельный сигнал для руководителей.",
        )

    if float(summary.get("unresolved_overbudget") or 0) > 0:
        add_rec(
            recommendations,
            "Финансовый контроль",
            "high",
            "Есть сверхбюджет без решения",
            "Сверхбюджет должен стать допработой, расходом компании или отдельным согласованным решением.",
            "Держать сумму сверхбюджета на рабочем столе для ролей с финансовым доступом.",
        )

    app_asset_match = re.search(r'app\.js\?v=([^"]+)', html)
    if app_asset_match and app_asset_match.group(1) not in sw_text:
        add_rec(
            recommendations,
            "Инженерия",
            "medium",
            "Версия PWA-кэша не совпадает с версией app.js",
            "Мобильное приложение может продолжить показывать старый интерфейс после деплоя.",
            "После каждой фронтенд-правки обновлять версию в index.html и service worker.",
        )

    if not recommendations:
        add_rec(
            recommendations,
            "Общий вывод",
            "info",
            "Критичных предложений нет",
            "Автоматический агент не нашел явных организационных или технических рисков.",
            "Продолжить ручное тестирование с коллегами по реальным сценариям.",
        )

    return recommendations


def run_checks(base_url: str, username: str | None, password: str | None) -> tuple[list[Check], list[Recommendation]]:
    checks: list[Check] = []
    recommendations: list[Recommendation] = []
    headers = auth_header(username, password)
    api_data: dict[str, object] = {}
    app_text = ""
    sw_text = ""

    check_repository_ui_contracts(checks, recommendations)

    status, root_headers, body = fetch(base_url, headers=headers)
    html = text_from(body)

    if status == 401 and not headers:
        add(
            checks,
            "Public access",
            "OK",
            "Боевой сайт закрыт авторизацией. Это нормально для внутреннего сервиса.",
            "Добавить GitHub Secrets KONTUR_BASIC_USER и KONTUR_BASIC_PASSWORD для глубокой проверки.",
        )
        return checks, recommendations

    if status == 401 and headers:
        add(checks, "Authorization", "FAIL", "Логин и пароль переданы, но сайт вернул HTTP 401.", "Проверить GitHub Secrets.")
        return checks, recommendations

    if status != 200:
        add(checks, "Homepage", "FAIL", f"Главная страница вернула HTTP {status}.", "Проверить Caddy, Docker-контейнер и логи приложения.")
        return checks, recommendations

    add(checks, "Homepage", "OK", "Главная страница вернула HTTP 200.")

    if "Строительный контур" in html:
        add(checks, "Page title/content", "OK", "В HTML найдено название продукта.")
    else:
        add(checks, "Page title/content", "WARN", "Название продукта не найдено в HTML.", "Проверить рендеринг index.html.")

    production_version = asset_version_from_html(html)
    repo_version = repository_asset_version()
    if repo_version and production_version:
        if repo_version == production_version:
            add(checks, "Production version", "OK", f"Production и репозиторий используют одну версию фронтенда: {production_version}.")
        else:
            add(
                checks,
                "Production version",
                "WARN",
                f"В репозитории фронтенд {repo_version}, на production сейчас {production_version}.",
                "После push нужно обновить сервер или вручную перезапустить проверку после деплоя.",
            )

    app_js = extract_asset(html, r'<script[^>]+src="([^"]*app\.js[^"]*)"')
    styles_css = extract_asset(html, r'<link[^>]+href="([^"]*styles\.css[^"]*)"')
    manifest = extract_asset(html, r'<link[^>]+rel="manifest"[^>]+href="([^"]*)"')

    for label, href in [("app.js", app_js), ("styles.css", styles_css), ("manifest", manifest)]:
        if not href:
            add(checks, f"Asset {label}", "FAIL", f"Ссылка на {label} не найдена в HTML.")
            continue
        asset_status, _, asset_body = fetch(absolute_url(base_url, href), headers=headers)
        if asset_status == 200 and asset_body:
            add(checks, f"Asset {label}", "OK", f"{label} доступен: {href}")
        else:
            add(checks, f"Asset {label}", "FAIL", f"{label} вернул HTTP {asset_status}.", "Проверить раздачу статических файлов.")

    if app_js:
        app_status, _, app_body = fetch(absolute_url(base_url, app_js), headers=headers)
        app_text = text_from(app_body) if app_status == 200 else ""
        if "maxChatDrafts" in app_text and "saveMaxBindingDraft" in app_text:
            add(checks, "MAX chat draft fix", "OK", "Во фронтенде есть защита от сброса поля MAX chat_id при автообновлении.")
        else:
            add(checks, "MAX chat draft fix", "WARN", "В app.js не найдена защита поля MAX chat_id.", "Очистить кэш или проверить деплой.")
        if "dashboardAttention" in html and "buildDashboardAttention" in app_text:
            add(checks, "Dashboard attention panel", "OK", "На рабочем столе есть блок контроля сигналов агента.")
        else:
            add(checks, "Dashboard attention panel", "WARN", "Не найден блок контроля сигналов агента.", "Добавить на рабочий стол компактную сводку рисков.")

    sw_status, _, sw_body = fetch(absolute_url(base_url, "/static/sw.js"), headers=headers)
    if sw_status == 200:
        sw_text = text_from(sw_body)
        app_asset_match = re.search(r'app\.js\?v=([^"]+)', html)
        if "CACHE_NAME" in sw_text and (not app_asset_match or app_asset_match.group(1) in sw_text):
            add(checks, "PWA cache version", "OK", "Версия service worker актуальна для правки MAX-привязок.")
        else:
            add(checks, "PWA cache version", "WARN", "Версия service worker может быть старой.", "После фронтенд-правок повышать версию кэша.")
    else:
        add(checks, "Service worker", "WARN", f"Service worker вернул HTTP {sw_status}.")

    for path in ["/api/session", "/api/users", "/api/projects", "/api/tasks", "/api/material-requests", "/api/summary"]:
        payload = check_json_endpoint(base_url, path, headers, checks)
        if payload is not None:
            api_data[path] = payload

    recommendations.extend(build_recommendations(api_data, html, app_text, sw_text))
    return checks, recommendations


def build_report(base_url: str, checks: list[Check], recommendations: list[Recommendation]) -> str:
    now = dt.datetime.now(dt.timezone.utc).astimezone()
    failed = sum(1 for item in checks if item.status == "FAIL")
    warnings = sum(1 for item in checks if item.status == "WARN")
    ok = sum(1 for item in checks if item.status == "OK")
    high_recommendations = [item for item in recommendations if item.severity == "high"]

    lines: list[str] = [
        "# Отчет QA-агента",
        "",
        f"- Дата: {now.strftime('%Y-%m-%d %H:%M:%S %z')}",
        f"- Адрес: `{base_url}`",
        f"- OK: {ok}",
        f"- WARN: {warnings}",
        f"- FAIL: {failed}",
        "",
        "## Проверки",
        "",
    ]

    for item in checks:
        lines.extend(
            [
                f"### {status_icon(item.status)} - {item.name}",
                "",
                item.details,
                "",
            ]
        )
        if item.recommendation:
            lines.extend(["Рекомендация: " + item.recommendation, ""])

    lines.extend(["## Рекомендации агента", ""])
    if recommendations:
        perspective_order = [
            "Сценарии и кнопки",
            "Строительный процесс",
            "Снабжение",
            "Финансовый контроль",
            "Инженерия и уведомления",
            "Инженерия",
            "Дизайн и управление",
            "Общий вывод",
        ]
        for perspective in perspective_order:
            group = [item for item in recommendations if item.perspective == perspective]
            if not group:
                continue
            lines.extend([f"### {perspective}", ""])
            for item in group:
                lines.extend(
                    [
                        f"- **{item.severity.upper()} · {item.title}**",
                        f"  {item.details}",
                        f"  Действие: {item.action}",
                    ]
                )
            lines.append("")
    else:
        lines.extend(["Агент не сформировал дополнительных рекомендаций.", ""])

    lines.extend(
        [
            "## Инженерный взгляд",
            "",
            "Сначала исправлять все FAIL. Если проверка ограничена авторизацией, нужно добавить GitHub Secrets и повторить запуск.",
            "",
            "## Дизайнерский взгляд",
            "",
            "Интерфейс должен оставаться плотным, дорогим и рабочим: меньше пустоты, аккуратные статусы, спокойный графитовый каркас, глубокий зеленый для действия и теплый золотой акцент для важного.",
            "",
            "## Строительная логика",
            "",
            "При проверке новых функций агент смотрит, к какому объекту, договору, смете, этапу, роли и уведомлению относится действие. Если действие нельзя объяснить без чата, интерфейс нужно упрощать.",
            "",
            "## Следующие действия",
            "",
        ]
    )

    if failed:
        lines.append("1. Исправить критические ошибки из раздела FAIL.")
    elif warnings:
        lines.append("1. Разобрать предупреждения и решить, какие из них переводить в задачи.")
    elif high_recommendations:
        lines.append("1. Технически сайт работает, но есть сильные процессные рекомендации. Их стоит разобрать до следующего цикла доработок.")
    else:
        lines.append("1. Критических проблем по автоматической проверке нет. Продолжить ручное тестирование ключевых сценариев.")

    lines.append("2. После изменений добавить запись в `docs/16-project-worklog.md`.")
    lines.append("")

    return "\n".join(lines)


def write_reports(report: str, report_dir: str) -> list[Path]:
    directory = Path(report_dir)
    directory.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    dated = directory / f"{stamp}.md"
    latest = directory / "latest.md"
    dated.write_text(report, encoding="utf-8")
    latest.write_text(report, encoding="utf-8")
    return [dated, latest]


def main() -> int:
    parser = argparse.ArgumentParser(description="Quality agent for Stroitelnyi Kontur.")
    parser.add_argument("--url", default=os.environ.get("KONTUR_URL", "https://kontur.derevgroup.ru"))
    parser.add_argument("--username", default=os.environ.get("KONTUR_BASIC_USER"))
    parser.add_argument("--password", default=os.environ.get("KONTUR_BASIC_PASSWORD"))
    parser.add_argument("--report-dir", default="")
    args = parser.parse_args()

    checks, recommendations = run_checks(args.url.rstrip("/"), args.username, args.password)
    report = build_report(args.url.rstrip("/"), checks, recommendations)
    print(report)

    if args.report_dir:
        paths = write_reports(report, args.report_dir)
        print("\nSaved reports:")
        for path in paths:
            print(f"- {path}")

    return 1 if any(item.status == "FAIL" for item in checks) else 0


if __name__ == "__main__":
    raise SystemExit(main())
