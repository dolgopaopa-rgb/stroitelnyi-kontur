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


def check_json_endpoint(base_url: str, path: str, headers: dict[str, str], checks: list[Check]) -> None:
    url = absolute_url(base_url, path)
    status, _, body = fetch(url, headers=headers)
    if status != 200:
        add(checks, f"API {path}", "FAIL", f"Endpoint вернул HTTP {status}.", "Проверить логи сервера и права доступа.")
        return
    try:
        json.loads(text_from(body))
    except json.JSONDecodeError:
        add(checks, f"API {path}", "FAIL", "Endpoint вернул не JSON.", "Проверить обработчик API.")
        return
    add(checks, f"API {path}", "OK", "Endpoint доступен и возвращает JSON.")


def run_checks(base_url: str, username: str | None, password: str | None) -> list[Check]:
    checks: list[Check] = []
    headers = auth_header(username, password)

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
        return checks

    if status == 401 and headers:
        add(checks, "Authorization", "FAIL", "Логин и пароль переданы, но сайт вернул HTTP 401.", "Проверить GitHub Secrets.")
        return checks

    if status != 200:
        add(checks, "Homepage", "FAIL", f"Главная страница вернула HTTP {status}.", "Проверить Caddy, Docker-контейнер и логи приложения.")
        return checks

    add(checks, "Homepage", "OK", "Главная страница вернула HTTP 200.")

    if "Строительный контур" in html:
        add(checks, "Page title/content", "OK", "В HTML найдено название продукта.")
    else:
        add(checks, "Page title/content", "WARN", "Название продукта не найдено в HTML.", "Проверить рендеринг index.html.")

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

    sw_status, _, sw_body = fetch(absolute_url(base_url, "/static/sw.js"), headers=headers)
    if sw_status == 200:
        sw_text = text_from(sw_body)
        if "CACHE_NAME" in sw_text and "20260521-max-bindings" in sw_text:
            add(checks, "PWA cache version", "OK", "Версия service worker актуальна для правки MAX-привязок.")
        else:
            add(checks, "PWA cache version", "WARN", "Версия service worker может быть старой.", "После фронтенд-правок повышать версию кэша.")
    else:
        add(checks, "Service worker", "WARN", f"Service worker вернул HTTP {sw_status}.")

    for path in ["/api/session", "/api/users", "/api/projects", "/api/tasks", "/api/material-requests"]:
        check_json_endpoint(base_url, path, headers, checks)

    return checks


def build_report(base_url: str, checks: list[Check]) -> str:
    now = dt.datetime.now(dt.timezone.utc).astimezone()
    failed = sum(1 for item in checks if item.status == "FAIL")
    warnings = sum(1 for item in checks if item.status == "WARN")
    ok = sum(1 for item in checks if item.status == "OK")

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

    lines.extend(
        [
            "## Инженерный взгляд",
            "",
            "Сначала исправлять все FAIL. Если проверка ограничена авторизацией, нужно добавить GitHub Secrets и повторить запуск.",
            "",
            "## Дизайнерский взгляд",
            "",
            "При следующих визуальных правках держать интерфейс плотным, дорогим и рабочим: меньше пустоты, аккуратные статусы, спокойный графитовый каркас, глубокий зеленый для действия и теплый золотой акцент для важного.",
            "",
            "## Строительная логика",
            "",
            "При проверке новых функций обязательно смотреть, к какому объекту, договору, смете, этапу, роли и уведомлению относится действие. Если действие нельзя объяснить без чата, интерфейс нужно упрощать.",
            "",
            "## Следующие действия",
            "",
        ]
    )

    if failed:
        lines.append("1. Исправить критические ошибки из раздела FAIL.")
    elif warnings:
        lines.append("1. Разобрать предупреждения и решить, какие из них переводить в задачи.")
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

    checks = run_checks(args.url.rstrip("/"), args.username, args.password)
    report = build_report(args.url.rstrip("/"), checks)
    print(report)

    if args.report_dir:
        paths = write_reports(report, args.report_dir)
        print("\nSaved reports:")
        for path in paths:
            print(f"- {path}")

    return 1 if any(item.status == "FAIL" for item in checks) else 0


if __name__ == "__main__":
    raise SystemExit(main())
